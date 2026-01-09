#!/usr/bin/env node
import 'dotenv/config';
import { ethers } from 'ethers';

// WARNING: Storing a private key in environment variables is risky. Only use in
// a secure, offline or controlled environment. Do NOT use a funded mainnet key
// you care about unless you understand the risks.

// Config via environment variables
const PRIVATE_KEY = process.env.PRIVATE_KEY; // required
const RPC_URL = process.env.RPC_URL || process.env.VITE_RPC_URL || 'https://mainnet.base.org';
const TOTAL_SWAPS = parseInt(process.env.TOTAL_SWAPS || '10', 10);
const AMOUNT = process.env.AMOUNT || '0.01'; // USDC amount as string
const DELAY_MS = parseInt(process.env.DELAY_MS || '15000', 10); // ms between txs

if (!PRIVATE_KEY) {
  console.error('Missing PRIVATE_KEY in environment. Aborting.');
  process.exit(1);
}

// Addresses (match constants.ts)
const USDC_ADDRESS = '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913';
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006';
const UNISWAP_ROUTER_ADDRESS = '0x26261513f42d602997386198f608d907c406311c';

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function approve(address spender, uint256 amount) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)'
];

const ROUTER_ABI = ['function execute(bytes commands, bytes[] inputs, uint256 deadline) payable'];

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

(async () => {
  console.log('Batch sender starting...');
  console.log(`RPC: ${RPC_URL}`);
  console.log(`Total swaps: ${TOTAL_SWAPS}, amount: ${AMOUNT} USDC, delay: ${DELAY_MS}ms`);

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
  const address = await wallet.getAddress();
  console.log('Using wallet:', address);

  const usdc = new ethers.Contract(USDC_ADDRESS, ERC20_ABI, wallet);
  const router = new ethers.Contract(UNISWAP_ROUTER_ADDRESS, ROUTER_ABI, wallet);

  const amountInUnits = ethers.parseUnits(AMOUNT, 6);

  // Approve if needed
  try {
    const currentAllowance = await usdc.allowance(address, UNISWAP_ROUTER_ADDRESS);
    if (BigInt(currentAllowance) < BigInt(amountInUnits) * BigInt(TOTAL_SWAPS)) {
      console.log('Approving USDC for router (MaxUint256)...');
      const tx = await usdc.approve(UNISWAP_ROUTER_ADDRESS, ethers.MaxUint256);
      console.log('Approve tx sent:', tx.hash);
      await tx.wait();
      console.log('Approve confirmed');
    } else {
      console.log('Sufficient allowance detected');
    }
  } catch (e) {
    console.error('Approval failed:', e);
    process.exit(1);
  }

  const fee = 500; // as in app code
  const coder = new ethers.AbiCoder();

  for (let i = 0; i < TOTAL_SWAPS; i++) {
    try {
      console.log(`Sending swap ${i + 1}/${TOTAL_SWAPS} ...`);

      const path = ethers.solidityPacked(['address', 'uint24', 'address'], [USDC_ADDRESS, fee, WETH_ADDRESS]);
      const inputs = [
        coder.encode(
          ['address', 'uint256', 'uint256', 'bytes', 'bool'],
          [address, amountInUnits, 0, path, true]
        )
      ];
      const deadline = Math.floor(Date.now() / 1000) + 60 * 20;
      // Gas price strategy: support a very low-priority (slow) mode
      let overrides = {};
      // estimate gas to avoid over-provisioning
      try {
        const estimatedGas = await router.estimateGas.execute('0x00', inputs, deadline);
        // add 10% buffer
        overrides.gasLimit = BigInt(estimatedGas) * 110n / 100n;
      } catch (eg) {
        // fallback to a safe default
        overrides.gasLimit = 800000n;
      }
      const GAS_MODE = (process.env.GAS_MODE || '').toLowerCase();
      const SLOW_GAS = (process.env.SLOW_GAS || 'false').toLowerCase() === 'true' || GAS_MODE === 'slow';
      if (SLOW_GAS) {
        try {
          // Fetch latest base fee
          const block = await provider.getBlock('latest');
          const baseFee = block && block.baseFeePerGas ? BigInt(block.baseFeePerGas) : null;
          const priorityGwei = process.env.PRIORITY_GWEI || '0.1'; // very low priority fee
          const MAXFEE_ADD_GWEI = process.env.MAXFEE_ADD_GWEI || '1';
          const priority = ethers.parseUnits(priorityGwei, 'gwei');
          const extra = ethers.parseUnits(MAXFEE_ADD_GWEI, 'gwei');
          if (baseFee) {
            // maxFee = baseFee * 1.1 + priority
            const maxFee = BigInt(baseFee) + BigInt(extra) + BigInt(priority);
            overrides.maxPriorityFeePerGas = priority;
            overrides.maxFeePerGas = maxFee;
          } else {
            // Fallback to feeData
            const feeData = await provider.getFeeData();
            const fallbackMax = feeData.maxFeePerGas || feeData.gasPrice || ethers.parseUnits('1', 'gwei');
            overrides.maxPriorityFeePerGas = priority;
            overrides.maxFeePerGas = BigInt(fallbackMax) + BigInt(extra) + BigInt(priority);
          }
          console.log(`Using slow gas: priority=${priorityGwei} gwei`);
        } catch (feeErr) {
          console.warn('Failed to compute slow gas overrides, sending without explicit fees:', feeErr);
        }
      }

      const tx = await router.execute('0x00', inputs, deadline, overrides);
      console.log(`TX sent: ${tx.hash} (waiting confirmation)`);
      await tx.wait();
      console.log(`TX confirmed: ${tx.hash}`);

      if (i < TOTAL_SWAPS - 1) await sleep(DELAY_MS);
    } catch (err) {
      console.error(`Swap ${i + 1} failed:`, err);
      // Decide: continue or abort? We'll continue after delay
      if (i < TOTAL_SWAPS - 1) await sleep(DELAY_MS);
    }
  }

  console.log('All swaps processed');
  process.exit(0);
})();
