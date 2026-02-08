/**
 * Bet Database Service
 * Handles bet persistence and queries
 */

import { Bet } from '../models/Bet.js';
import { User } from '../models/User.js';
import { isDBConnected } from '../index.js';

/**
 * Save bet to database
 */
export async function saveBet(betData) {
  if (!isDBConnected()) {
    console.warn('⚠️ MongoDB not connected, skipping bet save');
    return null;
  }

  try {
    const bet = new Bet({
      battleId: betData.battleId,
      battleAddress: betData.battleAddress,
      bettor: betData.bettor.toLowerCase(),
      side: betData.side,
      amount: betData.amount,
      txHash: betData.txHash,
      blockNumber: betData.blockNumber,
    });

    await bet.save();

    // Update user statistics
    await updateUserStats(betData.bettor, {
      totalBets: 1,
      totalWagered: betData.amount,
    });

    return bet;
  } catch (error) {
    console.error('Error saving bet to database:', error);
    return null;
  }
}

/**
 * Get user's bets
 */
export async function getUserBets(userAddress, options = {}) {
  if (!isDBConnected()) return [];

  try {
    const query = { bettor: userAddress.toLowerCase() };
    if (options.battleId) {
      query.battleId = options.battleId;
    }
    if (options.settled !== undefined) {
      query.settled = options.settled;
    }

    return await Bet.find(query)
      .sort({ createdAt: -1 })
      .limit(options.limit || 100);
  } catch (error) {
    console.error('Error getting user bets:', error);
    return [];
  }
}

/**
 * Get bets for a battle
 */
export async function getBattleBets(battleId) {
  if (!isDBConnected()) return [];

  try {
    return await Bet.find({ battleId }).sort({ createdAt: -1 });
  } catch (error) {
    console.error('Error getting battle bets:', error);
    return [];
  }
}

/**
 * Settle bets for a battle
 * @param {string} battleId - Battle ID
 * @param {string} winner - Winner side ('BULL' or 'BEAR')
 * @param {number} payoutRatio - Payout ratio (e.g., 1.8 means 1.8x)
 * @param {string} settlementTxHash - Settlement transaction hash (optional, for winners to view)
 */
export async function settleBets(battleId, winner, payoutRatio = 0, settlementTxHash = null) {
  if (!isDBConnected()) {
    console.warn('⚠️ MongoDB not connected, cannot settle bets');
    return [];
  }

  try {
    const bets = await Bet.find({ battleId, settled: false });
    
    console.log(`📊 Settling ${bets.length} bets for battle ${battleId}`, {
      winner,
      payoutRatio,
      betCount: bets.length,
    });
    
    // Normalize winner to match bet side format (bull/bear)
    const winnerLower = winner.toLowerCase();
    const settledBets = [];
    
    for (const bet of bets) {
      const won = bet.side.toLowerCase() === winnerLower;
      
      // Calculate payout: if won, payout = bet.amount * payoutRatio (or 2x if no ratio provided)
      // If lost, payout = 0
      const payout = won ? (payoutRatio > 0 ? bet.amount * payoutRatio : bet.amount * 2) : 0;

      await Bet.findByIdAndUpdate(bet._id, {
        $set: {
          settled: true,
          won,
          payout,
          settledAt: new Date(),
        },
      });

      // Update user stats
      await updateUserStats(bet.bettor, {
        totalWon: won ? payout : 0,
        totalLost: won ? 0 : bet.amount,
      });
      
      // Emit event for winnings distribution (if won)
      if (won && payout > 0) {
        try {
          const stateManager = (await import('../../state.mjs')).default;
          const winnings = payout - bet.amount; // Net winnings (payout - bet amount)
          
          console.log(`💰 Emitting winnings for ${bet.bettor}`, {
            battleId,
            betAmount: bet.amount,
            winnings,
            totalPayout: payout,
            side: bet.side,
          });
          
          if (stateManager && typeof stateManager.emit === 'function') {
            // Use settlement tx hash if available (so users can view the settlement transaction)
            // Otherwise fall back to bet tx hash
            const txHashToUse = settlementTxHash || bet.txHash;
            
            stateManager.emit('betWinningsDistributed', {
              battleId,
              bettor: bet.bettor,
              betId: bet._id,
              betAmount: bet.amount,
              winnings,
              totalPayout: payout,
              side: bet.side,
              txHash: txHashToUse, // Settlement tx hash (if available) or bet tx hash
              settlementTxHash: settlementTxHash, // Explicitly include settlement tx hash
              viaYellow: false,
            });
            console.log(`✅ Emitted betWinningsDistributed for bettor ${bet.bettor} in battle ${battleId}`, {
              winnings,
              totalPayout: payout,
              txHash: txHashToUse,
              settlementTxHash,
            });
          } else {
            console.warn('⚠️ StateManager not available, skipping event emission');
          }
        } catch (error) {
          console.warn('⚠️ Failed to emit winnings event:', error.message);
        }
      } else {
        console.log(`Bet ${bet._id} for battle ${battleId} was lost or had no payout.`);
      }
      
      settledBets.push(bet);
    }
    
    return settledBets;
  } catch (error) {
    console.error('❌ Error settling bets:', error);
    throw error;
  }
}

/**
 * Update user statistics
 */
async function updateUserStats(userAddress, updates) {
  if (!isDBConnected()) return;

  try {
    const user = await User.findOneAndUpdate(
      { address: userAddress.toLowerCase() },
      {
        $set: { lastActive: new Date() },
        $inc: updates,
      },
      { upsert: true, new: true }
    );

    // Calculate win rate
    if (user.totalBets > 0) {
      const wins = await Bet.countDocuments({
        bettor: userAddress.toLowerCase(),
        settled: true,
        won: true,
      });
      user.winRate = (wins / user.totalBets) * 100;
      await user.save();
    }

    return user;
  } catch (error) {
    console.error('Error updating user stats:', error);
    return null;
  }
}

/**
 * Get user statistics
 */
export async function getUserStats(userAddress) {
  if (!isDBConnected()) return null;

  try {
    return await User.findOne({ address: userAddress.toLowerCase() });
  } catch (error) {
    console.error('Error getting user stats:', error);
    return null;
  }
}

/**
 * Get leaderboard
 */
export async function getLeaderboard(limit = 10) {
  if (!isDBConnected()) return [];

  try {
    return await User.find()
      .sort({ totalWagered: -1 })
      .limit(limit)
      .select('address totalBets totalWagered totalWon winRate');
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    return [];
  }
}
