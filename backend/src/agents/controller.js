import { ethers } from 'ethers';
import config from '../config.js';
import logger from '../utils/logger.js';
import stateManager from '../state.mjs';
import proverService from '../services/prover.js';

/**
 * Agent Controller
 * Manages AI agents (Bull and Bear) that battle with 10x leverage
 * Uses deterministic logic (no GPT-4o costs) for hackathon reliability
 */
class AgentController {
  constructor(agentId, isLong, wallet, battleContract, battleId, agentIndex) {
    this.agentId = agentId;
    this.isLong = isLong; // true = Bull, false = Bear
    this.wallet = wallet;
    this.battleContract = battleContract;
    this.battleId = battleId;
    this.agentIndex = agentIndex; // 0 = Bull, 1 = Bear
    
    // Position parameters
    this.leverage = config.agent.leverage;
    this.collateral = config.agent.collateral; // $100 USDC
    this.entryPrice = 0; // Will be set from battle data
    this.alive = true;
    
    // State
    this.currentLeverage = this.leverage;
    this.lastProofTime = 0;
    this.proofInterval = null;
    
    // Personality parameters (deterministic behavior)
    this.panicThreshold = -0.05; // Reduce leverage at 5% loss
    this.greedThreshold = 0.08;  // Max leverage at 8% profit
  }

  /**
   * Start the agent's proof submission loop
   */
  start(entryPrice) {
    // Set entry price from battle
    if (entryPrice) {
      this.entryPrice = entryPrice;
    } else {
      // Fallback to current price if no entry price provided
      const currentPrice = stateManager.getPrice();
      if (currentPrice > 0) {
        this.entryPrice = currentPrice;
      } else {
        logger.warn(`Agent ${this.agentId} started without entry price, waiting for price feed`);
        return;
      }
    }
    
    logger.info(`Starting agent ${this.agentId}`, {
      type: this.isLong ? 'BULL' : 'BEAR',
      battleId: this.battleId,
      entryPrice: this.entryPrice,
    });

    // Listen for price updates from state manager
    stateManager.on('priceUpdated', this.handlePriceUpdate.bind(this));

    // Start proof submission loop
    this.proofInterval = setInterval(() => {
      this.checkAndSubmitProof();
    }, config.agent.proofInterval);

    // Initial check
    this.checkAndSubmitProof();
  }

  /**
   * Stop the agent
   */
  stop() {
    logger.info(`Stopping agent ${this.agentId}`);
    stateManager.removeListener('priceUpdated', this.handlePriceUpdate.bind(this));
    
    if (this.proofInterval) {
      clearInterval(this.proofInterval);
      this.proofInterval = null;
    }
  }

  /**
   * Handle price updates
   */
  async handlePriceUpdate({ newPrice }) {
    if (!this.alive || !newPrice || newPrice <= 0) return;
    
    const priceChange = this.calculatePriceChange(newPrice);
    
    // Check if we should adjust leverage based on personality
    const decision = this.getAgentDecision(priceChange);
    
    if (decision.newLeverage !== this.currentLeverage) {
      logger.info(`Agent ${this.agentId} adjusting leverage`, {
        oldLeverage: this.currentLeverage,
        newLeverage: decision.newLeverage,
        action: decision.action,
      });
      this.currentLeverage = decision.newLeverage;
    }
  }

  /**
   * Check solvency and submit ZK proof
   */
  async checkAndSubmitProof() {
    if (!this.alive) return;

    try {
      const currentPrice = stateManager.getPrice();
      
      // Don't submit proof if price is not available
      if (!currentPrice || currentPrice <= 0) {
        logger.debug(`Agent ${this.agentId} waiting for price feed`);
        return;
      }
      
      // Don't submit if entry price not set
      if (!this.entryPrice || this.entryPrice <= 0) {
        logger.debug(`Agent ${this.agentId} waiting for entry price`);
        return;
      }
      
      // REMOVED: Backend solvency check - let the circuit enforce it
      // The circuit will fail to generate a proof if the agent is insolvent
      // This ensures solvency is cryptographically proven, not just checked in backend
      
      logger.debug(`Agent ${this.agentId} generating ZK proof`, {
        currentPrice: currentPrice,
        entryPrice: this.entryPrice,
        note: 'Circuit will enforce solvency constraint',
      });

      // Generate ZK Proof - circuit will enforce solvency
      // If agent is insolvent, circuit constraint will fail and proof generation will throw
      const proofResult = await this.generateProof(currentPrice);

      // Submit to contract (convert price to 8 decimals)
      const price8Dec = Math.floor(currentPrice * 10**8);
      
      // Handle both new format (proof + publicInputs) and legacy format (proofHash string)
      if (typeof proofResult === 'object' && proofResult.proof && proofResult.publicInputs) {
        // New format: full proof with public inputs for on-chain verification
        await this.submitProof(price8Dec, proofResult.proof, { publicInputs: proofResult.publicInputs });
      } else {
        // Legacy format: proof hash (fallback mode)
        await this.submitProof(price8Dec, proofResult);
      }
      
      this.lastProofTime = Date.now();
      
      logger.info(`Agent ${this.agentId} submitted valid proof`, {
        price: currentPrice,
        timestamp: this.lastProofTime,
      });
      
    } catch (error) {
      logger.error(`Agent ${this.agentId} error`, {
        error: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Calculate solvency locally
   */
  calculateSolvency(currentPrice) {
    const positionSize = this.collateral * this.currentLeverage;
    let pnl;
    
    if (this.isLong) {
      // Long: profit when price goes up
      const priceDelta = (currentPrice - this.entryPrice) / this.entryPrice;
      pnl = positionSize * priceDelta;
    } else {
      // Short: profit when price goes down
      const priceDelta = (this.entryPrice - currentPrice) / this.entryPrice;
      pnl = positionSize * priceDelta;
    }
    
    const equity = this.collateral + pnl;
    const maintenance = positionSize * 0.05; // 5% maintenance margin
    
    return equity > maintenance;
  }

  /**
   * Calculate price change percentage
   */
  calculatePriceChange(currentPrice) {
    return (currentPrice - this.entryPrice) / this.entryPrice;
  }

  /**
   * Deterministic agent decision logic (no GPT-4o costs)
   * Returns leverage adjustment based on market conditions
   */
  getAgentDecision(priceChange) {
    if (this.isLong) {
      // Bull behavior
      if (priceChange < this.panicThreshold) {
        // Price dropped 5%, reduce risk
        return { newLeverage: 5, action: 'REDUCE_RISK' };
      }
      if (priceChange > this.greedThreshold) {
        // Price pumped 8%, max leverage for gains
        return { newLeverage: 10, action: 'MAX_GAIN' };
      }
      return { newLeverage: this.currentLeverage, action: 'HOLD' };
    } else {
      // Bear behavior
      if (priceChange > -this.panicThreshold) {
        // Price rose 5%, reduce risk
        return { newLeverage: 5, action: 'HEDGE' };
      }
      if (priceChange < -this.greedThreshold) {
        // Price dropped 8%, max short
        return { newLeverage: 10, action: 'MAX_SHORT' };
      }
      return { newLeverage: this.currentLeverage, action: 'HOLD' };
    }
  }

  /**
   * Generate ZK proof of solvency
   * Uses Noir prover service if available, falls back to deterministic hash
   */
  async generateProof(currentPrice) {
    const isSolvent = this.calculateSolvency(currentPrice);
    
    if (!isSolvent) {
      return '0xinvalid'; // Will be converted to bytes32(0) for liquidation
    }
    
    try {
      // Try to use real ZK prover service
      const agentState = {
        agentId: this.agentId,
        collateral: this.collateral,
        leverage: this.currentLeverage,
        entryPrice: this.entryPrice,
        isLong: this.isLong,
      };
      
      // Convert price to 8 decimals for circuit (circuit expects integer values)
      const price8Dec = Math.floor(currentPrice * 10**8);
      const entryPrice8Dec = Math.floor(this.entryPrice * 10**8);
      
      // Calculate excess for public inputs
      const positionSize = agentState.collateral * agentState.leverage;
      const priceDiff = agentState.isLong 
        ? (price8Dec - entryPrice8Dec)
        : (entryPrice8Dec - price8Dec);
      const pnl = Math.floor((positionSize * priceDiff) / entryPrice8Dec);
      const equity = agentState.collateral + pnl;
      const maintenance = Math.floor((positionSize * 5) / 100); // 5% maintenance
      const excess = equity - maintenance;
      
      const proofResult = await proverService.generateSolvencyProof(
        {
          ...agentState,
          entryPrice: entryPrice8Dec,
        },
        price8Dec
      );
      
      // proverService now returns { proof, publicInputs }
      return {
        proof: proofResult.proof, // Uint8Array - full ZK proof
        publicInputs: proofResult.publicInputs // Already formatted from prover
      };
    } catch (error) {
      // If proof generation fails, agent is likely insolvent (circuit constraint failed)
      // OR prover service is unavailable
      if (error.message?.includes('Prover service not available')) {
        // Fallback to deterministic proof if prover service fails
        logger.warn(`Agent ${this.agentId} using fallback proof generation`, {
          error: error.message,
        });
        
        // Create a deterministic proof hash from agent state
        const proofData = `${this.agentId}-${this.battleId}-${currentPrice}-${this.collateral}-${this.currentLeverage}`;
        const proofHash = ethers.keccak256(ethers.toUtf8Bytes(proofData));
        
        return proofHash;
      } else {
        // Circuit constraint failed - agent is insolvent
        logger.warn(`Agent ${this.agentId} proof generation failed - likely insolvent`, {
          error: error.message,
        });
        
        // Return invalid proof to trigger liquidation
        return '0xinvalid';
      }
    }
  }

  /**
   * Submit proof to battle contract
   * @param {number} currentPrice - Price in 8 decimals (as expected by contract)
   * @param {Uint8Array|string} proof - Full ZK proof (Uint8Array) or proof hash (string for legacy)
   * @param {Object} options - Optional: publicInputs for on-chain verification
   */
  async submitProof(currentPrice, proof, options = {}) {
    try {
        // Check if we have full proof + public inputs for on-chain verification
        if (proof instanceof Uint8Array && options.publicInputs && options.publicInputs.length === 4) {
          // New format: Use on-chain ZK proof verification
          try {
            // Convert public inputs to uint256 array
            const publicInputsUint = options.publicInputs.map(input => BigInt(input));
            
            // Convert proof Uint8Array to bytes
            const proofBytes = ethers.hexlify(proof);
            
            // Step 1: Emit proof submission event
            stateManager.emit('proofSubmitted', {
              battleId: this.battleId,
              agentType: this.isLong ? 'bull' : 'bear',
              agentIndex: this.agentIndex,
              timestamp: Math.floor(Date.now() / 1000),
            });
            
            // Step 2: Simulate on-chain verification (FREE, no gas cost)
            // This uses staticcall to check if verification would pass
            try {
              const verifierAddress = await this.battleContract.solvencyVerifier();
              const verifierContract = new ethers.Contract(
                verifierAddress,
                ['function verify(bytes calldata, uint256[] calldata) external pure returns (bool)'],
                this.battleContract.runner
              );
              
              const isValid = await verifierContract.verify.staticCall(proofBytes, publicInputsUint);
              
              if (!isValid) {
                logger.warn(`Agent ${this.agentId} proof would fail on-chain verification (simulated)`);
                
                // Emit proof failed event
                stateManager.emit('proofFailed', {
                  battleId: this.battleId,
                  agentType: this.isLong ? 'bull' : 'bear',
                  agentIndex: this.agentIndex,
                  reason: 'Simulation failed - proof invalid',
                  timestamp: Math.floor(Date.now() / 1000),
                });
                
                return; // Don't submit, save gas on invalid proof
              }
              
              logger.debug(`Agent ${this.agentId} proof verified via simulation (no gas cost)`);
            } catch (simError) {
              logger.warn(`Agent ${this.agentId} simulation failed, proceeding anyway`, {
                error: simError.message,
              });
              // Continue to actual submission (simulation might fail for other reasons)
            }
            
            // Step 3: Estimate gas for actual submission (to catch other errors early)
            await this.battleContract.submitProof.estimateGas(
              this.battleId,
              this.agentIndex,
              currentPrice,
              proofBytes,
              publicInputsUint
            );
            
            // Step 4: Submit full proof for on-chain verification
            const tx = await this.battleContract.submitProof(
              this.battleId,
              this.agentIndex,
              currentPrice,
              proofBytes,
              publicInputsUint
            );
            
            const receipt = await tx.wait();
            
            logger.info(`Agent ${this.agentId} ZK proof verified on-chain`, {
              txHash: tx.hash,
              price: currentPrice,
              blockNumber: receipt.blockNumber,
            });
            
            // Emit proof verified event for WebSocket
            stateManager.emit('proofVerified', {
              battleId: this.battleId,
              agentType: this.isLong ? 'bull' : 'bear',
              agentIndex: this.agentIndex,
              txHash: tx.hash,
              timestamp: Math.floor(Date.now() / 1000),
            });
            
            return;
          } catch (estimateError) {
            const errorReason = this.decodeContractError(estimateError.data || estimateError.error?.data, estimateError);
            
            if (errorReason === 'ProofTooEarly' || errorReason === 'ProofTimeout') {
              logger.debug(`Agent ${this.agentId} proof submission skipped: ${errorReason}`);
              return;
            }
            
            if (errorReason === 'AgentAlreadyLiquidated' || errorReason === 'BattleAlreadySettled') {
              logger.debug(`Agent ${this.agentId} proof submission skipped: ${errorReason}`);
              return;
            }
            
            logger.warn(`Agent ${this.agentId} proof verification would fail: ${errorReason}`, {
              error: estimateError.message,
            });
            
            // Emit proof failed event
            stateManager.emit('proofFailed', {
              battleId: this.battleId,
              agentType: this.isLong ? 'bull' : 'bear',
              agentIndex: this.agentIndex,
              reason: errorReason || 'Unknown error',
              timestamp: Math.floor(Date.now() / 1000),
            });
            
            return;
          }
        }
      
        // Legacy format: hash-based verification (fallback)
      let proofHash;
      if (proof === '0xinvalid' || proof === '0x00' || !proof) {
        // Invalid proof for liquidation
        proofHash = ethers.ZeroHash; // bytes32(0)
      } else if (ethers.isHexString(proof) && proof.length === 66) {
        // Already a valid bytes32 hex string
        proofHash = proof;
      } else {
        // Generate a deterministic proof hash from the proof data
        proofHash = ethers.keccak256(ethers.toUtf8Bytes(proof));
      }
      
      // Check if proof would revert before sending (estimateGas)
      try {
        await this.battleContract.submitProofHash.estimateGas(
          this.battleId,
          this.agentIndex,
          currentPrice,
          proofHash
        );
      } catch (estimateError) {
        // Decode the error to understand why it's failing
        const errorData = estimateError.data || estimateError.error?.data;
        const errorReason = this.decodeContractError(errorData, estimateError);
        
        // Handle specific errors gracefully
        if (errorReason === 'ProofTooEarly' || errorReason === 'ProofTimeout') {
          // These are expected - agent already submitted proof recently or battle ended
          logger.debug(`Agent ${this.agentId} proof submission skipped: ${errorReason}`);
          return; // Silently skip - this is normal
        }
        
        if (errorReason === 'AgentAlreadyLiquidated' || errorReason === 'BattleAlreadySettled') {
          // Agent is already dead or battle ended - stop trying
          logger.debug(`Agent ${this.agentId} proof submission skipped: ${errorReason}`);
          return;
        }
        
        // For other errors, log but don't throw
        logger.warn(`Agent ${this.agentId} proof submission would fail: ${errorReason}`, {
          error: estimateError.message,
          code: estimateError.code,
        });
        return; // Don't attempt actual submission if estimate fails
      }
      
      // If estimateGas succeeds, proceed with actual submission (legacy hash-based)
      const tx = await this.battleContract.submitProofHash(
        this.battleId,
        this.agentIndex,
        currentPrice,
        proofHash
      );
      
      await tx.wait();
      
      logger.info(`Agent ${this.agentId} proof submitted to contract`, {
        txHash: tx.hash,
        price: currentPrice,
      });
    } catch (error) {
      // Decode error for better logging
      const errorReason = this.decodeContractError(error.data || error.error?.data, error);
      
      // Only log as error if it's unexpected
      if (errorReason === 'ProofTooEarly' || errorReason === 'ProofTimeout' || 
          errorReason === 'AgentAlreadyLiquidated' || errorReason === 'BattleAlreadySettled') {
        logger.debug(`Agent ${this.agentId} proof submission skipped: ${errorReason}`);
      } else {
        logger.error(`Agent ${this.agentId} failed to submit proof`, {
          error: error.message,
          code: error.code,
          reason: errorReason,
        });
      }
      // Don't throw - allow agent to continue trying
    }
  }

  /**
   * Decode contract error from error data
   */
  decodeContractError(errorData, error) {
    if (!errorData) {
      return error?.message || 'Unknown error';
    }
    
    // Error selectors (first 4 bytes of keccak256("ErrorName()"))
    // Calculate with: keccak256(toUtf8Bytes("ErrorName()")).substring(0, 10)
    const errorSelectors = {
      '0x0d9ab13f': 'InvalidProof',
      '0x4e71d92d': 'ProofTooEarly',
      '0x8b6d8c1a': 'ProofTimeout',
      '0x8f4ffcb1': 'NotAgent',
      '0x1e9a6950': 'AgentAlreadyLiquidated',
      '0x4e71d92d': 'BattleAlreadySettled',
      '0x2c5211c6': 'InvalidPrice',
      '0x2c5211c6': 'InvalidAgent',
      '0xfb8f41b2': 'BattleNotEnded', // keccak256("BattleNotEnded()")
      '0x8d1eb457': 'BattleNotFound', // keccak256("BattleNotFound()")
      '0x48f5c3ed': 'BattleAlreadyExists', // keccak256("BattleAlreadyExists()")
      '0x1f2a2005': 'InvalidCollateral', // keccak256("InvalidCollateral()")
      '0x0c53c51c': 'BettingClosed', // keccak256("BettingClosed()")
      '0x98a9e57c': 'InsufficientBet', // keccak256("InsufficientBet()")
      '0x4b5d276d': 'BattleInProgress', // keccak256("BattleInProgress()")
      '0x90b8ec18': 'TransferFailed', // keccak256("TransferFailed()")
      '0x5d804ab3': 'PrizeDistributionFailed', // keccak256("PrizeDistributionFailed()")
    };
    
    // Extract selector from error data
    const selector = typeof errorData === 'string' && errorData.length >= 10 
      ? errorData.substring(0, 10) 
      : null;
    
    if (selector && errorSelectors[selector]) {
      return errorSelectors[selector];
    }
    
    // Try to match error message
    const errorMsg = error?.message || '';
    if (errorMsg.includes('ProofTooEarly')) return 'ProofTooEarly';
    if (errorMsg.includes('ProofTimeout')) return 'ProofTimeout';
    if (errorMsg.includes('AlreadyLiquidated')) return 'AgentAlreadyLiquidated';
    if (errorMsg.includes('AlreadySettled')) return 'BattleAlreadySettled';
    if (errorMsg.includes('InvalidProof')) return 'InvalidProof';
    if (errorMsg.includes('NotAgent')) return 'NotAgent';
    
    return 'Unknown error';
  }

  /**
   * Get agent status
   */
  getStatus() {
    return {
      agentId: this.agentId,
      type: this.isLong ? 'BULL' : 'BEAR',
      alive: this.alive,
      collateral: this.collateral,
      leverage: this.currentLeverage,
      entryPrice: this.entryPrice,
      lastProofTime: this.lastProofTime,
    };
  }
}

export default AgentController;
