/**
 * Agent Manager Service
 * 
 * Manages multiple agent controllers for active battles
 * - Starts agents when battles are created
 * - Stops agents when battles end
 * - Tracks agent health and updates state
 */

import { ethers } from 'ethers';
import AgentController from './controller.js';
import stateManager from '../state.mjs';
import logger from '../utils/logger.js';
import config from '../config.js';

class AgentManager {
  constructor(contractService) {
    this.contractService = contractService;
    this.agents = new Map(); // battleId -> { bull: AgentController, bear: AgentController }
    this.initialized = false;
  }

  /**
   * Initialize the agent manager
   */
  async initialize() {
    if (this.initialized) return;
    
    // Listen for battle events
    stateManager.on('battleCreated', this.handleBattleCreated.bind(this));
    stateManager.on('battleUpdated', this.handleBattleUpdated.bind(this));
    
    this.initialized = true;
    logger.info('Agent Manager initialized');
  }

  /**
   * Handle new battle creation
   */
  async handleBattleCreated(battle) {
    if (battle.status !== 'LIVE') return;
    
    logger.info('Starting agents for battle', { battleId: battle.id });
    await this.startAgentsForBattle(battle);
  }

  /**
   * Handle battle updates
   */
  handleBattleUpdated(battle) {
    // If battle ended, stop agents
    if (battle.status === 'SETTLED' || battle.status === 'CANCELLED') {
      this.stopAgentsForBattle(battle.id);
    }
  }

  /**
   * Start agents for a battle
   */
  async startAgentsForBattle(battle) {
    if (!this.contractService || !this.contractService.initialized) {
      logger.warn('Contract service not available, cannot start agents');
      return;
    }

    try {
      // Get battle contract address
      const battleAddress = battle.battleAddress || battle.contractAddress;
      if (!battleAddress) {
        logger.warn('Battle has no contract address', { battleId: battle.id });
        return;
      }

      // Get battle contract instance
      const battleContract = await this.getBattleContract(battleAddress);
      if (!battleContract) {
        logger.warn('Could not get battle contract', { battleAddress });
        return;
      }

      // Get agent wallets from battle
      const bullWallet = battle.bull?.sponsor || battle.agentA;
      const bearWallet = battle.bear?.sponsor || battle.agentB;
      
      if (!bullWallet || !bearWallet) {
        logger.warn('Battle missing agent wallets', { battleId: battle.id });
        return;
      }

      // Get entry price from battle or current price
      const entryPrice = battle.entryPrice || stateManager.getPrice();
      if (!entryPrice || entryPrice <= 0) {
        logger.warn('No entry price available for battle', { battleId: battle.id });
        return;
      }

      // Create agent controllers
      const bullAgent = new AgentController(
        `bull-${battle.id}`,
        true, // isLong
        bullWallet,
        battleContract,
        battle.id,
        0 // agentIndex
      );

      const bearAgent = new AgentController(
        `bear-${battle.id}`,
        false, // isLong
        bearWallet,
        battleContract,
        battle.id,
        1 // agentIndex
      );

      // Start agents
      bullAgent.start(entryPrice);
      bearAgent.start(entryPrice);

      // Store agents
      this.agents.set(battle.id, {
        bull: bullAgent,
        bear: bearAgent,
        battleId: battle.id,
      });

      logger.info('Agents started for battle', {
        battleId: battle.id,
        bullWallet,
        bearWallet,
        entryPrice,
      });

    } catch (error) {
      logger.error('Failed to start agents for battle', {
        battleId: battle.id,
        error: error.message,
      });
    }
  }

  /**
   * Stop agents for a battle
   */
  stopAgentsForBattle(battleId) {
    const agents = this.agents.get(battleId);
    if (!agents) return;

    agents.bull?.stop();
    agents.bear?.stop();

    this.agents.delete(battleId);

    logger.info('Agents stopped for battle', { battleId });
  }

  /**
   * Get battle contract instance
   */
  async getBattleContract(battleAddress) {
    if (!this.contractService || !this.contractService.provider) {
      return null;
    }

    // Battle Arena ABI (simplified - just what we need)
    const BATTLE_ARENA_ABI = [
      "function submitProof(bytes32 battleId, uint8 agentIndex, uint256 currentPrice, bytes calldata proof, uint256[] calldata publicInputs) external",
      "function submitProofHash(bytes32 battleId, uint8 agentIndex, uint256 currentPrice, bytes32 proofHash) external",
      "function getBattle(bytes32 battleId) external view returns (tuple(uint8 status, address agentA, address agentB, uint256 initialPrice, uint256 startTime, uint256 endTime, uint256 entryFee, uint256 eliminationThreshold, address winner, uint256 totalBets, uint256 betsOnA, uint256 betsOnB))",
    ];

    try {
      const wallet = this.contractService.wallet || this.contractService.provider;
      return new ethers.Contract(battleAddress, BATTLE_ARENA_ABI, wallet);
    } catch (error) {
      logger.error('Failed to create battle contract', { error: error.message });
      return null;
    }
  }

  /**
   * Get agent status for a battle
   */
  getAgentStatus(battleId) {
    const agents = this.agents.get(battleId);
    if (!agents) return null;

    return {
      bull: agents.bull?.getStatus(),
      bear: agents.bear?.getStatus(),
    };
  }

  /**
   * Get all active agents
   */
  getAllAgents() {
    const result = [];
    for (const [battleId, agents] of this.agents.entries()) {
      result.push({
        battleId,
        bull: agents.bull?.getStatus(),
        bear: agents.bear?.getStatus(),
      });
    }
    return result;
  }

  /**
   * Stop all agents
   */
  stopAll() {
    for (const battleId of this.agents.keys()) {
      this.stopAgentsForBattle(battleId);
    }
  }
}

export default AgentManager;
