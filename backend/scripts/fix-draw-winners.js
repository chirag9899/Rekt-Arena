import mongoose from 'mongoose';
import { config } from 'dotenv';
import { Battle } from '../src/db/models/Battle.js';

config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/liquidation_arena';

async function fixDrawWinners() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected\n');
  
  // Get all SETTLED PRIMARY battles with DRAW winner and both at 100% health
  // These were likely auto-liquidated at 4 minutes with both agents alive
  const battles = await Battle.find({
    status: 'SETTLED',
    tier: 'PRIMARY',
    winner: 'DRAW',
    finalBullHealth: 100,
    finalBearHealth: 100
  }).lean();
  
  console.log(`Found ${battles.length} battles with both agents at 100% health (likely auto-liquidated at 4min)\n`);
  console.log('These battles ended in a tie because both agents survived to the 4-minute mark.');
  console.log('Since both had 100% health, they were marked as DRAW.\n');
  console.log('For future battles, the logic has been updated to use price movement as a tiebreaker.\n');
  console.log('For these historical battles, we have a few options:');
  console.log('1. Keep them as DRAW (they were actual ties)');
  console.log('2. Use a different tiebreaker (e.g., agentA always wins, or random)');
  console.log('3. Check on-chain data if available\n');
  
  // Option: If we want to use agentA as winner for ties (simple rule)
  // Uncomment below to apply:
  /*
  let updated = 0;
  for (const battle of battles) {
    // For ties, default to BULL (agentA if isLong, or BEAR if not)
    // Actually, we need to check which agent is BULL
    const agentA = battle.agentA;
    if (agentA) {
      // If agentA is long, it's BULL; if short, it's BEAR
      // But we don't have isLong in the database...
      // So let's just alternate or use a simple rule
      const winner = battle.battleId.charCodeAt(battle.battleId.length - 1) % 2 === 0 ? 'BULL' : 'BEAR';
      
      await Battle.findOneAndUpdate(
        { battleId: battle.battleId },
        { $set: { winner: winner } }
      );
      updated++;
    }
  }
  console.log(`Updated ${updated} battles`);
  */
  
  // For now, let's check if we can determine from agent data
  const withAgentData = await Battle.find({
    status: 'SETTLED',
    tier: 'PRIMARY',
    winner: 'DRAW',
    finalBullHealth: 100,
    finalBearHealth: 100,
    'agentA.wallet': { $exists: true },
    'agentB.wallet': { $exists: true }
  }).limit(5).lean();
  
  console.log('Sample battles with agent data:');
  withAgentData.forEach(b => {
    console.log({
      battleId: b.battleId?.substring(0, 20),
      agentA: b.agentA?.wallet?.substring(0, 10),
      agentB: b.agentB?.wallet?.substring(0, 10),
    });
  });
  
  // Show current distribution
  const winnerCounts = await Battle.aggregate([
    { $match: { status: 'SETTLED', tier: 'PRIMARY' } },
    { $group: { _id: '$winner', count: { $sum: 1 } } }
  ]);
  
  console.log('\n📊 Current winner distribution:');
  winnerCounts.forEach(w => console.log(`  ${w._id || 'null'}: ${w.count}`));
  
  await mongoose.disconnect();
}

fixDrawWinners().catch(console.error);
