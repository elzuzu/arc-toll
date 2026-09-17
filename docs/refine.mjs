const KEY = process.env.TYPESAFE_API_KEY;
const VARIANTS = {
  plain: `A contract on Arc holding permissionless attestations about predatory liquidity pools. The contract reads each accused pool's fee() and USDC balance itself rather than trusting the attester. Measured on Arc on 2026-09-17: Uniswap V4 pools configured with 97%, 99% and 88% fees hold under a thousandth of a dollar and sit alongside legitimate pools for the same token, draining any router that touches them.`,

  arc_framed: `A contract on Arc that quantifies, on chain and in dollars, what a given liquidity pool would take from anyone routing through it. The caller names a pool; the contract reads its fee() and its USDC balance itself, and stores the answer as a dollar figure: how much of every 100 USDC routed through that pool is captured by its fee. That figure is directly meaningful here and needs no price oracle, because on Arc USDC is both the quote asset and the unit of account, so the contract is denominating harm in the same asset the chain settles in. On a chain whose gas and quote assets float, the same contract could only report a ratio, and would need a price feed to say what it costs. Measured on Arc on 2026-09-17: Uniswap V4 pools configured at 97%, 99% and 88% fees hold under a thousandth of a dollar and sit beside legitimate pools for the same token, so a router that picks the wrong one loses almost everything.`,
};

const Q = {
  arc_native: {
    type: 'score',
    instructions: `How much does this depend on a property specific to Arc — a chain whose gas token and quote asset are both USDC at 18 decimals, making on-chain dollar amounts computable with no price feed — rather than working identically on any EVM chain?`,
    criteria: [
      'Works identically on any EVM chain; nothing about Arc matters',
      'Arc makes it slightly more convenient, but the mechanism is chain-agnostic',
      'It leans on an Arc property, but an equivalent could be built elsewhere with an oracle',
      'The mechanism is impossible or meaningless anywhere except Arc',
    ],
  },
  real_problem: {
    type: 'score',
    instructions: `Does this solve a problem someone actually has, or one too small to matter? Judge the magnitude of the harm prevented.`,
    criteria: [
      'Negligible harm; technically real but unnoticed',
      'A genuine annoyance most would accept rather than take a dependency for',
      'A real problem that has visibly cost people something',
      'A problem actively costing people money on this chain right now',
    ],
  },
  honest_not_overclaiming: {
    type: 'noul',
    instructions: `Does this description stay within what the contract can actually verify, rather than claiming an authority over intent or fraud that a contract cannot have?`,
  },
};

for (const [name, text] of Object.entries(VARIANTS)) {
  const r = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ state: { candidate: text }, model: 'jev-latest', questions: Q }),
  });
  const a = (await r.json()).answers;
  console.log(
    `${name.padEnd(12)} arc-native ${a.arc_native.score.toFixed(1)}/3 (conf ${a.arc_native.confidence.toFixed(2)})  ` +
    `problème réel ${a.real_problem.score.toFixed(1)}/3  ` +
    `ne surpromet pas ${(a.honest_not_overclaiming.noul * 100).toFixed(0)}%`,
  );
}
