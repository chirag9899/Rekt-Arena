/**
 * Check battle status and settlement info
 * Usage: node scripts/check-battle-status.js <battleId>
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { connectDB } from '../src/db/index.js';
import { getBattle } from '../src/db/services/battleService.js';
import { getBattleBets } from '../src/db/services/betService.js';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

async function main() {
  const battleId = process.argv[2] || '0x82b81d716a70f73fa213e791e5810c74efe9da2348fa9a442c7875e504889384';

  try {
    await connectDB();
    console.log('✅ Connected to database\n');

    console.log(`🔍 Checking battle: ${battleId}\n`);
    const battle = await getBattle(battleId);
    
    if (!battle) {
      console.log('❌ Battle not found in database');
      console.log('   This might be a PRIMARY battle that was not saved to DB');
      process.exit(1);
    }

    console.log('📊 Battle Details:');
    console.log(`  ID: ${battle.id || battle._id}`);
    console.log(`  Status: ${battle.status}`);
    console.log(`  Tier: ${battle.tier || 'N/A'}`);
    console.log(`  BattleAddress: ${battle.battleAddress || 'N/A'}`);
    console.log(`  Winner: ${battle.winner || 'N/A'}`);
    console.log(`  FinalPrice: ${battle.finalPrice || 'N/A'}`);
    console.log(`  BullHealth: ${battle.bullHealth || 'N/A'}`);
    console.log(`  BearHealth: ${battle.bearHealth || 'N/A'}`);
    console.log(`  CreatedAt: ${battle.createdAt || 'N/A'}`);
    console.log(`  SettledAt: ${battle.settledAt || 'N/A'}`);
    console.log(`  SettlementTxHash: ${battle.settlementTxHash || 'N/A'}`);

    // Check bets
    console.log(`\n📊 Checking bets for this battle...`);
    const bets = await getBattleBets(battleId);
    console.log(`Found ${bets.length} bet(s):`);
    
    bets.forEach((bet, index) => {
      console.log(`\nBet ${index + 1}:`);
      console.log(`  Bettor: ${bet.bettor}`);
      console.log(`  Side: ${bet.side}`);
      console.log(`  Amount: ${bet.amount} USDC`);
      console.log(`  Settled: ${bet.settled}`);
      console.log(`  Won: ${bet.won !== undefined ? bet.won : 'N/A'}`);
      console.log(`  Payout: ${bet.payout || 0} USDC`);
    });

    // Check if battle is settled
    if (battle.status === 'SETTLED' && battle.winner) {
      console.log(`\n✅ Battle is settled! Winner: ${battle.winner}`);
      console.log(`   You can now run: node scripts/manual-settle-bet.js ${battleId} <userAddress> ${battle.winner.toLowerCase()} <payoutRatio>`);
    } else {
      console.log(`\n⚠️ Battle is not settled yet. Status: ${battle.status}`);
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
