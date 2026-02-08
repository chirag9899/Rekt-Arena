import mongoose from 'mongoose';
import { config } from 'dotenv';
import { Battle } from '../src/db/models/Battle.js';
import { ethers } from 'ethers';

config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/liquidation_arena';
const RPC_URL = process.env.RPC_URL || 'http://localhost:8545';

const BATTLE_ARENA_ABI = [
  "function getBattle(bytes32 battleId) external view returns (tuple(tuple(address wallet, uint256 collateral, bool isLong, uint256 leverage, uint256 entryPrice, bool alive, uint256 lastProofTime, uint256 totalBets) agentA, tuple(address wallet, uint256 collateral, bool isLong, uint256 leverage, uint256 entryPrice, bool alive, uint256 lastProofTime, uint256 totalBets) agentB, uint256 startTime, uint256 endTime, uint256 totalPool, uint8 status, address winner, uint256 entryFee, uint256 eliminationThreshold))",
];

async function backfillWinners() {
  console.log('Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected\n');
  
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  
  // Get all SETTLED PRIMARY battles with DRAW winner
  const battles = await Battle.find({
    status: 'SETTLED',
    tier: 'PRIMARY',
    winner: 'DRAW'
  }).lean();
  
  console.log(`Found ${battles.length} PRIMARY battles with DRAW winner to backfill\n`);
  
  let updated = 0;
  let errors = 0;
  
  for (const battle of battles) {
    try {
      if (!battle.battleAddress) {
        console.log(`⚠️ Skipping ${battle.battleId?.substring(0, 20)}... (no battleAddress)`);
        continue;
      }
      
      const battleArena = new ethers.Contract(battle.battleAddress, BATTLE_ARENA_ABI, provider);
      const battleIdBytes32 = ethers.id(battle.battleId);
      const onChainBattle = await battleArena.getBattle(battleIdBytes32);
      
      let winner = 'DRAW';
      
      if (onChainBattle && onChainBattle.winner && onChainBattle.winner !== ethers.ZeroAddress) {
        const agentA = onChainBattle.agentA;
        const agentB = onChainBattle.agentB;
        
        if (agentA && agentB) {
          const winnerAddress = onChainBattle.winner.toLowerCase();
          const agentAAddress = agentA.wallet?.toLowerCase();
          const agentBAddress = agentB.wallet?.toLowerCase();
          
          if (winnerAddress === agentAAddress) {
            winner = agentA.isLong ? 'BULL' : 'BEAR';
          } else if (winnerAddress === agentBAddress) {
            winner = agentB.isLong ? 'BULL' : 'BEAR';
          }
        }
      }
      
      if (winner !== 'DRAW') {
        await Battle.findOneAndUpdate(
          { battleId: battle.battleId },
          { $set: { winner: winner } }
        );
        console.log(`✅ Updated ${battle.battleId.substring(0, 20)}... to winner: ${winner}`);
        updated++;
      } else {
        console.log(`⚠️ ${battle.battleId.substring(0, 20)}... still DRAW (no winner on-chain)`);
      }
    } catch (error) {
      console.error(`❌ Error processing ${battle.battleId?.substring(0, 20)}...:`, error.message);
      errors++;
    }
  }
  
  console.log(`\n✅ Done! Updated ${updated} battles, ${errors} errors`);
  
  // Show new distribution
  const winnerCounts = await Battle.aggregate([
    { $match: { status: 'SETTLED', tier: 'PRIMARY' } },
    { $group: { _id: '$winner', count: { $sum: 1 } } }
  ]);
  
  console.log('\n📊 New winner distribution:');
  winnerCounts.forEach(w => console.log(`  ${w._id || 'null'}: ${w.count}`));
  
  await mongoose.disconnect();
}

backfillWinners().catch(console.error);
