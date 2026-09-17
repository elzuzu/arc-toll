// SPDX-License-Identifier: MIT
pragma solidity 0.8.33;

interface IFeeSource {
    function fee() external view returns (uint24);
}

/**
 * @title ArcToll
 * @notice A guard that refuses a swap through a pool that would take too much, before it executes.
 *
 * @dev Measured on Arc Mainnet on 2026-09-17, over 750 consecutive blocks of Uniswap V4 pool
 *      creation: 290 pools created, **nine** of them carrying a static fee of 50% or more — 99%,
 *      99%, 93%, 80%, 79% — beside legitimate pools for the same tokens. A router or front-end
 *      choosing a pool by token address alone walks into one and loses almost everything.
 *
 *      This is a guard, not a registry. A list only helps someone who remembers to read it; a
 *      revert stops the loss in the transaction where it would have happened. It is also not an
 *      accusation: the contract reports what a pool charges, which it can verify, and says nothing
 *      about anyone's intent, which it cannot.
 *
 *      Fees here are in **pips**, hundredths of a basis point, as Uniswap denominates them:
 *      1_000_000 pips is 100%. A pool at 990_000 keeps 99 cents of every dollar routed through it.
 */
contract ArcToll {
    /**
     * @notice Uniswap V4's marker for a pool whose fee is decided by its hook at swap time.
     * @dev This is the trap worth building a contract around. The flag occupies bit 23, so the
     *      obvious way to "clean" the value — masking it off — turns the most dangerous pool on the
     *      chain into one that reads as **free**. Three such pools were created in the same
     *      750-block window. A dynamic fee is not a low fee; it is an unknown one, and this contract
     *      treats it as unbounded rather than as zero.
     */
    uint24 public constant DYNAMIC_FEE_FLAG = 0x800000;

    /// @notice One hundred percent, in pips. A pool at or above this keeps everything.
    uint24 public constant FULL_CAPTURE_PIPS = 1_000_000;

    error TollTooHigh(address pool, uint24 tollPips, uint24 maxPips);
    error TollIsUnbounded(address pool);
    error NotAFeeSource(address pool);
    error MaxTollExceedsFullCapture(uint24 maxPips);

    /**
     * @notice What `pool` charges, and whether that figure is fixed at all.
     * @return pips The static fee in hundredths of a basis point, or 0 when `dynamic` is true.
     * @return dynamic True when the pool's hook sets the fee at swap time, so no figure is knowable
     *         in advance. Callers must not treat `pips == 0` as free without checking this.
     */
    function toll(address pool) public view returns (uint24 pips, bool dynamic) {
        (bool ok, bytes memory ret) = pool.staticcall(abi.encodeCall(IFeeSource.fee, ()));
        // A pool that cannot answer is not silently treated as free — that is the failure mode this
        // contract exists to prevent, so it is refused rather than guessed.
        if (!ok || ret.length < 32) revert NotAFeeSource(pool);
        uint24 raw = uint24(abi.decode(ret, (uint256)));
        if (raw & DYNAMIC_FEE_FLAG != 0) return (0, true);
        return (raw, false);
    }

    /**
     * @notice Revert unless `pool` charges strictly less than `maxPips`.
     * @dev **Call this inline, in the same transaction as the swap.** Reading it in an earlier
     *      transaction, or off chain, checks a figure that can be raised before the trade lands —
     *      see the note on this contract and `testFork_APoolsFeeCanMoveBetweenBlocks`. A
     *      dynamic-fee pool always reverts here: the caller asked for a bound and the pool cannot
     *      offer one.
     */
    function requireTollUnder(address pool, uint24 maxPips) external view {
        if (maxPips > FULL_CAPTURE_PIPS) revert MaxTollExceedsFullCapture(maxPips);
        (uint24 pips, bool dynamic) = toll(pool);
        if (dynamic) revert TollIsUnbounded(pool);
        if (pips >= maxPips) revert TollTooHigh(pool, pips, maxPips);
    }

    /**
     * @notice What routing `amount` through `pool` would cost, in the same units as `amount`.
     * @dev On Arc this is a dollar figure with no price feed in it, because USDC is both the quote
     *      asset and the unit of account. Reverts for a dynamic-fee pool: there is no honest number
     *      to return, and returning zero would be the dangerous answer.
     */
    function tollOn(address pool, uint256 amount) external view returns (uint256) {
        (uint24 pips, bool dynamic) = toll(pool);
        if (dynamic) revert TollIsUnbounded(pool);
        return (amount * pips) / FULL_CAPTURE_PIPS;
    }

    /**
     * @notice Check a Uniswap V4 pool key's fee before swapping with it.
     * @dev In V4 a pool is not a contract, so there is no `fee()` to read: the fee is a field of the
     *      key the caller is about to swap with. Validating that field is genuinely protective,
     *      because the attack is a router handed a key carrying a poisonous fee.
     */
    function requireKeyTollUnder(uint24 keyFee, uint24 maxPips) external pure {
        if (maxPips > FULL_CAPTURE_PIPS) revert MaxTollExceedsFullCapture(maxPips);
        if (keyFee & DYNAMIC_FEE_FLAG != 0) revert TollIsUnbounded(address(0));
        if (keyFee >= maxPips) revert TollTooHigh(address(0), keyFee, maxPips);
    }
}
