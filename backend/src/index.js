import express from 'express';
import cors from 'cors';
import { ethers } from 'ethers';
import { WebSocketServer } from 'ws';
import { createServer } from 'http';

import config from './config.js';
import logger from './utils/logger.js';
import priceFeed from './services/priceFeed.js';
import AgentController from './agents/controller.js';

// Contract ABIs (simplified - in production import from JSON files)
const BATTLE_ARENA_ABI = [
  "function createBattle(address bullWallet, address bearWallet, uint256 startPrice, bytes calldata zkProofInit) external returns (bytes32 battleId)",
  "function submitProof(bytes32 battleId, uint256 agentIndex, uint256 currentPrice, bytes calldata zkProof) external",
  "function checkSolvency(uint256 collateral, uint256 positionSize, uint256 entryPrice, uint256 currentPrice, bool isLong) public pure returns (bool)",
  "function getBattle(bytes32 battleId) external view returns (tuple(address wallet, uint256 collateral, bool isLong, uint256 leverage, uint256 entryPrice, bool alive, uint256 lastProofTime) agentA, tuple(address wallet, uint256 collateral, bool isLong, uint256 leverage, uint256 entryPrice, bool alive, uint256 lastProofTime) agentB, uint256 startTime, uint256 totalPool, bool settled, bytes32 zkVerificationKey)",
  "event BattleCreated(bytes32 indexed battleId, address indexed bull, address indexed bear, uint256 entryPrice, uint256 startTime)",
  "event AgentLiquidated(bytes32 indexed battleId, uint256 indexed agentIndex, uint256 timestamp, uint256 liquidationPrice)",
  "event BattleSettled(bytes32 indexed battleId, address indexed winner, uint256 prizeAmount, uint256 spectatorPayout)",
];

/**
 * Main Application Class
 */
class LiquidationArenaServer {
  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.provider = null;
    this.battleContract = null;
    this.agents = new Map();
    this.clients = new Set();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSocket();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: Date.now() });
    });

    // Get current ETH price
    this.app.get('/api/price', (req, res) => {
      res.json({
        price: priceFeed.getCurrentPrice(),
        timestamp: Date.now(),
      });
    });

    // Get agent status
    this.app.get('/api/agents/:battleId', (req, res) => {
      const { battleId } = req.params;
      const agents = [];
      
      for (const [id, agent] of this.agents) {
        if (id.startsWith(battleId)) {
          agents.push(agent.getStatus());
        }
      }
      
      res.json({ battleId, agents });
    });

    // Start a new battle
    this.app.post('/api/battles', async (req, res) => {
      try {
        const { bullWallet, bearWallet, startPrice } = req.body;
        
        // Create battle on-chain
        const tx = await this.battleContract.createBattle(
          bullWallet,
          bearWallet,
          startPrice || 3000 * 10**8,
          '0x00' // Mock proof for initialization
        );
        
        const receipt = await tx.wait();
        
        // Extract battle ID from event
        const event = receipt.events.find(e => e.event === 'BattleCreated');
        const battleId = event.args.battleId;
        
        // Start agents
        await this.startBattle(battleId, bullWallet, bearWallet, startPrice);
        
        res.json({
          success: true,
          battleId,
          txHash: receipt.transactionHash,
        });
      } catch (error) {
        logger.error('Failed to create battle', { error: error.message });
        res.status(500).json({ error: error.message });
      }
    });

    // Simulate price movement (for testing)
    this.app.post('/api/price/simulate', (req, res) => {
      const { percentChange } = req.body;
      priceFeed.simulatePriceMovement(percentChange);
      res.json({
        success: true,
        newPrice: priceFeed.getCurrentPrice(),
      });
    });
  }

  setupWebSocket() {
    this.wss.on('connection', (ws) => {
      logger.info('WebSocket client connected');
      this.clients.add(ws);

      // Send initial state
      ws.send(JSON.stringify({
        type: 'init',
        price: priceFeed.getCurrentPrice(),
        agents: Array.from(this.agents.values()).map(a => a.getStatus()),
      }));

      ws.on('close', () => {
        logger.info('WebSocket client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        logger.error('WebSocket error', { error: error.message });
      });
    });

    // Broadcast updates
    priceFeed.on('priceUpdate', (data) => {
      this.broadcast({
        type: 'priceUpdate',
        data,
      });
    });
  }

  broadcast(message) {
    const messageStr = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(messageStr);
      }
    });
  }

  async startBattle(battleId, bullWallet, bearWallet, startPrice) {
    // Create Bull agent
    const bullAgent = new AgentController(
      `bull-${battleId}`,
      true, // isLong
      bullWallet,
      this.battleContract,
      battleId,
      0 // agentIndex
    );
    
    // Create Bear agent
    const bearAgent = new AgentController(
      `bear-${battleId}`,
      false, // isLong
      bearWallet,
      this.battleContract,
      battleId,
      1 // agentIndex
    );

    // Store agents
    this.agents.set(bullAgent.agentId, bullAgent);
    this.agents.set(bearAgent.agentId, bearAgent);

    // Start agents
    bullAgent.start();
    bearAgent.start();

    logger.info('Battle started', { battleId, bull: bullWallet, bear: bearWallet });
  }

  async initialize() {
    try {
      // Initialize blockchain connection
      this.provider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
      
      if (config.blockchain.privateKey) {
        const wallet = new ethers.Wallet(config.blockchain.privateKey, this.provider);
        this.battleContract = new ethers.Contract(
          config.contracts.battleArena,
          BATTLE_ARENA_ABI,
          wallet
        );
      }

      // Start price feed
      priceFeed.start();

      logger.info('Server initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize server', { error: error.message });
      throw error;
    }
  }

  start() {
    this.server.listen(config.server.port, () => {
      logger.info(`Liquidation Arena server running on port ${config.server.port}`);
    });
  }

  async stop() {
    // Stop all agents
    for (const agent of this.agents.values()) {
      agent.stop();
    }
    this.agents.clear();

    // Stop price feed
    priceFeed.stop();

    // Close WebSocket server
    this.wss.close();

    // Close HTTP server
    this.server.close();

    logger.info('Server stopped');
  }
}

// Start server
const server = new LiquidationArenaServer();

async function main() {
  try {
    await server.initialize();
    server.start();
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
}

main();

// Handle graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  await server.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  await server.stop();
  process.exit(0);
});

export default server;
