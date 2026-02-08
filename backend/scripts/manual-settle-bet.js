/**
 * Manually settle a bet for a user
 * Usage: node scripts/manual-settle-bet.js <battleId> <userAddress> <winner> <payoutRatio>
 * Example: node scripts/manual-settle-bet.js 0x82b81d716a70f73fa213e791e5810c74efe9da2348fa9a442c7875e504889384 0x2F4bceBF573e63356358dF910f656eC8162f29a6 bull 1.8
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { connectDB } from '../src/db/index.js';
import { getUserBets, settleBets } from '../src/db/services/betService.js';
import stateManager from '../src/state.mjs';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

async function main() {
  const battleId = process.argv[2];
  const userAddress = process.argv[3];
  const winner = process.argv[4]; // 'bull', 'bear', or 'draw'
  const payoutRatio = parseFloat(process.argv[5]) || 0;

  if (!battleId || !userAddress || !winner) {
    console.error('Usage: node scripts/manual-settle-bet.js <battleId> <userAddress> <winner> <payoutRatio>');
    console.error('Example: node scripts/manual-settle-bet.js 0x82b81d716a70f73fa213e791e5810c74efe9da2348fa9a442c7875e504889384 0x2F4bceBF573e63356358dF910f656eC8162f29a6 bull 1.8');
    process.exit(1);
  }

  try {
    await connectDB();
    console.log('✅ Connected to database\n');

    // Get user's bets for this battle
    console.log(`🔍 Finding unsettled bets for user ${userAddress} on battle ${battleId}...`);
    const userBets = await getUserBets(userAddress.toLowerCase(), { battleId });
    const unsettledBets = userBets.filter(bet => !bet.settled);
    
    if (unsettledBets.length === 0) {
      console.log('❌ No unsettled bets found for this user on this battle');
      console.log(`   Found ${userBets.length} total bet(s), all are already settled`);
      process.exit(1);
    }

    console.log(`✅ Found ${unsettledBets.length} unsettled bet(s):`);
    unsettledBets.forEach((bet, index) => {
      console.log(`\nBet ${index + 1}:`);
      console.log(`  Bet ID: ${bet._id}`);
      console.log(`  Side: ${bet.side}`);
      console.log(`  Amount: ${bet.amount} USDC`);
    });

    // Settle all bets for this battle
    console.log(`\n💰 Settling bets for battle ${battleId}...`);
    console.log(`   Winner: ${winner}`);
    console.log(`   Payout Ratio: ${payoutRatio > 0 ? payoutRatio : 'Auto (2x if won, 0 if lost)'}`);
    
    const settledBets = await settleBets(battleId, winner, payoutRatio);
    
    if (!settledBets || settledBets.length === 0) {
      console.log('❌ No bets were settled');
      process.exit(1);
    }

    console.log(`\n✅ Settled ${settledBets.length} bet(s):`);
    settledBets.forEach((bet, index) => {
      const won = bet.won;
      const payout = bet.payout || 0;
      const winnings = won ? (payout - bet.amount) : 0;
      
      console.log(`\nBet ${index + 1}:`);
      console.log(`  Bet ID: ${bet._id}`);
      console.log(`  Side: ${bet.side}`);
      console.log(`  Amount: ${bet.amount} USDC`);
      console.log(`  Won: ${won ? '✅ YES' : '❌ NO'}`);
      console.log(`  Payout: ${payout} USDC`);
      console.log(`  Winnings: ${winnings > 0 ? '+' : ''}${winnings} USDC`);
    });

    // Find the user's settled bet and emit event
    const userSettledBet = settledBets.find(bet => bet.bettor.toLowerCase() === userAddress.toLowerCase());
    if (userSettledBet && userSettledBet.won && userSettledBet.payout > 0) {
      const winnings = userSettledBet.payout - userSettledBet.amount;
      console.log(`\n📢 Emitting winnings event for user...`);
      
      // Emit winnings event
      stateManager.emit('betWinningsDistributed', {
        battleId,
        bettor: userSettledBet.bettor,
        betId: userSettledBet._id,
        betAmount: userSettledBet.amount,
        winnings,
        totalPayout: userSettledBet.payout,
        side: userSettledBet.side,
        txHash: userSettledBet.txHash,
        viaYellow: false,
      });
      
      console.log(`✅ Winnings event emitted! User should receive toast notification.`);
    }

    console.log('\n✅ All bets settled successfully!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
