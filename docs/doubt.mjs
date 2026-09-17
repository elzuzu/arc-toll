/**
 * A second pass on the top candidates, testing the specific doubt the first pass could not express:
 * whether the problem each one solves is real or pedantic, and whether a reviewer would see it as
 * overlapping the builder's existing payment rail.
 */
const KEY = process.env.TYPESAFE_API_KEY;
const TOP = [
  { id: 'decimals-safe-vault',
    text: `A contract on Arc that accepts native USDC deposits at 18 decimals and tracks claims at the 6 decimals the ERC-20 predeploy reports, reverting on any amount whose conversion would truncate. The truncation it refuses is bounded: the factor between the two representations is exactly 1e12, so the largest residue any single conversion can lose is under 0.000001 USDC.` },
  { id: 'exact-gas-refund',
    text: `A contract on Arc where a sponsor pre-funds an allowance and callers are refunded the exact cost of their call, computed as gasUsed * tx.gasprice inside the transaction and paid in the same asset, because on Arc the gas token is USDC. Elsewhere this needs an ETH/USD oracle and always over- or under-refunds. The builder has already submitted ArcPay, a pay-per-call registry and escrow rail that settles in native USDC.` },
  { id: 'honeypot-registry',
    text: `A contract on Arc holding permissionless attestations about predatory liquidity pools, where the contract itself reads each accused pool's fee() and USDC balance as evidence rather than trusting the attester. Measured on Arc on 2026-09-17: Uniswap V4 pools configured with 97%, 99% and 88% fees hold under a thousandth of a dollar and sit alongside legitimate pools for the same token, draining any router that touches them.` },
];

const QUESTIONS = {
  real_problem: {
    type: 'score',
    instructions: `Does this solve a problem someone actually has, or a problem that is technically real but too small to matter in practice? Judge the magnitude of the harm it prevents.`,
    criteria: [
      'The harm it prevents is negligible; the problem is technically real but nobody would notice it',
      'A genuine annoyance, but one most builders would accept rather than adopt a dependency for',
      'A real problem that has visibly cost people something',
      'A problem that is actively costing people money on this chain right now',
    ],
  },
  reviewer_overlap: {
    type: 'noul',
    instructions: `Would a grant reviewer, having already seen this builder's pay-per-call and escrow payment rail, be likely to regard this new project as covering similar ground rather than as a genuinely separate contribution?`,
  },
  pitch_in_one_line: {
    type: 'score',
    instructions: `How easily could this project's value be made obvious to a reviewer in a single sentence, without the reviewer needing to already understand the chain's internals?`,
    criteria: [
      'Requires a page of background before the point lands',
      'Needs a paragraph of setup',
      'One sentence works if the reader knows the chain uses a stablecoin for gas',
      'One sentence lands with no background at all',
    ],
  },
};

for (const c of TOP) {
  const r = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ state: { candidate: c.text }, model: 'jev-latest', questions: QUESTIONS }),
  });
  const a = (await r.json()).answers;
  console.log(
    `${c.id.padEnd(22)} problème réel ${a.real_problem.score.toFixed(1)}/3 (conf ${a.real_problem.confidence.toFixed(2)})  ` +
    `recouvre ArcPay ${(a.reviewer_overlap.noul * 100).toFixed(0)}%  ` +
    `pitch en 1 phrase ${a.pitch_in_one_line.score.toFixed(1)}/3`,
  );
}
