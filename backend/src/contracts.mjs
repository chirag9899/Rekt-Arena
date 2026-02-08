/**
 * Contract Service for Liquidation Arena
 * 
 * Handles all blockchain interactions:
 * - Battle creation and management
 * - Agent proof submission
 * - Betting operations
 * - Settlement
 */

import { ethers } from 'ethers';
import stateManager from './state.mjs';
import { saveBattle } from './db/services/battleService.js';

// Contract ABIs - matching actual deployed contracts
const BATTLE_FACTORY_ABI = [
  // View functions
  "function getBattle(bytes32 battleId) external view returns (tuple(address battleAddress, address creator, bytes32 battleId, uint256 createdAt, tuple(uint256 entryFee, uint256 minPlayers, uint256 maxPlayers, uint256 timeLimit, uint256 eliminationThreshold, bool enabled) config))",
  "function getAllBattles() external view returns (bytes32[])",
  "function getBattleCount() external view returns (uint256)",
  "function getCreatorBattles(address creator) external view returns (bytes32[])",
  "function battleImplementation() external view returns (address)",
  "function usdc() external view returns (address)",
  "function feeRecipient() external view returns (address)",
  
  // Write functions
  "function createAndInitBattle(bytes32 battleId, tuple(uint256 entryFee, uint256 minPlayers, uint256 maxPlayers, uint256 timeLimit, uint256 eliminationThreshold, bool enabled) config, address agentA, address agentB, uint256 entryPrice) external returns (address)",
  
  // Events
  "event BattleCreated(bytes32 indexed battleId, address indexed battleAddress, address indexed creator, uint256 entryFee, uint256 timeLimit, uint256 eliminationThreshold)",
  "event BattleInitialized(bytes32 indexed battleId, address indexed agentA, address indexed agentB, uint256 entryPrice)"
];

const BATTLE_ARENA_ABI = [
  // View functions
  "function getBattle(bytes32 battleId) external view returns (tuple(tuple(address wallet, uint256 collateral, bool isLong, uint256 leverage, uint256 entryPrice, bool alive, uint256 lastProofTime, uint256 totalBets) agentA, tuple(address wallet, uint256 collateral, bool isLong, uint256 leverage, uint256 entryPrice, bool alive, uint256 lastProofTime, uint256 totalBets) agentB, uint256 startTime, uint256 endTime, uint256 totalPool, uint8 status, address winner, uint256 entryFee, uint256 eliminationThreshold))",
  "function status() external view returns (uint8)",
  
  // Write functions
  "function placeBet(bytes32 battleId, uint8 agentIndex, uint256 amount) external",
  "function settleBattle(bytes32 battleId, uint256 finalPrice) external",
  
  // Events
  "event BattleCreated(bytes32 indexed battleId, address indexed agentA, address indexed agentB, uint256 initialPrice, uint256 startTime, uint256 endTime, uint256 entryFee)",
  "event ProofSubmitted(bytes32 indexed battleId, address indexed agent, uint256 price, bytes32 proofHash)",
  "event AgentLiquidated(bytes32 indexed battleId, address indexed agent, uint256 liquidationPrice)",
  "event BetPlaced(bytes32 indexed battleId, address indexed bettor, uint8 side, uint256 amount)",
  "event BattleSettled(bytes32 indexed battleId, address indexed winner, uint256 prizeAmount, uint256 timestamp)"
];

const ERC20_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)"
];

class ContractService {
  constructor(config) {
    this.config = config;
    this.provider = null;
    this.battleFactory = null;
    this.usdc = null;
    this.wallet = null;
    this.initialized = false;
  }
  
  async initialize() {
    try {
      // Initialize provider
      this.provider = new ethers.JsonRpcProvider(this.config.rpcUrl);
      
      // Initialize wallet (for backend operations)
      if (this.config.privateKey) {
        this.wallet = new ethers.Wallet(this.config.privateKey, this.provider);
      }
      
      // Initialize contract instances
      this.battleFactory = new ethers.Contract(
        this.config.battleFactoryAddress,
        BATTLE_FACTORY_ABI,
        this.wallet || this.provider
      );
      
      this.usdc = new ethers.Contract(
        this.config.usdcAddress,
        ERC20_ABI,
        this.wallet || this.provider
      );
      
      // Disable event listeners - use polling instead to avoid filter errors
      // this._setupEventListeners();
      
      this.initialized = true;
      console.log('✅ Contract service initialized');
      
      // Sync initial state
      await this.syncBattlesFromChain();
      
      return true;
    } catch (error) {
      console.error('❌ Failed to initialize contract service:', error);
      return false;
    }
  }
  
  // Event listeners disabled - using polling instead to avoid filter errors
  // RPC providers often expire filters, causing constant errors
  // Use syncBattlesFromChain() periodically instead
  
  // ============ Battle Operations ============
  
  async createBattle(battleId, config, agentA, agentB, entryPrice) {
    if (!this.wallet) throw new Error('Wallet not configured');
    
    try {
      const tx = await this.battleFactory.createAndInitBattle(
        battleId,
        config,
        agentA,
        agentB,
        entryPrice
      );
      const receipt = await tx.wait();
      
      // Extract battle address from receipt
      const event = receipt.logs.find(log => {
        try {
          const parsed = this.battleFactory.interface.parseLog(log);
          return parsed && parsed.name === 'BattleCreated';
        } catch {
          return false;
        }
      });
      
      if (event) {
        const parsed = this.battleFactory.interface.parseLog(event);
        const battleAddress = parsed.args.battleAddress;
        
        // Return both battle address and tx hash
        return {
          battleAddress,
          txHash: receipt.hash,
          blockNumber: receipt.blockNumber,
        };
      }
      
      return null;
    } catch (error) {
      console.error('Failed to create battle:', error);
      throw error;
    }
  }
  
  // ============ View Functions ============
  
  async getBattle(battleId) {
    try {
      const factoryInfo = await this.battleFactory.getBattle(battleId);
      if (!factoryInfo || !factoryInfo.battleAddress) return null;
      
      // Try to get detailed info from BattleArena contract
      try {
        const battleArena = new ethers.Contract(factoryInfo.battleAddress, BATTLE_ARENA_ABI, this.provider);
        const arenaBattle = await battleArena.getBattle(battleId);
        
        return this._formatBattleFromArena(arenaBattle, factoryInfo);
      } catch (error) {
        // Battle might not be initialized yet, return factory info only
        return this._formatBattleFromFactory(factoryInfo);
      }
    } catch (error) {
      console.error('Failed to get battle:', error);
      return null;
    }
  }
  
  async getAllBattles() {
    try {
      const battleIds = await this.battleFactory.getAllBattles();
      return battleIds;
    } catch (error) {
      console.error('Failed to get all battles:', error);
      return [];
    }
  }
  
  async getBattleFromFactory(battleId) {
    try {
      const battleInfo = await this.battleFactory.getBattle(battleId);
      return battleInfo;
    } catch (error) {
      console.error('Failed to get battle from factory:', error);
      return null;
    }
  }
  
  async getBattleFromArena(battleAddress, battleId) {
    try {
      const battleArena = new ethers.Contract(battleAddress, BATTLE_ARENA_ABI, this.provider);
      
      // Get full battle data including agent structs
      const battleData = await battleArena.getBattle(battleId);
      
      // Parse the battle data
      const agentA = battleData.agentA;
      const agentB = battleData.agentB;
      
      return {
        status: Number(battleData.status),
        agentA: agentA.wallet !== ethers.ZeroAddress ? {
          wallet: agentA.wallet,
          collateral: Number(ethers.formatUnits(agentA.collateral, 6)), // USDC has 6 decimals
          isLong: agentA.isLong,
          leverage: Number(agentA.leverage) / 100, // Convert from basis points (1000 = 10x)
          entryPrice: Number(agentA.entryPrice) / 10**8, // Convert from 8 decimals
          alive: agentA.alive,
          lastProofTime: Number(agentA.lastProofTime) * 1000,
          totalBets: Number(ethers.formatUnits(agentA.totalBets, 6)),
        } : null,
        agentB: agentB.wallet !== ethers.ZeroAddress ? {
          wallet: agentB.wallet,
          collateral: Number(ethers.formatUnits(agentB.collateral, 6)),
          isLong: agentB.isLong,
          leverage: Number(agentB.leverage) / 100,
          entryPrice: Number(agentB.entryPrice) / 10**8,
          alive: agentB.alive,
          lastProofTime: Number(agentB.lastProofTime) * 1000,
          totalBets: Number(ethers.formatUnits(agentB.totalBets, 6)),
        } : null,
        startTime: Number(battleData.startTime) * 1000,
        endTime: Number(battleData.endTime) * 1000,
        totalPool: Number(ethers.formatUnits(battleData.totalPool, 6)),
        winner: battleData.winner !== ethers.ZeroAddress ? battleData.winner : null,
        entryFee: Number(ethers.formatUnits(battleData.entryFee, 6)),
        eliminationThreshold: Number(battleData.eliminationThreshold),
      };
    } catch (error) {
      console.error('Failed to get battle from arena:', error.message);
      // Battle might not be initialized yet
      return null;
    }
  }
  
  async syncBattlesFromChain() {
    try {
      console.log('🔄 Syncing battles from chain...');
      
      // Get all battle IDs from factory
      const battleIds = await this.getAllBattles();
      
      if (!battleIds || battleIds.length === 0) {
        console.log('✅ No battles found on chain');
        return true;
      }
      
      // Fetch battle info for each ID
      const battlePromises = battleIds.map(async (battleId) => {
        try {
          const factoryInfo = await this.getBattleFromFactory(battleId);
          if (!factoryInfo || !factoryInfo.battleAddress) return null;
          
          // Try to get full battle data from the battle arena contract
          const arenaStatus = await this.getBattleFromArena(factoryInfo.battleAddress, battleId);
          
          // Check if this battle already exists in stateManager to preserve tier
          const existingBattle = stateManager.getBattle(battleId);
          const existingTier = existingBattle?.tier;
          
          // Format battle data for state manager
          const battle = {
            id: battleId,
            battleAddress: factoryInfo.battleAddress,
            creator: factoryInfo.creator,
            tier: existingTier || 'SECONDARY', // Preserve existing tier, default to SECONDARY
            createdAt: (() => {
              const createdAtRaw = Number(factoryInfo.createdAt);
              // If createdAt is 0 or invalid, use current time
              if (!createdAtRaw || createdAtRaw === 0 || createdAtRaw > 1000000000000) {
                return Date.now();
              }
              // Convert from seconds to milliseconds
              const createdAtMs = createdAtRaw * 1000;
              // Validate: must be after 2020-01-01
              if (createdAtMs > 1577836800000 && createdAtMs < 4102444800000) {
                return createdAtMs;
              }
              // Fallback to current time if invalid
              return Date.now();
            })(),
            config: {
              entryFee: arenaStatus?.entryFee || Number(factoryInfo.config.entryFee),
              timeLimit: Number(factoryInfo.config.timeLimit),
              eliminationThreshold: arenaStatus?.eliminationThreshold || Number(factoryInfo.config.eliminationThreshold)
            },
            status: arenaStatus ? ['WAITING', 'LIVE', 'SETTLED', 'CANCELLED'][arenaStatus.status] : 'WAITING',
            // Include agent data from arena (now includes collateral, leverage, etc.)
            agentA: arenaStatus?.agentA?.wallet || null,
            agentB: arenaStatus?.agentB?.wallet || null,
            entryPrice: arenaStatus?.agentA?.entryPrice || arenaStatus?.agentB?.entryPrice || null,
            startTime: arenaStatus?.startTime ? Number(arenaStatus.startTime) * 1000 : (Number(factoryInfo.createdAt) * 1000),
            endTime: arenaStatus?.endTime ? Number(arenaStatus.endTime) * 1000 : null,
            // Format for agent manager with real data from contract
            bull: arenaStatus?.agentA ? {
              sponsor: arenaStatus.agentA.wallet,
              stake: arenaStatus.agentA.collateral, // Real collateral from contract (USDC)
              leverage: arenaStatus.agentA.leverage, // Real leverage from contract (10x)
              entryPrice: arenaStatus.agentA.entryPrice,
              health: 100, // Initial health - will be calculated by state manager based on price movements
              alive: arenaStatus.agentA.alive,
              lastProofTime: arenaStatus.agentA.lastProofTime,
              pnl: 0, // Will be calculated by state manager
            } : null,
            bear: arenaStatus?.agentB ? {
              sponsor: arenaStatus.agentB.wallet,
              stake: arenaStatus.agentB.collateral, // Real collateral from contract (USDC)
              leverage: arenaStatus.agentB.leverage, // Real leverage from contract (10x)
              entryPrice: arenaStatus.agentB.entryPrice,
              health: 100, // Initial health - will be calculated by state manager based on price movements
              alive: arenaStatus.agentB.alive,
              lastProofTime: arenaStatus.agentB.lastProofTime,
              pnl: 0, // Will be calculated by state manager
            } : null,
            totalPool: arenaStatus?.totalPool || 0,
          };
          
          return battle;
        } catch (error) {
          console.error(`Failed to fetch battle ${battleId}:`, error.message);
          return null;
        }
      });
      
      const battles = (await Promise.all(battlePromises)).filter(b => b !== null);
      
      // Update state manager and emit events for new battles
      battles.forEach(battle => {
        const existingBattle = stateManager.battles.get(battle.id);
        
        // Initialize escalation fields if missing (for battles synced from chain)
        // Validate timestamps - use startTime if valid, otherwise use now for new battles
        let startTime = null;
        
        // Check if startTime is valid (not null, not 0, and not in the far future)
        if (battle.startTime && battle.startTime > 0) {
          const startTimeMs = typeof battle.startTime === 'number' ? battle.startTime : new Date(battle.startTime).getTime();
          // Validate: must be after 2020 and before 2100 (reasonable timestamp range)
          if (startTimeMs > 1577836800000 && startTimeMs < 4102444800000) {
            startTime = startTimeMs;
          }
        }
        
        // Check createdAt as fallback
        if (!startTime && battle.createdAt && battle.createdAt > 0) {
          const createdAtMs = typeof battle.createdAt === 'number' ? battle.createdAt : new Date(battle.createdAt).getTime();
          // Validate: must be after 2020 and before 2100
          if (createdAtMs > 1577836800000 && createdAtMs < 4102444800000) {
            startTime = createdAtMs;
          }
        }
        
        // If no valid timestamp found, use current time (battle starts now)
        if (!startTime) {
          startTime = Date.now();
          console.log(`⚠️ Battle ${battle.id} has invalid startTime/createdAt, using current time for escalation`);
        }
        
        // Ensure startTime is set on the battle object for frontend
        battle.startTime = startTime;
        const now = Date.now();
        const elapsed = now - startTime;
        
        // Calculate current escalation level based on elapsed time
        let escalationLevel = 0;
        let currentLeverage = stateManager.escalationLevels[0]; // Start at 5x
        const escalationInterval = stateManager.escalationInterval; // 60 seconds
        
        if (elapsed >= escalationInterval * 3) {
          escalationLevel = 3; // 50x
          currentLeverage = stateManager.escalationLevels[3];
        } else if (elapsed >= escalationInterval * 2) {
          escalationLevel = 2; // 20x
          currentLeverage = stateManager.escalationLevels[2];
        } else if (elapsed >= escalationInterval) {
          escalationLevel = 1; // 10x
          currentLeverage = stateManager.escalationLevels[1];
        }
        
        // Calculate next escalation time
        const nextEscalationTime = escalationLevel < stateManager.escalationLevels.length - 1
          ? startTime + (escalationLevel + 1) * escalationInterval
          : null;
        
        // Add escalation fields to battle
        battle.escalationStartTime = startTime;
        battle.escalationLevel = escalationLevel;
        battle.currentLeverage = currentLeverage;
        battle.nextEscalationTime = nextEscalationTime;
        
        // Update agent leverage to match current escalation
        if (battle.bull) {
          battle.bull.leverage = currentLeverage;
        }
        if (battle.bear) {
          battle.bear.leverage = currentLeverage;
        }
        
        // Check if both agents are dead - if so, skip syncing this battle (it's stuck)
        const bullHealth = battle.bull?.health ?? 100;
        const bearHealth = battle.bear?.health ?? 100;
        const bothDead = (bullHealth <= 0 && bearHealth <= 0) || 
                        (!battle.bull?.alive && !battle.bear?.alive);
        
        if (bothDead && elapsed > 5 * 60 * 1000) { // Both dead and battle is >5 minutes old
          console.log(`⏭️ Skipping stuck battle ${battle.id} (both agents dead, ${Math.floor(elapsed / 1000)}s old)`);
          return null; // Skip this battle
        }
        
        if (!existingBattle) {
          // New battle - create it in state manager (will emit battleCreated event)
          stateManager.createBattle(battle);
          console.log(`✅ Created new battle with escalation: ${battle.id}`, {
            escalationStartTime: new Date(battle.escalationStartTime).toISOString(),
            escalationLevel: battle.escalationLevel,
            currentLeverage: battle.currentLeverage,
            nextEscalationTime: battle.nextEscalationTime ? new Date(battle.nextEscalationTime).toISOString() : null
          });
        } else {
          // Existing battle - update with escalation fields
          // CRITICAL: Preserve tier when updating existing battle
          const preservedTier = existingBattle.tier || battle.tier;
          
          // Preserve existing escalation if battle was already running
          if (existingBattle.escalationStartTime && existingBattle.status === 'LIVE') {
            // Don't reset escalation for live battles - keep existing timing
            console.log(`⚠️ Battle ${battle.id} already has escalation, preserving existing timing`);
          } else {
            // Update escalation fields for battles that don't have them
            Object.assign(existingBattle, {
              escalationStartTime: battle.escalationStartTime,
              escalationLevel: battle.escalationLevel,
              currentLeverage: battle.currentLeverage,
              nextEscalationTime: battle.nextEscalationTime,
              startTime: battle.startTime || existingBattle.startTime,
              tier: preservedTier // Preserve tier
            });
            
            // Update agent leverage
            if (existingBattle.bull) {
              existingBattle.bull.leverage = battle.currentLeverage;
            }
            if (existingBattle.bear) {
              existingBattle.bear.leverage = battle.currentLeverage;
            }
            
            console.log(`✅ Updated battle escalation: ${battle.id}`, {
              escalationStartTime: new Date(existingBattle.escalationStartTime).toISOString(),
              escalationLevel: existingBattle.escalationLevel,
              currentLeverage: existingBattle.currentLeverage,
              nextEscalationTime: existingBattle.nextEscalationTime ? new Date(existingBattle.nextEscalationTime).toISOString() : null,
              tier: preservedTier
            });
          }
          
          // Ensure tier is preserved even if not updating escalation
          if (preservedTier && !existingBattle.tier) {
            existingBattle.tier = preservedTier;
          }
          
          stateManager.battles.set(battle.id, existingBattle);
          // Emit update event so frontend gets the escalation data
          stateManager.emit('battleUpdated', existingBattle);
        }
      });
      
      // Identify primary battle by checking if it has agent wallets from env vars
      // Primary battles are created by the backend with BULL_AGENT_PRIVATE_KEY and BEAR_AGENT_PRIVATE_KEY
      const bullAgentAddress = process.env.BULL_AGENT_PRIVATE_KEY 
        ? new ethers.Wallet(process.env.BULL_AGENT_PRIVATE_KEY).address.toLowerCase()
        : null;
      const bearAgentAddress = process.env.BEAR_AGENT_PRIVATE_KEY
        ? new ethers.Wallet(process.env.BEAR_AGENT_PRIVATE_KEY).address.toLowerCase()
        : null;
      
      if (battles.length > 0 && bullAgentAddress && bearAgentAddress) {
        // Find battle that has both agent wallets (primary battle)
        // Sort by startTime DESC to get the newest active battle first
        const primaryCandidates = battles.filter(b => {
          const hasBull = b.agentA && b.agentA.toLowerCase() === bullAgentAddress;
          const hasBear = b.agentB && b.agentB.toLowerCase() === bearAgentAddress;
          const isActive = b.status === 'LIVE' || b.status === 'ACTIVE';
          return hasBull && hasBear && isActive;
        }).sort((a, b) => (b.startTime || 0) - (a.startTime || 0)); // Newest first
        
        const primaryBattle = primaryCandidates[0]; // Get the newest
        
        if (primaryBattle) {
          // Always set primary battle ID and tier
          stateManager.primaryBattleId = primaryBattle.id;
          const battle = stateManager.getBattle(primaryBattle.id);
          console.log(`🔍 DEBUG: Setting tier for primary battle`, {
            battleId: primaryBattle.id?.substring(0, 30),
            battleExists: !!battle,
            currentTier: battle?.tier,
            startTime: primaryBattle.startTime,
            candidatesCount: primaryCandidates.length
          });
          if (battle) {
            battle.tier = 'PRIMARY';
            stateManager.updateBattle(primaryBattle.id, battle);
            // Save to MongoDB immediately to persist tier
            saveBattle(battle).catch(err => {
              console.warn('Failed to save PRIMARY tier to MongoDB:', err.message);
            });
            console.log(`✅ Set tier=PRIMARY for battle ${primaryBattle.id.substring(0, 30)}`);
          } else {
            console.warn(`⚠️ Could not find battle ${primaryBattle.id} in stateManager to set tier!`);
          }
          console.log(`✅ Restored primary battle from chain: ${primaryBattle.id}`);
        } else if (!stateManager.primaryBattleId) {
          // Fallback: set first active battle as primary (only if no primary set yet)
          const firstActive = battles.find(b => b.status === 'LIVE' || b.status === 'ACTIVE');
          if (firstActive) {
            stateManager.primaryBattleId = firstActive.id;
            const battle = stateManager.getBattle(firstActive.id);
            if (battle) {
              battle.tier = 'PRIMARY';
              stateManager.updateBattle(firstActive.id, battle);
            }
            console.log(`⚠️ No primary battle found, using first active battle: ${firstActive.id}`);
          }
        }
      } else if (battles.length > 0 && !stateManager.primaryBattleId) {
        // No agent keys configured, just use first battle
        stateManager.primaryBattleId = battles[0].id;
        const battle = stateManager.getBattle(battles[0].id);
        if (battle) {
          battle.tier = 'PRIMARY';
          stateManager.updateBattle(battles[0].id, battle);
        }
      }
      
      console.log(`✅ Synced ${battles.length} battles`);
      return true;
    } catch (error) {
      console.error('Failed to sync battles:', error);
      return false;
    }
  }
  
  // ============ Helper Methods ============
  
  async _approveUSDCIfNeeded(amount) {
    const allowance = await this.usdc.allowance(
      this.wallet.address,
      this.config.battleFactoryAddress
    );
    
    if (allowance < amount) {
      const tx = await this.usdc.approve(
        this.config.battleFactoryAddress,
        ethers.MaxUint256
      );
      await tx.wait();
    }
  }
  
  _formatBattleFromArena(arenaBattle, factoryInfo) {
    const [status, agentA, agentB, initialPrice, startTime, endTime, entryFee, eliminationThreshold, winner, totalBets, betsOnA, betsOnB] = arenaBattle;
    
    return {
      id: factoryInfo.battleId,
      battleAddress: factoryInfo.battleAddress,
      creator: factoryInfo.creator,
      status: ['WAITING', 'ACTIVE', 'SETTLED', 'CANCELLED'][Number(status)],
      agentA: agentA !== ethers.ZeroAddress ? agentA : null,
      agentB: agentB !== ethers.ZeroAddress ? agentB : null,
      initialPrice: Number(initialPrice),
      startTime: Number(startTime) * 1000,
      endTime: Number(endTime) * 1000,
      entryFee: Number(ethers.formatUnits(entryFee, 6)),
      eliminationThreshold: Number(eliminationThreshold),
      winner: winner !== ethers.ZeroAddress ? winner : null,
      totalBets: Number(ethers.formatUnits(totalBets, 6)),
      betsOnA: Number(ethers.formatUnits(betsOnA, 6)),
      betsOnB: Number(ethers.formatUnits(betsOnB, 6)),
      createdAt: (() => {
        const createdAtRaw = Number(factoryInfo.createdAt);
        if (!createdAtRaw || createdAtRaw === 0 || createdAtRaw > 1000000000000) {
          return Date.now();
        }
        const createdAtMs = createdAtRaw * 1000;
        if (createdAtMs > 1577836800000 && createdAtMs < 4102444800000) {
          return createdAtMs;
        }
        return Date.now();
      })()
    };
  }
  
  _formatBattleFromFactory(factoryInfo) {
    return {
      id: factoryInfo.battleId,
      battleAddress: factoryInfo.battleAddress,
      creator: factoryInfo.creator,
      status: 'WAITING',
            createdAt: (() => {
              const createdAtRaw = Number(factoryInfo.createdAt);
              // If createdAt is 0 or invalid, use current time
              if (!createdAtRaw || createdAtRaw === 0 || createdAtRaw > 1000000000000) {
                return Date.now();
              }
              // Convert from seconds to milliseconds
              const createdAtMs = createdAtRaw * 1000;
              // Validate: must be after 2020-01-01 and before 2100-01-01
              if (createdAtMs > 1577836800000 && createdAtMs < 4102444800000) {
                return createdAtMs;
              }
              // Fallback to current time if invalid
              return Date.now();
            })(),
      config: {
        entryFee: Number(ethers.formatUnits(factoryInfo.config.entryFee, 6)),
        timeLimit: Number(factoryInfo.config.timeLimit),
        eliminationThreshold: Number(factoryInfo.config.eliminationThreshold)
      }
    };
  }
  
  // ============ Event Handlers ============
  
  _handleBattleCreated(battleId, battleAddress, creator) {
    // Fetch full battle data
    this.getBattle(battleId).then(battle => {
      if (battle) {
        stateManager.createBattle(battle);
      }
    }).catch(error => {
      console.error('Error handling battle created event:', error);
    });
  }
  
  _handleBattleInitialized(battleId, agentA, agentB, entryPrice) {
    stateManager.updateBattle(battleId, {
      status: 'ACTIVE',
      agentA,
      agentB,
      initialPrice: Number(entryPrice),
      startTime: Date.now()
    });
  }
  
  // ============ Betting Functions ============
  
  /**
   * Get BattleArena contract instance
   * @param {string} battleAddress - Address of the BattleArena contract
   * @returns {ethers.Contract} BattleArena contract instance
   */
  getBattleArenaContract(battleAddress) {
    if (!battleAddress || battleAddress === ethers.ZeroAddress) {
      return null;
    }
    return new ethers.Contract(battleAddress, BATTLE_ARENA_ABI, this.provider);
  }
  
  /**
   * Get BattleArena contract with signer (for transactions)
   * @param {string} battleAddress - Address of the BattleArena contract
   * @param {ethers.Signer} signer - Signer to use for transactions
   * @returns {ethers.Contract} BattleArena contract instance with signer
   */
  getBattleArenaContractWithSigner(battleAddress, signer) {
    if (!battleAddress || battleAddress === ethers.ZeroAddress) {
      return null;
    }
    return new ethers.Contract(battleAddress, BATTLE_ARENA_ABI, signer);
  }
  
  /**
   * Check USDC allowance for a user
   * @param {string} userAddress - User's wallet address
   * @param {string} spenderAddress - Address to check allowance for (battle contract)
   * @returns {Promise<bigint>} Current allowance
   */
  async checkUSDCAllowance(userAddress, spenderAddress) {
    try {
      const allowance = await this.usdc.allowance(userAddress, spenderAddress);
      return allowance;
    } catch (error) {
      console.error('Failed to check USDC allowance:', error);
      throw error;
    }
  }
  
  /**
   * Get USDC balance for a user
   * @param {string} userAddress - User's wallet address
   * @returns {Promise<bigint>} USDC balance (6 decimals)
   */
  async getUSDCBalance(userAddress) {
    try {
      const balance = await this.usdc.balanceOf(userAddress);
      return balance;
    } catch (error) {
      console.error('Failed to get USDC balance:', error);
      throw error;
    }
  }
  
  /**
   * Place a bet on a battle (requires user's signer)
   * @param {string} battleAddress - Address of the BattleArena contract
   * @param {string} battleId - Battle ID (bytes32)
   * @param {ethers.Signer} userSigner - User's signer (from frontend)
   * @param {number} agentIndex - 0 for Bull, 1 for Bear
   * @param {number} amount - Bet amount in USDC (will be converted to 6 decimals)
   * @returns {Promise<ethers.ContractTransactionResponse>} Transaction response
   */
  async placeBet(battleAddress, battleId, userSigner, agentIndex, amount) {
    try {
      // Convert amount to USDC (6 decimals)
      const amountWei = ethers.parseUnits(amount.toString(), 6);
      
      // Get battle contract with user's signer
      const battleArena = this.getBattleArenaContractWithSigner(battleAddress, userSigner);
      if (!battleArena) {
        throw new Error('Invalid battle address');
      }
      
      // Check if battle is active
      const battle = await battleArena.getBattle(battleId);
      if (Number(battle.status) !== 1) { // 1 = ACTIVE
        throw new Error('Battle is not active');
      }
      
      // Check USDC allowance
      const userAddress = await userSigner.getAddress();
      const allowance = await this.checkUSDCAllowance(userAddress, battleAddress);
      
      if (allowance < amountWei) {
        throw new Error('Insufficient USDC allowance. Please approve USDC first.');
      }
      
      // Check balance
      const balance = await this.getUSDCBalance(userAddress);
      if (balance < amountWei) {
        throw new Error('Insufficient USDC balance');
      }
      
      // Place bet
      const tx = await battleArena.placeBet(battleId, agentIndex, amountWei);
      
      return {
        txHash: tx.hash,
        battleId,
        agentIndex,
        amount: amountWei.toString(),
        userAddress
      };
    } catch (error) {
      console.error('Failed to place bet:', error);
      throw error;
    }
  }

  /**
   * Settle a battle on-chain
   * @param {string} battleAddress - Address of the BattleArena contract
   * @param {string} battleId - Battle ID (bytes32)
   * @param {number} finalPrice - Final ETH price for settlement (8 decimals)
   * @returns {Promise<Object>} Settlement result with txHash
   */
  async settleBattle(battleAddress, battleId, finalPrice) {
    try {
      if (!this.wallet) {
        throw new Error('Wallet not configured. Settlement requires backend wallet.');
      }

      // Convert battleId to bytes32 if it's a string
      let battleIdBytes32;
      if (typeof battleId === 'string' && !battleId.startsWith('0x')) {
        battleIdBytes32 = ethers.id(battleId);
      } else {
        battleIdBytes32 = battleId;
      }

      // Convert finalPrice to 8 decimals (if needed)
      const finalPriceWei = typeof finalPrice === 'number' 
        ? BigInt(Math.floor(finalPrice * 1e8))
        : BigInt(finalPrice);

      // Get battle contract with backend wallet
      const battleArena = this.getBattleArenaContractWithSigner(battleAddress, this.wallet);
      if (!battleArena) {
        throw new Error('Invalid battle address');
      }

      // Check if battle can be settled
      const battle = await battleArena.getBattle(battleIdBytes32);
      if (Number(battle.status) === 2) { // 2 = SETTLED
        throw new Error('Battle already settled');
      }

      // Settle battle
      const tx = await battleArena.settleBattle(battleIdBytes32, finalPriceWei);
      const receipt = await tx.wait();

      console.log('✅ Battle settled on-chain:', {
        battleId: battleIdBytes32,
        txHash: receipt.hash,
        finalPrice: finalPriceWei.toString()
      });

      return {
        txHash: receipt.hash,
        battleId: battleIdBytes32,
        finalPrice: finalPriceWei.toString(),
        blockNumber: receipt.blockNumber
      };
    } catch (error) {
      console.error('Failed to settle battle:', error);
      throw error;
    }
  }
  
  // ============ Health Check ============
  
  async healthCheck() {
    try {
      const blockNumber = await this.provider.getBlockNumber();
      return {
        status: 'healthy',
        blockNumber,
        connected: true
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        connected: false
      };
    }
  }
}

export default ContractService;
