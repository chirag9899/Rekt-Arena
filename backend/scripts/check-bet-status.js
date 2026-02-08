/**
 * Check bet status for a user
 * Usage: node scripts/check-bet-status.js <userAddress> [battleId]
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { connectDB } from '../src/db/index.js';
import { getUserBets, getBattleBets } from '../src/db/services/betService.js';
import { Bet } from '../src/db/models/Bet.js';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

async function main() {
  const userAddress = process.argv[2];
  const battleId = process.argv[3];

  if (!userAddress) {
    console.error('Usage: node scripts/check-bet-status.js <userAddress> [battleId]');
    console.error('Example: node scripts/check-bet-status.js 0x2F4bceBF573e63356358dF910f656eC8162f29a6');
    process.exit(1);
  }

  try {
    await connectDB();
    console.log('✅ Connected to database\n');

    // Check by txHash
    const txHash = '0xfb8fe5ecff432df3759b2d613e2b37e086c2e47efb5b900e5da06497b1b32eb8';
    console.log(`🔍 Checking for bet with txHash: ${txHash}`);
    const betByTx = await Bet.findOne({ txHash });
    
    if (betByTx) {
      console.log('✅ Found bet by transaction hash:');
      console.log(`  Bet ID: ${betByTx._id}`);
      console.log(`  BattleId: ${betByTx.battleId}`);
      console.log(`  BattleAddress: ${betByTx.battleAddress}`);
      console.log(`  Bettor: ${betByTx.bettor}`);
      console.log(`  Side: ${betByTx.side}`);
      console.log(`  Amount: ${betByTx.amount} USDC`);
      console.log(`  TxHash: ${betByTx.txHash}`);
      console.log(`  BlockNumber: ${betByTx.blockNumber || 'N/A'}`);
      console.log(`  Settled: ${betByTx.settled}`);
      console.log(`  Won: ${betByTx.won !== undefined ? betByTx.won : 'N/A'}`);
      console.log(`  Payout: ${betByTx.payout || 0} USDC`);
      console.log(`  CreatedAt: ${betByTx.createdAt}`);
      console.log(`  SettledAt: ${betByTx.settledAt || 'N/A'}`);
    } else {
      console.log('❌ Bet not found by transaction hash\n');
    }

    // Check by battleId
    const targetBattleId = battleId || '0x82b81d716a70f73fa213e791e5810c74efe9da2348fa9a442c7875e504889384';
    console.log(`\n🔍 Checking for bets on battle: ${targetBattleId}`);
    const battleBets = await getBattleBets(targetBattleId);
    console.log(`Found ${battleBets.length} bet(s) for this battle:`);
    
    battleBets.forEach((bet, index) => {
      console.log(`\nBet ${index + 1}:`);
      console.log(`  Bet ID: ${bet._id}`);
      console.log(`  Bettor: ${bet.bettor}`);
      console.log(`  Side: ${bet.side}`);
      console.log(`  Amount: ${bet.amount} USDC`);
      console.log(`  TxHash: ${bet.txHash}`);
      console.log(`  Settled: ${bet.settled}`);
      console.log(`  Won: ${bet.won !== undefined ? bet.won : 'N/A'}`);
      console.log(`  Payout: ${bet.payout || 0} USDC`);
    });

    // Check user's bets
    console.log(`\n🔍 Checking all bets for user: ${userAddress}`);
    const userBets = await getUserBets(userAddress.toLowerCase());
    console.log(`Found ${userBets.length} bet(s) for this user:`);
    
    userBets.forEach((bet, index) => {
      console.log(`\nBet ${index + 1}:`);
      console.log(`  Bet ID: ${bet._id}`);
      console.log(`  BattleId: ${bet.battleId}`);
      console.log(`  Side: ${bet.side}`);
      console.log(`  Amount: ${bet.amount} USDC`);
      console.log(`  TxHash: ${bet.txHash}`);
      console.log(`  Settled: ${bet.settled}`);
      console.log(`  Won: ${bet.won !== undefined ? bet.won : 'N/A'}`);
      console.log(`  Payout: ${bet.payout || 0} USDC`);
    });

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
