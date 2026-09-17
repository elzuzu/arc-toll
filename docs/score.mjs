#!/usr/bin/env node
/**
 * Score candidate Arc Microgrant projects against the programme's stated criteria.
 *
 * Code owns the policy: the weights, the eligibility gate and the ranking live here, so they can be
 * changed without re-running inference. The model supplies only the per-dimension judgments.
 */
import { readFile, writeFile } from 'node:fs/promises';

const KEY = process.env.TYPESAFE_API_KEY;
if (!KEY) { console.error('TYPESAFE_API_KEY missing'); process.exit(1); }

const CHAIN_FACTS = `Arc is Circle's stablecoin-native L1, chain id 5042, mainnet opened 2026-09-16.
Its gas token is USDC carried at the EVM level with 18 decimals, so gasUsed * tx.gasprice is a
dollar amount directly, with no price feed in that expression. The USDC ERC-20 predeploy at
0x3600000000000000000000000000000000000000 reports the same single balance with 6 decimals; the two
views are related by exactly 1e12. Block time is 0.51s. Uniswap V2, V3 and V4 are deployed and
active; Curve, Balancer, Velodrome and DODO are absent.`;

const GRANT_RULES = `Twenty microgrants of 500 USDC each, for proofs of concept, tiny apps, demos,
prototypes and technical experiments running on Arc mainnet. The project must be DEPLOYED AND
WORKING ON ARC MAINNET at the time of submission: design mockups, slide decks, testnet-only builds
and projects with no Arc component are explicitly not eligible. What the reviewers look for:
relevance to Arc, technical credibility, the quality of what was built, and whether the project is
worth taking further. Promise counts for more than traction.`;

const ALREADY_SUBMITTED = `The same builder has already submitted two projects, so a third must be
genuinely distinct from both. ArcPay is a pay-per-call registry and autonomous escrow rail for
agents, settling in native USDC. ArcMeter is a permissionless registry of measured EVM gas costs
published in dollars. A registered competitor is separately building payments and escrow on Arc.`;

const QUESTIONS = {
  eligible_deployment: {
    type: 'noul',
    instructions: `Is the core artifact of this project a smart contract deployed on the chain, as
opposed to a library, an SDK, a command-line tool, a website, or a document? Answer about what the
project fundamentally IS, not about supporting pieces it might also ship.`,
  },
  arc_native: {
    type: 'score',
    instructions: `How much does this project depend on a property that is specific to Arc, given
the chain facts in state? Judge the mechanism described, not the topic.`,
    criteria: [
      'The same contract would work identically on Ethereum or any other EVM chain; nothing about Arc matters',
      'Arc makes it slightly cheaper or more convenient, but the mechanism is chain-agnostic',
      'It leans on an Arc property, but an equivalent could be built elsewhere with an oracle or extra machinery',
      'The mechanism is impossible or meaningless anywhere except Arc, because it relies on the gas token being the unit of account or on the dual 18/6 representation',
    ],
  },
  distinct_from_existing: {
    type: 'score',
    instructions: `How distinct is this from the two projects the same builder has already
submitted, described in state? A reviewer seeing all three should not feel they are variations of
one idea.`,
    criteria: [
      'Essentially a rework of one of the two existing projects',
      'A different feature set but the same category and audience',
      'A different category, sharing only an underlying fact about the chain',
      'Clearly a different kind of artifact, serving a different need and a different reader',
    ],
  },
  verifiable_credibility: {
    type: 'score',
    instructions: `Could an evaluator confirm this project actually does what it claims, in minutes,
using only public information such as chain reads and a test suite? Judge how much of the claim
rests on evidence anyone can reproduce versus on the builder's word.`,
    criteria: [
      'Its value rests on claims a reader must take on trust',
      'Partly checkable, but the interesting part is not directly observable',
      'Mostly checkable from chain reads and tests, with some judgment needed',
      'Every claim is reproducible by reading the chain or running the test suite',
    ],
  },
  worth_taking_further: {
    type: 'score',
    instructions: `Would another builder on Arc plausibly use this, or would it plausibly grow into
something larger? Judge usefulness to people other than its author.`,
    criteria: [
      'A demo with no plausible user beyond its author',
      'Interesting to look at, but nobody would depend on it',
      'A real if narrow need; a handful of builders would use it',
      'Addresses a need that many Arc builders will hit, and has an obvious path to something larger',
    ],
  },
  one_session_scope: {
    type: 'score',
    instructions: `Could an experienced Solidity developer build, test, deploy and document this to
a high standard in one focused working session, with no external dependencies or integrations to
negotiate?`,
    criteria: [
      'Weeks of work, or depends on other parties',
      'Several days of careful work',
      'One long session, tight but achievable',
      'Comfortably one session, with time left for tests and documentation',
    ],
  },
};

async function judge(candidate) {
  const body = {
    state: {
      arc_chain_facts: CHAIN_FACTS,
      grant_programme_rules: GRANT_RULES,
      builder_already_submitted: ALREADY_SUBMITTED,
      candidate_title: candidate.title,
      candidate_description: candidate.text,
    },
    model: 'jev-latest',
    questions: QUESTIONS,
  };
  const r = await fetch('https://api.typesafe.ai/v1/systemone', {
    method: 'POST',
    headers: { authorization: `Bearer ${KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${candidate.id}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).answers;
}

// Policy, deliberately in code: weights reflect the programme's own stated emphasis.
const WEIGHTS = {
  arc_native: 0.30,
  worth_taking_further: 0.25,
  verifiable_credibility: 0.20,
  distinct_from_existing: 0.15,
  one_session_scope: 0.10,
};

const SP = new URL('.', import.meta.url);
const candidates = JSON.parse(await readFile(new URL('candidates.json', SP), 'utf8'));

const rows = [];
for (const c of candidates) {
  const a = await judge(c);
  const dims = Object.fromEntries(Object.keys(WEIGHTS).map((k) => [k, a[k].score / 3]));
  const weighted = Object.entries(WEIGHTS).reduce((s, [k, w]) => s + dims[k] * w, 0);
  const eligible = a.eligible_deployment.noul;
  rows.push({
    id: c.id, title: c.title,
    eligible,
    // An ineligible project scores zero however good it is: the rule is a gate, not a preference.
    total: eligible >= 0.5 ? weighted : 0,
    raw: weighted,
    dims: Object.fromEntries(Object.keys(WEIGHTS).map((k) => [k, { score: a[k].score, conf: a[k].confidence }])),
  });
  process.stderr.write(`  scored ${c.id}\n`);
}

rows.sort((x, y) => y.total - x.total);
await writeFile(new URL('results.json', SP), JSON.stringify(rows, null, 2));

const pct = (v) => `${(v * 100).toFixed(0)}%`;
console.log('\nrank  total  elig  arc  worth  verif  disct  scope   project');
for (const r of rows) {
  const d = r.dims;
  console.log(
    `${String(rows.indexOf(r) + 1).padStart(2)}.  ${pct(r.total).padStart(5)}  ${pct(r.eligible).padStart(4)}  ` +
    `${d.arc_native.score.toFixed(1)}  ${d.worth_taking_further.score.toFixed(1)}    ` +
    `${d.verifiable_credibility.score.toFixed(1)}    ${d.distinct_from_existing.score.toFixed(1)}    ` +
    `${d.one_session_scope.score.toFixed(1)}   ${r.title}`,
  );
}
console.log('\n(scores are 0-3 on the described levels; total is the weighted mix, zeroed if not a deployed artifact)');
