/**
 * Manual script to save a bet that was placed on-chain but not saved to the database
 * Usage: node scripts/manual-save-bet.js <battleId> <battleAddress> <userAddress> <side> <amount> <txHash> [blockNumber]
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { connectDB } from '../src/db/index.js';
import { saveBet, getUserBets } from '../src/db/services/betService.js';

dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../.env') });

async function main() {
  const battleId = process.argv[2];
  const battleAddress = process.argv[3];
  const userAddress = process.argv[4];
  const side = process.argv[5];
  const amount = parseFloat(process.argv[6]);
  const txHash = process.argv[7];
  const blockNumber = process.argv[8] ? parseInt(process.argv[8]) : undefined;

  if (!battleId || !battleAddress || !userAddress || !side || !amount || !txHash) {
    console.error('Usage: node scripts/manual-save-bet.js <battleId> <battleAddress> <userAddress> <side> <amount> <txHash> [blockNumber]');
    process.exit(1);
  }

  try {
    await connectDB();
    console.log('✅ Connected to database');

    const existingBets = await getUserBets(userAddress.toLowerCase(), { battleId });
    if (existingBets.length > 0) {
      console.log(`⚠️ Found ${existingBets.length} existing bet(s)`);
      const matchingBet = existingBets.find(b => b.txHash === txHash);
      if (matchingBet) {
        console.log('✅ Bet already exists!');
        process.exit(0);
      }
    }

    const bet = await saveBet({
      battleId,
      battleAddress,
      bettor: userAddress.toLowerCase(),
      side: side.toLowerCase(),
      amount,
      txHash,
      blockNumber,
    });

    if (!bet) {
      console.error('❌ Failed to save bet');
      process.exit(1);
    }

    console.log(`✅ Bet saved! ID: ${bet._id}`);
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
