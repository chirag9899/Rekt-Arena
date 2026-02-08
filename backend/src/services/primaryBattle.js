/**
 * Primary Battle Auto-Creation Service
 * 
 * Automatically creates new primary battles when one ends:
 * 1. Watches for primary battle settlement
 * 2. Creates new primary battle on-chain
 * 3. Auto-deposits 100 USDC from Bull agent wallet
 * 4. Auto-deposits 100 USDC from Bear agent wallet
 * 5. Battle starts automatically
 */

import { ethers } from 'ethers';
import stateManager from '../state.mjs';
import logger from '../utils/logger.js';
import config from '../config.js';

class PrimaryBattleService {
  constructor(contractService) {
    this.contractService = contractService;
    this.isRunning = false;
    this.bullWallet = null;
    this.bearWallet = null;
    this.minCollateral = 100 * 1e6; // 100 USDC (6 decimals)
  }

  /**
   * Initialize the service
   * @param {string} bullWalletPrivateKey - Private key for Bull agent wallet
   * @param {string} bearWalletPrivateKey - Private key for Bear agent wallet
   */
  async initialize(bullWalletPrivateKey, bearWalletPrivateKey) {
    if (!this.contractService || !this.contractService.initialized) {
      logger.warn('Contract service not available for primary battle service');
      return;
    }

    // Create wallets for agents
    if (bullWalletPrivateKey) {
      this.bullWallet = new ethers.Wallet(bullWalletPrivateKey, this.contractService.provider);
    }
    if (bearWalletPrivateKey) {
      this.bearWallet = new ethers.Wallet(bearWalletPrivateKey, this.contractService.provider);
    }

    if (!this.bullWallet || !this.bearWallet) {
      logger.warn('Primary battle agent wallets not configured');
      return;
    }

    // Listen for battle settlement events
    stateManager.on('battleSettled', this.handleBattleSettled.bind(this));

    this.isRunning = true;
    logger.info('Primary Battle Service initialized', {
      bullWallet: this.bullWallet.address,
      bearWallet: this.bearWallet.address,
    });

    // Wait for first price update before checking/creating battles
    await this.waitForPrice();

    // Check if primary battle exists, if not create one
    await this.ensurePrimaryBattleExists();
    
    // Set up periodic check (every 30 seconds) to ensure primary battle always exists
    this.checkInterval = setInterval(async () => {
      if (!this.isRunning) {
        clearInterval(this.checkInterval);
        return;
      }
      await this.ensurePrimaryBattleExists();
    }, 30000); // Check every 30 seconds
  }

  /**
   * Wait for first price update from price feed
   */
  async waitForPrice() {
    const currentPrice = stateManager.getPrice();
    if (currentPrice > 0) {
      logger.info('Price already available', { price: currentPrice });
      return;
    }

    logger.info('Waiting for first price update from price feed...');
    
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        logger.warn('Price wait timeout after 30 seconds, proceeding anyway');
        stateManager.off('priceUpdated', listener);
        resolve();
      }, 30000);

      const listener = () => {
        const price = stateManager.getPrice();
        if (price > 0) {
          clearTimeout(timeout);
          stateManager.off('priceUpdated', listener);
          logger.info('Price received, proceeding with primary battle check', { price });
          resolve();
        }
      };

      stateManager.on('priceUpdated', listener);
    });
  }

  /**
   * Ensure a primary battle exists
   */
  async ensurePrimaryBattleExists() {
    // First, ensure battles are synced from chain
    if (this.contractService && this.contractService.initialized) {
      logger.info('Syncing battles from chain before checking for primary battle...');
      await this.contractService.syncBattlesFromChain();
    }
    
    // Check all battles to find an existing primary battle
    const allBattles = stateManager.getAllBattles();
    const now = Date.now();
    
    const existingPrimary = allBattles.find(b => {
      // Check if this battle has BOTH our agent wallets (primary battle indicator)
      const hasBullAgent = b.agentA && b.agentA.toLowerCase() === this.bullWallet.address.toLowerCase();
      const hasBearAgent = b.agentB && b.agentB.toLowerCase() === this.bearWallet.address.toLowerCase();
      const isActive = b.status === 'LIVE' || b.status === 'ACTIVE';
      
      // Check if battle is expired (endTime passed >10 minutes ago)
      // Using 10 minutes to allow some buffer but prevent old battles from blocking new ones
      let endTimeMs = null;
      if (b.endTime) {
        if (typeof b.endTime === 'string') {
          endTimeMs = new Date(b.endTime).getTime();
        } else if (b.endTime > 1e12) {
          endTimeMs = b.endTime; // Already in milliseconds
        } else {
          endTimeMs = b.endTime * 1000; // Convert seconds to milliseconds
        }
      }
      let isExpired = endTimeMs && (now - endTimeMs) > 600000; // 10 minutes
      
      // Also check if battle ended and both agents are dead
      const bothDead = (!b.bull?.alive && !b.bear?.alive) || 
                       (b.bull?.health <= 0 && b.bear?.health <= 0);
      if (bothDead && endTimeMs && now >= endTimeMs) {
        isExpired = true; // Treat as expired if both dead and endTime passed
      }
      
      // SANITY CHECK: If endTime is way in the future (>1 day from startTime), treat as expired
      // This handles corrupted timestamps from chain sync
      const maxBattleDuration = 86400000; // 1 day in ms
      if (endTimeMs && b.startTime) {
        const startTimeMs = b.startTime > 1e12 ? b.startTime : b.startTime * 1000;
        if ((endTimeMs - startTimeMs) > maxBattleDuration) {
          isExpired = true;
        }
      }
      
      // Also check if battle is too old by startTime (>1 hour ago)
      let startTimeMs = null;
      if (b.startTime) {
        if (typeof b.startTime === 'string') {
          startTimeMs = new Date(b.startTime).getTime();
        } else if (b.startTime > 1e12) {
          startTimeMs = b.startTime; // Already in milliseconds
        } else {
          startTimeMs = b.startTime * 1000; // Convert seconds to milliseconds
        }
      }
      const isOldBattle = startTimeMs && (now - startTimeMs) > 3600000; // 1 hour
      
      // Log for debugging
      if (hasBullAgent && hasBearAgent) {
        logger.info('🔍 Found battle with PRIMARY agents', {
          battleId: b.id?.substring(0, 40),
          status: b.status,
          isActive,
          isExpired,
          isOldBattle,
          bothDead,
          startTime: startTimeMs ? new Date(startTimeMs).toISOString() : 'not set',
          endTime: endTimeMs ? new Date(endTimeMs).toISOString() : 'not set',
          timePassedSinceStart: startTimeMs ? `${Math.floor((now - startTimeMs) / 60000)} minutes` : 'N/A',
          timePassedSinceEnd: endTimeMs ? `${Math.floor((now - endTimeMs) / 60000)} minutes` : 'N/A',
          willUse: hasBullAgent && hasBearAgent && isActive && !isExpired && !isOldBattle
        });
      }
      
      return hasBullAgent && hasBearAgent && isActive && !isExpired && !isOldBattle;
    });
    
    if (existingPrimary) {
      logger.info('Found existing ACTIVE primary battle on chain', { 
        battleId: existingPrimary.id,
        status: existingPrimary.status 
      });
      stateManager.primaryBattleId = existingPrimary.id;
      return;
    }
    
    // Check if there's a primary battle ID set
    const primaryBattleId = stateManager.primaryBattleId;
    if (primaryBattleId) {
      const primaryBattle = stateManager.getBattle(primaryBattleId);
      
      // Check if battle is expired (endTime passed >10 minutes ago)
      const now = Date.now();
      let endTimeMs = null;
      if (primaryBattle?.endTime) {
        if (typeof primaryBattle.endTime === 'string') {
          endTimeMs = new Date(primaryBattle.endTime).getTime();
        } else if (primaryBattle.endTime > 1e12) {
          endTimeMs = primaryBattle.endTime; // Already in milliseconds
        } else {
          endTimeMs = primaryBattle.endTime * 1000; // Convert seconds to milliseconds
        }
      }
      const isExpired = endTimeMs && (now - endTimeMs) > 600000; // 10 minutes
      
      // Also check if both agents are dead and battle is expired
      const bothDead = (!primaryBattle?.bull?.alive && !primaryBattle?.bear?.alive) || 
                       (primaryBattle?.bull?.health <= 0 && primaryBattle?.bear?.health <= 0);
      const isExpiredWithDeadAgents = bothDead && endTimeMs && now >= endTimeMs;
      
      if (primaryBattle && (primaryBattle.status === 'LIVE' || primaryBattle.status === 'ACTIVE') && !isExpired && !isExpiredWithDeadAgents) {
        logger.info('✅ PRIMARY battle exists and is active', { 
          battleId: primaryBattleId,
          status: primaryBattle.status,
          endTime: endTimeMs ? new Date(endTimeMs).toISOString() : 'not set'
        });
        return;
      } else {
        logger.info('⚠️ PRIMARY battle ID set but battle is stale/expired', {
          battleId: primaryBattleId,
          status: primaryBattle?.status || 'not found',
          endTime: endTimeMs ? new Date(endTimeMs).toISOString() : 'not set',
          isExpired,
          isExpiredWithDeadAgents,
          bothDead,
          timePassedSinceEnd: endTimeMs ? `${Math.floor((now - endTimeMs) / 60000)} minutes` : 'N/A',
          willCreateNew: true
        });
        // Clear the stale PRIMARY ID
        stateManager.primaryBattleId = null;
      }
    }
    
    // No primary battle found, create one
    logger.info('🆕 No active primary battle found, creating new one...');
    await this.createNewPrimaryBattle();
  }

  /**
   * Handle battle settlement - create new primary battle
   */
  async handleBattleSettled(battle) {
    // Log what we received
    logger.info('🔔 handleBattleSettled called', { 
      battleId: battle.id?.substring(0, 20),
      tier: battle.tier,
      primaryBattleId: stateManager.primaryBattleId?.substring(0, 20),
      match: battle.id === stateManager.primaryBattleId
    });
    
    // Only handle primary battles
    if (battle.tier !== 'PRIMARY') {
      logger.warn('Battle settled but tier is not PRIMARY', { tier: battle.tier });
      return;
    }
    if (battle.id !== stateManager.primaryBattleId) {
      logger.warn('Battle settled but ID does not match primaryBattleId', { 
        battleId: battle.id?.substring(0, 20),
        primaryBattleId: stateManager.primaryBattleId?.substring(0, 20) 
      });
      return;
    }

    logger.info('✨ Primary battle settled, creating new one IMMEDIATELY...', { battleId: battle.id });
    
    // Create new battle instantly for seamless UX (no gap)
    await this.createNewPrimaryBattle();
  }

  /**
   * Create a new primary battle with auto-deposits
   */
  async createNewPrimaryBattle() {
    if (!this.isRunning) return;
    if (!this.contractService || !this.contractService.initialized) {
      logger.error('Cannot create primary battle: contract service not available');
      return;
    }

    try {
      // Get current ETH price - with retry if not available
      let currentPrice = stateManager.getPrice();
      if (!currentPrice || currentPrice <= 0) {
        logger.info('Price not available yet, waiting for price update...');
        await this.waitForPrice();
        currentPrice = stateManager.getPrice();
        
        if (!currentPrice || currentPrice <= 0) {
          logger.error('Still no price available after retry, aborting primary battle creation');
          return;
        }
        
        logger.info('Price received after retry, proceeding with battle creation', { price: currentPrice });
      }

      // Generate unique battle ID
      const battleId = `primary-${Date.now()}`;
      const battleIdBytes32 = ethers.id(battleId);
      const entryPrice = Math.floor(currentPrice * 1e8); // Convert to 8 decimals

      // Battle config (4 minutes with escalation mechanic)
      const duration = 240; // 4 minutes = 240 seconds
      const config = {
        entryFee: 0,
        minPlayers: 2,
        maxPlayers: 2,
        timeLimit: duration,
        eliminationThreshold: 9500, // 95% (in basis points)
        enabled: true,
      };

      logger.info('Creating primary battle on-chain...', {
        battleId: battleIdBytes32,
        bullWallet: this.bullWallet.address,
        bearWallet: this.bearWallet.address,
        entryPrice,
        duration: `${duration}s (4 minutes)`,
      });

      // Ensure USDC approval for both wallets (they should already be approved from setup script)
      logger.info('Ensuring USDC approvals for agent wallets...');
      await this.ensureUSDCApproval(
        this.bullWallet, 
        this.contractService.config.battleFactoryAddress, 
        this.minCollateral
      );
      await this.ensureUSDCApproval(
        this.bearWallet, 
        this.contractService.config.battleFactoryAddress, 
        this.minCollateral
      );

      // Create battle on-chain
      const createResult = await this.contractService.createBattle(
        battleIdBytes32,
        config,
        this.bullWallet.address,
        this.bearWallet.address,
        entryPrice
      );

      if (!createResult || !createResult.battleAddress) {
        throw new Error('Battle creation failed - no battle address returned');
      }

      const { battleAddress, txHash, blockNumber } = createResult;

      logger.info('✅ Primary battle created on-chain', {
        battleId: battleIdBytes32,
        battleAddress,
        txHash,
        blockNumber,
      });

      // Sync battle from chain to state manager
      await this.contractService.syncBattlesFromChain();

      // Set as primary battle (use battleIdBytes32 which is the on-chain ID)
      const battle = stateManager.getBattle(battleIdBytes32);
      if (battle) {
        battle.tier = 'PRIMARY'; // Mark as primary
        stateManager.primaryBattleId = battleIdBytes32;
        // Update battle with tier and creation tx hash (this will save to MongoDB)
        stateManager.updateBattle(battleIdBytes32, {
          tier: 'PRIMARY',
          creationTxHash: txHash,
          creationBlockNumber: blockNumber,
        });
        // Also update in-memory battle object
        battle.creationTxHash = txHash;
        battle.creationBlockNumber = blockNumber;
        
        // Emit battleCreated event so WebSocket broadcasts to all clients
        stateManager.emit('battleCreated', battle);
        
        logger.info('✅ Primary battle set and ready', { battleId: battleIdBytes32 });
      } else {
        logger.warn('Battle created but not found in state after sync', { battleId: battleIdBytes32 });
      }

    } catch (error) {
      logger.error('Failed to create primary battle', {
        error: error.message,
        stack: error.stack,
      });
      
      // If it's a USDC approval or transfer issue, log it clearly
      if (error.message?.includes('ERC20') || error.message?.includes('transfer') || error.message?.includes('allowance')) {
        logger.error('❌ USDC Transfer Failed - Check agent wallets:', {
          bullWallet: this.bullWallet.address,
          bearWallet: this.bearWallet.address,
          note: 'Ensure wallets have: 1) MATIC for gas, 2) 100+ USDC, 3) Approved USDC for BattleFactory'
        });
      }
    }
  }

  /**
   * Ensure USDC approval for agent wallet
   * @param {ethers.Wallet} wallet - Agent wallet
   * @param {string} spenderAddress - Address to approve (BattleArena implementation)
   * @param {bigint} amount - Amount to approve
   */
  async ensureUSDCApproval(wallet, spenderAddress, amount) {
    try {
      const usdcContract = new ethers.Contract(
        this.contractService.config.usdcAddress,
        ['function approve(address spender, uint256 amount) external returns (bool)',
         'function allowance(address owner, address spender) external view returns (uint256)'],
        wallet
      );

      const allowance = await usdcContract.allowance(wallet.address, spenderAddress);

      if (allowance < amount) {
        logger.info('Approving USDC for agent wallet', {
          wallet: wallet.address,
          spender: spenderAddress,
          amount: amount.toString(),
        });

        const tx = await usdcContract.approve(spenderAddress, ethers.MaxUint256);
        await tx.wait();
        logger.info('✅ USDC approved', { wallet: wallet.address, spender: spenderAddress });
      }
    } catch (error) {
      logger.error('Failed to approve USDC', {
        wallet: wallet.address,
        spender: spenderAddress,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Deposit collateral for an agent
   */
  async depositCollateral(battleAddress, battleId, wallet, agentIndex, amount) {
    try {
      const BATTLE_ARENA_ABI = [
        "function depositCollateral(bytes32 battleId, uint8 agentIndex, uint256 amount) external",
      ];
      
      const battleContract = new ethers.Contract(battleAddress, BATTLE_ARENA_ABI, wallet);
      
      logger.info('Depositing collateral for agent', {
        battleAddress,
        battleId,
        agentIndex,
        wallet: wallet.address,
        amount: amount.toString(),
      });
      
      const tx = await battleContract.depositCollateral(battleId, agentIndex, amount);
      await tx.wait();
      
      logger.info('✅ Collateral deposited', {
        wallet: wallet.address,
        agentIndex,
        amount: amount.toString(),
      });
    } catch (error) {
      logger.error('Failed to deposit collateral', {
        wallet: wallet.address,
        agentIndex,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Stop the service
   */
  stop() {
    this.isRunning = false;
    stateManager.removeListener('battleSettled', this.handleBattleSettled);
    logger.info('Primary Battle Service stopped');
  }
}

export default PrimaryBattleService;
