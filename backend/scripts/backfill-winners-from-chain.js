/**
 * Backfill winners from on-chain data for all settled battles
 * This script fetches the actual winner from the smart contract and updates the database
 */

import { ethers } from 'ethers';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { Battle } from '../src/db/models/Battle.js';

dotenv.config();

const BATTLE_ARENA_ABI = [
  'function getBattle(bytes32 battleId) view returns (tuple(tuple(address wallet, uint256 collateral, bool isLong, uint256 leverage, uint256 entryPrice, bool alive, uint256 lastProofTime, uint256 totalBets) agentA, tuple(address wallet, uint256 collateral, bool isLong, uint256 leverage, uint256 entryPrice, bool alive, uint256 lastProofTime, uint256 totalBets) agentB, uint256 startTime, uint256 endTime, uint8 status, address winner, uint256 totalPool, uint256 entryFee, uint256 eliminationThreshold))',
];

async function backfillWinners() {
  try {
    console.log('🔄 Starting winner backfill from blockchain...\n');

    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/liquidation_arena');
    console.log('✅ Connected to MongoDB\n');

    // Setup blockchain connection
    const provider = new ethers.JsonRpcProvider(process.env.AMOY_RPC || process.env.RPC_URL || 'http://127.0.0.1:8545');
    const battleArenaAddress = process.env.BATTLE_ARENA;
    
    if (!battleArenaAddress) {
      throw new Error('BATTLE_ARENA not found in environment');
    }

    const battleArena = new ethers.Contract(battleArenaAddress, BATTLE_ARENA_ABI, provider);
    console.log(`✅ Connected to BattleArena at ${battleArenaAddress}\n`);

    // Get all settled battles from database
    const settledBattles = await Battle.find({
      status: 'SETTLED',
      battleAddress: { $exists: true },
    }).sort({ createdAt: 1 });

    console.log(`📊 Found ${settledBattles.length} settled battles in database\n`);

    let updated = 0;
    let failed = 0;
    let unchanged = 0;
    const failedBattles = [];

    for (let i = 0; i < settledBattles.length; i++) {
      const battle = settledBattles[i];
      const battleIdShort = battle.battleId.substring(0, 20);
      
      try {
        console.log(`[${i + 1}/${settledBattles.length}] Processing ${battleIdShort}...`);
        
        // Fetch battle from chain
        const onChainBattle = await battleArena.getBattle(battle.battleId);
        
        // Extract winner address
        const winnerAddress = onChainBattle.winner;
        
        if (!winnerAddress || winnerAddress === ethers.ZeroAddress) {
          console.log(`  ⚠️  No winner on-chain (ZeroAddress) - skipping`);
          unchanged++;
          continue;
        }

        // Get agent data
        const agentA = onChainBattle.agentA;
        const agentB = onChainBattle.agentB;
        
        // Determine winner side (BULL or BEAR)
        let winner = 'DRAW';
        const winnerAddressLower = winnerAddress.toLowerCase();
        const agentAAddressLower = agentA.wallet.toLowerCase();
        const agentBAddressLower = agentB.wallet.toLowerCase();
        
        if (winnerAddressLower === agentAAddressLower) {
          // AgentA won - check if it's BULL or BEAR
          winner = agentA.isLong ? 'BULL' : 'BEAR';
        } else if (winnerAddressLower === agentBAddressLower) {
          // AgentB won - check if it's BULL or BEAR
          winner = agentB.isLong ? 'BULL' : 'BEAR';
        } else {
          console.log(`  ⚠️  Winner address ${winnerAddress} doesn't match either agent`);
          console.log(`      AgentA: ${agentA.wallet} (${agentA.isLong ? 'LONG' : 'SHORT'})`);
          console.log(`      AgentB: ${agentB.wallet} (${agentB.isLong ? 'LONG' : 'SHORT'})`);
          failed++;
          failedBattles.push({ battleId: battle.battleId, reason: 'Winner mismatch' });
          continue;
        }

        // Update database if winner changed
        if (battle.winner === winner) {
          console.log(`  ✓ Already correct: ${winner}`);
          unchanged++;
        } else {
          const oldWinner = battle.winner || 'null';
          await Battle.updateOne(
            { _id: battle._id },
            { $set: { winner: winner } }
          );
          console.log(`  ✅ Updated: ${oldWinner} → ${winner}`);
          updated++;
        }

      } catch (error) {
        console.log(`  ❌ Error: ${error.message}`);
        failed++;
        failedBattles.push({ 
          battleId: battle.battleId, 
          reason: error.message 
        });
      }
    }

    // Final summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 BACKFILL SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total battles processed: ${settledBattles.length}`);
    console.log(`✅ Updated: ${updated}`);
    console.log(`✓ Already correct: ${unchanged}`);
    console.log(`❌ Failed: ${failed}`);
    console.log('='.repeat(60));

    if (failedBattles.length > 0) {
      console.log('\n⚠️  Failed battles:');
      failedBattles.forEach(({ battleId, reason }) => {
        console.log(`  - ${battleId.substring(0, 20)}...: ${reason}`);
      });
    }

    // Show new winner distribution
    console.log('\n📊 New winner distribution:');
    const winnerCounts = await Battle.aggregate([
      { $match: { status: 'SETTLED' } },
      { $group: { _id: '$winner', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);
    
    winnerCounts.forEach(w => {
      console.log(`  ${w._id || 'null'}: ${w.count}`);
    });

    // Show by tier
    console.log('\n📊 Winner distribution by tier:');
    const tierWinners = await Battle.aggregate([
      { $match: { status: 'SETTLED' } },
      { $group: { _id: { tier: '$tier', winner: '$winner' }, count: { $sum: 1 } } },
      { $sort: { '_id.tier': 1, '_id.winner': 1 } }
    ]);
    
    tierWinners.forEach(t => {
      console.log(`  ${t._id.tier || 'null'} - ${t._id.winner || 'null'}: ${t.count}`);
    });

  } catch (error) {
    console.error('❌ Fatal error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\n✅ Disconnected from MongoDB');
  }
}

backfillWinners();
