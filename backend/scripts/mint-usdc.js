#!/usr/bin/env node
/**
 * Mint MockUSDC to Agent Wallets
 * 
 * This script mints test USDC to the Bull and Bear agent wallets
 * so they can fund primary battles.
 * 
 * Usage: node scripts/mint-usdc.js
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
const USDC_ADDRESS = process.env.USDC_ADDRESS || process.env.MOCK_USDC; // Try both
const PRIVATE_KEY = process.env.PRIVATE_KEY; // Owner of MockUSDC
const BULL_AGENT_ADDRESS = '0x9a0ddD8564f4d3C0dCFEc26840231339648c9516';
const BEAR_AGENT_ADDRESS = '0xcb89843fdb4763c252e4EE7c31Ee1CC753ffdBD7';

// Amount to mint: 10,000 USDC (6 decimals)
const MINT_AMOUNT = 10000n * 1000000n; // 10,000 * 10^6

async function main() {
  console.log('💵 Minting MockUSDC to Agent Wallets\n');

  // Validate environment variables
  if (!PRIVATE_KEY) {
    console.error('❌ Missing PRIVATE_KEY in .env file');
    console.error('   This should be the owner of the MockUSDC contract');
    process.exit(1);
  }

  if (!USDC_ADDRESS) {
    console.error('❌ Missing USDC_ADDRESS in .env file');
    console.error('   Set USDC_ADDRESS to the deployed MockUSDC contract address');
    process.exit(1);
  }

  // Connect to network
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  console.log(`📡 Connected to: ${RPC_URL}`);

  // Create owner wallet
  const ownerWallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log(`🔑 Owner wallet: ${ownerWallet.address}\n`);

  // MockUSDC Contract
  const usdcAbi = [
    'function mint(address to, uint256 amount) external',
    'function batchMint(address[] calldata recipients, uint256[] calldata amounts) external',
    'function balanceOf(address account) external view returns (uint256)',
    'function decimals() external view returns (uint8)',
    'function owner() external view returns (address)',
  ];
  const usdcContract = new ethers.Contract(USDC_ADDRESS, usdcAbi, ownerWallet);

  try {
    // Check contract info
    const decimals = await usdcContract.decimals();
    const contractOwner = await usdcContract.owner();
    
    console.log(`💵 MockUSDC: ${USDC_ADDRESS}`);
    console.log(`   Decimals: ${decimals}`);
    console.log(`   Owner: ${contractOwner}\n`);

    // Verify caller is owner
    if (contractOwner.toLowerCase() !== ownerWallet.address.toLowerCase()) {
      console.error(`❌ Wallet ${ownerWallet.address} is not the owner of MockUSDC`);
      console.error(`   Owner is: ${contractOwner}`);
      console.error(`   Please use the owner's private key (PRIVATE_KEY in .env)`);
      process.exit(1);
    }

    console.log('✅ Owner verified\n');

    // Check current balances
    console.log('📊 Current Balances:');
    const [bullBalance, bearBalance] = await Promise.all([
      usdcContract.balanceOf(BULL_AGENT_ADDRESS),
      usdcContract.balanceOf(BEAR_AGENT_ADDRESS),
    ]);
    
    console.log(`   Bull Agent: ${Number(bullBalance) / 10**Number(decimals)} USDC`);
    console.log(`   Bear Agent: ${Number(bearBalance) / 10**Number(decimals)} USDC\n`);

    // Mint using batchMint (more efficient)
    console.log(`🏭 Minting ${Number(MINT_AMOUNT) / 10**Number(decimals)} USDC to each agent...\n`);
    
    const recipients = [BULL_AGENT_ADDRESS, BEAR_AGENT_ADDRESS];
    const amounts = [MINT_AMOUNT, MINT_AMOUNT];

    console.log('📝 Sending transaction...');
    const tx = await usdcContract.batchMint(recipients, amounts);
    console.log(`   Tx Hash: ${tx.hash}`);
    
    console.log('⏳ Waiting for confirmation...');
    const receipt = await tx.wait();
    console.log(`   ✅ Confirmed in block ${receipt.blockNumber}\n`);

    // Check new balances
    console.log('📊 New Balances:');
    const [bullBalanceNew, bearBalanceNew] = await Promise.all([
      usdcContract.balanceOf(BULL_AGENT_ADDRESS),
      usdcContract.balanceOf(BEAR_AGENT_ADDRESS),
    ]);
    
    console.log(`   Bull Agent: ${Number(bullBalanceNew) / 10**Number(decimals)} USDC ✅`);
    console.log(`   Bear Agent: ${Number(bearBalanceNew) / 10**Number(decimals)} USDC ✅\n`);

    console.log('✅ Minting complete!\n');
    console.log('🎯 Next steps:');
    console.log('   1. Run: npm run setup (to approve USDC)');
    console.log('   2. Run: npm run dev (to start backend)');
    console.log('   3. Primary battles will be created automatically!\n');

  } catch (error) {
    console.error('\n❌ Minting failed:', error.message);
    
    if (error.message?.includes('Ownable')) {
      console.error('   → Only the contract owner can mint tokens');
      console.error('   → Check that PRIVATE_KEY is the owner\'s key');
    } else if (error.message?.includes('insufficient funds')) {
      console.error('   → Owner wallet needs MATIC for gas fees');
      console.error(`   → Send MATIC to: ${ownerWallet.address}`);
    }
    
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
