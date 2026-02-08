import mongoose from 'mongoose';
import { config } from 'dotenv';
import { Battle } from '../src/db/models/Battle.js';
import ContractService from '../src/contracts.mjs';
import { ethers } from 'ethers';

config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/liquidation_arena';

async function backfillWinners() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected\n');
  
  // Initialize contract service (same way backend does)
  const contractService = new ContractService({
    rpcUrl: process.env.RPC_URL,
    battleFactoryAddress: process.env.BATTLE_FACTORY_ADDRESS,
    privateKey: process.env.BACKEND_PRIVATE_KEY,
  });
  
  await contractService.initialize();
  console.log('✅ Contract service initialized\n');
  
  // Get all SETTLED PRIMARY battles with DRAW winner
  const battles = await Battle.find({
    status: 'SETTLED',
    tier: 'PRIMARY',
    winner: 'DRAW'
  }).sort({ endTime: -1 }).limit(50).lean(); // Start with first 50
  
  console.log(`Found ${battles.length} PRIMARY battles with DRAW winner to backfill\n`);
  
  let updated = 0;
  let errors = 0;
  let stillDraw = 0;
  
  for (const battle of battles) {
    try {
      if (!battle.battleAddress) {
        console.log(`⚠️ Skipping ${battle.battleId?.substring(0, 20)}... (no battleAddress)`);
        continue;
      }
      
      // Use contract service to get battle from arena
      const onChainBattle = await contractService.getBattleFromArena(
        battle.battleAddress,
        battle.battleId
      );
      
      if (!onChainBattle) {
        console.log(`⚠️ Could not fetch ${battle.battleId.substring(0, 20)}... from chain`);
        errors++;
        continue;
      }
      
      let winner = 'DRAW';
      
      if (onChainBattle.winner && onChainBattle.winner !== ethers.ZeroAddress) {
        const agentA = onChainBattle.agentA;
        const agentB = onChainBattle.agentB;
        
        if (agentA && agentB && agentA.wallet && agentB.wallet) {
          const winnerAddress = onChainBattle.winner.toLowerCase();
          const agentAAddress = agentA.wallet.toLowerCase();
          const agentBAddress = agentB.wallet.toLowerCase();
          
          if (winnerAddress === agentAAddress) {
            winner = agentA.isLong ? 'BULL' : 'BEAR';
          } else if (winnerAddress === agentBAddress) {
            winner = agentB.isLong ? 'BULL' : 'BEAR';
          } else {
            console.log(`⚠️ Winner address ${winnerAddress.substring(0, 10)}... doesn't match agents for ${battle.battleId.substring(0, 20)}...`);
            stillDraw++;
            continue;
          }
        } else {
          console.log(`⚠️ Missing agent data for ${battle.battleId.substring(0, 20)}...`);
          stillDraw++;
          continue;
        }
      } else {
        console.log(`⚠️ No winner on-chain for ${battle.battleId.substring(0, 20)}... (status: ${onChainBattle.status})`);
        stillDraw++;
        continue;
      }
      
      if (winner !== 'DRAW') {
        await Battle.findOneAndUpdate(
          { battleId: battle.battleId },
          { $set: { winner: winner } }
        );
        console.log(`✅ Updated ${battle.battleId.substring(0, 20)}... to winner: ${winner}`);
        updated++;
      }
    } catch (error) {
      console.error(`❌ Error processing ${battle.battleId?.substring(0, 20)}...:`, error.message);
      errors++;
    }
  }
  
  console.log(`\n✅ Done! Updated ${updated} battles, ${stillDraw} still DRAW, ${errors} errors`);
  
  // Show new distribution
  const winnerCounts = await Battle.aggregate([
    { $match: { status: 'SETTLED', tier: 'PRIMARY' } },
    { $group: { _id: '$winner', count: { $sum: 1 } } }
  ]);
  
  console.log('\n📊 Winner distribution:');
  winnerCounts.forEach(w => console.log(`  ${w._id || 'null'}: ${w.count}`));
  
  await mongoose.disconnect();
  process.exit(0);
}

backfillWinners().catch(console.error);
