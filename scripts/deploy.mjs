#!/usr/bin/env node
/**
 * Deploy ArcToll to Arc Mainnet.
 *
 * Estimates and prints everything first, and only broadcasts when passed --execute. The signing key
 * is read from the macOS keychain at the moment it is needed and never written to a file, an
 * environment variable, or this program's output.
 */
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createPublicClient, createWalletClient, fallback, http, formatUnits } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const RPCS = [
  'https://rpc.mainnet.arc.io',
  'https://rpc.drpc.mainnet.arc.io',
  'https://rpc.quicknode.mainnet.arc.io',
];
const CHAIN_ID = 5042;
const EXPECTED_DEPLOYER = '0xd3fb4e6479749100D876584e7F5c5cC1EEAE51A5';
const EXECUTE = process.argv.includes('--execute');

const arc = {
  id: CHAIN_ID,
  name: 'Arc Mainnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: RPCS } },
  blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' } },
};

function keyFromKeychain() {
  const raw = execFileSync('security', ['find-generic-password', '-s', 'arc-grant-wallet', '-a', 'deploy', '-w'], {
    encoding: 'utf8',
  }).trim();
  return raw.startsWith('0x') ? raw : `0x${raw}`;
}

const usdc = (v) => `${formatUnits(v, 18)} USDC`;

async function main() {
  const artifact = JSON.parse(
    await readFile(new URL('../contracts/out/ArcToll.sol/ArcToll.json', import.meta.url), 'utf8'),
  );
  const bytecode = artifact.bytecode.object;
  const abi = artifact.abi;

  const publicClient = createPublicClient({ chain: arc, transport: fallback(RPCS.map((u) => http(u))) });
  const account = privateKeyToAccount(keyFromKeychain());

  const [chainId, balance, gasPrice, block] = await Promise.all([
    publicClient.getChainId(),
    publicClient.getBalance({ address: account.address }),
    publicClient.getGasPrice(),
    publicClient.getBlockNumber(),
  ]);

  console.log('======================================================');
  console.log(`  chain            : ${chainId}${chainId === CHAIN_ID ? ' (Arc Mainnet)' : ' *** WRONG CHAIN ***'}`);
  console.log(`  block            : #${block}`);
  console.log(`  deployer         : ${account.address}`);
  console.log(`  expected         : ${EXPECTED_DEPLOYER}`);
  console.log(`  balance          : ${usdc(balance)}`);
  console.log(`  gas price        : ${formatUnits(gasPrice, 9)} gwei`);
  console.log(`  bytecode         : ${bytecode.length / 2 - 1} bytes`);

  if (chainId !== CHAIN_ID) throw new Error(`refusing to deploy to chain ${chainId}`);
  if (account.address.toLowerCase() !== EXPECTED_DEPLOYER.toLowerCase()) {
    throw new Error(`keychain key derives ${account.address}, not the expected deployer`);
  }

  const gas = await publicClient.estimateGas({ account, data: bytecode });
  const cost = gas * gasPrice;
  console.log(`  estimated gas    : ${gas}`);
  console.log(`  estimated cost   : ${usdc(cost)}`);
  console.log(`  balance after    : ${usdc(balance - cost)}`);
  console.log('======================================================');

  if (balance < cost * 3n) throw new Error('balance is under three times the estimate; refusing');

  if (!EXECUTE) {
    console.log('\n--- DRY RUN (pass --execute to broadcast) ---');
    return;
  }

  const wallet = createWalletClient({ account, chain: arc, transport: fallback(RPCS.map((u) => http(u))) });
  const hash = await wallet.deployContract({ abi, bytecode, args: [] });
  console.log(`\n[+] broadcast ${hash}`);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  console.log(`[+] status       : ${receipt.status}`);
  console.log(`[+] address      : ${receipt.contractAddress}`);
  console.log(`[+] gas used     : ${receipt.gasUsed}`);
  console.log(`[+] cost         : ${usdc(receipt.gasUsed * receipt.effectiveGasPrice)}`);
  console.log(`[+] explorer     : https://explorer.arc.io/address/${receipt.contractAddress}`);

  const record = {
    contractAddress: receipt.contractAddress,
    chainId: CHAIN_ID,
    deployer: account.address,
    transactionHash: hash,
    blockNumber: receipt.blockNumber.toString(),
    gasUsed: receipt.gasUsed.toString(),
    deploymentCostNative: (receipt.gasUsed * receipt.effectiveGasPrice).toString(),
    deployedAt: new Date().toISOString(),
    explorer: `https://explorer.arc.io/address/${receipt.contractAddress}`,
  };
  const { writeFile } = await import('node:fs/promises');
  await writeFile(new URL('../deployment.json', import.meta.url), JSON.stringify(record, null, 2) + '\n');
  console.log('[+] wrote deployment.json');
}

main().catch((e) => { console.error(`\n[x] ${e.message}`); process.exit(1); });
