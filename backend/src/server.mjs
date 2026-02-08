/**
 * Main Server for Liquidation Arena Backend
 * 
 * Combines:
 * - HTTP API (Express)
 * - WebSocket Server (for real-time updates)
 * - Contract Service (blockchain interactions)
 * - Price Feed Service (mock or real)
 * - Agent Controller (AI agents)
 */

import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import dotenv from 'dotenv';

import stateManager from './state.mjs';
import WebSocketService from './websocket.mjs';
import ContractService from './contracts.mjs';
import priceFeedService from './services/priceFeed.js';
import AgentManager from './agents/manager.js';
import YellowService from './services/yellow.js';
import PrimaryBattleService from './services/primaryBattle.js';
import BattleSettlementService from './services/battleSettlement.js';
import { ethers } from 'ethers';
import db from './db/index.js';
import { Battle } from './db/models/Battle.js';
import rateLimiter from './middleware/rateLimiter.mjs';

dotenv.config();

// Suppress filter errors from ethers.js (common with RPC providers)
// These errors occur when RPC providers expire event filters
const originalConsoleError = console.error;
const originalConsoleLog = console.log;

console.error = (...args) => {
  const message = args.join(' ');
  // Suppress filter not found errors and @TODO errors from ethers.js
  if (message.includes('filter not found') || 
      message.includes('@TODO Error') ||
      message.includes('@TODO') && message.includes('filter') ||
      (message.includes('UNKNOWN_ERROR') && message.includes('eth_getFilterChanges'))) {
    return; // Silently ignore
  }
  // Call original console.error for other errors
  originalConsoleError.apply(console, args);
};

console.log = (...args) => {
  const message = args.join(' ');
  // Also suppress @TODO errors in console.log
  if (message.includes('@TODO Error') && message.includes('filter not found')) {
    return; // Silently ignore
  }
  // Call original console.log for other messages
  originalConsoleLog.apply(console, args);
};

const app = express();
const server = createServer(app);

// ============ Middleware ============

app.use(cors());
app.use(express.json());

// Trust proxy for accurate IP addresses (if behind reverse proxy)
app.set('trust proxy', 1);

// Rate limiting - apply standard limit to all routes
app.use(rateLimiter.standard());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

// ============ Services ============

let wsService;
let contractService;
let agentManager;
let yellowService;
let primaryBattleService;
let battleSettlementService;

// ============ HTTP Routes ============

// Health check
app.get('/health', async (req, res) => {
  const stats = wsService ? wsService.getStats() : { connections: 0 };
  const contractHealth = contractService ? await contractService.healthCheck() : { status: 'not_initialized' };
  const agentStats = agentManager ? {
    activeBattles: agentManager.agents.size,
    agents: agentManager.getAllAgents().length
  } : { status: 'not_initialized' };
  
  res.json({
    status: 'ok',
    timestamp: Date.now(),
    websocket: stats,
    blockchain: contractHealth,
    agents: agentStats,
    price: stateManager.getPrice()
  });
});

// Get full state
app.get('/api/state', (req, res) => {
  res.json(stateManager.getFullState());
});

// Get all battles
app.get('/api/battles', (req, res) => {
  const battles = stateManager.getAllBattles();
  res.json({ battles });
});

// Get active battles
app.get('/api/battles/active', (req, res) => {
  const battles = stateManager.getActiveBattles();
  res.json({ battles });
});

// Get waiting lobbies
app.get('/api/battles/waiting', (req, res) => {
  const battles = stateManager.getWaitingLobbies();
  res.json({ battles });
});

// Get primary battle
app.get('/api/battles/primary', (req, res) => {
  const battle = stateManager.getPrimaryBattle();
  if (!battle) {
    return res.status(404).json({ error: 'No primary battle active' });
  }
  res.json({ battle });
});

// Get secondary battles
app.get('/api/battles/secondary', (req, res) => {
  const battles = stateManager.getSecondaryBattles();
  res.json({ battles });
});

// Get battle history (settled battles from MongoDB)
app.get('/api/battles/history', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    const skip = parseInt(req.query.skip) || 0;
    const tier = req.query.tier; // 'PRIMARY' or 'SECONDARY' or undefined for all
    
    // Get agent addresses for PRIMARY battle identification
    const bullAgentAddress = process.env.BULL_AGENT_PRIVATE_KEY 
      ? new ethers.Wallet(process.env.BULL_AGENT_PRIVATE_KEY).address.toLowerCase()
      : null;
    const bearAgentAddress = process.env.BEAR_AGENT_PRIVATE_KEY
      ? new ethers.Wallet(process.env.BEAR_AGENT_PRIVATE_KEY).address.toLowerCase()
      : null;
    
    // Build query - explicitly exclude CANCELLED and only include SETTLED
    const query = { 
      status: { $in: ['SETTLED'] }, // Only SETTLED, explicitly exclude CANCELLED
      winner: { $exists: true, $ne: null } // Only battles with a winner
    };
    
    // Add tier filter if specified
    if (tier && (tier === 'PRIMARY' || tier === 'SECONDARY')) {
      if (tier === 'PRIMARY') {
        // For PRIMARY: check tier field OR agent wallets match (but NOT if tier is explicitly SECONDARY)
        if (bullAgentAddress && bearAgentAddress) {
          // Use exact match instead of regex for better performance and accuracy
          query.$or = [
            { tier: 'PRIMARY' }, // Explicitly PRIMARY
            // If tier is null/undefined, check agent wallets (both combinations)
            // BUT exclude if tier is explicitly SECONDARY
            {
              $and: [
                { 'agentA.wallet': { $regex: new RegExp(`^${bullAgentAddress}$`, 'i') } },
                { 'agentB.wallet': { $regex: new RegExp(`^${bearAgentAddress}$`, 'i') } },
                { tier: { $ne: 'SECONDARY' } } // Not explicitly SECONDARY
              ]
            },
            {
              $and: [
                { 'agentA.wallet': { $regex: new RegExp(`^${bearAgentAddress}$`, 'i') } },
                { 'agentB.wallet': { $regex: new RegExp(`^${bullAgentAddress}$`, 'i') } },
                { tier: { $ne: 'SECONDARY' } } // Not explicitly SECONDARY
              ]
            }
          ];
        } else {
          // If no agent addresses, just check tier
          query.tier = 'PRIMARY';
        }
      } else {
        // For SECONDARY: tier is SECONDARY OR (tier is null/undefined AND doesn't match agent wallets)
        if (bullAgentAddress && bearAgentAddress) {
          query.$or = [
            { tier: 'SECONDARY' },
            {
              $and: [
                {
                  $or: [
                    { tier: { $exists: false } },
                    { tier: null }
                  ]
                },
                {
                  $nor: [
                    {
                      $and: [
                        { 'agentA.wallet': { $regex: new RegExp(bullAgentAddress, 'i') } },
                        { 'agentB.wallet': { $regex: new RegExp(bearAgentAddress, 'i') } }
                      ]
                    },
                    {
                      $and: [
                        { 'agentA.wallet': { $regex: new RegExp(bearAgentAddress, 'i') } },
                        { 'agentB.wallet': { $regex: new RegExp(bullAgentAddress, 'i') } }
                      ]
                    }
                  ]
                }
              ]
            }
          ];
        } else {
          // If no agent addresses configured, just check tier
          query.$or = [
            { tier: 'SECONDARY' },
            { tier: { $exists: false } },
            { tier: null }
          ];
        }
      }
    }
    
    // Get total count for pagination
    const totalCount = await Battle.countDocuments(query);
    
    // Debug logging
    console.log('🔍 Battle history query:', {
      tier: tier || 'all',
      totalCount,
      limit,
      skip,
      queryKeys: Object.keys(query)
    });
    
    // Use Battle model instead of raw MongoDB queries
    // Add timeout to prevent hanging queries
    const history = await Battle.find(query)
      .sort({ endTime: -1 })
      .limit(limit)
      .skip(skip)
      .lean() // Use lean() for better performance
      .maxTimeMS(10000); // 10 second timeout
    
    console.log('📊 Battle history results:', {
      tier: tier || 'all',
      found: history.length,
      totalCount,
      sampleIds: history.slice(0, 3).map(b => b.battleId?.substring(0, 20) || 'no-id'),
      sampleTiers: history.slice(0, 3).map(b => b.tier || 'null'),
      sampleStatuses: history.slice(0, 3).map(b => b.status || 'null') // Debug: check statuses
    });
    
    // If PRIMARY tier and no results, check if we have any battles at all
    if (tier === 'PRIMARY' && history.length === 0) {
      const allSettled = await Battle.countDocuments({ status: 'SETTLED', winner: { $exists: true, $ne: null } });
      const primarySettled = await Battle.countDocuments({ status: 'SETTLED', tier: 'PRIMARY' });
      const withAgents = await Battle.countDocuments({
        status: 'SETTLED',
        'agentA.wallet': { $regex: new RegExp(bullAgentAddress || '', 'i') },
        'agentB.wallet': { $regex: new RegExp(bearAgentAddress || '', 'i') }
      });
      console.log('🔍 PRIMARY battle debug:', {
        allSettled,
        primarySettled,
        withAgents,
        bullAgent: bullAgentAddress?.substring(0, 10),
        bearAgent: bearAgentAddress?.substring(0, 10)
      });
    }
    
    // Transform to frontend format
    const transformed = history.map(battle => {
      // Calculate round from battleId
      const roundMatch = battle.battleId.match(/-(\d+)$/);
      const round = roundMatch ? parseInt(roundMatch[1]) : 1;
      
      // Determine tier if missing (backfill for old battles)
      let battleTier = battle.tier;
      
      // If we're querying for PRIMARY, only include battles that are actually PRIMARY
      if (tier === 'PRIMARY') {
        // If tier is explicitly SECONDARY, skip it
        if (battleTier === 'SECONDARY') {
          return null; // Filter out
        }
        
        // If tier is null/undefined, check if it matches agent wallets
        if (!battleTier && bullAgentAddress && bearAgentAddress) {
          const agentA = battle.agentA?.wallet?.toLowerCase();
          const agentB = battle.agentB?.wallet?.toLowerCase();
          if ((agentA === bullAgentAddress && agentB === bearAgentAddress) ||
              (agentA === bearAgentAddress && agentB === bullAgentAddress)) {
            battleTier = 'PRIMARY';
            // Backfill tier in database (async, non-blocking)
            Battle.findOneAndUpdate(
              { battleId: battle.battleId },
              { $set: { tier: 'PRIMARY' } }
            ).catch(err => console.warn('Failed to backfill tier:', err));
          } else {
            // Doesn't match agent wallets - not PRIMARY, skip it
            return null;
          }
        } else if (!battleTier) {
          // No tier and no agent addresses to check - skip it
          return null;
        }
      } else {
        // For non-PRIMARY queries, use normal logic
        if (!battleTier && bullAgentAddress && bearAgentAddress) {
          const agentA = battle.agentA?.wallet?.toLowerCase();
          const agentB = battle.agentB?.wallet?.toLowerCase();
          if ((agentA === bullAgentAddress && agentB === bearAgentAddress) ||
              (agentA === bearAgentAddress && agentB === bullAgentAddress)) {
            battleTier = 'PRIMARY';
          } else {
            battleTier = 'SECONDARY';
          }
        } else if (!battleTier) {
          battleTier = 'SECONDARY';
        }
      }
      
      // Calculate TVL from agent collateral
      const tvl = ((battle.agentA?.collateral || 0) + (battle.agentB?.collateral || 0)) || 200; // Default 200 for primary battles
      
      // Filter out CANCELLED battles (safety check)
      if (battle.status === 'CANCELLED') {
        console.warn(`⚠️ Found CANCELLED battle in results: ${battle.battleId?.substring(0, 20)}`);
        return null; // Will be filtered out
      }
      
      // Calculate duration
      const duration = battle.endTime && battle.startTime 
        ? (new Date(battle.endTime).getTime() - new Date(battle.startTime).getTime())
        : 0;
      
      return {
        id: battle.battleId,
        round,
        winner: battle.winner || 'DRAW',
        bullHealth: battle.finalBullHealth ?? 0,
        bearHealth: battle.finalBearHealth ?? 0,
        tvl,
        duration,
        endTime: battle.endTime ? new Date(battle.endTime).getTime() : Date.now(),
        payoutRatio: 0, // TODO: Calculate from betting pool
        tier: battleTier, // Include tier in response
        status: battle.status, // Include status for debugging
      };
    });
    
    // Filter out any null entries (CANCELLED battles)
    const filteredHistory = transformed.filter(b => b !== null);
    
    // Recalculate totalCount if we filtered out any battles
    const actualTotalCount = filteredHistory.length < transformed.length 
      ? await Battle.countDocuments({ ...query, status: 'SETTLED' }) 
      : totalCount;
    
    res.json({ 
      history: filteredHistory, 
      count: filteredHistory.length,
      totalCount: actualTotalCount,
      page: Math.floor(skip / limit) + 1,
      totalPages: Math.ceil(actualTotalCount / limit),
      limit,
      skip
    });
  } catch (error) {
    console.error('Failed to fetch battle history:', error);
    res.status(500).json({ error: 'Failed to fetch battle history', message: error.message });
  }
});

// Get battle stats
app.get('/api/stats', async (req, res) => {
  try {
    const tier = req.query.tier; // Optional tier filter
    
    // Get agent addresses for PRIMARY battle identification (same logic as history endpoint)
    const bullAgentAddress = process.env.BULL_AGENT_PRIVATE_KEY 
      ? new ethers.Wallet(process.env.BULL_AGENT_PRIVATE_KEY).address.toLowerCase()
      : null;
    const bearAgentAddress = process.env.BEAR_AGENT_PRIVATE_KEY
      ? new ethers.Wallet(process.env.BEAR_AGENT_PRIVATE_KEY).address.toLowerCase()
      : null;
    
    // Build query for settled battles (same logic as history endpoint)
    const settledQuery = { 
      status: 'SETTLED',
      winner: { $exists: true, $ne: null }
    };
    
    if (tier && (tier === 'PRIMARY' || tier === 'SECONDARY')) {
      if (tier === 'PRIMARY') {
        // For PRIMARY: check tier field OR agent wallets match (same as history)
        if (bullAgentAddress && bearAgentAddress) {
          settledQuery.$or = [
            { tier: 'PRIMARY' },
            {
              $and: [
                { 'agentA.wallet': { $regex: new RegExp(bullAgentAddress, 'i') } },
                { 'agentB.wallet': { $regex: new RegExp(bearAgentAddress, 'i') } },
                { tier: { $ne: 'SECONDARY' } }
              ]
            },
            {
              $and: [
                { 'agentA.wallet': { $regex: new RegExp(bearAgentAddress, 'i') } },
                { 'agentB.wallet': { $regex: new RegExp(bullAgentAddress, 'i') } },
                { tier: { $ne: 'SECONDARY' } }
              ]
            }
          ];
        } else {
          settledQuery.tier = 'PRIMARY';
        }
      } else {
        // For SECONDARY: same logic as history endpoint
        if (bullAgentAddress && bearAgentAddress) {
          settledQuery.$or = [
            { tier: 'SECONDARY' },
            {
              $and: [
                {
                  $or: [
                    { tier: { $exists: false } },
                    { tier: null }
                  ]
                },
                {
                  $nor: [
                    {
                      $and: [
                        { 'agentA.wallet': { $regex: new RegExp(bullAgentAddress, 'i') } },
                        { 'agentB.wallet': { $regex: new RegExp(bearAgentAddress, 'i') } }
                      ]
                    },
                    {
                      $and: [
                        { 'agentA.wallet': { $regex: new RegExp(bearAgentAddress, 'i') } },
                        { 'agentB.wallet': { $regex: new RegExp(bullAgentAddress, 'i') } }
                      ]
                    }
                  ]
                }
              ]
            }
          ];
        } else {
          settledQuery.$or = [
            { tier: 'SECONDARY' },
            { tier: { $exists: false } },
            { tier: null }
          ];
        }
      }
    }
    
    // Build query for all battles (for total count)
    const allQuery = tier && (tier === 'PRIMARY' || tier === 'SECONDARY') 
      ? (tier === 'PRIMARY' ? settledQuery : { tier: 'SECONDARY' })
      : {};
    
    const totalBattles = await Battle.countDocuments(allQuery);
    const settledBattles = await Battle.countDocuments(settledQuery);
    const liveBattles = stateManager.getAllBattles().filter(b => b.status === 'live').length;
    
    // Bull vs Bear wins (only from settled battles)
    const bullWins = await Battle.countDocuments({ ...settledQuery, winner: 'BULL' });
    const bearWins = await Battle.countDocuments({ ...settledQuery, winner: 'BEAR' });
    const draws = await Battle.countDocuments({ ...settledQuery, winner: 'DRAW' });
    
    // Total TVL from active battles
    const activeBattles = stateManager.getAllBattles();
    const totalTVL = activeBattles.reduce((sum, b) => sum + (b.tvl || 0), 0);
    
    // Calculate total volume from settled battles
    const settledBattlesData = await Battle.find(settledQuery).lean();
    const totalVolume = settledBattlesData.reduce((sum, b) => {
      const tvl = ((b.agentA?.collateral || 0) + (b.agentB?.collateral || 0)) || 200;
      return sum + tvl;
    }, 0);
    
    res.json({
      totalBattles,
      settledBattles,
      liveBattles,
      bullWins,
      bearWins,
      draws,
      totalTVL,
      totalVolume
    });
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats', message: error.message });
  }
});

// Get specific battle
app.get('/api/battles/:battleId', (req, res) => {
  const { battleId } = req.params;
  const battle = stateManager.getBattleState(battleId);
  
  if (!battle) {
    return res.status(404).json({ error: 'Battle not found' });
  }
  
  res.json({ battle });
});

// Get betting pool for battle
app.get('/api/battles/:battleId/pool', (req, res) => {
  const { battleId } = req.params;
  const pool = stateManager.getBettingPool(battleId);
  res.json({ battleId, pool });
});

// Validate bet and get contract info (strict rate limit)
app.post('/api/battles/:battleId/bet/validate', rateLimiter.strict(), async (req, res) => {
  const { battleId } = req.params;
  const { userAddress, side, amount } = req.body;
  
  if (!userAddress || !side || !amount) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  try {
    const battle = stateManager.getBattleState(battleId);
    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }
    
    if (battle.status !== 'ACTIVE' && battle.status !== 'LIVE') {
      return res.status(400).json({ error: 'Battle is not active' });
    }
    
    if (!battle.battleAddress) {
      return res.status(400).json({ error: 'Battle contract address not available' });
    }
    
    const agentIndex = side === 'bull' ? 0 : 1;
    const amountWei = BigInt(Math.floor(amount * 1e6)); // USDC has 6 decimals
    
    // Check balance
    const balance = await contractService.getUSDCBalance(userAddress);
    if (balance < amountWei) {
      return res.status(400).json({
        error: 'Insufficient USDC balance',
        balance: balance.toString(),
        required: amountWei.toString()
      });
    }
    
    // Check allowance
    const allowance = await contractService.checkUSDCAllowance(
      userAddress,
      battle.battleAddress
    );
    
    const needsApproval = allowance < amountWei;
    
    res.json({
      valid: true,
      battleId,
      battleAddress: battle.battleAddress,
      agentIndex,
      amount: amountWei.toString(),
      needsApproval,
      currentAllowance: allowance.toString(),
      balance: balance.toString()
    });
  } catch (error) {
    console.error('Error validating bet:', error);
    res.status(500).json({
      error: 'Failed to validate bet',
      message: error.message
    });
  }
});

// Save bet after on-chain placement
app.post('/api/battles/:battleId/bet', rateLimiter.strict(), async (req, res) => {
  const { battleId } = req.params;
  const { userAddress, side, amount, txHash, blockNumber } = req.body;
  
  if (!userAddress || !side || !amount || !txHash) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  try {
    const battle = stateManager.getBattleState(battleId);
    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }
    
    if (!battle.battleAddress) {
      return res.status(400).json({ error: 'Battle contract address not available' });
    }
    
    // Save bet to database
    const { saveBet } = await import('./db/services/betService.js');
    const bet = await saveBet({
      battleId,
      battleAddress: battle.battleAddress,
      bettor: userAddress,
      side: side.toLowerCase(),
      amount: parseFloat(amount),
      txHash,
      blockNumber: blockNumber ? parseInt(blockNumber) : undefined,
    });
    
    // Update betting pool in state manager
    stateManager.updateBettingPool(battleId, side.toLowerCase(), parseFloat(amount));
    
    console.log('✅ Bet saved to database:', {
      battleId,
      userAddress,
      side,
      amount,
      txHash,
      betId: bet?._id,
    });
    
    res.json({
      success: true,
      bet: bet ? {
        id: bet._id,
        battleId: bet.battleId,
        side: bet.side,
        amount: bet.amount,
        txHash: bet.txHash,
        createdAt: bet.createdAt,
      } : null,
    });
  } catch (error) {
    console.error('Error saving bet:', error);
    res.status(500).json({
      error: 'Failed to save bet',
      message: error.message
    });
  }
});

// Get user's bets for a battle
app.get('/api/battles/:battleId/bets/:userAddress', async (req, res) => {
  const { battleId, userAddress } = req.params;
  
  try {
    const { getUserBets } = await import('./db/services/betService.js');
    const bets = await getUserBets(userAddress, { battleId });
    
    console.log(`📊 User bets for battle ${battleId}:`, {
      userAddress,
      battleId,
      betCount: bets.length,
      bets: bets.map(b => ({
        side: b.side,
        amount: b.amount,
        settled: b.settled,
        won: b.won,
        payout: b.payout,
      })),
    });
    
    res.json({
      bets: bets.map(bet => ({
        id: bet._id,
        battleId: bet.battleId,
        side: bet.side,
        amount: bet.amount,
        txHash: bet.txHash,
        settled: bet.settled,
        won: bet.won,
        payout: bet.payout,
        createdAt: bet.createdAt,
        settledAt: bet.settledAt,
      })),
    });
  } catch (error) {
    console.error('Error getting user bets:', error);
    res.status(500).json({
      error: 'Failed to get user bets',
      message: error.message
    });
  }
});

// Get all user's bets (across all battles)
app.get('/api/bets/:userAddress', async (req, res) => {
  const { userAddress } = req.params;
  const { limit = 50, settled } = req.query;
  
  try {
    const { getUserBets } = await import('./db/services/betService.js');
    const options = {
      limit: parseInt(limit),
      settled: settled !== undefined ? settled === 'true' : undefined,
    };
    const bets = await getUserBets(userAddress, options);
    
    res.json({
      bets: bets.map(bet => ({
        id: bet._id,
        battleId: bet.battleId,
        side: bet.side,
        amount: bet.amount,
        txHash: bet.txHash,
        settled: bet.settled,
        won: bet.won,
        payout: bet.payout,
        createdAt: bet.createdAt,
        settledAt: bet.settledAt,
      })),
    });
  } catch (error) {
    console.error('Error getting user bets:', error);
    res.status(500).json({
      error: 'Failed to get user bets',
      message: error.message
    });
  }
});

// Get price history
app.get('/api/price/history', (req, res) => {
  const { limit = 100 } = req.query;
  const history = stateManager.getPriceHistory().slice(-limit);
  res.json({ price: stateManager.getPrice(), history });
});

// Get current price
app.get('/api/price', (req, res) => {
  res.json({
    price: stateManager.getPrice(),
    timestamp: Date.now()
  });
});

// Prover service endpoints
app.post('/api/prover/generate', async (req, res) => {
  const { agentState, currentPrice } = req.body;
  
  if (!agentState || !currentPrice) {
    return res.status(400).json({ error: 'Missing agentState or currentPrice' });
  }
  
  try {
    const proverService = (await import('./services/prover.js')).default;
    const proof = await proverService.generateSolvencyProof(agentState, currentPrice);
    
    res.json({
      success: true,
      proof: Array.from(proof), // Convert Uint8Array to array for JSON
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to generate proof',
      message: error.message,
    });
  }
});

app.post('/api/prover/verify', async (req, res) => {
  const { proof, publicInputs } = req.body;
  
  if (!proof || !publicInputs) {
    return res.status(400).json({ error: 'Missing proof or publicInputs' });
  }
  
  try {
    const proverService = (await import('./services/prover.js')).default;
    const isValid = await proverService.verifyProof(
      new Uint8Array(proof),
      publicInputs
    );
    
    res.json({
      success: true,
      valid: isValid,
    });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to verify proof',
      message: error.message,
    });
  }
});

// Get agent status for a battle
app.get('/api/battles/:battleId/agents', (req, res) => {
  const { battleId } = req.params;
  
  if (!agentManager) {
    return res.status(503).json({ error: 'Agent manager not initialized' });
  }
  
  const status = agentManager.getAgentStatus(battleId);
  
  if (!status) {
    return res.status(404).json({ error: 'No agents found for this battle' });
  }
  
  res.json({ battleId, agents: status });
});

// Get all active agents
app.get('/api/agents', (req, res) => {
  if (!agentManager) {
    return res.status(503).json({ error: 'Agent manager not initialized' });
  }
  
  const agents = agentManager.getAllAgents();
  res.json({ agents });
});

// ============ Yellow SDK / State Channel Endpoints ============

// Create betting session (open state channel)
app.post('/api/yellow/session', async (req, res) => {
  const { userAddress, battleId, signedMessage } = req.body;
  
  if (!yellowService) {
    return res.status(503).json({ error: 'Yellow service not initialized' });
  }
  
  if (!userAddress || !battleId) {
    return res.status(400).json({ error: 'Missing userAddress or battleId' });
  }
  
  try {
    // Get battle contract address
    const battle = stateManager.getBattle(battleId);
    if (!battle) {
      return res.status(404).json({ error: 'Battle not found' });
    }
    
    const battleContract = battle.battleAddress || battle.id;
    
    // Create a message signer that uses the provided signature
    // For Yellow SDK, we need a signer function, but we'll use the signed message
    const messageSigner = async (message) => {
      // If we have a signed message, verify it matches
      // For now, we'll create a session without requiring a new signature
      // The actual signing happens on the frontend
      return signedMessage || '';
    };
    
    const session = await yellowService.createBettingSession(
      userAddress,
      battleContract,
      messageSigner
    );
    
    res.json({ success: true, session });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to create betting session',
      message: error.message,
    });
  }
});

// Place bet via state channel
app.post('/api/yellow/bet', rateLimiter.strict(), async (req, res) => {
  const { userAddress, agent, amount, signedMessage } = req.body;
  
  if (!yellowService) {
    return res.status(503).json({ error: 'Yellow service not initialized' });
  }
  
  if (!userAddress || !agent || !amount || !signedMessage) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  try {
    // Create a message signer that uses the provided signature
    const messageSigner = async (message) => {
      // The frontend already signed the message, so we use that signature
      return signedMessage;
    };
    
    const bet = await yellowService.placeBet(
      userAddress,
      agent,
      amount,
      messageSigner
    );
    
    res.json({ success: true, bet });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to place bet',
      message: error.message,
    });
  }
});

// Close session and settle
app.post('/api/yellow/settle', async (req, res) => {
  const { userAddress, winnerAgent, winnings, battleId, finalPrice } = req.body;
  
  if (!yellowService) {
    return res.status(503).json({ error: 'Yellow service not initialized' });
  }
  
  if (!userAddress) {
    return res.status(400).json({ error: 'Missing userAddress' });
  }
  
  try {
    // Get battle info for on-chain settlement
    let battleAddress = null;
    let settlementPrice = finalPrice;
    
    if (battleId) {
      const battle = stateManager.getBattle(battleId);
      if (battle) {
        battleAddress = battle.battleAddress;
        // Use current price if finalPrice not provided
        if (!settlementPrice) {
          settlementPrice = stateManager.getPrice() * 1e8; // Convert to 8 decimals
        }
      }
    }

    // Contract settler function (if contract service available)
    const contractSettler = contractService && contractService.initialized && battleAddress
      ? async (battleAddr, battleIdBytes32, price) => {
          return await contractService.settleBattle(battleAddr, battleIdBytes32, price);
        }
      : null;

    const result = await yellowService.settleSession(
      userAddress,
      winnerAgent,
      winnings,
      {
        battleId,
        battleAddress,
        finalPrice: settlementPrice,
        contractSettler
      }
    );
    
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({
      error: 'Failed to settle session',
      message: error.message,
    });
  }
});

// Get session status
app.get('/api/yellow/session/:userAddress', (req, res) => {
  const { userAddress } = req.params;
  
  if (!yellowService) {
    return res.status(503).json({ error: 'Yellow service not initialized' });
  }
  
  const session = yellowService.getSession(userAddress);
  
  if (!session) {
    return res.status(404).json({ error: 'No active session found' });
  }
  
  res.json({ session });
});

// ============ Admin Routes (would need auth in production) ============

// Update price (mock price feed)
app.post('/admin/price', (req, res) => {
  const { price } = req.body;
  
  if (!price || isNaN(price)) {
    return res.status(400).json({ error: 'Invalid price' });
  }
  
  const oldPrice = stateManager.getPrice();
  stateManager.updatePrice(Number(price));
  
  res.json({
    success: true,
    oldPrice,
    newPrice: Number(price),
    change: ((Number(price) - oldPrice) / oldPrice * 100).toFixed(2) + '%'
  });
});

// Simulate price movement
app.post('/admin/price/simulate', (req, res) => {
  const { percentChange, direction } = req.body;
  
  const currentPrice = stateManager.getPrice();
  const change = currentPrice * (percentChange / 100);
  const newPrice = direction === 'up' ? currentPrice + change : currentPrice - change;
  
  stateManager.updatePrice(newPrice);
  
  res.json({
    success: true,
    oldPrice: currentPrice,
    newPrice,
    change: percentChange + '%',
    direction
  });
});

// Create battle (on-chain or mock)
app.post('/admin/battles/mock', rateLimiter.strict(), async (req, res) => {
  // Users can only create SECONDARY battles - PRIMARY is system-only
  const requestedTier = req.body.tier;
  if (requestedTier === 'PRIMARY') {
    return res.status(403).json({ 
      error: 'Forbidden',
      message: 'PRIMARY battles can only be created by the system. Users can only create SECONDARY battles.'
    });
  }
  
  const { tier = 'SECONDARY', status = 'WAITING', asset, bull, bear } = req.body;
  
  try {
    // Use provided asset info or default to ETH
    const assetInfo = asset || {
      assetId: 'ethereum',
      symbol: 'ETH',
      pairLabel: 'ETH-PERP',
    };
    
    // Use provided agent data
    const bullData = bull;
    const bearData = bear;
    
    if (!bullData) {
      return res.status(400).json({ 
        error: 'Bull agent data required',
        message: 'Please provide bull agent with sponsor, stake, and leverage'
      });
    }
    
    // Generate battle ID
    const battleId = `battle-${Date.now()}`;
    
    // Try to create battle on-chain if contract service is available
    let battleAddress = null;
    let onChainCreated = false;
    
    if (contractService && contractService.initialized) {
      try {
        // Convert battleId to bytes32
        const battleIdBytes32 = ethers.id(battleId);
        
        // Get current price (8 decimals for contract)
        const currentPrice = stateManager.getPrice();
        const entryPrice = Math.floor(currentPrice * 1e8); // Convert to 8 decimals
        
        // Create battle config
        const config = {
          entryFee: 0, // No entry fee for now
          minPlayers: 2,
          maxPlayers: 2,
          timeLimit: 86400, // 24 hours
          eliminationThreshold: 9500, // 95% (in basis points)
          enabled: true
        };
        
        // Agent addresses - use sponsor addresses
        const agentA = bullData.sponsor; // Bull
        const agentB = bearData?.sponsor || ethers.ZeroAddress; // Bear or zero if not provided
        
        console.log('📝 Creating battle on-chain:', {
          battleId: battleIdBytes32,
          agentA,
          agentB,
          entryPrice
        });
        
        // Create battle on-chain
        const tx = await contractService.createBattle(
          battleIdBytes32,
          config,
          agentA,
          agentB,
          entryPrice
        );
        
        const receipt = await tx.wait();
        console.log('✅ Battle created on-chain:', receipt.hash);
        
        // Get battle address from event or contract
        const battleInfo = await contractService.getBattleFromFactory(battleIdBytes32);
        battleAddress = battleInfo?.battleAddress;
        onChainCreated = true;
        
      } catch (error) {
        console.error('❌ Failed to create battle on-chain:', error);
        // Fall through to create mock battle
      }
    }
    
    // Create battle object (on-chain or mock)
  const battle = {
    id: battleId,
      battleAddress: battleAddress, // Will be null if on-chain creation failed
    tier,
      status: onChainCreated ? 'LIVE' : status,
      assetLabel: assetInfo.pairLabel,
      assetId: assetInfo.assetId,
      assetSymbol: assetInfo.symbol,
      bull: bullData ? {
        ...bullData,
      entryPrice: stateManager.getPrice(),
      health: 100,
      alive: true,
      lastProofTime: Date.now(),
      pnl: 0
    } : null,
      bear: bearData ? {
        ...bearData,
      entryPrice: stateManager.getPrice(),
      health: 100,
      alive: true,
      lastProofTime: Date.now(),
      pnl: 0
    } : null,
      startTime: (onChainCreated || status === 'LIVE') ? Date.now() : null,
      totalPool: (bullData?.stake || 0) + (bearData?.stake || 0),
    entryPrice: stateManager.getPrice(),
    createdAt: Date.now()
  };
  
  stateManager.createBattle(battle);
  
    res.json({ 
      success: true, 
      battle,
      onChain: onChainCreated,
      battleAddress: battleAddress,
      message: onChainCreated 
        ? 'Battle created on-chain successfully' 
        : 'Battle created (mock - contract service unavailable)'
    });
    
  } catch (error) {
    console.error('Error creating battle:', error);
    res.status(500).json({
      error: 'Failed to create battle',
      message: error.message
    });
  }
});

// Update agent health
app.post('/admin/battles/:battleId/health', (req, res) => {
  const { battleId } = req.params;
  const { agentType, health } = req.body;
  
  const agent = stateManager.updateAgentHealth(battleId, agentType, health);
  
  if (!agent) {
    return res.status(404).json({ error: 'Battle or agent not found' });
  }
  
  res.json({ success: true, agent });
});

// Sync battles from chain
app.post('/admin/sync', async (req, res) => {
  if (!contractService) {
    return res.status(503).json({ error: 'Contract service not initialized' });
  }
  
  const success = await contractService.syncBattlesFromChain();
  
  if (success) {
    res.json({ success: true, battles: stateManager.battles.size });
  } else {
    res.status(500).json({ error: 'Sync failed' });
  }
});

// Clear all battles (for testing/fresh start)
app.post('/admin/battles/clear', (req, res) => {
  const count = stateManager.clearAllBattles();
  res.json({ 
    success: true, 
    message: `Cleared ${count} battle(s) from state`,
    count 
  });
});

// Remove a specific battle
app.delete('/admin/battles/:battleId', (req, res) => {
  const { battleId } = req.params;
  const removed = stateManager.removeBattle(battleId);
  
  if (removed) {
    res.json({ success: true, message: `Removed battle ${battleId}` });
  } else {
    res.status(404).json({ error: 'Battle not found' });
  }
});

// ============ MongoDB API Endpoints ============

// Get user betting history
app.get('/api/users/:address/bets', async (req, res) => {
  try {
    const { address } = req.params;
    const { battleId, settled, limit } = req.query;
    
    const bets = await getUserBets(address, {
      battleId,
      settled: settled === 'true' ? true : settled === 'false' ? false : undefined,
      limit: limit ? parseInt(limit) : 100,
    });
    
    res.json({ success: true, bets });
  } catch (error) {
    console.error('Error getting user bets:', error);
    res.status(500).json({ error: 'Failed to get user bets' });
  }
});

// Get all transactions (bets + battle creation/settlement)
app.get('/api/transactions', async (req, res) => {
  try {
    const { address, battleId, limit = 20, skip = 0 } = req.query;
    const { Bet } = await import('./db/models/Bet.js');
    const { Battle } = await import('./db/models/Battle.js');
    
    const transactions = [];
    const limitNum = Math.min(parseInt(limit) || 20, 100); // Cap at 100
    const skipNum = parseInt(skip) || 0;
    
    // Get user bets (if address provided) or all bets
    const betQuery = {};
    if (address) betQuery.bettor = address.toLowerCase();
    if (battleId) betQuery.battleId = battleId;
    
    const bets = await Bet.find(betQuery)
      .sort({ createdAt: -1 })
      .limit(limitNum)
      .skip(skipNum)
      .lean();
    
    bets.forEach(bet => {
      // Validate txHash - must be 66 characters (0x + 64 hex chars)
      let txHash = bet.txHash;
      if (!txHash || !/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
        // Invalid or missing txHash - use null instead of fake hash
        txHash = null;
      }
      
      transactions.push({
        type: 'BET',
        txHash: txHash, // null if invalid
        blockNumber: bet.blockNumber,
        from: bet.bettor,
        to: bet.battleAddress || '',
        battleId: bet.battleId,
        amount: bet.amount || 0,
        side: bet.side,
        timestamp: bet.createdAt ? new Date(bet.createdAt).toISOString() : new Date().toISOString(),
        status: bet.settled ? 'SETTLED' : 'PENDING',
      });
    });
    
    // Get battle creation/settlement transactions (only if we have space)
    if (transactions.length < limitNum) {
      const battleQuery = {};
      if (battleId) battleQuery.battleId = battleId;
      if (address) {
        battleQuery.$or = [
          { creator: address.toLowerCase() },
          { 'agentA.wallet': { $regex: new RegExp(address.toLowerCase(), 'i') } },
          { 'agentB.wallet': { $regex: new RegExp(address.toLowerCase(), 'i') } },
        ];
      }
      
      const battles = await Battle.find(battleQuery)
        .sort({ createdAt: -1 })
        .limit(limitNum - transactions.length)
        .skip(skipNum)
        .lean();
      
      // Helper to validate txHash format (must be 66 chars: 0x + 64 hex)
      const isValidTxHash = (hash) => {
        return hash && /^0x[a-fA-F0-9]{64}$/.test(hash);
      };
      
      battles.forEach(battle => {
        if (battle.status === 'SETTLED' && battle.endTime) {
          // Use settlementTxHash if available, otherwise null (not battleAddress which is a contract address)
          const settlementTxHash = battle.settlementTxHash || null;
          transactions.push({
            type: 'BATTLE_SETTLED',
            txHash: isValidTxHash(settlementTxHash) ? settlementTxHash : null,
            blockNumber: battle.settlementBlockNumber || null,
            from: battle.battleAddress || '',
            to: battle.winner === 'BULL' ? (battle.agentA?.wallet || '') : (battle.agentB?.wallet || ''),
            battleId: battle.battleId,
            amount: battle.totalPool || 0,
            timestamp: battle.endTime ? new Date(battle.endTime).toISOString() : new Date().toISOString(),
            status: 'SETTLED',
            winner: battle.winner,
          });
        }
        // Add battle creation
        // Use creationTxHash if available, otherwise null
        const creationTxHash = battle.creationTxHash || null;
        transactions.push({
          type: 'BATTLE_CREATED',
          txHash: isValidTxHash(creationTxHash) ? creationTxHash : null,
          blockNumber: battle.creationBlockNumber || null,
          from: battle.creator || '',
          to: battle.battleAddress || '',
          battleId: battle.battleId,
          timestamp: battle.createdAt ? new Date(battle.createdAt).toISOString() : new Date().toISOString(),
          status: 'SETTLED',
        });
      });
    }
    
    // Sort by timestamp descending
    transactions.sort((a, b) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    res.json({
      success: true,
      transactions: transactions.slice(0, limitNum),
      count: transactions.length,
    });
  } catch (error) {
    console.error('Failed to get transactions:', error);
    res.status(500).json({ error: 'Failed to get transactions', message: error.message });
  }
});

// Get user statistics
app.get('/api/users/:address/stats', async (req, res) => {
  try {
    const { address } = req.params;
    const stats = await getUserStats(address);
    
    if (!stats) {
      return res.json({ 
        success: true, 
        stats: {
          address,
          totalBets: 0,
          totalWagered: 0,
          totalWon: 0,
          totalLost: 0,
          winRate: 0,
        }
      });
    }
    
    res.json({ success: true, stats });
  } catch (error) {
    console.error('Error getting user stats:', error);
    res.status(500).json({ error: 'Failed to get user stats' });
  }
});

// Get leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const leaderboard = await getLeaderboard(parseInt(limit));
    
    res.json({ success: true, leaderboard });
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    res.status(500).json({ error: 'Failed to get leaderboard' });
  }
});

// ============ Error Handling ============

app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ============ Initialization ============

async function startServer() {
  const PORT = process.env.PORT || 3001;
  
  try {
    // Initialize MongoDB connection
    try {
      await db.connect();
    } catch (error) {
      console.warn('⚠️ MongoDB connection failed, continuing without database:', error.message);
      console.warn('⚠️ Some features (betting history, analytics) will be unavailable');
    }
    
    // Initialize WebSocket service
    wsService = new WebSocketService(server, contractService);
    
    // Initialize contract service if configured (Polygon Amoy)
    const rpcUrl = process.env.AMOY_RPC || process.env.RPC_URL;
    const battleFactoryAddress = process.env.BATTLE_FACTORY || process.env.BATTLE_FACTORY_ADDRESS;
    const usdcAddress = process.env.MOCK_USDC || process.env.USDC_ADDRESS;
    
    if (rpcUrl && battleFactoryAddress) {
      contractService = new ContractService({
        rpcUrl,
        battleFactoryAddress,
        usdcAddress,
        privateKey: process.env.PRIVATE_KEY
      });
      
      await contractService.initialize();
      
      // Sync battles from chain FIRST (this happens in initialize, but ensure it completes)
      console.log('🔄 Ensuring battles are synced from chain...');
      await contractService.syncBattlesFromChain();
      const syncedBattles = stateManager.getAllBattles();
      console.log(`✅ Synced ${syncedBattles.length} battle(s) from chain`);
      
      // Start price feed service BEFORE other services (they depend on it)
      priceFeedService.on('priceUpdate', ({ price, priceUsd }) => {
        // Update state manager with real price
        stateManager.updatePrice(price);
      });
      
      // Start the price feed service
      priceFeedService.start();
      console.log('📈 Price feed service started (CoinGecko API)');
      
      // Wait for first price update (max 5 seconds)
      console.log('⏳ Waiting for first price update...');
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.log('⚠️ Price wait timeout, continuing anyway');
          resolve();
        }, 5000);
        
        const checkPrice = () => {
          if (stateManager.getPrice() > 0) {
            clearTimeout(timeout);
            console.log('✅ Price available:', stateManager.getPrice());
            resolve();
    } else {
            setTimeout(checkPrice, 100);
          }
        };
        checkPrice();
      });
      
      // Initialize agent manager
      agentManager = new AgentManager(contractService);
      await agentManager.initialize();
      console.log('🤖 Agent Manager initialized');
      
      // Initialize Primary Battle Service (auto-creates primary battles)
      // Only if no primary battle exists yet
      if (process.env.BULL_AGENT_PRIVATE_KEY && process.env.BEAR_AGENT_PRIVATE_KEY) {
        primaryBattleService = new PrimaryBattleService(contractService);
        await primaryBattleService.initialize(
          process.env.BULL_AGENT_PRIVATE_KEY,
          process.env.BEAR_AGENT_PRIVATE_KEY
        );
        console.log('✅ Primary Battle Service initialized');
        
        // Check if primary battle already exists, if not create one
        const existingPrimary = stateManager.primaryBattleId 
          ? stateManager.getBattle(stateManager.primaryBattleId)
          : null;
        
        if (!existingPrimary || existingPrimary.status !== 'LIVE') {
          console.log('🆕 No active primary battle found, creating new one...');
          // Primary battle service will create one automatically on next check
        } else {
          console.log(`✅ Primary battle already exists: ${stateManager.primaryBattleId}`);
        }
      } else {
        console.warn('⚠️ Primary Battle Service not initialized: BULL_AGENT_PRIVATE_KEY and BEAR_AGENT_PRIVATE_KEY not set');
      }
      
      // Initialize Battle Settlement Service (auto-liquidation and settlement)
      battleSettlementService = new BattleSettlementService(contractService, yellowService);
      await battleSettlementService.initialize();
      console.log('✅ Battle Settlement Service initialized');
      
      // Initialize Yellow service for state channels (optional)
      if (process.env.YELLOW_NODE_URL) {
        const YellowService = (await import('./services/yellow.js')).default;
        yellowService = new YellowService();
        try {
          await yellowService.connect();
          console.log('💛 Yellow Service initialized');
        } catch (error) {
          console.log('⚠️ Yellow Service connection failed, continuing without it');
          yellowService = null;
        }
      } else {
        console.log('⚠️ Yellow Node URL not configured, skipping Yellow service');
      }
    } else {
      console.log('⚠️ Contract service not configured, running in mock mode');
    }
    
    // Start server
    server.listen(PORT, () => {
      console.log(`
🚀 Liquidation Arena Server Started

📡 HTTP API:    http://localhost:${PORT}
🔌 WebSocket:   ws://localhost:${PORT}
📊 Health:      http://localhost:${PORT}/health

Available endpoints:
  GET  /api/state              - Full application state
  GET  /api/battles            - All battles
  GET  /api/battles/active     - Active battles
  GET  /api/battles/waiting    - Waiting lobbies
  GET  /api/battles/primary    - Current primary battle
  GET  /api/battles/secondary  - Secondary battles
  GET  /api/price              - Current ETH price
  GET  /api/price/history      - Price history

Admin endpoints:
  POST /admin/price            - Update price
  POST /admin/price/simulate   - Simulate price movement
  POST /admin/battles/mock     - Create mock battle
  POST /admin/battles/:id/health - Update agent health
  POST /admin/sync             - Sync from blockchain
  POST /admin/battles/clear   - Clear all battles from state
  DELETE /admin/battles/:id   - Remove specific battle
      `);
    });
    
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

// ============ Price Feed Integration ============
// Price feed is now handled by PriceFeedService (CoinGecko API)
// No mock simulation - all prices come from real API

// ============ Graceful Shutdown ============

process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully');
  if (yellowService) {
    yellowService.disconnect();
  }
  if (agentManager) {
    agentManager.stopAll();
  }
  if (battleSettlementService) {
    battleSettlementService.stop();
  }
  await db.disconnect();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully');
  if (yellowService) {
    yellowService.disconnect();
  }
  if (agentManager) {
    agentManager.stopAll();
  }
  if (battleSettlementService) {
    battleSettlementService.stop();
  }
  await db.disconnect();
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

// Also suppress unhandled rejections for filter errors
process.on('unhandledRejection', (reason, promise) => {
  if (reason && typeof reason === 'object') {
    // Ignore filter not found errors
    if (reason.code === 'UNKNOWN_ERROR' && reason.error?.message?.includes('filter not found')) {
      return; // Silently ignore
    }
    // Ignore @TODO errors from ethers.js internal code
    if (reason.message?.includes('@TODO')) {
      return; // Silently ignore
    }
  }
  // Log other unhandled rejections
  originalConsoleError('Unhandled rejection:', reason);
});

// Duplicate handlers removed - using the ones above that handle both yellowService and agentManager

// Start the server
startServer();

export { app, server, wsService, contractService };
