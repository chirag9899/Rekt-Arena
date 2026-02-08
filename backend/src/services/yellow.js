// Import CommonJS module correctly
import nitrolite from '@erc7824/nitrolite';
const { createAppSessionMessage } = nitrolite;

import WebSocket from 'ws';
import logger from '../utils/logger.js';
import stateManager from '../state.mjs';

/**
 * Yellow Network Service for Rekt Arena
 * Handles state channels for gasless betting
 */
class YellowService {
  constructor() {
    this.ws = null;
    this.sessions = new Map(); // userAddress -> session
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectDelay = 5000; // 5 seconds
    this.reconnectTimer = null;
    this.heartbeatInterval = null;
    this.isConnecting = false;
  }

  /**
   * Connect to Yellow ClearNode
   */
  async connect() {
    // Don't connect if already connecting or connected
    if (this.isConnecting || (this.isConnected && this.ws?.readyState === WebSocket.OPEN)) {
      return;
    }

    const nodeUrl = process.env.YELLOW_NODE_URL || 'wss://clearnet-sandbox.yellow.com/ws';
    
    // If YELLOW_NODE_URL is not set, skip connection (optional service)
    if (!process.env.YELLOW_NODE_URL) {
      logger.info('Yellow Network URL not configured, skipping connection (optional service)');
      return;
    }

    this.isConnecting = true;
    
    return new Promise((resolve, reject) => {
      try {
      this.ws = new WebSocket(nodeUrl);

      this.ws.onopen = () => {
        logger.info('✅ Connected to Yellow Network');
        this.isConnected = true;
          this.isConnecting = false;
          this.reconnectAttempts = 0;
          
          // Start heartbeat to keep connection alive
          this.startHeartbeat();
          
        resolve();
      };

      this.ws.onmessage = (event) => {
          try {
            // Parse JSON message from Yellow Network
            const message = typeof event.data === 'string' 
              ? JSON.parse(event.data) 
              : event.data;
            this.handleMessage(message);
          } catch (error) {
            logger.error('Failed to parse Yellow message:', error);
          }
      };

      this.ws.onerror = (error) => {
        logger.error('Yellow WebSocket error:', error);
          this.isConnecting = false;
          // Don't reject immediately - let onclose handle reconnection
        };

        this.ws.onclose = (event) => {
          logger.warn('Yellow WebSocket closed', {
            code: event.code,
            reason: event.reason || 'Unknown',
            wasClean: event.wasClean
          });
          
          this.isConnected = false;
          this.isConnecting = false;
          this.stopHeartbeat();
          
          // Attempt to reconnect if not a clean close and we haven't exceeded max attempts
          if (!event.wasClean && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            logger.error('Max reconnection attempts reached for Yellow Network. Service disabled.');
          }
        };
      } catch (error) {
        this.isConnecting = false;
        logger.error('Failed to create Yellow WebSocket connection:', error);
        reject(error);
      }
    });
  }

  /**
   * Schedule reconnection attempt
   */
  scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.min(this.reconnectAttempts, 5); // Exponential backoff, max 5x
    
    logger.info(`Scheduling Yellow Network reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(error => {
        logger.error('Reconnection attempt failed:', error);
      });
    }, delay);
  }

  /**
   * Start heartbeat to keep connection alive
   */
  startHeartbeat() {
    this.stopHeartbeat(); // Clear any existing interval
    
    // Send ping every 30 seconds
    this.heartbeatInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
        } catch (error) {
          logger.error('Failed to send Yellow heartbeat:', error);
        }
      }
    }, 30000);
  }

  /**
   * Stop heartbeat
   */
  stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  /**
   * Create a betting session for a user
   * @param {string} userAddress - User's wallet address
   * @param {string} battleContract - Battle contract address (as partner)
   * @param {Function} messageSigner - Function to sign messages
   */
  async createBettingSession(userAddress, battleContract, messageSigner) {
    const appDefinition = {
      protocol: 'rekt-arena-betting-v1',
      participants: [userAddress, battleContract],
      weights: [100, 0], // User has full control
      quorum: 100,
      challenge: 0,
      nonce: Date.now()
    };

    // Initial allocation: $50 USDC (6 decimals)
    const allocations = [
      { 
        participant: userAddress, 
        asset: 'usdc', 
        amount: '50000000' // $50 USDC
      },
      { 
        participant: battleContract, 
        asset: 'usdc', 
        amount: '0' 
      }
    ];

    try {
      const sessionMessage = await createAppSessionMessage(
        messageSigner,
        [{ definition: appDefinition, allocations }]
      );

      // Check if connection is still open before sending
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        throw new Error('Yellow Network connection not available. Please reconnect.');
      }

      this.ws.send(sessionMessage);

      const session = {
        userAddress,
        battleContract,
        appDefinition,
        allocations,
        bets: [],
        createdAt: Date.now()
      };

      this.sessions.set(userAddress, session);
      logger.info(`Betting session created for ${userAddress}`);

      return session;
    } catch (error) {
      logger.error('Failed to create betting session:', error);
      throw error;
    }
  }

  /**
   * Place a bet via state channel (gasless)
   * @param {string} userAddress - User's address
   * @param {string} agent - 'bull' or 'bear'
   * @param {string} amount - Amount in USDC (6 decimals)
   * @param {Function} messageSigner - Signer function
   */
  async placeBet(userAddress, agent, amount, messageSigner) {
    const session = this.sessions.get(userAddress);
    if (!session) {
      throw new Error('No active session found');
    }

    const betData = {
      type: 'bet',
      agent,
      amount: amount.toString(),
      timestamp: Date.now(),
      battleId: session.battleContract
    };

    try {
      const signature = await messageSigner(JSON.stringify(betData));
      
      const signedBet = {
        ...betData,
        signature,
        sender: userAddress
      };

      this.ws.send(JSON.stringify(signedBet));
      
      // Track bet locally
      session.bets.push({
        agent,
        amount,
        timestamp: Date.now()
      });

      // Update betting pool in state manager
      const stateManager = (await import('../state.mjs')).default;
      const battleId = session.battleContract;
      const betAmount = parseFloat(amount) || 0;
      
      if (battleId) {
        const currentPool = stateManager.getBettingPool(battleId) || { bull: 0, bear: 0 };
        if (agent === 'bull') {
          currentPool.bull = (currentPool.bull || 0) + betAmount;
        } else {
          currentPool.bear = (currentPool.bear || 0) + betAmount;
        }
        stateManager.setBettingPool(battleId, currentPool);
        logger.info(`Updated betting pool for ${battleId}: ${JSON.stringify(currentPool)}`);
      }

      logger.info(`Bet placed: ${amount} USDC on ${agent} by ${userAddress}`);
      return signedBet;
    } catch (error) {
      logger.error('Failed to place bet:', error);
      throw error;
    }
  }

  /**
   * Close session and settle bets
   * @param {string} userAddress - User's address
   * @param {string} winnerAgent - 'bull' or 'bear'
   * @param {number} winnings - Amount won
   * @param {Object} options - Additional options
   * @param {string} options.battleId - Battle ID for on-chain settlement
   * @param {string} options.battleAddress - Battle contract address
   * @param {number} options.finalPrice - Final ETH price (8 decimals)
   * @param {Function} options.contractSettler - Function to call contract settlement
   */
  async settleSession(userAddress, winnerAgent, winnings, options = {}) {
    const session = this.sessions.get(userAddress);
    if (!session) {
      throw new Error('No session to settle');
    }

    const settleData = {
      type: 'settle',
      winnerAgent,
      winnings: winnings.toString(),
      timestamp: Date.now(),
      battleId: options.battleId || session.battleContract
    };

    // Step 1: Settle via Yellow Network (off-chain state channel)
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
    this.ws.send(JSON.stringify(settleData));
      logger.info(`Yellow session settled for ${userAddress}: won ${winnings} USDC`);
    } else {
      logger.warn('Yellow Network connection not available, skipping off-chain settlement');
    }

    // Step 2: Settle on-chain (if contract settler provided)
    let onChainSettlement = null;
    if (options.contractSettler && options.battleAddress && options.finalPrice) {
      try {
        logger.info(`Settling battle on-chain: ${options.battleId}`);
        onChainSettlement = await options.contractSettler(
          options.battleAddress,
          options.battleId,
          options.finalPrice
        );
        logger.info(`✅ Battle settled on-chain: ${onChainSettlement.txHash}`);
      } catch (error) {
        logger.error('Failed to settle battle on-chain:', error);
        // Continue - Yellow settlement succeeded, on-chain is optional
      }
    }
    
    // Remove session
    this.sessions.delete(userAddress);
    
    return {
      ...settleData,
      onChainSettlement
    };
  }

  /**
   * Handle incoming messages from Yellow
   */
  handleMessage(message) {
    logger.debug('Yellow message:', message);

    switch (message.type) {
      case 'session_created':
        logger.info('Session confirmed:', message.sessionId);
        break;
        
      case 'payment':
        logger.info('Payment received:', message.amount);
        break;
        
      case 'session_message':
        this.handleAppMessage(message);
        break;
        
      case 'error':
        logger.error('Yellow error:', message.error);
        break;
    }
  }

  /**
   * Handle application-specific messages
   */
  handleAppMessage(message) {
    // Handle bet confirmations, settlements, etc.
    logger.info('App message:', message.data);
  }

  /**
   * Get user's session
   */
  getSession(userAddress) {
    return this.sessions.get(userAddress);
  }

  /**
   * Disconnect from Yellow
   */
  disconnect() {
    // Clear reconnection timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    // Stop heartbeat
    this.stopHeartbeat();
    
    // Close WebSocket
    if (this.ws) {
      this.ws.close(1000, 'Intentional disconnect');
      this.ws = null;
      this.isConnected = false;
      this.isConnecting = false;
      logger.info('Disconnected from Yellow Network');
    }
  }
}

// Export class and singleton instance
export default YellowService;
export const yellowService = new YellowService();
