import { Noir } from '@noir-lang/noir_js';
import { BarretenbergBackend } from '@noir-lang/backend_barretenberg';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import logger from '../utils/logger.js';
import config from '../config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * ZK Prover Service
 * Generates ZK proofs of solvency using Noir
 */
class ProverService {
  constructor() {
    this.noir = null;
    this.backend = null;
    this.initialized = false;
  }

  /**
   * Initialize the prover with the circuit
   */
  async initialize() {
    if (this.initialized) return;
    
    try {
      logger.info('Initializing ZK Prover Service');
      
      // Read circuit file
      const circuitPath = join(__dirname, '../../', config.noir.circuitPath);
      
      // Check if circuit file exists
      try {
      const circuit = JSON.parse(readFileSync(circuitPath, 'utf-8'));
      
      // Initialize backend and Noir
      this.backend = new BarretenbergBackend(circuit);
      this.noir = new Noir(circuit, this.backend);
      
      this.initialized = true;
      logger.info('ZK Prover Service initialized successfully');
      } catch (fileError) {
        // Circuit file not found or not compiled - use fallback mode
        logger.warn('⚠️ ZK Circuit not compiled - using fallback mode (deterministic hashes)', {
          path: circuitPath,
          error: fileError.message,
          note: 'To enable real ZK proofs, compile the circuit: cd circuits/solvency && nargo compile',
        });
        this.initialized = false;
        this.fallbackMode = true;
      }
    } catch (error) {
      logger.error('Failed to initialize ZK Prover Service', {
        error: error.message,
      });
      this.fallbackMode = true;
      // Don't throw - allow fallback mode
    }
  }

  /**
   * Generate a ZK proof of solvency
   * @param {Object} agentState - Agent's current state
   * @param {number} currentPrice - Current ETH price (8 decimals)
   * @returns {Promise<Uint8Array>} - ZK proof
   */
  async generateSolvencyProof(agentState, currentPrice) {
    if (!this.initialized && !this.fallbackMode) {
      await this.initialize();
    }

    // If in fallback mode or initialization failed, throw to trigger fallback
    if (this.fallbackMode || !this.initialized) {
      throw new Error('Prover service not available, using fallback');
    }

    try {
      // Calculate excess (equity - maintenance) to pass as public input
      // This allows the circuit to verify solvency
      const positionSize = agentState.collateral * agentState.leverage;
      const priceDiff = agentState.isLong 
        ? (currentPrice - agentState.entryPrice)
        : (agentState.entryPrice - currentPrice);
      const pnl = Math.floor((positionSize * priceDiff) / agentState.entryPrice);
      const equity = agentState.collateral + pnl;
      const maintenance = Math.floor((positionSize * 5) / 100); // 5% maintenance
      const excess = equity - maintenance;
      
      // If excess is negative, the agent is insolvent - circuit will fail
      // But we still try to generate proof so circuit can enforce it
      
      // Prepare inputs for the circuit
      // Note: Circuit expects Field values (integers)
      const input = {
        collateral: agentState.collateral.toString(),
        position_size: positionSize.toString(),
        entry_price: agentState.entryPrice.toString(),
        current_price: currentPrice.toString(),
        is_long: agentState.isLong ? '1' : '0',
        maintenance_percent: '5',
        excess: excess.toString(), // Public input - circuit will verify this matches calculated excess
      };

      logger.debug('Generating ZK proof', {
        agentId: agentState.agentId,
        input: {
          collateral: input.collateral,
          position_size: input.position_size,
          current_price: input.current_price,
          is_long: input.is_long,
        },
      });

      // Generate witness first, then proof
      // Noir.js API: execute() generates witness, then backend.generateProof() creates proof
      const witness = await this.noir.execute(input);
      
      // Generate proof from witness using backend
      const proofData = await this.backend.generateProof(witness);
      
      // Extract proof and public inputs from proofData
      // proofData structure: { proof: Uint8Array, publicInputs: Uint8Array[] }
      const proof = proofData.proof;
      
      // Public inputs are already in the witness, extract them
      // The circuit has 4 public inputs: [current_price, is_long, maintenance_percent, excess]
      const publicInputs = [
        currentPrice.toString(),           // current_price
        agentState.isLong ? '1' : '0',     // is_long
        '5',                                 // maintenance_percent
        excess.toString()                    // excess (equity - maintenance)
      ];
      
      logger.info('ZK proof generated successfully', {
        agentId: agentState.agentId,
        proofLength: proof.length,
        publicInputsCount: publicInputs.length,
      });

      // Return both proof and public inputs
      return {
        proof,
        publicInputs
      };
    } catch (error) {
      logger.error('Failed to generate ZK proof', {
        agentId: agentState.agentId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Verify a ZK proof
   * @param {string} proof - The proof to verify
   * @param {Object} publicInputs - Public inputs used in the proof
   * @returns {Promise<boolean>} - Whether the proof is valid
   */
  async verifyProof(proof, publicInputs) {
    if (!this.initialized) {
      await this.initialize();
    }

    if (!this.initialized || !this.backend) {
      logger.warn('Prover not initialized, cannot verify proof');
      return false;
    }

    try {
      // Use backend's verify method
      // publicInputs should be Uint8Array[] format
      const publicInputsBytes = publicInputs.map(pi => {
        // Convert string to Uint8Array (32 bytes for each field)
        const num = BigInt(pi);
        const bytes = new Uint8Array(32);
        // Convert bigint to bytes (little-endian)
        let temp = num;
        for (let i = 0; i < 32 && temp > 0n; i++) {
          bytes[i] = Number(temp & 0xffn);
          temp = temp >> 8n;
        }
        return bytes;
      });
      
      const isValid = await this.backend.verify(proof, publicInputsBytes);
      
      logger.debug('Proof verification result', {
        isValid,
      });

      return isValid;
    } catch (error) {
      logger.error('Proof verification failed', {
        error: error.message,
      });
      return false;
    }
  }

  /**
   * Destroy the prover and free resources
   */
  async destroy() {
    if (this.backend) {
      await this.backend.destroy();
      this.backend = null;
      this.noir = null;
      this.initialized = false;
      logger.info('ZK Prover Service destroyed');
    }
  }
}

// Export singleton instance
export default new ProverService();
