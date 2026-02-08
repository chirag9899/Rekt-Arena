/**
 * WebSocket Server for Liquidation Arena
 * 
 * Handles real-time communication with frontend clients:
 * - Battle state updates
 * - Price feed streaming
 * - Agent health updates
 * - Betting events
 * - ZK proof verification status
 */

import { WebSocketServer } from 'ws';
import stateManager from './state.mjs';

class WebSocketService {
  constructor(server, contractService = null) {
    this.wss = new WebSocketServer({ server });
    this.contractService = contractService;
    this.setupEventHandlers();
    this.setupStateListeners();
    
    console.log('🔌 WebSocket server initialized');
  }
  
  setupEventHandlers() {
    this.wss.on('connection', (ws, req) => {
      console.log('🔗 New WebSocket connection');
      
      // Add to state manager
      stateManager.addConnection(ws, {
        ip: req.socket.remoteAddress,
        userAgent: req.headers['user-agent']
      });
      
      // Send initial state
      this.sendInitialState(ws);
      
      // Handle messages
      ws.on('message', (data) => {
        this.handleMessage(ws, data);
      });
      
      // Handle close
      ws.on('close', () => {
        console.log('🔌 WebSocket disconnected');
        stateManager.removeConnection(ws);
      });
      
      // Handle errors
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
      
      // Send heartbeat
      this.startHeartbeat(ws);
    });
  }
  
  setupStateListeners() {
    // Listen for state changes and broadcast to relevant clients
    
    stateManager.on('priceUpdated', ({ oldPrice, newPrice }) => {
      this.broadcast('PRICE_UPDATE', {
        price: newPrice,
        change: ((newPrice - oldPrice) / oldPrice * 100).toFixed(2),
        timestamp: Date.now()
      });
    });
    
    stateManager.on('battleCreated', (battle) => {
      this.broadcast('BATTLE_CREATED', { battle });
    });
    
    stateManager.on('battleUpdated', (battle) => {
      // Broadcast to ALL clients for real-time battle updates
      this.broadcast('BATTLE_UPDATE', { battle });
    });
    
    stateManager.on('agentHealthChanged', ({ battleId, agentType, newHealth, agent }) => {
      // Broadcast to ALL clients for real-time health updates
      this.broadcast('AGENT_HEALTH', {
        battleId,
        agentType,
        health: newHealth,
        pnl: agent.pnl
      });
    });
    
    stateManager.on('agentLiquidated', ({ battleId, agentType, agent }) => {
      this.broadcastToBattle(battleId, 'AGENT_LIQUIDATED', {
        battleId,
        agentType,
        agent,
        timestamp: Date.now()
      });
    });
    
    stateManager.on('allBattlesCleared', () => {
      // Broadcast empty state to all clients when battles are cleared
      const state = stateManager.getFullState();
      this.broadcast('ALL_BATTLES', state);
      console.log('📢 Broadcasted cleared state to all WebSocket clients');
    });
    
    stateManager.on('battleEscalated', ({ battleId, level, leverage, nextEscalationTime, timestamp }) => {
      // Broadcast to ALL clients, not just battle subscribers
      // This ensures home page updates in real-time
      this.broadcast('BATTLE_ESCALATED', {
        battleId,
        level,
        leverage,
        nextEscalationTime,
        timestamp
      });
    });
    
    stateManager.on('betPlaced', ({ battleId, side, amount, pool }) => {
      this.broadcastToBattle(battleId, 'BET_PLACED', {
        battleId,
        side,
        amount,
        pool,
        timestamp: Date.now()
      });
    });
    
    // Listen for battle settlement (winner announcement + payouts)
    // Listen for proof submission events
    stateManager.on('proofSubmitted', ({ battleId, agentType, agentIndex, txHash, timestamp }) => {
      this.broadcast('PROOF_SUBMITTED', {
        battleId,
        agentType,
        agentIndex,
        txHash,
        timestamp,
        status: 'verifying' // Initial status
      });
    });
    
    // Listen for proof verification success
    stateManager.on('proofVerified', ({ battleId, agentType, agentIndex, txHash, timestamp }) => {
      this.broadcast('PROOF_VERIFIED', {
        battleId,
        agentType,
        agentIndex,
        txHash,
        timestamp,
        status: 'verified'
      });
    });
    
    // Listen for proof verification failure
    stateManager.on('proofFailed', ({ battleId, agentType, agentIndex, reason, timestamp }) => {
      this.broadcast('PROOF_FAILED', {
        battleId,
        agentType,
        agentIndex,
        reason,
        timestamp,
        status: 'failed'
      });
    });
    
    stateManager.on('battleSettled', (battle) => {
      // Use final health (before liquidation) if available, otherwise current health
      const bullHealth = battle.finalBullHealth ?? battle.bull?.health ?? 0;
      const bearHealth = battle.finalBearHealth ?? battle.bear?.health ?? 0;
      const winner = battle.winner || (bullHealth > bearHealth ? 'BULL' : (bearHealth > bullHealth ? 'BEAR' : 'DRAW'));
      
      // Get betting pool for this battle
      const bettingPool = stateManager.bettingPools.get(battle.id);
      const totalPool = bettingPool ? (bettingPool.bull + bettingPool.bear) : 0;
      const winningPool = winner === 'BULL' ? (bettingPool?.bull ?? 0) : (winner === 'BEAR' ? (bettingPool?.bear ?? 0) : 0);
      const losingPool = winner === 'BULL' ? (bettingPool?.bear ?? 0) : (winner === 'BEAR' ? (bettingPool?.bull ?? 0) : 0);
      
      // Calculate payouts (5% house fee)
      const houseFee = 0.05;
      const payoutRatio = winningPool > 0 ? (totalPool * (1 - houseFee)) / winningPool : 0;
      
      // Broadcast battle end to all clients
      this.broadcast('BATTLE_ENDED', {
        battleId: battle.id,
        winner,
        finalPrice: stateManager.currentPrice,
        bullHealth,
        bearHealth,
        totalPool,
        winningPool,
        losingPool,
        payoutRatio,
        timestamp: Date.now(),
        tier: battle.tier
      });
      
      console.log(`🏆 Battle ${battle.id} ended - Winner: ${winner} (${bullHealth.toFixed(2)}% vs ${bearHealth.toFixed(2)}%)`);
    });
    
    // Listen for bet winnings distribution events
    stateManager.on('betWinningsDistributed', ({ battleId, bettor, betAmount, winnings, totalPayout, side, txHash, settlementTxHash, viaYellow }) => {
      // Broadcast to all users (so everyone can see winners)
      this.broadcast('WINNINGS_DISTRIBUTED', {
        battleId,
        bettor,
        betAmount,
        winnings,
        totalPayout,
        side,
        txHash,
        settlementTxHash, // Include settlement tx hash if available
        viaYellow: viaYellow || false,
        timestamp: Date.now(),
      });
      
      console.log(`💰 Winnings distributed: ${bettor} won ${winnings} USDC (bet: ${betAmount}, payout: ${totalPayout})`);
    });
  }
  
  async handleMessage(ws, data) {
    try {
      const message = JSON.parse(data);
      const { type, payload } = message;
      
      console.log('📨 WebSocket message:', type);
      
      switch (type) {
        case 'SUBSCRIBE_BATTLE':
          this.handleSubscribeBattle(ws, payload);
          break;
          
        case 'UNSUBSCRIBE_BATTLE':
          this.handleUnsubscribeBattle(ws, payload);
          break;
          
        case 'GET_BATTLE_STATE':
          this.handleGetBattleState(ws, payload);
          break;
          
        case 'GET_ALL_BATTLES':
          this.handleGetAllBattles(ws);
          break;
          
        case 'PLACE_BET':
          await this.handlePlaceBet(ws, payload);
          break;
          
        case 'PING':
          this.send(ws, 'PONG', { timestamp: Date.now() });
          break;
          
        case 'AUTH':
          this.handleAuth(ws, payload);
          break;
          
        default:
          console.warn('Unknown message type:', type);
          this.send(ws, 'ERROR', { message: 'Unknown message type' });
      }
    } catch (error) {
      console.error('Error handling message:', error);
      this.send(ws, 'ERROR', { message: 'Invalid message format' });
    }
  }
  
  // ============ Message Handlers ============
  
  handleSubscribeBattle(ws, { battleId }) {
    stateManager.subscribeToBattle(ws, battleId);
    
    // Send current battle state
    const battle = stateManager.getBattleState(battleId);
    if (battle) {
      this.send(ws, 'BATTLE_SUBSCRIBED', { battle });
    } else {
      this.send(ws, 'ERROR', { message: 'Battle not found' });
    }
  }
  
  handleUnsubscribeBattle(ws, { battleId }) {
    stateManager.unsubscribeFromBattle(ws, battleId);
    this.send(ws, 'BATTLE_UNSUBSCRIBED', { battleId });
  }
  
  handleGetBattleState(ws, { battleId }) {
    const battle = stateManager.getBattleState(battleId);
    if (battle) {
      this.send(ws, 'BATTLE_STATE', { battle });
    } else {
      this.send(ws, 'ERROR', { message: 'Battle not found' });
    }
  }
  
  handleGetAllBattles(ws) {
    const state = stateManager.getFullState();
    this.send(ws, 'ALL_BATTLES', state);
  }
  
  async handlePlaceBet(ws, { battleId, side, amount, userAddress }) {
    try {
      // Validate parameters
      if (!battleId || !side || !amount || amount <= 0) {
        this.send(ws, 'ERROR', { 
          message: 'Invalid bet parameters',
          code: 'INVALID_PARAMS'
        });
        return;
      }
      
      // Get battle info
      const battle = stateManager.getBattleState(battleId);
      if (!battle) {
        this.send(ws, 'ERROR', { 
          message: 'Battle not found',
          code: 'BATTLE_NOT_FOUND'
        });
        return;
      }
      
      if (battle.status !== 'ACTIVE' && battle.status !== 'LIVE') {
        this.send(ws, 'ERROR', { 
          message: 'Battle is not active',
          code: 'BATTLE_NOT_ACTIVE'
        });
        return;
      }
      
      // Convert side to agentIndex (0 = Bull, 1 = Bear)
      const agentIndex = side === 'bull' ? 0 : 1;
      
      // If contractService is available, validate with contract
      if (this.contractService && battle.battleAddress) {
        try {
          // Check USDC balance and allowance
          const amountWei = BigInt(Math.floor(amount * 1e6)); // USDC has 6 decimals
          
          if (userAddress) {
            const balance = await this.contractService.getUSDCBalance(userAddress);
            if (balance < amountWei) {
              this.send(ws, 'ERROR', { 
                message: 'Insufficient USDC balance',
                code: 'INSUFFICIENT_BALANCE',
                balance: balance.toString(),
                required: amountWei.toString()
              });
              return;
            }
            
            const allowance = await this.contractService.checkUSDCAllowance(
              userAddress, 
              battle.battleAddress
            );
            
            if (allowance < amountWei) {
              this.send(ws, 'BET_NEEDS_APPROVAL', {
                battleId,
                battleAddress: battle.battleAddress,
                amount: amountWei.toString(),
                currentAllowance: allowance.toString(),
                message: 'USDC approval required before betting'
              });
              return;
            }
          }
          
          // Send validation success - frontend will call contract
          this.send(ws, 'BET_VALIDATED', {
            battleId,
            battleAddress: battle.battleAddress,
            agentIndex,
            amount: amountWei.toString(),
            message: 'Bet validated. Call contract from frontend.'
          });
        } catch (error) {
          console.error('Error validating bet with contract:', error);
          // Fall through to local state update
        }
      }
      
      // Update local state (for UI updates before contract confirmation)
      const pool = stateManager.placeBet(battleId, side, amount, {
        bettor: userAddress,
        txHash: null, // Will be updated when transaction confirms
      });
      
      this.send(ws, 'BET_PENDING', {
        battleId,
        side,
        amount,
        pool,
        timestamp: Date.now(),
        message: 'Bet pending contract confirmation'
      });
    } catch (error) {
      console.error('Error handling bet:', error);
      this.send(ws, 'ERROR', { 
        message: 'Failed to process bet',
        code: 'BET_ERROR',
        error: error.message
      });
    }
  }
  
  handleAuth(ws, { address, signature }) {
    // Verify signature and associate connection with user
    // For now, just store the address
    const conn = stateManager.connections.get(ws);
    if (conn) {
      conn.address = address;
    }
    
    this.send(ws, 'AUTH_CONFIRMED', { address });
  }
  
  // ============ Send Methods ============
  
  send(ws, type, payload) {
    if (ws.readyState === 1) { // WebSocket.OPEN
      ws.send(JSON.stringify({ type, payload, timestamp: Date.now() }));
    }
  }
  
  sendInitialState(ws) {
    const state = stateManager.getFullState();
    this.send(ws, 'INITIAL_STATE', state);
  }
  
  broadcast(type, payload) {
    const message = JSON.stringify({ type, payload, timestamp: Date.now() });
    
    for (const ws of stateManager.connections.keys()) {
      if (ws.readyState === 1) {
        ws.send(message);
      }
    }
  }
  
  broadcastToBattle(battleId, type, payload) {
    const subscribers = stateManager.getSubscribersForBattle(battleId);
    const message = JSON.stringify({ type, payload, timestamp: Date.now() });
    
    subscribers.forEach(ws => {
      if (ws.readyState === 1) {
        ws.send(message);
      }
    });
  }
  
  // ============ Heartbeat ============
  
  startHeartbeat(ws) {
    const interval = setInterval(() => {
      if (ws.readyState === 1) {
        this.send(ws, 'HEARTBEAT', { timestamp: Date.now() });
      } else {
        clearInterval(interval);
      }
    }, 30000); // Every 30 seconds
    
    ws.on('close', () => clearInterval(interval));
  }
  
  // ============ Utility Methods ============
  
  getStats() {
    return {
      connections: stateManager.connections.size,
      battles: stateManager.battles.size,
      activeBattles: stateManager.getActiveBattles().length,
      waitingLobbies: stateManager.getWaitingLobbies().length
    };
  }
}

export default WebSocketService;
