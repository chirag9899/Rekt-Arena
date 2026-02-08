#!/usr/bin/env node
/**
 * Mint MockUSDC to a specific address
 * 
 * Usage: node scripts/mint-usdc-to-address.js <address> <amount>
 * Example: node scripts/mint-usdc-to-address.js 0x2F4bceBF573e63356358dF910f656eC8162f29a6 1000
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
const USDC_ADDRESS = process.env.USDC_ADDRESS || process.env.MOCK_USDC || process.env.VITE_MOCK_USDC;
const PRIVATE_KEY = process.env.PRIVATE_KEY; // Owner of MockUSDC

// Get address and amount from command line args
const targetAddress = process.argv[2];
const amount = parseFloat(process.argv[3]) || 1000; // Default 1000 USDC

if (!targetAddress) {
  console.error('❌ Missing target address');
  console.error('Usage: node scripts/mint-usdc-to-address.js <address> [amount]');
  console.error('Example: node scripts/mint-usdc-to-address.js 0x2F4bceBF573e63356358dF910f656eC8162f29a6 1000');
  process.exit(1);
}

// Validate address format
if (!ethers.isAddress(targetAddress)) {
  console.error(`❌ Invalid address: ${targetAddress}`);
  process.exit(1);
}

// Amount to mint: amount USDC (6 decimals)
const MINT_AMOUNT = BigInt(Math.floor(amount * 1000000)); // amount * 10^6

async function main() {
  console.log(`💵 Minting ${amount} USDC to ${targetAddress}\n`);

  // Validate environment variables
  if (!PRIVATE_KEY) {
    console.error('❌ Missing PRIVATE_KEY in .env file');
    console.error('   This should be the owner of the MockUSDC contract');
    process.exit(1);
  }

  if (!USDC_ADDRESS) {
    console.error('❌ Missing USDC_ADDRESS in .env file');
    console.error('   Set USDC_ADDRESS or MOCK_USDC to the deployed MockUSDC contract address');
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

    // Check current balance
    console.log('📊 Current Balance:');
    const currentBalance = await usdcContract.balanceOf(targetAddress);
    console.log(`   ${targetAddress}: ${Number(currentBalance) / 10**Number(decimals)} USDC\n`);

    // Mint
    console.log(`🏭 Minting ${amount} USDC to ${targetAddress}...\n`);
    
    console.log('📝 Sending transaction...');
    const tx = await usdcContract.mint(targetAddress, MINT_AMOUNT);
    console.log(`   Tx Hash: ${tx.hash}`);
    
    console.log('⏳ Waiting for confirmation...');
    const receipt = await tx.wait();
    console.log(`   ✅ Confirmed in block ${receipt.blockNumber}\n`);

    // Check new balance
    console.log('📊 New Balance:');
    const newBalance = await usdcContract.balanceOf(targetAddress);
    console.log(`   ${targetAddress}: ${Number(newBalance) / 10**Number(decimals)} USDC ✅\n`);

    console.log('✅ Minting complete!\n');
    console.log(`🔗 View on PolygonScan: https://amoy.polygonscan.com/tx/${tx.hash}\n`);

  } catch (error) {
    console.error('\n❌ Minting failed:', error.message);
    
    if (error.message?.includes('Ownable')) {
      console.error('   → Only the contract owner can mint tokens');
      console.error('   → Check that PRIVATE_KEY is the owner\'s key');
    } else if (error.message?.includes('insufficient funds')) {
      console.error('   → Owner wallet needs MATIC for gas fees');
      console.error(`   → Send MATIC to: ${ownerWallet.address}`);
    } else if (error.message?.includes('nonce')) {
      console.error('   → Transaction nonce error. Try again in a moment.');
    }
    
    console.error('\nFull error:', error);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Error:', error);
  process.exit(1);
});
