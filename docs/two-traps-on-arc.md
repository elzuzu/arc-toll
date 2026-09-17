# Two things that will break your Arc integration

Arc opened on 16 September 2026. I shipped three contracts to it inside forty-eight hours, and in
doing so walked into two traps that are not in any documentation. Both are still live. Both will
cost you money if your team is arriving from another chain, which every team on Arc currently is.

Everything below is reproducible against the public RPC. No claim here rests on my word.

---

## 1. USDC has eighteen decimals here, and also six

Arc's gas token is USDC. At the EVM level the native asset carries **18 decimals** — that is what
`msg.value` and `eth_getBalance` speak. The USDC **ERC-20 predeploy** at
`0x3600000000000000000000000000000000000000` reports the **same balance with 6**.

One balance. Two views. Related by exactly `1e12`.

```bash
ADDR=0x5ACCC00D7e4dB975CCbfC2801bC9447f37198797

# native, 18 decimals
curl -s https://rpc.mainnet.arc.io -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_getBalance","params":["'$ADDR'","latest"],"id":1}'

# the same balance through the predeploy, 6 decimals
curl -s https://rpc.mainnet.arc.io -H 'content-type: application/json' \
  -d '{"jsonrpc":"2.0","method":"eth_call","params":[{"to":"0x3600000000000000000000000000000000000000",
      "data":"0x70a08231000000000000000000000000'${ADDR:2}'"},"latest"],"id":1}'
```

`floor(native / 1e12) == balanceOf(addr)`, verified on five addresses.

**Why this catches people.** USDC is a six-decimal token on every other chain. Assuming six here
overstates every native amount **by a factor of a trillion**. It is the natural assumption, and it
is wrong in the direction that does the most damage: a wallet configured with six decimals shows a
balance a trillion times too large, and a contract that prices in six-decimal units under-charges by
the same factor.

I shipped that assumption into a project's documentation before catching it. The fix is not clever —
it is knowing the fact exists.

**What follows from it, and this part is a gift.** `gasUsed * tx.gasprice` on Arc is a **dollar
amount, directly**, with no price feed anywhere in the expression. On a chain whose gas token floats,
a contract that wants to know what it just cost must consult an oracle and inherits its staleness
window and its failure modes. Here the unit of gas is the unit of account. A contract can price its
own execution from inside the transaction that runs it, adding no trust assumption at all.

**Measured on Arc**, from a contract doing it to itself:

| Operation | Gas | Cost |
|---|---|---|
| cold `SSTORE` | 22,113 | $0.00044226 |
| cold `SLOAD` | 2,115 | $0.00004230 |
| `ecrecover` | 3,331 | $0.00006662 |
| `staticcall` → `balanceOf` on the predeploy | 10,761 | $0.00021522 |

That last row carries its own warning: the same call costs **2,816 gas in a local EVM**, because
locally there is no code at `0x3600…0000`. If you are sizing Arc costs from a local run, you are out
by a factor of four on any external read.

---

## 2. A pool's fee is not what you read a block ago

`fee()` is immutable on a Uniswap V3 pool. Every tool in the ecosystem assumes so, and on Ethereum
that assumption has never cost anyone anything.

On Arc, a live pool presenting exactly that interface answered:

| Block | `fee()` |
|---|---|
| 21288698 | **400** |
| 21300698 | 410 |
| 21308698 | **450** |
| an hour later | **460** |
| later still | **400** |

It oscillates. `0xd945caee4635bcd7fb8a9fa74dc1d0c4c1472782`, check it yourself.

**The consequence is not that the number is surprising. It is that any off-chain check is
unsound.** A front-end that reads a fee, shows it to a user, and submits a swap is showing a figure
that can be raised before the transaction lands. A published list of "safe pools" is worse than
useless, because it is trusted.

The only sound check runs **in the same transaction as the trade**.

### And the flag that reads as free

Uniswap V4 marks a pool whose fee its hook sets at swap time with `0x800000` in the fee field. The
obvious way to clean that value is to mask the flag off — which leaves **zero**.

So the naive guard reports the pool whose fee is *entirely unknown* as the **cheapest on the chain**.

Over 750 consecutive blocks of V4 pool creation on Arc: **290 pools created, nine carrying a static
fee of 50% or more** — 99%, 99%, 93%, 80%, 79% — and **three with the dynamic flag set**. They sit
beside legitimate pools for the same tokens. Across 8,941 swaps in another window, **none** went
through one: nobody routes into them on purpose. They are traps waiting for a router that picks by
token address alone.

A dynamic fee is not a low fee. It is an unknown one, and it should be refused rather than quoted.

---

## What I did about it

Three contracts, all live on Arc mainnet, all MIT, all with the claims written as executable tests
rather than prose:

- **[ArcMeter](https://github.com/elzuzu/arc-meter)** — `0x1f4e93ccc63efe4b3edf8a7dc93f57d7132ca9ba`.
  A permissionless registry of what EVM operations cost here, in dollars, measured from inside
  transactions. Publishes its own measurement overhead instead of subtracting it silently.
- **[ArcToll](https://github.com/elzuzu/arc-toll)** — `0x2fac07dec284a0c453ec15aa856767cd5b0d74e4`.
  A guard a router calls inline: reads the fee on chain and reverts before a bad swap executes.
  Refuses to quote a dynamic-fee pool at all.
- **[ArcPay](https://github.com/elzuzu/otter-arc)** — `0x4704b3e740376434b05587b58e30a901f79434e4`.
  Pay-per-call and escrow rails settling in native USDC.

One bug worth admitting, because it is the reason the numbers above can be trusted. ArcMeter's first
version reported a cold `SLOAD` at **7 gas** against a specified 2,100 — seven being exactly what the
measurement harness costs on its own. At 200 optimizer runs, `pop(sload(slot))` has no observable
effect and was deleted outright. The benchmark was measuring itself. A test asserting only "it does
not revert" would have passed it; the tests assert the properties the contract claims, and those
caught it.

---

## If you are shipping on Arc

I am in Geneva, I have been on this chain since the day it opened, and I am available for
integration and review work — the decimal handling, the pool-safety path, and the parts where a
stablecoin-native chain behaves unlike the one your code was written for.

`arc@elzuzu.ch.eu.org` · [github.com/elzuzu](https://github.com/elzuzu)
