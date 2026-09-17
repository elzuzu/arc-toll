// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

import {Test} from "forge-std/Test.sol";
import {ArcToll} from "../src/ArcToll.sol";

/**
 * Runs against Arc Mainnet itself, so the guard is checked on pools that exist rather than on mocks
 * written to agree with it. `forge test` picks the endpoint up from foundry.toml by name.
 */
contract ArcTollForkTest is Test {
    ArcToll internal guard;

    // Real Arc pools, with the fees they carried on 2026-09-17.
    address constant CIRBTC_USDC_1BP = 0x82916bee18fCEF517B26C72d7Cb5F13694E1dB41; // fee 100
    address constant CIRBTC_USDC_43BP = 0xd945cAEe4635BcD7FB8A9fA74dC1D0c4C1472782; // fee 430
    address constant ARGUS_USDC_1PCT = 0x6A3bAcAa6493734c1Ac221EBF42CF530A96C1e02; // fee 10000

    function setUp() public {
        vm.createSelectFork(vm.rpcUrl("arc"));
        guard = new ArcToll();
    }

    function testFork_ReadsRealPoolFees() public view {
        (uint24 a, bool dynA) = guard.toll(CIRBTC_USDC_1BP);
        (uint24 c, bool dynC) = guard.toll(ARGUS_USDC_1PCT);
        assertFalse(dynA || dynC, "these two carry fixed fees");
        assertEq(a, 100, "cirBTC/USDC 0.01% tier");
        assertEq(c, 10_000, "ARGUS/USDC 1% tier");
    }

    /**
     * @dev The finding that shaped this contract, asserted against two pinned blocks of Arc rather
     *      than described in prose.
     *
     *      `fee()` on a Uniswap V3 pool is immutable, and every tool in the ecosystem assumes so.
     *      This pool is not one: the same call answers a different number at different heights.
     *      Observed on 2026-09-17 — 400 at block 21288698, 410 at 21300698, 450 at 21308698 — while
     *      presenting the ordinary V3 interface.
     *
     *      An off-chain check is therefore worthless: the figure a front-end reads can be raised
     *      before the swap it was meant to protect. The guard is only sound when it runs in the same
     *      transaction as the trade, which is why it is a revert and not a list.
     */
    function testFork_APoolsFeeCanMoveBetweenBlocks() public {
        vm.createSelectFork(vm.rpcUrl("arc"), 21_288_698);
        ArcToll early = new ArcToll();
        (uint24 feeEarly,) = early.toll(CIRBTC_USDC_43BP);

        vm.createSelectFork(vm.rpcUrl("arc"), 21_308_698);
        ArcToll late = new ArcToll();
        (uint24 feeLate,) = late.toll(CIRBTC_USDC_43BP);

        assertEq(feeEarly, 400, "the fee this pool charged at the earlier height");
        assertEq(feeLate, 450, "and at the later one");
        assertGt(feeLate, feeEarly, "a fee that moves is a fee no off-chain check can rely on");
    }

    function testFork_LegitimatePoolsPassAnOrdinaryBound() public view {
        guard.requireTollUnder(CIRBTC_USDC_1BP, 3_000);
        guard.requireTollUnder(CIRBTC_USDC_43BP, 3_000);
    }

    /// @dev Whatever the moving pool charges today, it stays inside a sane band — the point is that
    ///      the band, not the number, is what a caller can safely assume.
    function testFork_TheMovingPoolStaysWithinABand() public view {
        (uint24 pips,) = guard.toll(CIRBTC_USDC_43BP);
        assertGe(pips, 100, "not below a basis point");
        assertLe(pips, 10_000, "and not above one percent");
    }

    function testFork_AOnePercentPoolFailsATightBound() public {
        vm.expectRevert(
            abi.encodeWithSelector(ArcToll.TollTooHigh.selector, ARGUS_USDC_1PCT, uint24(10_000), uint24(3_000))
        );
        guard.requireTollUnder(ARGUS_USDC_1PCT, 3_000);
    }

    /// @dev The headline figure, computed against a live pool rather than asserted in a README.
    function testFork_PricesTheLossOnALivePool() public view {
        uint256 cost = guard.tollOn(ARGUS_USDC_1PCT, 1_000e18);
        assertEq(cost, 10e18, "1% of 1,000 USDC is 10 USDC, with no oracle in the calculation");
    }

    function testFork_TheUsdcPredeployIsNotAPool() public {
        address predeploy = 0x3600000000000000000000000000000000000000;
        vm.expectRevert(abi.encodeWithSelector(ArcToll.NotAFeeSource.selector, predeploy));
        guard.toll(predeploy);
    }
}
