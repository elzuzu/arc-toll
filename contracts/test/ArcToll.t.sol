// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {Test} from "forge-std/Test.sol";
import {ArcToll} from "../src/ArcToll.sol";

contract MockPool {
    uint24 private _fee;

    constructor(uint24 f) {
        _fee = f;
    }

    function fee() external view returns (uint24) {
        return _fee;
    }
}

/// @dev Answers `fee()` with fewer than 32 bytes, as a contract that happens to have the selector
///      but is not a pool would.
contract TruncatedPool {
    fallback() external {
        assembly {
            mstore(0, 1)
            return(0, 4)
        }
    }
}

contract ArcTollTest is Test {
    ArcToll internal guard;

    uint24 constant DYNAMIC = 0x800000;
    uint24 constant POINT_THREE_PCT = 3_000;
    uint24 constant NINETY_NINE_PCT = 990_000;

    function setUp() public {
        guard = new ArcToll();
    }

    // ------------------------------------------------- the trap the contract exists for

    /**
     * @dev The central claim. A dynamic-fee pool's raw value is 0x800000; masking the flag off
     *      leaves zero, so a naive guard reports the most dangerous pool on the chain as free.
     */
    function test_DynamicFeeIsNotReportedAsFree() public {
        MockPool pool = new MockPool(DYNAMIC);
        (uint24 pips, bool dynamic) = guard.toll(address(pool));
        assertTrue(dynamic, "a hook-set fee must be flagged as unknowable");
        assertEq(pips, 0, "no static figure exists");
        // The naive reading, shown to be wrong rather than merely warned about.
        assertEq(uint24(DYNAMIC) & ~uint24(DYNAMIC), 0, "masking the flag yields zero");
    }

    function test_DynamicFeePoolAlwaysFailsTheGuard() public {
        MockPool pool = new MockPool(DYNAMIC);
        vm.expectRevert(abi.encodeWithSelector(ArcToll.TollIsUnbounded.selector, address(pool)));
        guard.requireTollUnder(address(pool), 500_000);
    }

    function test_TollOnRefusesToPriceADynamicPool() public {
        MockPool pool = new MockPool(DYNAMIC | 1234);
        vm.expectRevert(abi.encodeWithSelector(ArcToll.TollIsUnbounded.selector, address(pool)));
        guard.tollOn(address(pool), 100e18);
    }

    // ---------------------------------------------------------------- ordinary guarding

    function test_HighFeePoolIsRefused() public {
        MockPool pool = new MockPool(NINETY_NINE_PCT);
        vm.expectRevert(
            abi.encodeWithSelector(ArcToll.TollTooHigh.selector, address(pool), NINETY_NINE_PCT, POINT_THREE_PCT)
        );
        guard.requireTollUnder(address(pool), POINT_THREE_PCT);
    }

    function test_OrdinaryPoolPasses() public {
        MockPool pool = new MockPool(500);
        guard.requireTollUnder(address(pool), POINT_THREE_PCT);
    }

    function test_BoundIsStrict() public {
        MockPool pool = new MockPool(POINT_THREE_PCT);
        vm.expectRevert(
            abi.encodeWithSelector(ArcToll.TollTooHigh.selector, address(pool), POINT_THREE_PCT, POINT_THREE_PCT)
        );
        guard.requireTollUnder(address(pool), POINT_THREE_PCT);
    }

    /// @dev An address that cannot answer is refused, never treated as charging nothing.
    function test_NonPoolIsRefusedNotAssumedFree() public {
        address notAPool = makeAddr("eoa");
        vm.expectRevert(abi.encodeWithSelector(ArcToll.NotAFeeSource.selector, notAPool));
        guard.toll(notAPool);
    }

    function test_ShortAnswerIsRefused() public {
        TruncatedPool pool = new TruncatedPool();
        vm.expectRevert(abi.encodeWithSelector(ArcToll.NotAFeeSource.selector, address(pool)));
        guard.toll(address(pool));
    }

    function test_MaxAboveFullCaptureIsRejected() public {
        MockPool pool = new MockPool(500);
        vm.expectRevert(abi.encodeWithSelector(ArcToll.MaxTollExceedsFullCapture.selector, uint24(1_000_001)));
        guard.requireTollUnder(address(pool), 1_000_001);
    }

    // --------------------------------------------------------------------- arithmetic

    function test_TollOnIsTheFractionOfTheAmount() public {
        MockPool pool = new MockPool(NINETY_NINE_PCT);
        assertEq(guard.tollOn(address(pool), 100e18), 99e18, "99% of 100 USDC is 99 USDC");
    }

    function testFuzz_TollNeverExceedsTheAmount(uint96 amount, uint24 pips) public {
        pips = uint24(bound(pips, 0, guard.FULL_CAPTURE_PIPS()));
        MockPool pool = new MockPool(pips);
        assertLe(guard.tollOn(address(pool), amount), amount, "a toll cannot exceed what is routed");
    }

    // ------------------------------------------------------------------ the V4 key path

    function test_KeyGuardRejectsADynamicKey() public {
        vm.expectRevert(abi.encodeWithSelector(ArcToll.TollIsUnbounded.selector, address(0)));
        guard.requireKeyTollUnder(DYNAMIC, 10_000);
    }

    function test_KeyGuardRejectsAPoisonousKey() public {
        vm.expectRevert(abi.encodeWithSelector(ArcToll.TollTooHigh.selector, address(0), NINETY_NINE_PCT, 10_000));
        guard.requireKeyTollUnder(NINETY_NINE_PCT, 10_000);
    }

    function test_KeyGuardAcceptsAnOrdinaryKey() public view {
        guard.requireKeyTollUnder(3_000, 10_000);
    }
}
