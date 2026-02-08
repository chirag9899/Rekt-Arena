#!/usr/bin/env node
/**
 * Setup Script for Primary Battle Agent Wallets
 * 
 * This script:
 * 1. Checks agent wallet balances (MATIC + USDC)
 * 2. Approves USDC for BattleFactory (one-time setup)
 * 3. Verifies approvals are successful
 * 
 * Run this once after deploying contracts and before starting the backend.
 * 
 * Usage: node scripts/setup-agent-wallets.js
 */

import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env') });

const RPC_URL = process.env.RPC_URL || 'https://rpc-amoy.polygon.technology';
const USDC_ADDRESS = process.env.USDC_ADDRESS || process.env.MOCK_USDC;
const BATTLE_FACTORY_ADDRESS = process.env.BATTLE_FACTORY_ADDRESS || process.env.BATTLE_FACTORY;
const BULL_AGENT_PRIVATE_KEY = process.env.BULL_AGENT_PRIVATE_KEY;
const BEAR_AGENT_PRIVATE_KEY = process.env.BEAR_AGENT_PRIVATE_KEY;

const MIN_MATIC_BALANCE = ethers.parseEther('1'); // 1 MATIC minimum
const MIN_USDC_BALANCE = 100 * 1e6; // 100 USDC minimum (6 decimals)

async function main() {
  console.log('🔧 Primary Battle Agent Wallet Setup\n');

  // Validate environment variables
  if (!BULL_AGENT_PRIVATE_KEY || !BEAR_AGENT_PRIVATE_KEY) {
    console.error('❌ Missing agent private keys in .env file');
    console.error('   Set BULL_AGENT_PRIVATE_KEY and BEAR_AGENT_PRIVATE_KEY');
    process.exit(1);
  }

  if (!USDC_ADDRESS || !BATTLE_FACTORY_ADDRESS) {
    console.error('❌ Missing contract addresses in .env file');
    console.error('   Set USDC_ADDRESS and BATTLE_FACTORY_ADDRESS');
    process.exit(1);
  }

  // Connect to network
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  console.log(`📡 Connected to: ${RPC_URL}`);

  // Create wallets
  const bullWallet = new ethers.Wallet(BULL_AGENT_PRIVATE_KEY, provider);
  const bearWallet = new ethers.Wallet(BEAR_AGENT_PRIVATE_KEY, provider);

  console.log(`\n🐂 Bull Agent: ${bullWallet.address}`);
  console.log(`🐻 Bear Agent: ${bearWallet.address}\n`);

  // USDC Contract
  const usdcAbi = [
    'function balanceOf(address account) external view returns (uint256)',
    'function allowance(address owner, address spender) external view returns (uint256)',
    'function approve(address spender, uint256 amount) external returns (bool)',
    'function decimals() external view returns (uint8)',
  ];
  const usdcContract = new ethers.Contract(USDC_ADDRESS, usdcAbi, provider);

  // Check USDC decimals
  const decimals = await usdcContract.decimals();
  console.log(`💵 USDC Decimals: ${decimals}\n`);

  // Step 1: Check Balances
  console.log('📊 Checking Balances...\n');

  const [bullMatic, bearMatic, bullUsdc, bearUsdc] = await Promise.all([
    provider.getBalance(bullWallet.address),
    provider.getBalance(bearWallet.address),
    usdcContract.balanceOf(bullWallet.address),
    usdcContract.balanceOf(bearWallet.address),
  ]);

  console.log(`Bull Agent:`);
  console.log(`  MATIC: ${ethers.formatEther(bullMatic)} ${bullMatic >= MIN_MATIC_BALANCE ? '✅' : '❌ (need ≥1 MATIC)'}`);
  console.log(`  USDC:  ${Number(bullUsdc) / 10**Number(decimals)} ${bullUsdc >= MIN_USDC_BALANCE ? '✅' : '❌ (need ≥100 USDC)'}`);

  console.log(`\nBear Agent:`);
  console.log(`  MATIC: ${ethers.formatEther(bearMatic)} ${bearMatic >= MIN_MATIC_BALANCE ? '✅' : '❌ (need ≥1 MATIC)'}`);
  console.log(`  USDC:  ${Number(bearUsdc) / 10**Number(decimals)} ${bearUsdc >= MIN_USDC_BALANCE ? '✅' : '❌ (need ≥100 USDC)'}`);

  const hasEnoughBalance = 
    bullMatic >= MIN_MATIC_BALANCE && 
    bearMatic >= MIN_MATIC_BALANCE && 
    bullUsdc >= MIN_USDC_BALANCE && 
    bearUsdc >= MIN_USDC_BALANCE;

  if (!hasEnoughBalance) {
    console.log('\n⚠️  WARNING: Insufficient balances detected!');
    console.log('   Primary battles require:');
    console.log('   - 1+ MATIC per wallet (for gas)');
    console.log('   - 100+ USDC per wallet (for battle collateral)');
    console.log('\n   Please fund the wallets before continuing.\n');
  }

  // Step 2: Check Approvals
  console.log('\n🔍 Checking USDC Approvals...\n');

  const [bullAllowance, bearAllowance] = await Promise.all([
    usdcContract.allowance(bullWallet.address, BATTLE_FACTORY_ADDRESS),
    usdcContract.allowance(bearWallet.address, BATTLE_FACTORY_ADDRESS),
  ]);

  console.log(`Bull Agent Allowance: ${Number(bullAllowance) / 10**Number(decimals)} USDC`);
  console.log(`Bear Agent Allowance: ${Number(bearAllowance) / 10**Number(decimals)} USDC`);

  const needsApproval = bullAllowance < MIN_USDC_BALANCE || bearAllowance < MIN_USDC_BALANCE;

  if (!needsApproval) {
    console.log('\n✅ Both wallets already have sufficient USDC approval!');
    console.log('   Primary battle service is ready to use.\n');
    return;
  }

  // Step 3: Approve USDC
  console.log('\n📝 Approving USDC for BattleFactory...');
  console.log(`   Spender: ${BATTLE_FACTORY_ADDRESS}\n`);

  try {
    // Approve for Bull Agent
    if (bullAllowance < MIN_USDC_BALANCE) {
      console.log('Approving for Bull Agent...');
      const bullTx = await usdcContract.connect(bullWallet).approve(
        BATTLE_FACTORY_ADDRESS,
        ethers.MaxUint256
      );
      console.log(`  Tx: ${bullTx.hash}`);
      await bullTx.wait();
      console.log('  ✅ Bull Agent approved\n');
    } else {
      console.log('  ✅ Bull Agent already approved\n');
    }

    // Approve for Bear Agent
    if (bearAllowance < MIN_USDC_BALANCE) {
      console.log('Approving for Bear Agent...');
      const bearTx = await usdcContract.connect(bearWallet).approve(
        BATTLE_FACTORY_ADDRESS,
        ethers.MaxUint256
      );
      console.log(`  Tx: ${bearTx.hash}`);
      await bearTx.wait();
      console.log('  ✅ Bear Agent approved\n');
    } else {
      console.log('  ✅ Bear Agent already approved\n');
    }

    console.log('✅ All approvals complete!\n');
    console.log('🚀 You can now start the backend with: npm run dev');
    console.log('   Primary battles will be automatically created.\n');

  } catch (error) {
    console.error('\n❌ Approval failed:', error.message);
    if (error.message?.includes('insufficient funds')) {
      console.error('   → Wallets need more MATIC for gas fees');
    }
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
