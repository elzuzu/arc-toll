# ArcToll

**A guard that refuses a swap through a pool that would take too much — before it executes.**

Live on Arc Mainnet at [`0x2fac07dec284a0c453ec15aa856767cd5b0d74e4`](https://explorer.arc.io/address/0x2fac07dec284a0c453ec15aa856767cd5b0d74e4) · [dashboard](https://elzuzu.github.io/arc-toll/)

## The problem, measured

Sampled on 2026-09-17 over 750 consecutive blocks of Uniswap V4 pool creation on Arc:

| | |
|---|---|
| Pools created | **290** |
| Carrying a static fee of 50% or more | **9** — 99%, 99%, 93%, 80%, 79% |
| Carrying a *dynamic* fee, set by a hook at swap time | **3** |

These sit beside legitimate pools for the same tokens. A router or front-end selecting by token
address alone walks into one and loses almost everything.

## Two traps, and why a list would not have caught either

**A dynamic fee is not a low fee; it is an unknown one.** Uniswap V4 marks such pools with
`0x800000` in the fee field. The obvious way to "clean" that value — masking the flag off — leaves
**zero**, so a naive guard reports the most dangerous pool on the chain as *free*. ArcToll returns
`dynamic = true` and refuses to quote a figure at all.

**A pool's fee can move.** `fee()` is immutable on a Uniswap V3 pool and every tool in the ecosystem
assumes so. A live Arc pool presenting that exact interface answered **400** at block 21288698,
**450** at 21308698, and **460** an hour later — all on the same day.

That second finding is why this is a guard and not a registry. A published list is not merely less
useful than a revert; it is **unsound**, because the figure it publishes can be raised before the
swap it was meant to protect. The check is only worth anything in the same transaction as the trade.

## Using it

```solidity
IArcToll(0x2fac07dec284a0c453ec15aa856767cd5b0d74e4)
    .requireTollUnder(pool, 3_000);   // revert unless the pool charges under 0.3%
// ... your swap, in the same transaction
```

| Function | Behaviour |
|---|---|
| `toll(pool)` | `(pips, dynamic)`. Reverts on an address that cannot answer, rather than reporting it as free |
| `requireTollUnder(pool, maxPips)` | Reverts with the measured figure. A dynamic-fee pool always reverts |
| `tollOn(pool, amount)` | What routing `amount` costs, in native 18-decimal USDC |
| `requireKeyTollUnder(keyFee, maxPips)` | For Uniswap V4, where the fee is a field of the key you are about to swap with, not a contract to read |

Fees are in **pips** — hundredths of a basis point, as Uniswap denominates them. `1_000_000` is 100%.

## The Arc tie, stated without inflation

`tollOn` returns a **dollar amount with no price feed in it**, because on Arc USDC is both the quote
asset and the unit of account. On a chain whose quote asset floats, the same contract could only
return a ratio and would need an oracle to say what it costs.

This is a weaker tie to Arc than measuring gas in dollars would be, and it is not dressed up as
more. The project was chosen because the problem is live on this chain today, not because the
mechanism is exotic.

## Verify it yourself

```bash
# what the moving pool charges right now
cast call 0x2fac07dec284a0c453ec15aa856767cd5b0d74e4 \
  "toll(address)(uint24,bool)" 0xd945caee4635bcd7fb8a9fa74dc1d0c4c1472782 \
  --rpc-url https://rpc.mainnet.arc.io

# the guard refusing a 1% pool against a 0.3% bound — this call reverts
cast call 0x2fac07dec284a0c453ec15aa856767cd5b0d74e4 \
  "requireTollUnder(address,uint24)" 0x6a3bacaa6493734c1ac221ebf42cf530a96c1e02 3000 \
  --rpc-url https://rpc.mainnet.arc.io

git clone https://github.com/elzuzu/arc-toll && cd arc-toll/contracts && forge test   # 21 tests
```

The fork test `testFork_APoolsFeeCanMoveBetweenBlocks` pins two Arc blocks and asserts the fee moved
between them, so the central claim is an executable assertion rather than a sentence in a README.

## How this project was chosen

Seven candidates were scored against the grant programme's stated criteria, with an already-built
project injected as a calibration control. The first ranking crowned a technically elegant
non-problem; a second pass asking whether the problem was real inverted it. The harness and results
are in [`docs/`](docs/). A registry framing scored **0.9/3** on "prevents the harm directly" against
**2.8/3** for this guard, which is why the design changed before a line was written.

## License

MIT.
