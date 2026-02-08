/**
 * Script to settle pending bets for battles that are already settled on-chain
 * This fixes bets that are stuck in "Pending" status
 */

import mongoose from 'mongoose';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '../.env') });

// Import services
const { default: stateManager } = await import('../src/state.mjs');
const { Bet } = await import('../src/db/models/Bet.js');
const { Battle } = await import('../src/db/models/Battle.js');
const { settleBets } = await import('../src/db/services/betService.js');

// Contract ABI for getBattle
const BATTLE_ARENA_ABI = [
  'function getBattle(bytes32 battleId) external view returns (tuple(tuple(address wallet, uint256 collateral, bool isLong, uint256 leverage, uint256 entryPrice, bool alive, uint256 lastProofTime, uint256 totalBets) agentA, tuple(address wallet, uint256 collateral, bool isLong, uint256 leverage, uint256 entryPrice, bool alive, uint256 lastProofTime, uint256 totalBets) agentB, uint256 startTime, uint256 endTime, uint256 totalPool, uint8 status, address winner, uint256 entryFee, uint256 eliminationThreshold))',
];

async function main() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/liquidation-arena';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB');

    // Connect to blockchain
    const rpcUrl = process.env.RPC_URL || 'https://rpc-amoy.polygon.technology';
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    console.log('✅ Connected to blockchain');

    // Get all pending bets
    const pendingBets = await Bet.find({ settled: false });
    console.log(`\n📊 Found ${pendingBets.length} pending bets`);

    if (pendingBets.length === 0) {
      console.log('✅ No pending bets to settle');
      await mongoose.disconnect();
      return;
    }

    // Group bets by battleId
    const betsByBattle = {};
    for (const bet of pendingBets) {
      if (!betsByBattle[bet.battleId]) {
        betsByBattle[bet.battleId] = [];
      }
      betsByBattle[bet.battleId].push(bet);
    }

    console.log(`\n🔍 Checking ${Object.keys(betsByBattle).length} unique battles...\n`);

    let settledCount = 0;
    let failedCount = 0;

    for (const [battleId, bets] of Object.entries(betsByBattle)) {
      try {
        console.log(`\n📋 Battle: ${battleId.substring(0, 30)}...`);
        console.log(`   Pending bets: ${bets.length}`);

        // Get battle from database
        const battle = await Battle.findOne({ battleId });
        if (!battle) {
          console.log(`   ⚠️  Battle not found in database, skipping...`);
          failedCount += bets.length;
          continue;
        }

        if (!battle.battleAddress) {
          console.log(`   ⚠️  Battle has no contract address, skipping...`);
          failedCount += bets.length;
          continue;
        }

        // Check on-chain status
        const battleArena = new ethers.Contract(battle.battleAddress, BATTLE_ARENA_ABI, provider);
        
        // Convert battleId to bytes32
        let battleIdBytes32;
        if (battleId.startsWith('0x') && battleId.length === 66) {
          battleIdBytes32 = battleId;
        } else {
          battleIdBytes32 = ethers.id(battleId);
        }

        const onChainBattle = await battleArena.getBattle(battleIdBytes32);
        const onChainStatus = Number(onChainBattle.status); // 0=Pending, 1=Active, 2=Settled
        const winner = onChainBattle.winner;

        console.log(`   On-chain status: ${['Pending', 'Active', 'Settled'][onChainStatus]}`);
        console.log(`   Winner: ${winner}`);

        if (onChainStatus !== 2) {
          console.log(`   ⏳ Battle is not settled on-chain yet (status: ${onChainStatus}), skipping...`);
          continue;
        }

        if (!winner || winner === ethers.ZeroAddress) {
          console.log(`   ⚠️  Battle is settled but has no winner, skipping...`);
          continue;
        }

        // Determine winner side (bull or bear)
        // Check which agent is the winner
        const agentA = onChainBattle.agentA;
        const agentB = onChainBattle.agentB;
        const winnerSide = winner.toLowerCase() === agentA.wallet.toLowerCase() ? 'bull' : 'bear';

        console.log(`   ✅ Winner side: ${winnerSide.toUpperCase()}`);

        // Calculate payout ratio from total pool
        const totalPool = Number(onChainBattle.totalPool) / 1e6; // USDC has 6 decimals
        const bullBets = bets.filter(b => b.side === 'bull').reduce((sum, b) => sum + b.amount, 0);
        const bearBets = bets.filter(b => b.side === 'bear').reduce((sum, b) => sum + b.amount, 0);
        const winningPool = winnerSide === 'bull' ? bullBets : bearBets;
        const losingPool = winnerSide === 'bull' ? bearBets : bullBets;
        
        // Payout ratio = (winning pool + losing pool) / winning pool
        const payoutRatio = winningPool > 0 ? (winningPool + losingPool) / winningPool : 1.8;
        
        console.log(`   💰 Payout ratio: ${payoutRatio.toFixed(2)}x`);

        // Settle bets
        const settlementTxHash = battle.settlementTxHash || null;
        const settledBets = await settleBets(battleId, winnerSide, payoutRatio, settlementTxHash);

        console.log(`   ✅ Settled ${settledBets.length} bets`);
        settledCount += settledBets.length;

      } catch (error) {
        console.error(`   ❌ Error settling bets for battle ${battleId}:`, error.message);
        failedCount += bets.length;
      }
    }

    console.log(`\n\n📊 Summary:`);
    console.log(`   ✅ Settled: ${settledCount} bets`);
    console.log(`   ❌ Failed: ${failedCount} bets`);
    console.log(`   ⏳ Still pending: ${pendingBets.length - settledCount - failedCount} bets`);

    await mongoose.disconnect();
    console.log('\n✅ Done!');

  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

main();
