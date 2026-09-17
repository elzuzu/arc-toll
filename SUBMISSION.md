# Arc Microgrants submission — ArcToll

Third distinct project from the same builder, alongside ArcPay (BUIDL 48819) and ArcMeter
(BUIDL 48824). The programme allows it: *"One submission per project. Teams can submit more than one
distinct project."*

**Two steps, not one.** Creating a BUIDL publishes a standalone project and enters no competition.
Entering Arc Microgrants is separate, from the hackathon page: Submit BUIDL → Use existing BUIDL →
ArcToll. The track selector is the tell.

## Step 1 — Profile

| Field | Value |
|---|---|
| Name | `ArcToll` |
| One-line pitch | `A guard that refuses a swap through a pool that would take too much, before it executes.` |
| Category | `Crypto / Web3` (required; the only coherent option) |
| GitHub | `https://github.com/elzuzu/arc-toll` |
| Project website | `https://elzuzu.github.io/arc-toll/` |
| Social link 1 | `https://github.com/elzuzu` |
| Logo | `docs/logo.png` (square — the slot centre-crops anything wider) |

There is no cover-image field and no free-tag field; the nearest, "Key innovation domains", is a
closed vocabulary that does not contain `Solidity` or `Arc`.

## Step 2 — Details

### Description

A router on Arc can be handed a pool that keeps almost everything routed through it. Measured on
2026-09-17 over 750 consecutive blocks of Uniswap V4 pool creation: **290 pools created, nine with a
static fee of 50% or more** — 99%, 99%, 93%, 80%, 79% — sitting beside legitimate pools for the same
tokens. Choosing by token address alone walks into one.

ArcToll is a guard, called inline. `requireTollUnder(pool, maxPips)` reads the pool's fee itself and
reverts with the measured figure before the swap executes. `tollOn(pool, amount)` returns what
routing that amount would cost, in native 18-decimal USDC — a **dollar figure with no price feed in
it**, because on Arc USDC is both the quote asset and the unit of account. On a chain whose quote
asset floats, the same contract could only return a ratio.

**Two traps, neither of which a published list would have caught.**

A *dynamic* fee is not a low fee, it is an unknown one. Uniswap V4 marks such pools with `0x800000`
in the fee field, and the obvious way to clean that value — masking the flag off — leaves **zero**,
so a naive guard reports the most dangerous pool on the chain as *free*. Three such pools appeared in
the same window. ArcToll returns `dynamic = true` and refuses to quote a figure at all.

And **a pool's fee can move**. `fee()` is immutable on a Uniswap V3 pool and every tool assumes so.
A live Arc pool presenting that exact interface answered **400** at block 21288698, **450** at
21308698, and **460** an hour after this contract was deployed. That makes an off-chain check not
merely less useful than a revert but *unsound*: the figure can be raised before the swap it was meant
to protect. It is why this is a guard and not a registry, and it is asserted by
`testFork_APoolsFeeCanMoveBetweenBlocks`, which pins both blocks and checks the movement.

That finding also corrected its author: two earlier readings of that pool, 420 and 430, had been
treated as measurement error and publicly retracted. Neither was wrong. The pool was moving.

### Verify it yourself

```bash
cast call 0x2fac07dec284a0c453ec15aa856767cd5b0d74e4 "toll(address)(uint24,bool)" \
  0xd945caee4635bcd7fb8a9fa74dc1d0c4c1472782 --rpc-url https://rpc.mainnet.arc.io
git clone https://github.com/elzuzu/arc-toll && cd arc-toll/contracts && forge test   # 21 tests
```

## Step 3 — Team information

[`docs/team-information.txt`](docs/team-information.txt), 1,775 characters.

## Step 4 — Contact

Telegram `elzuzu0` (**without** the `@`; the prefix is rendered outside the input). Backup: Discord
`lextulhor`. Email `arc@elzuzu.ch.eu.org`.

## The hackathon entry form

"What does it use Arc for?" is **capped at 960 characters**, enforced only on submit. The answer is
kept verbatim at 933 characters in [`docs/arc-usage-960.txt`](docs/arc-usage-960.txt).

"Had you deployed to Arc before this project?" → **Mainnet** (the menu is Mainnet / Testnet / No).
"Received a Circle or Arc grant, bounty or prize?" → **No**.

## Deployment facts

| | |
|---|---|
| Contract | `0x2fac07dec284a0c453ec15aa856767cd5b0d74e4` |
| Chain | Arc Mainnet, 5042 |
| Deploy tx | `0x36153de77f22c9d7783d629aae5ad32e818305e0bf9f9277fe13f418c136fad4` |
| Gas used | 336,430 (0.0067286 USDC at 20 gwei) |
| Tests | 21/21, including fork tests against live Arc pools |
