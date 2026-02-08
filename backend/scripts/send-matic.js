#!/usr/bin/env node
/**
 * Send MATIC to Agent Wallets
 * 
 * This script sends MATIC from your main wallet to the agent wallets
 * so they can pay for gas fees.
 * 
 * Usage: node scripts/send-matic.js
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
const PRIVATE_KEY = process.env.PRIVATE_KEY; // Your main wallet
const BULL_AGENT_ADDRESS = '0x9a0ddD8564f4d3C0dCFEc26840231339648c9516';
const BEAR_AGENT_ADDRESS = '0xcb89843fdb4763c252e4EE7c31Ee1CC753ffdBD7';

// Amount to send: 5 MATIC each
const MATIC_AMOUNT = ethers.parseEther('5');

async function main() {
  console.log('💰 Sending MATIC to Agent Wallets\n');

  // Validate environment variables
  if (!PRIVATE_KEY) {
    console.error('❌ Missing PRIVATE_KEY in .env file');
    process.exit(1);
  }

  // Connect to network
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  console.log(`📡 Connected to: ${RPC_URL}`);

  // Create sender wallet
  const senderWallet = new ethers.Wallet(PRIVATE_KEY, provider);
  console.log(`💳 Sender wallet: ${senderWallet.address}\n`);

  try {
    // Check sender balance
    const senderBalance = await provider.getBalance(senderWallet.address);
    console.log(`📊 Sender Balance: ${ethers.formatEther(senderBalance)} MATIC`);
    
    const totalNeeded = MATIC_AMOUNT * 2n; // 2 recipients
    if (senderBalance < totalNeeded) {
      console.error(`\n❌ Insufficient MATIC balance`);
      console.error(`   Need: ${ethers.formatEther(totalNeeded)} MATIC`);
      console.error(`   Have: ${ethers.formatEther(senderBalance)} MATIC`);
      console.error(`\n   Get testnet MATIC from: https://faucet.polygon.technology/`);
      process.exit(1);
    }

    console.log(`✅ Sufficient balance\n`);

    // Send to Bull Agent
    console.log(`📤 Sending ${ethers.formatEther(MATIC_AMOUNT)} MATIC to Bull Agent...`);
    const bullTx = await senderWallet.sendTransaction({
      to: BULL_AGENT_ADDRESS,
      value: MATIC_AMOUNT,
    });
    console.log(`   Tx: ${bullTx.hash}`);
    await bullTx.wait();
    console.log(`   ✅ Confirmed\n`);

    // Send to Bear Agent
    console.log(`📤 Sending ${ethers.formatEther(MATIC_AMOUNT)} MATIC to Bear Agent...`);
    const bearTx = await senderWallet.sendTransaction({
      to: BEAR_AGENT_ADDRESS,
      value: MATIC_AMOUNT,
    });
    console.log(`   Tx: ${bearTx.hash}`);
    await bearTx.wait();
    console.log(`   ✅ Confirmed\n`);

    // Check new balances
    console.log('📊 New Balances:');
    const [bullBalance, bearBalance] = await Promise.all([
      provider.getBalance(BULL_AGENT_ADDRESS),
      provider.getBalance(BEAR_AGENT_ADDRESS),
    ]);
    
    console.log(`   Bull Agent: ${ethers.formatEther(bullBalance)} MATIC ✅`);
    console.log(`   Bear Agent: ${ethers.formatEther(bearBalance)} MATIC ✅\n`);

    console.log('✅ MATIC sent successfully!\n');
    console.log('🎯 Next steps:');
    console.log('   1. Run: npm run setup (to approve USDC)');
    console.log('   2. Run: npm run dev (to start backend)');
    console.log('   3. Primary battles will be created automatically!\n');

  } catch (error) {
    console.error('\n❌ Transfer failed:', error.message);
    
    if (error.message?.includes('insufficient funds')) {
      console.error('   → Sender wallet needs more MATIC');
      console.error('   → Get testnet MATIC from: https://faucet.polygon.technology/');
    }
    
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
