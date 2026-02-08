/**
 * Battle Settlement Service
 * 
 * Automatically:
 * 1. Checks for battles that should be liquidated
 * 2. Calls checkAndLiquidate on contract when health drops
 * 3. Settles battles when they end (endTime reached)
 * 4. Determines winners and distributes prizes
 */

import { ethers } from 'ethers';
import stateManager from '../state.mjs';
import logger from '../utils/logger.js';

class BattleSettlementService {
  constructor(contractService, yellowService = null) {
    this.contractService = contractService;
    this.yellowService = yellowService;
    this.isRunning = false;
    this.checkInterval = null;
    this.checkIntervalMs = 30000; // Check every 30 seconds
  }

  /**
   * Initialize the service
   */
  async initialize() {
    if (!this.contractService || !this.contractService.initialized) {
      logger.warn('Contract service not available for battle settlement service');
      return;
    }

    this.isRunning = true;
    
    // Listen for battle updates
    stateManager.on('battleUpdated', this.handleBattleUpdate.bind(this));
    stateManager.on('priceUpdated', this.handlePriceUpdate.bind(this));
    
    // CRITICAL: Listen for battles ready for settlement (emitted by checkEscalations)
    stateManager.on('battleReadyForSettlement', this.handleBattleReadyForSettlement.bind(this));

    // Start periodic checks
    this.startPeriodicChecks();

    logger.info('Battle Settlement Service initialized');
  }

  /**
   * Start periodic checks for liquidation and settlement
   */
  startPeriodicChecks() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }

    this.checkInterval = setInterval(() => {
      this.checkAllBattles();
    }, this.checkIntervalMs);

    // Initial check
    this.checkAllBattles();
  }

  /**
   * Check all battles for liquidation and settlement
   */
  async checkAllBattles() {
    if (!this.isRunning) {
      logger.debug('Battle Settlement Service is not running, skipping check');
      return;
    }

    const battles = stateManager.getAllBattles();
    logger.debug(`🔍 Checking ${battles.length} battles for settlement...`);
    const currentPrice = stateManager.getPrice();

    if (!currentPrice || currentPrice <= 0) {
      return; // Can't check without price
    }

    for (const battle of battles) {
      // Only check battles that are live/active (settled battles are handled separately)
      if (battle.status !== 'LIVE' && battle.status !== 'ACTIVE') {
        continue;
      }
      
      // Skip if battle doesn't have a contract address
      if (!battle.battleAddress) {
        logger.debug(`⚠️ Battle ${battle.id?.substring(0, 20)}... has no battleAddress, skipping`, {
          battleId: battle.id,
          status: battle.status,
        });
        continue;
      }
      
      // Skip battles that are marked as stuck (too many failed settlement attempts)
      // Lower threshold to skip faster - if a battle fails 10+ times, it's likely stuck
      if (battle._settlementRetries && battle._settlementRetries > 10) {
        continue; // Skip battles that have failed 10+ times
      }

      try {
        // Priority 1: Check for 4-minute auto-liquidation (escalation mechanic)
        // Use escalationStartTime if available, otherwise fall back to startTime
        const battleStartTime = battle.escalationStartTime || battle.startTime;
        if (battleStartTime) {
          const startTimeMs = battleStartTime > 1e12 ? battleStartTime : battleStartTime * 1000;
          const elapsed = Date.now() - startTimeMs;
          const maxBattleDuration = 240000; // 4 minutes = 240000ms
          
          if (elapsed >= maxBattleDuration && (battle.bull?.alive || battle.bear?.alive)) {
            logger.info(`⏰ Battle ${battle.id?.substring(0, 20)}... reached 4-minute mark, triggering settlement`, {
              battleId: battle.id,
              elapsed: Math.floor(elapsed / 1000),
              bullAlive: battle.bull?.alive,
              bearAlive: battle.bear?.alive,
              startTime: new Date(startTimeMs).toISOString(),
            });
            await this.settleBattle(battle, currentPrice);
            continue;
          } else if (elapsed >= maxBattleDuration - 60000) { // Log when within 1 minute of settlement
            logger.debug(`⏳ Battle ${battle.id?.substring(0, 20)}... approaching 4-minute mark`, {
              battleId: battle.id,
              elapsed: Math.floor(elapsed / 1000),
              timeRemaining: Math.floor((maxBattleDuration - elapsed) / 1000),
            });
          }
        }
        
        // Priority 2: Check if battle should be settled (endTime reached)
        // endTime is in milliseconds (from backend state) or seconds (from contract)
        let endTimeMs = battle.endTime 
          ? (battle.endTime > 1e12 ? battle.endTime : battle.endTime * 1000) // If < 1e12, it's seconds, convert to ms
          : null;
        
        // If endTime is missing but we have startTime and timeLimit, calculate it
        if (!endTimeMs && battle.startTime && battle.config?.timeLimit) {
          const startTimeMs = battle.startTime > 1e12 ? battle.startTime : battle.startTime * 1000;
          const timeLimitSeconds = battle.config.timeLimit;
          endTimeMs = startTimeMs + (timeLimitSeconds * 1000);
          logger.debug(`📅 Calculated endTime from startTime + timeLimit`, {
            battleId: battle.id,
            startTime: new Date(startTimeMs).toISOString(),
            timeLimit: `${timeLimitSeconds}s`,
            calculatedEndTime: new Date(endTimeMs).toISOString(),
          });
        }
        
        if (endTimeMs && Date.now() >= endTimeMs) {
          logger.info(`⏰ Battle ${battle.id?.substring(0, 20)}... reached endTime, attempting settlement`, {
            battleId: battle.id,
            endTime: new Date(endTimeMs).toISOString(),
            currentTime: new Date().toISOString(),
            status: battle.status,
          });
          await this.settleBattle(battle, currentPrice);
          continue;
        } else if (endTimeMs) {
          const timeRemaining = Math.floor((endTimeMs - Date.now()) / 1000);
          if (timeRemaining < 60) { // Only log if less than 1 minute remaining
            logger.debug(`⏳ Battle ${battle.id?.substring(0, 20)}... not ready for settlement`, {
              battleId: battle.id,
              timeRemaining: `${timeRemaining}s`,
              endTime: new Date(endTimeMs).toISOString(),
            });
          }
        } else if (!battleStartTime) {
          // No endTime and no startTime - battle might be stuck
          logger.warn(`⚠️ Battle ${battle.id?.substring(0, 20)}... has no endTime, startTime, or escalationStartTime`, {
            battleId: battle.id,
            status: battle.status,
            startTime: battle.startTime,
            escalationStartTime: battle.escalationStartTime,
            config: battle.config,
            note: 'Battle may need to be synced from chain to get proper timestamps',
          });
        }

        // Check for liquidation (health < 5%)
        if (battle.bull && battle.bull.health < 5 && battle.bull.alive) {
          await this.checkLiquidation(battle, 0, currentPrice); // Agent A (Bull)
        }

        if (battle.bear && battle.bear.health < 5 && battle.bear.alive) {
          await this.checkLiquidation(battle, 1, currentPrice); // Agent B (Bear)
        }
      } catch (error) {
        logger.error('Error checking battle', {
          battleId: battle.id,
          error: error.message,
        });
      }
    }
  }

  /**
   * Handle battleReadyForSettlement event from stateManager
   * This is emitted when checkEscalations marks a battle as ready
   */
  async handleBattleReadyForSettlement(eventData) {
    const { battleId, battle, finalPrice } = eventData;
    
    logger.info('🔔 Received battleReadyForSettlement event', {
      battleId,
      finalPrice,
      battleStatus: battle?.status,
    });

    if (!battle) {
      logger.warn('No battle data in battleReadyForSettlement event');
      return;
    }

    // Settle this battle on-chain
    try {
      await this.settleBattle(battle, finalPrice);
      logger.info('✅ Battle settled on-chain via battleReadyForSettlement event', {
        battleId,
      });
    } catch (error) {
      logger.error('❌ Failed to settle battle from battleReadyForSettlement event', {
        battleId,
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Check and trigger liquidation for an agent
   */
  async checkLiquidation(battle, agentIndex, currentPrice) {
    if (!battle.battleAddress) {
      logger.warn('Battle has no contract address', { battleId: battle.id });
      return;
    }

    try {
      const battleArena = new ethers.Contract(
        battle.battleAddress,
        [
          'function checkAndLiquidate(bytes32 battleId, uint8 agentIndex, uint256 currentPrice) external',
          'function getBattle(bytes32 battleId) external view returns (tuple(...))',
        ],
        this.contractService.provider
      );

      const battleIdBytes32 = ethers.id(battle.id);
      const currentPriceWei = BigInt(Math.floor(currentPrice * 1e8)); // Convert to 8 decimals

      logger.info('Checking liquidation', {
        battleId: battle.id,
        agentIndex,
        currentPrice,
      });

      // Call checkAndLiquidate (anyone can call this)
      const tx = await battleArena.checkAndLiquidate(
        battleIdBytes32,
        agentIndex,
        currentPriceWei
      );

      await tx.wait();
      logger.info('✅ Liquidation check completed', {
        battleId: battle.id,
        agentIndex,
        txHash: tx.hash,
      });

      // Sync battle state from chain
      await this.contractService.syncBattlesFromChain();
    } catch (error) {
      // Don't log errors if agent is already liquidated or not ready
      if (!error.message?.includes('already liquidated') && 
          !error.message?.includes('not ready')) {
        logger.error('Failed to check liquidation', {
          battleId: battle.id,
          agentIndex,
          error: error.message,
        });
      }
    }
  }

  /**
   * Settle a battle that has ended
   */
  async settleBattle(battle, finalPrice) {
    if (!battle.battleAddress) {
      logger.warn('Battle has no contract address', { battleId: battle.id });
      return;
    }

    // Declare variables in outer scope so they're accessible in catch block
    let onChainEndTimeSeconds = null;
    let onChainStatus = null;
    let currentTimeSeconds = null;
    let blockTimestamp = null;

    try {
      // First, verify on-chain that battle has actually ended
      const battleArena = new ethers.Contract(
        battle.battleAddress,
        [
          'function getBattle(bytes32 battleId) external view returns (tuple(tuple(address wallet, uint256 collateral, bool isLong, uint256 leverage, uint256 entryPrice, bool alive, uint256 lastProofTime, uint256 totalBets) agentA, tuple(address wallet, uint256 collateral, bool isLong, uint256 leverage, uint256 entryPrice, bool alive, uint256 lastProofTime, uint256 totalBets) agentB, uint256 startTime, uint256 endTime, uint256 totalPool, uint8 status, address winner, uint256 entryFee, uint256 eliminationThreshold))',
        ],
        this.contractService.provider
      );

      const battleIdBytes32 = typeof battle.id === 'string' && !battle.id.startsWith('0x')
        ? ethers.id(battle.id)
        : battle.id;
      const onChainBattle = await battleArena.getBattle(battleIdBytes32);
      
      // Contract's endTime is in seconds (Unix timestamp)
      onChainEndTimeSeconds = Number(onChainBattle.endTime);
      onChainStatus = Number(onChainBattle.status); // 0=Pending, 1=Active, 2=Settled
      currentTimeSeconds = Math.floor(Date.now() / 1000); // Current time in seconds

      // Get blockchain timestamp first for accurate comparison
      // blockTimestamp is already declared at function scope
      try {
        const blockNumber = await this.contractService.provider.getBlockNumber();
        const block = await this.contractService.provider.getBlock(blockNumber);
        blockTimestamp = Number(block.timestamp);
      } catch (err) {
        logger.warn('Failed to get block timestamp, using Date.now()', { 
          battleId: battle.id,
          error: err.message 
        });
        blockTimestamp = currentTimeSeconds;
      }

      logger.info('Checking battle settlement eligibility', {
        battleId: battle.id,
        onChainEndTime: onChainEndTimeSeconds,
        blockTimestamp,
        backendTime: currentTimeSeconds,
        timeRemainingFromBlock: onChainEndTimeSeconds - blockTimestamp,
        timeRemainingFromBackend: onChainEndTimeSeconds - currentTimeSeconds,
        onChainStatus: ['Pending', 'Active', 'Settled'][onChainStatus],
      });

      // Check if battle is already settled
      if (onChainStatus === 2) {
        logger.info('Battle already settled on-chain, checking if bets need to be settled', { battleId: battle.id });
        
        // Even if battle is already settled, we should check if bets are settled
        // This handles cases where settlement happened but bets weren't updated
        try {
          const { settleBets } = await import('../db/services/betService.js');
          const winner = onChainBattle.winner;
          
          if (winner && winner !== ethers.ZeroAddress) {
            // Determine winner side
            const agentA = onChainBattle.agentA;
            const agentB = onChainBattle.agentB;
            const winnerSide = winner.toLowerCase() === agentA.wallet.toLowerCase() ? 'bull' : 'bear';
            
            // Calculate payout ratio
            const totalPool = Number(onChainBattle.totalPool) / 1e6;
            // Get bets for this battle to calculate ratio
            const { getBattleBets } = await import('../db/services/betService.js');
            const bets = await getBattleBets(battle.id);
            const winningBets = bets.filter(b => b.side === winnerSide && !b.settled);
            const losingBets = bets.filter(b => b.side !== winnerSide && !b.settled);
            const winningPool = winningBets.reduce((sum, b) => sum + b.amount, 0);
            const losingPool = losingBets.reduce((sum, b) => sum + b.amount, 0);
            const payoutRatio = winningPool > 0 ? (winningPool + losingPool) / winningPool : 1.8;
            
            // Get settlement tx hash from battle
            const settlementTxHash = battle.settlementTxHash || null;
            
            // Settle any pending bets
            const settledBets = await settleBets(battle.id, winnerSide, payoutRatio, settlementTxHash);
            if (settledBets.length > 0) {
              logger.info(`✅ Settled ${settledBets.length} pending bets for already-settled battle`, { 
                battleId: battle.id,
                winner: winnerSide,
                payoutRatio,
              });
            }
          }
        } catch (error) {
          logger.warn('Failed to settle bets for already-settled battle', { 
            battleId: battle.id, 
            error: error.message 
          });
        }
        
        await this.contractService.syncBattlesFromChain();
        return;
      }

      // Check if battle status is Active (required by battleActive modifier)
      if (onChainStatus !== 1) { // 1 = Active
        logger.warn('⚠️ Battle is not Active on-chain, cannot settle', {
          battleId: battle.id,
          onChainStatus: ['Pending', 'Active', 'Settled'][onChainStatus],
          onChainStatusNumber: onChainStatus,
          note: 'battleActive modifier requires status == Active. Battle may need to be activated first.',
        });
        return; // Don't try to settle if battle is not Active
      }

      // Check if blockchain timestamp has reached the endTime
      // The contract requires: block.timestamp >= battle.endTime (exact check, no buffer)
      // Also check if battle is too old (more than 1 hour past endTime) - likely stuck
      const timeSinceEndTime = blockTimestamp - onChainEndTimeSeconds;
      const MAX_SETTLEMENT_AGE = 3600; // 1 hour in seconds (reduced from 24 hours)
      
      if (onChainEndTimeSeconds === 0) {
        logger.debug('Battle has no endTime set, skipping settlement', { battleId: battle.id });
        return;
      }
      
      if (blockTimestamp < onChainEndTimeSeconds) {
        logger.debug('Battle not ended yet on-chain (block.timestamp < endTime)', {
          battleId: battle.id,
          onChainEndTime: onChainEndTimeSeconds,
          blockTimestamp,
          backendTime: currentTimeSeconds,
          timeRemaining: onChainEndTimeSeconds - blockTimestamp,
          note: `Contract will revert with BattleNotEnded() if block.timestamp < endTime. Blockchain needs ${onChainEndTimeSeconds - blockTimestamp} more seconds. Waiting...`,
        });
        return; // Don't try to settle if battle hasn't ended on-chain
      }
      
      // If battle is too old and still can't be settled, mark it as stuck and skip
      // Reduced to 1 hour to catch stuck battles faster
      if (timeSinceEndTime > MAX_SETTLEMENT_AGE) {
        logger.warn('Battle is too old and likely stuck, skipping settlement attempts', {
          battleId: battle.id,
          onChainEndTime: onChainEndTimeSeconds,
          blockTimestamp,
          timeSinceEndTime: Math.floor(timeSinceEndTime / 3600) + ' hours',
          onChainStatus: ['Pending', 'Active', 'Settled'][onChainStatus],
          note: 'Battle is more than 1 hour past endTime. If it cannot be settled, it may be stuck. Consider clearing old battles.',
        });
        // Mark battle as stuck to prevent further attempts
        battle._settlementRetries = 999; // Mark as permanently stuck
        return; // Skip this battle
      }
      
      logger.info('✅ Blockchain timestamp has reached endTime, proceeding with settlement', {
        battleId: battle.id,
        onChainEndTime: onChainEndTimeSeconds,
        blockTimestamp,
        timeRemaining: blockTimestamp - onChainEndTimeSeconds,
      });

      logger.info('Settling battle', {
        battleId: battle.id,
        finalPrice,
        endTime: onChainEndTimeSeconds,
        currentTime: currentTimeSeconds,
      });

      // Call settleBattle on contract
      const settlementResult = await this.contractService.settleBattle(
        battle.battleAddress,
        battle.id,
        finalPrice
      );

      // Fetch battle state from chain to get the winner
      let winner = 'DRAW';
      try {
        const onChainBattle = await this.contractService.getBattleFromArena(
          battle.battleAddress,
          battle.id
        );
        
        if (onChainBattle && onChainBattle.winner && onChainBattle.winner !== ethers.ZeroAddress) {
          // Determine winner by comparing winner address to agent wallets
          const agentA = onChainBattle.agentA;
          const agentB = onChainBattle.agentB;
          
          if (agentA && agentB) {
            const winnerAddress = onChainBattle.winner.toLowerCase();
            const agentAAddress = agentA.wallet?.toLowerCase();
            const agentBAddress = agentB.wallet?.toLowerCase();
            
            // Determine which agent won based on wallet address
            if (winnerAddress === agentAAddress) {
              // AgentA is the winner - determine if it's BULL or BEAR based on isLong
              winner = agentA.isLong ? 'BULL' : 'BEAR';
            } else if (winnerAddress === agentBAddress) {
              // AgentB is the winner - determine if it's BULL or BEAR based on isLong
              winner = agentB.isLong ? 'BULL' : 'BEAR';
            } else {
              // Winner address doesn't match either agent - might be a draw or error
              logger.warn('Winner address does not match either agent', {
                battleId: battle.id,
                winnerAddress,
                agentAAddress,
                agentBAddress,
              });
              winner = 'DRAW';
            }
          } else {
            logger.warn('Cannot determine winner - missing agent data', {
              battleId: battle.id,
              hasAgentA: !!agentA,
              hasAgentB: !!agentB,
            });
          }
        } else {
          logger.warn('No winner found on-chain after settlement', {
            battleId: battle.id,
            winner: onChainBattle?.winner,
          });
        }
      } catch (error) {
        logger.error('Failed to fetch winner from chain after settlement', {
          battleId: battle.id,
          error: error.message,
        });
        // Fallback: use health-based winner determination
        const bullHealth = battle.finalBullHealth ?? battle.bull?.health ?? 0;
        const bearHealth = battle.finalBearHealth ?? battle.bear?.health ?? 0;
        if (bullHealth > bearHealth) {
          winner = 'BULL';
        } else if (bearHealth > bullHealth) {
          winner = 'BEAR';
        }
      }

      // Store settlement tx hash and winner in battle
      if (settlementResult && settlementResult.txHash) {
        // CRITICAL: Preserve tier when updating battle
        const updateData = {
          settlementTxHash: settlementResult.txHash,
          settlementBlockNumber: settlementResult.blockNumber,
          status: 'SETTLED', // Ensure status is SETTLED
          winner: winner, // Store the determined winner
        };
        
        // Preserve tier if it exists (especially for PRIMARY battles)
        if (battle.tier) {
          updateData.tier = battle.tier;
        } else if (battle.id === stateManager.primaryBattleId) {
          // If this is the primary battle, ensure tier is set
          updateData.tier = 'PRIMARY';
        }
        
        // Update battle with settlement tx hash and winner (this will save to MongoDB)
        stateManager.updateBattle(battle.id, updateData);
        // Also update in-memory battle object
        battle.settlementTxHash = settlementResult.txHash;
        battle.settlementBlockNumber = settlementResult.blockNumber;
        battle.status = 'SETTLED';
        battle.winner = winner;
        if (updateData.tier) {
          battle.tier = updateData.tier;
        }
        logger.info('✅ Stored settlement tx hash and winner', {
          battleId: battle.id,
          txHash: settlementResult.txHash,
          blockNumber: settlementResult.blockNumber,
          winner: winner,
          tier: updateData.tier || battle.tier || 'not set',
        });
      } else {
        logger.warn('⚠️ Settlement result missing txHash', {
          battleId: battle.id,
          settlementResult: settlementResult ? 'exists but no txHash' : 'null/undefined',
        });
        // Still update winner even if txHash is missing
        battle.winner = winner;
        stateManager.updateBattle(battle.id, { winner: winner, status: 'SETTLED' });
      }

      logger.info('✅ Battle settled', { battleId: battle.id, winner: winner });

      // Sync battle state from chain
      await this.contractService.syncBattlesFromChain();

      // Calculate payout ratio for bettors
      const bettingPool = stateManager.bettingPools.get(battle.id);
      const totalPool = bettingPool ? (bettingPool.bull + bettingPool.bear) : 0;
      const winningPool = winner === 'BULL' ? (bettingPool?.bull ?? 0) : (winner === 'BEAR' ? (bettingPool?.bear ?? 0) : 0);
      const houseFee = 0.05; // 5% house fee
      const payoutRatio = winningPool > 0 ? (totalPool * (1 - houseFee)) / winningPool : 0;
      
      logger.info('Calculating bet payouts', {
        battleId: battle.id,
        winner,
        totalPool,
        winningPool,
        payoutRatio,
        bettingPool: bettingPool ? { bull: bettingPool.bull, bear: bettingPool.bear } : 'none',
      });
      
      // Settle bets in database (this will emit betWinningsDistributed events)
      try {
        const { settleBets } = await import('../db/services/betService.js');
        // Normalize winner to lowercase for betService (it expects 'bull' or 'bear')
        const winnerLower = winner === 'BULL' ? 'bull' : 'bear';
        // Pass settlement transaction hash so winners can see the settlement transaction
        const settledBets = await settleBets(
          battle.id, 
          winnerLower, 
          payoutRatio,
          settlementResult?.txHash // Pass settlement tx hash for winners
        );
        logger.info(`✅ Settled bets for battle ${battle.id}`, { 
          winner: winnerLower, 
          payoutRatio,
          settledCount: settledBets?.length || 0,
          settlementTxHash: settlementResult?.txHash,
        });
      } catch (error) {
        logger.error('❌ Failed to settle bets in database', { battleId: battle.id, error: error.message, stack: error.stack });
      }

      // Settle Yellow SDK sessions for users who bet on this battle
      await this.settleYellowSessions(battle, finalPrice);

      // Emit event for primary battle service
      stateManager.emit('battleSettled', battle);
    } catch (error) {
      // Check if error is "BattleNotEnded" - this can mean:
      // 1. Battle status is not Active (from battleActive modifier)
      // 2. block.timestamp < battle.endTime (from settleBattle function)
      if (error.data && error.data.startsWith('0xe450d38c')) {
        // If we've tried multiple times and it still fails, reduce logging frequency
        const retryCount = (battle._settlementRetries || 0) + 1;
        battle._settlementRetries = retryCount;
        
        // Only log warning every 10th attempt to reduce spam
        if (retryCount % 10 === 1) {
          logger.warn('BattleNotEnded error when trying to settle (will retry)', {
            battleId: battle.id,
            onChainStatus: onChainStatus !== null && onChainStatus !== undefined ? ['Pending', 'Active', 'Settled'][onChainStatus] : 'unknown',
            onChainEndTime: onChainEndTimeSeconds !== null ? onChainEndTimeSeconds : 'unknown',
            blockTimestamp: blockTimestamp !== null ? blockTimestamp : 'unknown',
            backendTime: currentTimeSeconds !== null ? currentTimeSeconds : 'unknown',
            timeRemaining: (onChainEndTimeSeconds !== null && blockTimestamp !== null) ? onChainEndTimeSeconds - blockTimestamp : 'unknown',
            retryCount,
            note: 'This could mean: 1) Battle status is not Active, or 2) Contract block.timestamp < endTime. Will retry later. For old battles, consider clearing them.',
          });
        }
        return;
      }
      
      logger.error('Failed to settle battle', {
        battleId: battle.id,
        error: error.message,
        errorData: error.data,
      });
    }
  }

  /**
   * Settle Yellow SDK sessions for users who bet on this battle
   */
  async settleYellowSessions(battle, finalPrice) {
    if (!this.yellowService) {
      return; // Yellow service not available
    }

    try {
      // Determine winner from battle state
      const bullHealth = battle.finalBullHealth ?? battle.bull?.health ?? 0;
      const bearHealth = battle.finalBearHealth ?? battle.bear?.health ?? 0;
      const winner = battle.winner || (bullHealth > bearHealth ? 'BULL' : (bearHealth > bullHealth ? 'BEAR' : 'DRAW'));
      
      // Get betting pool for this battle
      const bettingPool = stateManager.bettingPools.get(battle.id);
      const totalPool = bettingPool ? (bettingPool.bull + bettingPool.bear) : 0;
      const winningPool = winner === 'BULL' ? (bettingPool?.bull ?? 0) : (winner === 'BEAR' ? (bettingPool?.bear ?? 0) : 0);
      const losingPool = winner === 'BULL' ? (bettingPool?.bear ?? 0) : (winner === 'BEAR' ? (bettingPool?.bull ?? 0) : 0);
      
      // Calculate payout ratio (5% house fee)
      const houseFee = 0.05;
      const payoutRatio = winningPool > 0 ? (totalPool * (1 - houseFee)) / winningPool : 0;

      // Get all Yellow sessions and find ones for this battle
      const yellowSessions = this.yellowService.sessions || new Map();
      const battleAddress = battle.battleAddress || battle.id;

      for (const [userAddress, session] of yellowSessions.entries()) {
        // Check if this session is for the current battle
        if (session.battleContract !== battleAddress && session.battleContract !== battle.id) {
          continue;
        }

        // Calculate winnings for this user
        let totalWinnings = 0;
        const userBets = session.bets || [];
        
        for (const bet of userBets) {
          const betAmount = parseFloat(bet.amount) || 0;
          const betAgent = bet.agent === 'bull' ? 'BULL' : 'BEAR';
          
          if (betAgent === winner) {
            // User won - calculate winnings based on payout ratio
            const winnings = betAmount * payoutRatio;
            totalWinnings += winnings;
            logger.info(`User ${userAddress} won ${winnings} USDC on ${betAgent} bet of ${betAmount} USDC`);
          } else {
            // User lost - no winnings
            logger.info(`User ${userAddress} lost ${betAmount} USDC on ${betAgent} bet`);
          }
        }

        if (userBets.length > 0) {
          try {
            // Settle the Yellow session
            const winnerAgent = winner === 'BULL' ? 'bull' : (winner === 'BEAR' ? 'bear' : 'draw');
            const settlementPrice = finalPrice * 1e8; // Convert to 8 decimals

            // Contract settler function
            const contractSettler = this.contractService && this.contractService.initialized && battle.battleAddress
              ? async (battleAddr, battleIdBytes32, price) => {
                  return await this.contractService.settleBattle(battleAddr, battleIdBytes32, price);
                }
              : null;

            await this.yellowService.settleSession(
              userAddress,
              winnerAgent,
              totalWinnings,
              {
                battleId: battle.id,
                battleAddress: battle.battleAddress,
                finalPrice: settlementPrice,
                contractSettler
              }
            );

            logger.info(`✅ Settled Yellow session for ${userAddress}: ${totalWinnings} USDC winnings`);
            
            // Emit event for Yellow SDK winnings (if any)
            if (totalWinnings > 0) {
              stateManager.emit('betWinningsDistributed', {
                battleId: battle.id,
                bettor: userAddress,
                betAmount: userBets.reduce((sum, b) => sum + (parseFloat(b.amount) || 0), 0),
                winnings: totalWinnings,
                totalPayout: totalWinnings, // Yellow SDK winnings are net
                side: winnerAgent,
                txHash: null, // Yellow SDK is off-chain
                viaYellow: true,
              });
            }
          } catch (error) {
            logger.error(`Failed to settle Yellow session for ${userAddress}:`, error);
            // Continue with other sessions
          }
        }
      }
    } catch (error) {
      logger.error('Error settling Yellow sessions:', error);
    }
  }

  /**
   * Handle battle updates
   */
  handleBattleUpdate(battle) {
    // If battle ended, check if we need to settle
    if (battle.status === 'SETTLED') {
      logger.info('Battle already settled', { battleId: battle.id });
    }
  }

  /**
   * Handle price updates - check for liquidations
   */
  handlePriceUpdate({ newPrice }) {
    if (!this.isRunning) return;
    
    // Trigger check for all battles when price updates
    // (The periodic check will handle it, but we can also check immediately)
    setTimeout(() => {
      this.checkAllBattles();
    }, 1000); // Small delay to avoid too frequent checks
  }

  /**
   * Stop the service
   */
  stop() {
    this.isRunning = false;
    
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }

    stateManager.removeListener('battleUpdated', this.handleBattleUpdate);
    stateManager.removeListener('priceUpdated', this.handlePriceUpdate);

    logger.info('Battle Settlement Service stopped');
  }
}

export default BattleSettlementService;
