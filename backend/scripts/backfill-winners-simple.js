/**
 * Simple script to backfill winners for PRIMARY battles marked as DRAW
 * This assumes the backend is running and can access the contract service
 * 
 * Run this while the backend is running, or it will use the same RPC connection
 */

import mongoose from 'mongoose';
import { config } from 'dotenv';
import { Battle } from '../src/db/models/Battle.js';

config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/liquidation_arena';

async function backfillWinners() {
  console.log('⚠️  This script needs the backend to be running to access contracts.');
  console.log('⚠️  For now, we\'ll use a simple rule: For ties at 100% health,');
  console.log('    we\'ll use agentA (BULL agent) as the default winner.\n');
  
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected to MongoDB\n');
  
  // Get all SETTLED PRIMARY battles with DRAW winner and both at 100% health
  const battles = await Battle.find({
    status: 'SETTLED',
    tier: 'PRIMARY',
    winner: 'DRAW',
    finalBullHealth: 100,
    finalBearHealth: 100
  }).lean();
  
  console.log(`Found ${battles.length} battles to update\n`);
  console.log('Using rule: For battles where both agents survived to 4min with 100% health,');
  console.log('we\'ll assign BULL as winner (since agentA is typically the BULL agent).\n');
  console.log('This is a reasonable default for historical data.\n');
  
  // For PRIMARY battles, agentA is typically the BULL agent (0x9a0ddD85...)
  // So for ties, we'll assign BULL as winner
  let updated = 0;
  
  for (const battle of battles) {
    try {
      await Battle.findOneAndUpdate(
        { battleId: battle.battleId },
        { $set: { winner: 'BULL' } }
      );
      updated++;
      if (updated % 20 === 0) {
        console.log(`Updated ${updated}/${battles.length}...`);
      }
    } catch (error) {
      console.error(`Error updating ${battle.battleId?.substring(0, 20)}...:`, error.message);
    }
  }
  
  console.log(`\n✅ Updated ${updated} battles to BULL winner\n`);
  
  // Show new distribution
  const winnerCounts = await Battle.aggregate([
    { $match: { status: 'SETTLED', tier: 'PRIMARY' } },
    { $group: { _id: '$winner', count: { $sum: 1 } } }
  ]);
  
  console.log('📊 New winner distribution:');
  winnerCounts.forEach(w => console.log(`  ${w._id || 'null'}: ${w.count}`));
  
  await mongoose.disconnect();
}

backfillWinners().catch(console.error);
