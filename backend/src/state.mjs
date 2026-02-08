/**
 * Central State Management for Liquidation Arena Backend
 * 
 * Manages:
 * - Battle state (PRIMARY and SECONDARY)
 * - Agent states and health
 * - Price feed data
 * - User connections
 * - Betting pools
 */

import { EventEmitter } from 'events';
import { saveBattle } from './db/services/battleService.js';

class StateManager extends EventEmitter {
  constructor() {
    super();
    
    // Battle storage - starts empty, only real blockchain or user-created battles
    this.battles = new Map(); // battleId -> battleState
    this.primaryBattleId = null;
    
    // Agent storage
    this.agents = new Map(); // agentId -> agentState
    
    // Price feed - will be set by PriceFeedService
    this.currentPrice = 0; // No default price - must come from real API
    this.priceHistory = []; // Last 100 price points
    
    // User connections
    this.connections = new Map(); // ws -> { userId, subscribedBattles }
    
    // Betting pools
    this.bettingPools = new Map(); // battleId -> { bull: amount, bear: amount }
    
    // Escalation mechanic - leverage increases every 60 seconds
    this.escalationLevels = [5, 10, 20, 50]; // Leverage levels
    this.escalationInterval = 60000; // 60 seconds
    this.maxBattleDuration = 240000; // 4 minutes = auto-liquidate
    
    // Escalation check interval (every second)
    this.escalationCheckInterval = setInterval(() => {
      this.checkEscalations();
    }, 1000);
    
    // No mock data initialization - battles only come from blockchain or user creation
    console.log('📊 StateManager initialized with empty state (no mock data)');
    console.log('⚡ Escalator Mechanic enabled: 5x → 10x → 20x → 50x every 60s, auto-liquidate at 4min');
  }
  
  // ============ Battle Management ============
  
  getBattle(battleId) {
    return this.battles.get(battleId);
  }
  
  getAllBattles() {
    return Array.from(this.battles.values()).filter(battle => {
      // Filter out stuck battles (too many failed settlement attempts)
      if (battle._settlementRetries && battle._settlementRetries > 10) {
        return false;
      }
      
      // AGGRESSIVE FILTER: If both agents are dead (0% health), filter out immediately
      // This catches battles that have been liquidated but can't be settled
      const bullHealth = battle.bull?.health ?? (battle.agentA?.health ?? 100);
      const bearHealth = battle.bear?.health ?? (battle.agentB?.health ?? 100);
      const bothDead = (bullHealth <= 0 && bearHealth <= 0) || 
                      (!battle.bull?.alive && !battle.bear?.alive) ||
                      ((battle.bull?.health !== undefined && battle.bull.health <= 0) && 
                       (battle.bear?.health !== undefined && battle.bear.health <= 0));
      
      if (bothDead) {
        // If both agents are dead, check if battle is old enough to be considered stuck
        let isOld = false;
        
        // Check escalationStartTime
        if (battle.escalationStartTime) {
          const escalationStartMs = typeof battle.escalationStartTime === 'number' 
            ? battle.escalationStartTime 
            : new Date(battle.escalationStartTime).getTime();
          const timeSinceStart = Date.now() - escalationStartMs;
          if (timeSinceStart > 5 * 60 * 1000) { // 5 minutes
            isOld = true;
          }
        }
        
        // Check createdAt
        if (!isOld && battle.createdAt) {
          const createdAtMs = typeof battle.createdAt === 'number' 
            ? battle.createdAt 
            : new Date(battle.createdAt).getTime();
          const timeSinceCreation = Date.now() - createdAtMs;
          if (timeSinceCreation > 5 * 60 * 1000) { // 5 minutes
            isOld = true;
          }
        }
        
        // If both agents are dead and battle is old, filter it out
        // OR if both agents are dead and battle status is SETTLED, filter it out
        if (isOld || battle.status === 'SETTLED') {
          return false;
        }
      }
      
      // Filter out battles that are too old
      // Check endTime first
      if (battle.endTime) {
        const endTimeMs = battle.endTime > 1e12 ? battle.endTime : battle.endTime * 1000;
        const timeSinceEnd = Date.now() - endTimeMs;
        if (timeSinceEnd > 3600000) { // 1 hour in milliseconds
          return false;
        }
      }
      
      // Check escalationStartTime - if battle started more than 5 minutes ago (4min + 1min buffer)
      // and both agents are dead (0% health), it's likely stuck
      if (battle.escalationStartTime) {
        const escalationStartMs = typeof battle.escalationStartTime === 'number' 
          ? battle.escalationStartTime 
          : new Date(battle.escalationStartTime).getTime();
        const timeSinceStart = Date.now() - escalationStartMs;
        const maxBattleAge = 5 * 60 * 1000; // 5 minutes in milliseconds
        
        // If battle is older than 5 minutes and both agents are dead, filter it out
        if (timeSinceStart > maxBattleAge) {
          if (bothDead) {
            return false; // Battle is old and both agents are dead - likely stuck
          }
        }
      }
      
      // Check createdAt as fallback
      if (battle.createdAt) {
        const createdAtMs = typeof battle.createdAt === 'number' 
          ? battle.createdAt 
          : new Date(battle.createdAt).getTime();
        const timeSinceCreation = Date.now() - createdAtMs;
        // If battle was created more than 1 hour ago and status is still ACTIVE/LIVE, it might be stuck
        if (timeSinceCreation > 3600000 && (battle.status === 'ACTIVE' || battle.status === 'LIVE')) {
          // Only filter if both agents are dead (indicating it should have been settled)
          if (bothDead) {
            return false;
          }
        }
      }
      
      return true;
    });
  }
  
  getPrimaryBattle() {
    const primary = this.battles.get(this.primaryBattleId);
    if (!primary) return null;
    
    // Filter out stuck battles (too many failed settlement attempts)
    if (primary._settlementRetries && primary._settlementRetries > 10) {
      return null;
    }
    
    const now = Date.now();
    
    // Filter out battles that are expired (more than 10 minutes past endTime)
    // Match the threshold used in ensurePrimaryBattleExists() for consistency
    if (primary.endTime) {
      const endTimeMs = primary.endTime > 1e12 ? primary.endTime : primary.endTime * 1000;
      const timeSinceEnd = now - endTimeMs;
      if (timeSinceEnd > 600000) { // 10 minutes in milliseconds (matching ensurePrimaryBattleExists)
        // Clear the PRIMARY ID so a new battle can be created
        console.log('⚠️ PRIMARY battle expired, clearing ID', {
          battleId: this.primaryBattleId?.substring(0, 20),
          endTime: new Date(endTimeMs).toISOString(),
          timeSinceEnd: `${Math.floor(timeSinceEnd / 60000)} minutes`,
        });
        this.primaryBattleId = null;
        return null;
      }
    }
    
    // Also check if both agents are dead and battle is expired
    const bothDead = (!primary.bull?.alive && !primary.bear?.alive) || 
                     (primary.bull?.health <= 0 && primary.bear?.health <= 0);
    if (bothDead && primary.endTime) {
      const endTimeMs = primary.endTime > 1e12 ? primary.endTime : primary.endTime * 1000;
      if (now >= endTimeMs) {
        console.log('⚠️ PRIMARY battle has dead agents and is expired, clearing ID', {
          battleId: this.primaryBattleId?.substring(0, 20),
        });
        this.primaryBattleId = null;
        return null;
      }
    }
    
    // Only return if battle is LIVE or ACTIVE
    if (primary.status === 'LIVE' || primary.status === 'ACTIVE') {
      return primary;
    }
    
    return null;
  }
  
  getSecondaryBattles() {
    return this.getAllBattles().filter(b => b.tier === 'SECONDARY');
  }
  
  getActiveBattles() {
    // getAllBattles() already filters out stuck/old battles
    return this.getAllBattles().filter(b => b.status === 'LIVE' || b.status === 'ACTIVE');
  }
  
  getWaitingLobbies() {
    return this.getAllBattles().filter(b => b.status === 'WAITING');
  }
  
  /**
   * Clear all battles from state (for testing/fresh start)
   * Note: This only clears in-memory state, battles still exist on-chain
   */
  clearAllBattles() {
    const battleIds = Array.from(this.battles.keys());
    const count = battleIds.length;
    this.battles.clear();
    this.primaryBattleId = null;
    this.bettingPools.clear();
    console.log(`🗑️ Cleared ${count} battle(s) from state`);
    this.emit('battlesCleared', { count });
    // Also emit allBattlesCleared for WebSocket service
    this.emit('allBattlesCleared');
    return count;
  }
  
  /**
   * Remove a specific battle from state
   */
  removeBattle(battleId) {
    const existed = this.battles.has(battleId);
    if (existed) {
      this.battles.delete(battleId);
      this.bettingPools.delete(battleId);
      if (this.primaryBattleId === battleId) {
        this.primaryBattleId = null;
      }
      this.emit('battleRemoved', { battleId });
    }
    return existed;
  }
  
  updateBattle(battleId, updates) {
    const battle = this.battles.get(battleId);
    if (!battle) return null;
    
    // Preserve escalation fields when updating (don't overwrite with null/undefined)
    const preservedFields = {
      escalationStartTime: battle.escalationStartTime,
      escalationLevel: battle.escalationLevel,
      currentLeverage: battle.currentLeverage,
      nextEscalationTime: battle.nextEscalationTime,
      tier: battle.tier // Preserve tier
    };
    
    Object.assign(battle, updates);
    
    // Restore escalation fields if they were nullified
    if (!battle.escalationStartTime && preservedFields.escalationStartTime) {
      battle.escalationStartTime = preservedFields.escalationStartTime;
    }
    if (battle.escalationLevel === undefined && preservedFields.escalationLevel !== undefined) {
      battle.escalationLevel = preservedFields.escalationLevel;
    }
    if (!battle.currentLeverage && preservedFields.currentLeverage) {
      battle.currentLeverage = preservedFields.currentLeverage;
    }
    if (!battle.nextEscalationTime && preservedFields.nextEscalationTime) {
      battle.nextEscalationTime = preservedFields.nextEscalationTime;
    }
    // Preserve tier if it was set
    if (!battle.tier && preservedFields.tier) {
      battle.tier = preservedFields.tier;
    }
    
    // Save to MongoDB (async, non-blocking)
    saveBattle(battle).catch(err => {
      console.warn('Failed to update battle in MongoDB:', err.message);
    });
    
    this.emit('battleUpdated', battle);
    return battle;
  }
  
  createBattle(battleData) {
    const startTime = battleData.startTime || battleData.escalationStartTime || Date.now();
    
    // If escalation fields already set (from sync), use them; otherwise initialize
    const escalationStartTime = battleData.escalationStartTime || startTime;
    const escalationLevel = battleData.escalationLevel ?? 0;
    const currentLeverage = battleData.currentLeverage || this.escalationLevels[escalationLevel];
    const nextEscalationTime = battleData.nextEscalationTime || (startTime + this.escalationInterval);
    
    const battle = {
      ...battleData,
      createdAt: battleData.createdAt || Date.now(),
      // Default to SECONDARY unless explicitly set to PRIMARY (only by PrimaryBattleService)
      tier: battleData.tier || 'SECONDARY',
      // Escalation tracking
      escalationStartTime, // When battle started
      escalationLevel, // Current escalation level (0 = 5x, 1 = 10x, 2 = 20x, 3 = 50x)
      nextEscalationTime, // Next escalation timestamp
      currentLeverage, // Current leverage level
    };
    
    // Initialize agent leverage to match current escalation
    if (battle.bull) battle.bull.leverage = currentLeverage;
    if (battle.bear) battle.bear.leverage = currentLeverage;
    
    this.battles.set(battle.id, battle);
    
    // Save to MongoDB (async, non-blocking)
    saveBattle(battle).catch(err => {
      console.warn('Failed to save battle to MongoDB:', err.message);
    });
    
    this.emit('battleCreated', battle);
    return battle;
  }
  
  /**
   * Check and apply leverage escalations for all live battles
   */
  checkEscalations() {
    const now = Date.now();
    
    for (const battle of this.battles.values()) {
      if (battle.status !== 'LIVE' && battle.status !== 'ACTIVE') continue;
      if (!battle.escalationStartTime) {
        // Try to initialize escalation if missing
        if (battle.startTime || battle.createdAt) {
          const startTime = typeof battle.startTime === 'number' ? battle.startTime : (battle.startTime ? new Date(battle.startTime).getTime() : null);
          const createdAt = typeof battle.createdAt === 'number' ? battle.createdAt : (battle.createdAt ? new Date(battle.createdAt).getTime() : null);
          const escalationStart = startTime || createdAt || Date.now();
          
          battle.escalationStartTime = escalationStart;
          battle.escalationLevel = 0;
          battle.currentLeverage = this.escalationLevels[0];
          battle.nextEscalationTime = escalationStart + this.escalationInterval;
          
          // Update agent leverage
          if (battle.bull) battle.bull.leverage = this.escalationLevels[0];
          if (battle.bear) battle.bear.leverage = this.escalationLevels[0];
          
          console.log(`⚠️ Initialized missing escalation for battle ${battle.id}`, {
            escalationStartTime: new Date(battle.escalationStartTime).toISOString(),
            escalationLevel: battle.escalationLevel,
            currentLeverage: battle.currentLeverage,
            nextEscalationTime: new Date(battle.nextEscalationTime).toISOString()
          });
          
          // Emit update so frontend gets the escalation data
          this.emit('battleUpdated', battle);
        } else {
          console.warn(`⚠️ Battle ${battle.id} has no startTime or createdAt, skipping escalation`);
          continue; // Skip if no start time available
        }
      }
      
      const elapsed = now - battle.escalationStartTime;
      
      // Auto-liquidate after 4 minutes
      if (elapsed >= this.maxBattleDuration) {
        if (battle.bull?.alive || battle.bear?.alive) {
          console.log(`⚡ AUTO-LIQUIDATION: Battle ${battle.id} reached 4 minutes, ready for settlement`);
          
          // Liquidate both agents (set health to 0, mark as not alive)
          if (battle.bull?.alive) {
            this.updateAgentHealth(battle.id, 'bull', 0);
            if (battle.bull) battle.bull.alive = false;
          }
          
          if (battle.bear?.alive) {
            this.updateAgentHealth(battle.id, 'bear', 0);
            if (battle.bear) battle.bear.alive = false;
          }
          
          // Store final health for history (before liquidation - both should be 0 now)
          battle.finalBullHealth = battle.bull?.health ?? 0;
          battle.finalBearHealth = battle.bear?.health ?? 0;
          
          // Mark battle end time but DON'T set status to SETTLED yet
          // Let the BattleSettlementService handle the on-chain settlement
          battle.endTime = now;
          
          // CRITICAL: Ensure tier is preserved (especially for PRIMARY battles)
          if (battle.id === this.primaryBattleId) {
            battle.tier = 'PRIMARY';
            console.log(`✅ Preserved PRIMARY tier for battle ${battle.id.substring(0, 20)}... (matched primaryBattleId)`);
          } else if (!battle.tier) {
            battle.tier = 'SECONDARY';
          }
          
          console.log(`⏰ Battle ${battle.id.substring(0, 20)}... reached 4-minute mark - Ready for settlement (Tier: ${battle.tier})`);
          
          // DON'T save to MongoDB yet - let the settlement service handle it after on-chain settlement
          // DON'T set battle.status = 'SETTLED' - let settlement service do it
          // DON'T set battle.winner yet - settlement service will fetch it from chain
          
          this.emit('battleEscalated', {
            battleId: battle.id,
            level: 'AUTO-LIQUIDATE',
            leverage: 0,
            timestamp: now
          });
          
          // Emit battle updated
          this.emit('battleUpdated', battle);
          
          // CRITICAL: Emit event for settlement service to handle on-chain settlement
          this.emit('battleReadyForSettlement', {
            battleId: battle.id,
            battle,
            finalPrice: this.currentPrice
          });
          
          // Note: battleSettled event will be emitted by settlement service after on-chain settlement
        }
        continue;
      }
      
      // Check if it's time to escalate
      if (battle.nextEscalationTime && now >= battle.nextEscalationTime && battle.escalationLevel < this.escalationLevels.length - 1) {
        const newLevel = battle.escalationLevel + 1;
        const newLeverage = this.escalationLevels[newLevel];
        
        console.log(`⚡ ESCALATION: Battle ${battle.id} escalating to ${newLeverage}x leverage`, {
          oldLevel: battle.escalationLevel,
          newLevel,
          elapsed: Math.floor((now - battle.escalationStartTime) / 1000),
          nextEscalationTime: battle.nextEscalationTime ? new Date(battle.nextEscalationTime).toISOString() : null
        });
        
        battle.escalationLevel = newLevel;
        battle.currentLeverage = newLeverage;
        battle.nextEscalationTime = now + this.escalationInterval;
        
        // Update leverage for both agents
        if (battle.bull) {
          battle.bull.leverage = newLeverage;
        }
        if (battle.bear) {
          battle.bear.leverage = newLeverage;
        }
        
        // Recalculate health with new leverage
        if (this.currentPrice > 0) {
          this._updateBattleHealth(battle, this.currentPrice);
        }
        
        this.emit('battleEscalated', {
          battleId: battle.id,
          level: newLevel,
          leverage: newLeverage,
          nextEscalationTime: battle.nextEscalationTime,
          timestamp: now
        });
        
        this.emit('battleUpdated', battle);
      }
    }
  }
  
  /**
   * Update health for a single battle with escalating leverage
   */
  _updateBattleHealth(battle, price) {
    if (!battle.entryPrice || battle.entryPrice <= 0) return;
    
    const leverage = battle.currentLeverage || battle.bull?.leverage || 10;
    
    // Calculate PnL for Bull
    if (battle.bull) {
      const priceChange = (price - battle.entryPrice) / battle.entryPrice;
      const positionSize = battle.bull.stake * leverage;
      battle.bull.pnl = positionSize * priceChange;
      
      // Dynamic health calculation - health changes with price movement
      // Formula: health = 100 - (priceMove% * leverage * multiplier)
      // Multiplier makes it more sensitive (2.0x for realistic volatility)
      const priceMovePercent = priceChange * 100;
      
      if (priceChange < 0) { 
        // Bull loses when price drops - health decreases
        const healthLoss = Math.abs(priceMovePercent) * leverage * 2.0;
        const health = Math.max(0, Math.min(100, 100 - healthLoss));
        this.updateAgentHealth(battle.id, 'bull', health);
        if (health <= 0 && battle.bull) {
          battle.bull.alive = false;
        }
      } else if (priceChange > 0.001) { 
        // Bull is winning (price up > 0.1%) - health increases but caps at 100
        // Small gains don't fully restore health at high leverage
        const healthGain = priceMovePercent * leverage * 0.5; // Slower recovery
        const health = Math.min(100, (battle.bull?.health || 100) + healthGain);
        this.updateAgentHealth(battle.id, 'bull', health);
      } else {
        // Price unchanged or tiny move - slight decay at high leverage
        const currentHealth = battle.bull?.health || 100;
        const health = leverage > 30 ? Math.max(98, currentHealth - 0.1) : currentHealth;
        this.updateAgentHealth(battle.id, 'bull', health);
      }
    }
    
    // Calculate PnL for Bear
    if (battle.bear) {
      const priceChange = (battle.entryPrice - price) / battle.entryPrice; // Inverted for bear
      const positionSize = battle.bear.stake * leverage;
      battle.bear.pnl = positionSize * priceChange;
      
      const priceMovePercent = priceChange * 100;
      
      if (priceChange < 0) { 
        // Bear loses when price rises - health decreases
        const healthLoss = Math.abs(priceMovePercent) * leverage * 2.0;
        const health = Math.max(0, Math.min(100, 100 - healthLoss));
        this.updateAgentHealth(battle.id, 'bear', health);
        if (health <= 0 && battle.bear) {
          battle.bear.alive = false;
        }
      } else if (priceChange > 0.001) { 
        // Bear is winning (price down > 0.1%) - health increases
        const healthGain = priceMovePercent * leverage * 0.5;
        const health = Math.min(100, (battle.bear?.health || 100) + healthGain);
        this.updateAgentHealth(battle.id, 'bear', health);
      } else {
        // Price unchanged - slight decay at high leverage
        const currentHealth = battle.bear?.health || 100;
        const health = leverage > 30 ? Math.max(98, currentHealth - 0.1) : currentHealth;
        this.updateAgentHealth(battle.id, 'bear', health);
      }
    }
  }
  
  // ============ Agent Management ============
  
  getAgent(agentId) {
    return this.agents.get(agentId);
  }
  
  updateAgentHealth(battleId, agentType, newHealth) {
    const battle = this.battles.get(battleId);
    if (!battle) return null;
    
    const agent = battle[agentType];
    if (!agent) return null;
    
    const oldHealth = agent.health;
    agent.health = Math.max(0, Math.min(100, newHealth));
    
    if (agent.health <= 0 && agent.alive) {
      agent.alive = false;
      this.emit('agentLiquidated', { battleId, agentType, agent });
    }
    
    this.emit('agentHealthChanged', { 
      battleId, 
      agentType, 
      oldHealth, 
      newHealth: agent.health,
      agent 
    });
    
    return agent;
  }
  
  // ============ Price Feed ============
  
  updatePrice(newPrice) {
    const oldPrice = this.currentPrice;
    this.currentPrice = newPrice;
    
    this.priceHistory.push({
      price: newPrice,
      timestamp: Date.now()
    });
    
    // Keep only last 100 points
    if (this.priceHistory.length > 100) {
      this.priceHistory.shift();
    }
    
    // Update all live battles with new price
    this._updateBattlesWithPrice(newPrice);
    
    this.emit('priceUpdated', { oldPrice, newPrice });
    return newPrice;
  }
  
  _updateBattlesWithPrice(price) {
    // Don't update battles if price is not set (0 or invalid)
    if (!price || price <= 0) return;
    
    for (const battle of this.battles.values()) {
      if (battle.status !== 'LIVE' && battle.status !== 'ACTIVE') continue;
      
      // Skip if entry price is not set
      if (!battle.entryPrice || battle.entryPrice <= 0) continue;
      
      // Use escalating leverage if available, otherwise fall back to agent leverage
      this._updateBattleHealth(battle, price);
    }
  }
  
  getPrice() {
    return this.currentPrice;
  }
  
  getPriceHistory() {
    return this.priceHistory;
  }
  
  // ============ Connection Management ============
  
  addConnection(ws, userData = {}) {
    this.connections.set(ws, {
      userId: userData.userId || null,
      address: userData.address || null,
      subscribedBattles: new Set(),
      connectedAt: Date.now()
    });
    this.emit('connectionAdded', ws);
  }
  
  removeConnection(ws) {
    this.connections.delete(ws);
    this.emit('connectionRemoved', ws);
  }
  
  subscribeToBattle(ws, battleId) {
    const conn = this.connections.get(ws);
    if (conn) {
      conn.subscribedBattles.add(battleId);
    }
  }
  
  unsubscribeFromBattle(ws, battleId) {
    const conn = this.connections.get(ws);
    if (conn) {
      conn.subscribedBattles.delete(battleId);
    }
  }
  
  getSubscribersForBattle(battleId) {
    const subscribers = [];
    for (const [ws, conn] of this.connections) {
      if (conn.subscribedBattles.has(battleId)) {
        subscribers.push(ws);
      }
    }
    return subscribers;
  }
  
  broadcastToBattle(battleId, message) {
    const subscribers = this.getSubscribersForBattle(battleId);
    const data = JSON.stringify(message);
    
    subscribers.forEach(ws => {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(data);
      }
    });
  }
  
  broadcastToAll(message) {
    const data = JSON.stringify(message);
    
    for (const ws of this.connections.keys()) {
      if (ws.readyState === 1) {
        ws.send(data);
      }
    }
  }
  
  // ============ Betting Pools ============
  
  getBettingPool(battleId) {
    return this.bettingPools.get(battleId) || { bull: 0, bear: 0 };
  }
  
  placeBet(battleId, side, amount, betData = {}) {
    const pool = this.bettingPools.get(battleId);
    if (!pool) {
      this.bettingPools.set(battleId, { bull: 0, bear: 0 });
    }
    
    const current = this.bettingPools.get(battleId);
    current[side] += amount;
    
    // Save bet to MongoDB (async, non-blocking)
    if (betData.bettor) {
      const battle = this.battles.get(battleId);
      saveBet({
        battleId,
        battleAddress: battle?.battleAddress,
        bettor: betData.bettor,
        side,
        amount,
        txHash: betData.txHash,
        blockNumber: betData.blockNumber,
      }).catch(err => {
        console.warn('Failed to save bet to MongoDB:', err.message);
      });
    }
    
    this.emit('betPlaced', { battleId, side, amount, pool: current });
    return current;
  }
  
  // ============ State Snapshots ============
  
  getFullState() {
    // Transform battles to frontend format
    const transformBattle = (battle) => {
      if (!battle) return null;
      
      // Don't transform battles where both agents are dead (0% health)
      // This prevents showing stuck battles in the frontend
      const bullHealth = battle.bull?.health ?? 100;
      const bearHealth = battle.bear?.health ?? 100;
      const bothDead = (bullHealth <= 0 && bearHealth <= 0) || 
                      (!battle.bull?.alive && !battle.bear?.alive);
      
      if (bothDead) {
        // If both agents are dead, check if battle is old enough to be considered stuck
        // OR if battle status is SETTLED, don't show it
        if (battle.status === 'SETTLED') {
          return null; // Don't show settled battles
        }
        
        let isOld = false;
        if (battle.escalationStartTime) {
          const escalationStartMs = typeof battle.escalationStartTime === 'number' 
            ? battle.escalationStartTime 
            : new Date(battle.escalationStartTime).getTime();
          if (Date.now() - escalationStartMs > 5 * 60 * 1000) {
            isOld = true;
          }
        } else if (battle.createdAt) {
          const createdAtMs = typeof battle.createdAt === 'number' 
            ? battle.createdAt 
            : new Date(battle.createdAt).getTime();
          if (Date.now() - createdAtMs > 5 * 60 * 1000) {
            isOld = true;
          }
        }
        
        // If both agents are dead and battle is old, don't show it
        if (isOld) {
          return null;
        }
      }
      
      // Calculate current amounts (initial stakes + betting pool)
      const bettingPool = this.getBettingPool(battle.id);
      const bullAmount = (battle.bull?.stake || 0) + (bettingPool.bull || 0);
      const bearAmount = (battle.bear?.stake || 0) + (bettingPool.bear || 0);
      
      // For PRIMARY battles, default to 100 each if stakes are missing (agent wallets always have 100 USDC)
      const isPrimary = battle.tier === 'PRIMARY';
      const finalBullAmount = isPrimary && bullAmount === 0 ? 100 : bullAmount;
      const finalBearAmount = isPrimary && bearAmount === 0 ? 100 : bearAmount;
      const tvl = finalBullAmount + finalBearAmount;
      
      // Calculate leverage from escalation level if currentLeverage not set
      const escalationLevel = battle.escalationLevel ?? 0;
      const leverageFromEscalation = this.escalationLevels[escalationLevel] || 5;
      const currentLeverage = battle.currentLeverage || leverageFromEscalation;
      
      return {
        id: battle.id,
        round: parseInt(battle.id.split('-')[1]) || 1,
        status: battle.status.toLowerCase(),
        tier: battle.tier || 'SECONDARY', // PRIMARY or SECONDARY
        bullAmount: finalBullAmount,
        bearAmount: finalBearAmount,
        bullHealth: battle.bull?.health ?? 100,
        bearHealth: battle.bear?.health ?? 100,
        bullLeverage: battle.bull?.leverage || currentLeverage,
        bearLeverage: battle.bear?.leverage || currentLeverage,
        currentLeverage, // Add this field for easier access
        escalationLevel: battle.escalationLevel ?? 0,
        nextEscalationTime: battle.nextEscalationTime || null,
        escalationStartTime: battle.escalationStartTime || battle.startTime || null,
        bullZKVerified: battle.bull?.lastProofTime !== null,
        bearZKVerified: battle.bear?.lastProofTime !== null,
        tvl,
        minBet: 10,
        viewers: 0, // Real viewer count would come from connection tracking
        // Market label (e.g. ETH-PERP, BTC-PERP). Currently a single global market,
        // but this can be extended per-battle in the future.
        asset: (battle.assetLabel || 'ETH-PERP'),
        currentPrice: this.currentPrice,
        priceChange: (() => {
          const entryPrice = battle.entryPrice || 0;
          if (!entryPrice || entryPrice <= 0 || !this.currentPrice || this.currentPrice <= 0) {
            return 0; // Return 0% if we don't have valid prices
          }
          return ((this.currentPrice - entryPrice) / entryPrice) * 100;
        })(),
        liquidationPrice: battle.liquidationPrices?.bull || battle.liquidationPrices?.bear || 0,
        battleAddress: battle.battleAddress || null, // Include contract address
        startTime: battle.startTime || null,
        endTime: battle.endTime || null, // Include endTime for countdown
      };
    };

    const primaryBattle = this.getPrimaryBattle();
    const secondaryBattles = this.getSecondaryBattles();
    const activeBattles = this.getActiveBattles();

    // Transform battles and filter out null values (filtered/stuck battles)
    const transformedPrimary = primaryBattle ? transformBattle(primaryBattle) : null;
    const transformedSecondary = secondaryBattles.map(transformBattle).filter(b => b !== null);
    const transformedActive = activeBattles.map(transformBattle).filter(b => b !== null);

    return {
      currentPrice: this.currentPrice,
      primaryBattleId: this.primaryBattleId, // Include the ID for reference
      battles: [
        ...(transformedPrimary ? [transformedPrimary] : []),
        ...transformedSecondary
      ],
      primaryBattle: transformedPrimary,
      secondaryBattles: transformedSecondary,
      activeBattles: transformedActive,
    };
  }
  
  getBattleState(battleId) {
    const battle = this.battles.get(battleId);
    if (!battle) return null;
    
    return {
      ...battle,
      bettingPool: this.getBettingPool(battleId),
      currentPrice: this.currentPrice
    };
  }
}

// Singleton instance
const stateManager = new StateManager();

export default stateManager;
