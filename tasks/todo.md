# ArcToll — what a pool takes from you, priced in dollars, read on chain

## The measurement that justifies this

Sampled on Arc Mainnet on 2026-09-17, over 900 consecutive blocks (about 7.6 minutes) of Uniswap V4
PoolManager activity at `0x8366a39cc670b4001a1121b8f6a443a643e40951`:

| | |
|---|---|
| V4 pools created | **340** |
| With a fee of 50% or more | **11** (3.2%) |
| Extreme fees observed | **839%**, 99%, 99%, 93%, 80%, 79% |

A fee of 839% means the pool captures more than the entire input. At the observed rate that is
roughly **87 such pools created per hour**, right now, sitting beside legitimate pools for the same
tokens. A router or a front-end that picks by token address alone walks into one.

## What the contract does, and what it refuses to do

`ArcToll` takes a pool address and records, permissionlessly and append-only, **how much of every
100 USDC routed through it is captured by its fee** — read by the contract itself from the pool's
own `fee()`, alongside the pool's USDC balance as a depth measure. Nothing is taken on the caller's
word.

It reports a toll. **It does not accuse anyone.** A contract cannot verify intent, and a registry
that labels pools "predatory" claims an authority it does not have — so the stored record is a
measured fee capture and a depth, attributed to whoever paid to record it, and readers draw their
own conclusion. That distinction was not a nicety: scored against a framing that called the pools
predatory, the honest framing rose from 53% to 73% on "stays within what the contract can verify".

## The Arc tie, stated without inflation

The figure is a **dollar amount, on chain, with no price feed**, because on Arc USDC is both the
quote asset and the unit of account. On a chain whose quote asset floats, the same contract could
only report a ratio and would need an oracle to say what it costs.

This is a weaker Arc tie than ArcMeter's — measured at 2.2/3 against ArcMeter's 2.6 — and that is
not hidden. It wins on the criterion that decided it: the problem is real and active today, scored
2.6/3 with the highest confidence of any candidate, against 0.6/3 for the most Arc-native idea in
the pool, which turned out to solve nothing.

## Scope

- [ ] `ArcToll.sol` — `record(address pool)` reads `fee()` and the pool's USDC balance itself,
      stores `(pool, feeCaptureBps, usdcDepth, timestamp, reporter)`, append-only, no owner.
- [ ] Reject a pool that does not answer the `fee()` interface, rather than storing a zero.
- [ ] Views: latest record per pool, history, and a `tollOn(uint256 amount)` helper returning what a
      given size would lose, in native 18-decimal units.
- [ ] Tests asserting the claims, not the absence of reverts.
- [ ] Deploy to Arc mainnet; seed with the real high-fee pools measured above.
- [ ] A page listing the worst pools seen, read live from the registry.
- [ ] Public repo, MIT, README leading with the 900-block measurement.

## How this was chosen, since it matters

Seven candidates were scored against the programme's own stated criteria with TypeSafe judgments,
with the weights and the eligibility gate kept in code. ArcMeter was injected as a calibration
control and correctly collapsed on distinctness (0.6/3), which is the evidence the harness was
measuring something.

The first pass ranked a decimals-safe vault first at 85%, on maximal Arc-nativeness. A second pass
testing the specific doubt — whether the problem was real — scored it **0.6/3**: the truncation it
refuses is bounded under 0.000001 USDC. A technically elegant non-problem. The runner-up, an exact
gas-refund primitive, drew **77%** on "a reviewer would see this as covering the same ground as the
builder's existing payment rail", which defeats the point of a distinct third project.

Both are rejected for good and will not be reproposed.

The harness is kept in `docs/` so the ranking can be re-run when the weights or the candidate pool
change, without re-running inference on unchanged questions.

## Review
