import mongoose from 'mongoose';
import { config } from 'dotenv';
import { Battle } from '../src/db/models/Battle.js';
import { ethers } from 'ethers';

config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/liquidation_arena';

async function check() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected\n');
  
  const bullAgentAddress = process.env.BULL_AGENT_PRIVATE_KEY 
    ? new ethers.Wallet(process.env.BULL_AGENT_PRIVATE_KEY).address.toLowerCase()
    : null;
  const bearAgentAddress = process.env.BEAR_AGENT_PRIVATE_KEY
    ? new ethers.Wallet(process.env.BEAR_AGENT_PRIVATE_KEY).address.toLowerCase()
    : null;
  
  console.log('Agent addresses:', {
    bull: bullAgentAddress || 'NOT SET',
    bear: bearAgentAddress || 'NOT SET'
  });
  console.log('');
  
  // Check all settled battles
  const allSettled = await Battle.find({ status: 'SETTLED' }).lean();
  console.log('📊 All SETTLED battles:', allSettled.length);
  
  // Check PRIMARY tier
  const primaryTier = await Battle.find({ status: 'SETTLED', tier: 'PRIMARY' }).lean();
  console.log('📊 PRIMARY tier battles:', primaryTier.length);
  
  // Check with agent wallets
  if (bullAgentAddress && bearAgentAddress) {
    const withAgents = await Battle.find({
      status: 'SETTLED',
      $or: [
        { 'agentA.wallet': { $regex: new RegExp(bullAgentAddress, 'i') }, 'agentB.wallet': { $regex: new RegExp(bearAgentAddress, 'i') } },
        { 'agentA.wallet': { $regex: new RegExp(bearAgentAddress, 'i') }, 'agentB.wallet': { $regex: new RegExp(bullAgentAddress, 'i') } }
      ]
    }).lean();
    console.log('📊 Battles with agent wallets:', withAgents.length);
    
    if (withAgents.length > 0) {
      console.log('\n🔍 Sample battle with agents:');
      const sample = withAgents[0];
      console.log({
        battleId: sample.battleId?.substring(0, 30),
        tier: sample.tier || 'null',
        status: sample.status,
        winner: sample.winner || 'null',
        agentA: sample.agentA?.wallet?.substring(0, 20),
        agentB: sample.agentB?.wallet?.substring(0, 20),
        hasWinner: !!sample.winner
      });
      
      // Check if they need tier update
      const needsUpdate = withAgents.filter(b => b.tier !== 'PRIMARY');
      if (needsUpdate.length > 0) {
        console.log(`\n⚠️ Found ${needsUpdate.length} battles with agent wallets but tier !== 'PRIMARY'`);
        console.log('Updating them to PRIMARY...');
        for (const battle of needsUpdate) {
          await Battle.findOneAndUpdate(
            { battleId: battle.battleId },
            { $set: { tier: 'PRIMARY' } }
          );
          console.log(`✅ Updated ${battle.battleId.substring(0, 20)}... to PRIMARY`);
        }
      }
    }
  }
  
  // Check battles without tier
  const noTier = await Battle.find({ status: 'SETTLED', tier: { $exists: false } }).lean();
  console.log('\n📊 SETTLED battles without tier:', noTier.length);
  
  // Check battles with winner
  const withWinner = await Battle.find({ status: 'SETTLED', winner: { $exists: true, $ne: null } }).lean();
  console.log('📊 SETTLED battles with winner:', withWinner.length);
  
  // Show sample of all settled
  if (allSettled.length > 0) {
    console.log('\n📋 Sample settled battles:');
    allSettled.slice(0, 5).forEach(b => {
      console.log({
        battleId: b.battleId?.substring(0, 30),
        tier: b.tier || 'null',
        status: b.status,
        winner: b.winner || 'null',
        agentA: b.agentA?.wallet?.substring(0, 20) || 'null',
        agentB: b.agentB?.wallet?.substring(0, 20) || 'null'
      });
    });
  } else {
    console.log('\n⚠️ No settled battles found in database!');
  }
  
  // Test the actual query used by the API
  console.log('\n🔍 Testing PRIMARY history query...');
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
  
  const primaryHistory = await Battle.find(query).sort({ endTime: -1 }).limit(50).lean();
  console.log(`✅ PRIMARY history query returned: ${primaryHistory.length} battles`);
  
  if (primaryHistory.length > 0) {
    console.log('\n📋 Sample PRIMARY history results:');
    primaryHistory.slice(0, 3).forEach(b => {
      console.log({
        battleId: b.battleId?.substring(0, 30),
        tier: b.tier || 'null',
        status: b.status,
        winner: b.winner || 'null'
      });
    });
  }
  
  await mongoose.disconnect();
  console.log('\n✅ Done!');
}

check().catch(console.error);
