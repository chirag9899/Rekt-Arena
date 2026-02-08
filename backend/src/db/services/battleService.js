/**
 * Battle Database Service
 * Handles battle data persistence and queries
 */

import { Battle } from '../models/Battle.js';
import { BattleStats } from '../models/BattleStats.js';
import { isDBConnected } from '../index.js';
import { ethers } from 'ethers';

/**
 * Determine battle tier based on agent wallets
 */
function determineTier(battleData) {
  // If tier is explicitly set to PRIMARY, always preserve it
  if (battleData.tier === 'PRIMARY') {
    return 'PRIMARY';
  }
  
  // If tier is explicitly set to SECONDARY, check if it's actually PRIMARY before accepting
  // (This prevents PRIMARY battles from being incorrectly marked as SECONDARY)
  const isExplicitlySecondary = battleData.tier === 'SECONDARY';
  
  // Check if this is a PRIMARY battle by matching agent wallets
  const bullAgentAddress = process.env.BULL_AGENT_PRIVATE_KEY 
    ? new ethers.Wallet(process.env.BULL_AGENT_PRIVATE_KEY).address.toLowerCase()
    : null;
  const bearAgentAddress = process.env.BEAR_AGENT_PRIVATE_KEY
    ? new ethers.Wallet(process.env.BEAR_AGENT_PRIVATE_KEY).address.toLowerCase()
    : null;
  
  if (bullAgentAddress && bearAgentAddress) {
    // Try multiple ways to get agent addresses (handle different data structures)
    // battleData.agentA/agentB can be:
    // 1. String (address) - e.g., "0x1234..."
    // 2. Object with wallet property - e.g., { wallet: "0x1234...", ... }
    // 3. null/undefined - check battleData.bull/bear.wallet as fallback
    let agentA = null;
    let agentB = null;
    
    if (typeof battleData.agentA === 'string') {
      agentA = battleData.agentA.toLowerCase();
    } else if (battleData.agentA?.wallet) {
      agentA = battleData.agentA.wallet.toLowerCase();
    } else if (battleData.bull?.wallet) {
      agentA = battleData.bull.wallet.toLowerCase();
    }
    
    if (typeof battleData.agentB === 'string') {
      agentB = battleData.agentB.toLowerCase();
    } else if (battleData.agentB?.wallet) {
      agentB = battleData.agentB.wallet.toLowerCase();
    } else if (battleData.bear?.wallet) {
      agentB = battleData.bear.wallet.toLowerCase();
    }
    
    if (agentA && agentB) {
      const matchesPrimary = 
        (agentA === bullAgentAddress && agentB === bearAgentAddress) ||
        (agentA === bearAgentAddress && agentB === bullAgentAddress);
      
      if (matchesPrimary) {
        // If it matches PRIMARY agents, always set to PRIMARY (even if explicitly marked as SECONDARY)
        if (isExplicitlySecondary) {
          console.log(`⚠️ Battle ${battleData.id?.substring(0, 20)}... was marked SECONDARY but matches PRIMARY agents, correcting to PRIMARY`);
        } else {
          console.log(`✅ Auto-detected PRIMARY tier for battle ${battleData.id?.substring(0, 20)}...`);
        }
        return 'PRIMARY';
      }
    }
  }
  
  // If explicitly SECONDARY and doesn't match PRIMARY agents, keep as SECONDARY
  if (isExplicitlySecondary) {
    return 'SECONDARY';
  }
  
  // Default to SECONDARY for new battles
  return 'SECONDARY';
}

/**
 * Save or update battle in database
 */
export async function saveBattle(battleData) {
  if (!isDBConnected()) {
    console.warn('⚠️ MongoDB not connected, skipping battle save');
    return null;
  }

  try {
    // Determine tier automatically if not set
    const tier = determineTier(battleData);
    
    const battle = await Battle.findOneAndUpdate(
      { battleId: battleData.id },
      {
        $set: {
          battleId: battleData.id,
          battleAddress: battleData.battleAddress,
          creator: battleData.creator,
          status: battleData.status,
          tier: tier,
          asset: battleData.assetLabel || 'ETH-PERP',
          agentA: battleData.agentA ? {
            wallet: battleData.agentA,
            collateral: battleData.bull?.stake,
            leverage: battleData.currentLeverage || battleData.bull?.leverage,
            entryPrice: battleData.bull?.entryPrice,
            alive: battleData.bull?.alive,
          } : null,
          agentB: battleData.agentB ? {
            wallet: battleData.agentB,
            collateral: battleData.bear?.stake,
            leverage: battleData.currentLeverage || battleData.bear?.leverage,
            entryPrice: battleData.bear?.entryPrice,
            alive: battleData.bear?.alive,
          } : null,
          entryPrice: battleData.entryPrice,
          startTime: battleData.startTime ? new Date(battleData.startTime) : null,
          endTime: battleData.endTime ? new Date(battleData.endTime) : null,
          entryFee: battleData.config?.entryFee,
          eliminationThreshold: battleData.config?.eliminationThreshold,
          totalPool: battleData.totalPool,
          winner: battleData.winner,
          finalBullHealth: battleData.finalBullHealth,
          finalBearHealth: battleData.finalBearHealth,
          escalationLevel: battleData.escalationLevel ?? 0,
          escalationStartTime: battleData.escalationStartTime ? new Date(battleData.escalationStartTime) : null,
          nextEscalationTime: battleData.nextEscalationTime ? new Date(battleData.nextEscalationTime) : null,
          currentLeverage: battleData.currentLeverage || 5,
          creationTxHash: battleData.creationTxHash || null,
          settlementTxHash: battleData.settlementTxHash || null,
          creationBlockNumber: battleData.creationBlockNumber || null,
          settlementBlockNumber: battleData.settlementBlockNumber || null,
          updatedAt: new Date(),
        },
      },
      {
        upsert: true,
        new: true,
      }
    );

    return battle;
  } catch (error) {
    console.error('Error saving battle to database:', error);
    return null;
  }
}

/**
 * Get battle from database
 */
export async function getBattle(battleId) {
  if (!isDBConnected()) return null;

  try {
    return await Battle.findOne({ battleId });
  } catch (error) {
    console.error('Error getting battle from database:', error);
    return null;
  }
}

/**
 * Get all active battles
 */
export async function getActiveBattles() {
  if (!isDBConnected()) return [];

  try {
    return await Battle.find({
      status: { $in: ['LIVE', 'ACTIVE'] },
    }).sort({ createdAt: -1 });
  } catch (error) {
    console.error('Error getting active battles:', error);
    return [];
  }
}

/**
 * Update battle stats
 */
export async function updateBattleStats(battleId, stats) {
  if (!isDBConnected()) return null;

  try {
    return await BattleStats.findOneAndUpdate(
      { battleId },
      { $set: stats },
      { upsert: true, new: true }
    );
  } catch (error) {
    console.error('Error updating battle stats:', error);
    return null;
  }
}
