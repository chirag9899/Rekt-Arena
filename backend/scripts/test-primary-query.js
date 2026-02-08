import mongoose from 'mongoose';
import { config } from 'dotenv';
import { Battle } from '../src/db/models/Battle.js';
import { ethers } from 'ethers';

config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/liquidation_arena';

async function test() {
  await mongoose.connect(MONGODB_URI);
  
  const bullAgentAddress = process.env.BULL_AGENT_PRIVATE_KEY 
    ? new ethers.Wallet(process.env.BULL_AGENT_PRIVATE_KEY).address.toLowerCase()
    : null;
  const bearAgentAddress = process.env.BEAR_AGENT_PRIVATE_KEY
    ? new ethers.Wallet(process.env.BEAR_AGENT_PRIVATE_KEY).address.toLowerCase()
    : null;
  
  console.log('Agent addresses:', {
    bull: bullAgentAddress?.substring(0, 20),
    bear: bearAgentAddress?.substring(0, 20)
  });
  
  const query = { 
    status: { $in: ['SETTLED'] },
    winner: { $exists: true, $ne: null }
  };
  
  if (bullAgentAddress && bearAgentAddress) {
    query.$or = [
      { tier: 'PRIMARY' },
      {
        $and: [
          { 'agentA.wallet': { $regex: new RegExp(bullAgentAddress, 'i') } },
          { 'agentB.wallet': { $regex: new RegExp(bearAgentAddress, 'i') } },
          { tier: { $ne: 'SECONDARY' } }
        ]
      },
      {
        $and: [
          { 'agentA.wallet': { $regex: new RegExp(bearAgentAddress, 'i') } },
          { 'agentB.wallet': { $regex: new RegExp(bullAgentAddress, 'i') } },
          { tier: { $ne: 'SECONDARY' } }
        ]
      }
    ];
  } else {
    query.tier = 'PRIMARY';
  }
  
  console.log('\n🔍 Query structure:');
  console.log(JSON.stringify(query, null, 2));
  
  const count = await Battle.countDocuments(query);
  console.log(`\n✅ Count: ${count}`);
  
  const results = await Battle.find(query).limit(5).sort({ endTime: -1 }).lean();
  console.log(`\n✅ Results found: ${results.length}`);
  
  if (results.length > 0) {
    console.log('\n📋 Sample results:');
    results.forEach((b, i) => {
      console.log(`${i + 1}. Battle ${b.battleId?.substring(0, 30)}`);
      console.log(`   Tier: ${b.tier || 'null'}`);
      console.log(`   Status: ${b.status}`);
      console.log(`   Winner: ${b.winner || 'null'}`);
      console.log(`   AgentA: ${b.agentA?.wallet?.substring(0, 20) || 'null'}`);
      console.log(`   AgentB: ${b.agentB?.wallet?.substring(0, 20) || 'null'}`);
    });
  } else {
    // Debug: check what we have
    const allSettled = await Battle.countDocuments({ status: 'SETTLED' });
    const withWinner = await Battle.countDocuments({ status: 'SETTLED', winner: { $exists: true, $ne: null } });
    const primaryTier = await Battle.countDocuments({ status: 'SETTLED', tier: 'PRIMARY' });
    const withAgents = await Battle.countDocuments({
      status: 'SETTLED',
      'agentA.wallet': { $regex: new RegExp(bullAgentAddress || '', 'i') },
      'agentB.wallet': { $regex: new RegExp(bearAgentAddress || '', 'i') }
    });
    
    console.log('\n🔍 Debug counts:');
    console.log(`  All SETTLED: ${allSettled}`);
    console.log(`  SETTLED with winner: ${withWinner}`);
    console.log(`  SETTLED with tier=PRIMARY: ${primaryTier}`);
    console.log(`  SETTLED with agent wallets: ${withAgents}`);
    
    // Check a sample battle
    const sample = await Battle.findOne({ status: 'SETTLED', tier: 'PRIMARY' }).lean();
    if (sample) {
      console.log('\n📋 Sample PRIMARY battle:');
      console.log({
        battleId: sample.battleId?.substring(0, 30),
        tier: sample.tier,
        status: sample.status,
        winner: sample.winner,
        agentA: sample.agentA?.wallet?.substring(0, 20),
        agentB: sample.agentB?.wallet?.substring(0, 20)
      });
      
      // Test if this battle matches our query
      const matches = await Battle.countDocuments({
        battleId: sample.battleId,
        ...query
      });
      console.log(`\n  Does this battle match our query? ${matches > 0 ? 'YES' : 'NO'}`);
    }
  }
  
  await mongoose.disconnect();
}

test().catch(console.error);
