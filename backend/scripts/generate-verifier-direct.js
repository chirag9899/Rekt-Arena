#!/usr/bin/env node
/**
 * Direct Verifier Generation Attempt
 * 
 * This script tries to use the backend's verification key
 * and manually construct or find a way to generate the Solidity verifier
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { BarretenbergBackend } from '@noir-lang/backend_barretenberg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PROJECT_ROOT = join(__dirname, '../..');
const CIRCUIT_JSON = join(PROJECT_ROOT, 'circuits/solvency/target/solvency.json');
const OUTPUT_VERIFIER = join(PROJECT_ROOT, 'contracts/src/SolvencyVerifierGenerated.sol');

console.log('🔧 Direct Verifier Generation Attempt\n');

if (!existsSync(CIRCUIT_JSON)) {
  console.error('❌ Circuit not compiled!');
  process.exit(1);
}

const circuit = JSON.parse(readFileSync(CIRCUIT_JSON, 'utf-8'));
const backend = new BarretenbergBackend(circuit);

try {
  // Initialize backend
  await backend.instantiate();
  
  // Get verification key
  console.log('Getting verification key...');
  const vk = await backend.getVerificationKey();
  console.log('✅ VK obtained:', vk.length, 'bytes');
  
  // Check if we can access the underlying API
  const api = backend.api;
  if (api) {
    console.log('\nChecking API methods...');
    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(api));
    const verifierMethods = methods.filter(m => 
      m.toLowerCase().includes('verif') || 
      m.toLowerCase().includes('solidity') ||
      m.toLowerCase().includes('write')
    );
    console.log('Verifier-related methods:', verifierMethods.join(', ') || 'none found');
  }
  
  // Unfortunately, the WASM backend doesn't expose verifier generation
  // We need the native bb CLI tool
  console.log('\n❌ Verifier generation requires the native Barretenberg CLI (bb)');
  console.log('\n📋 The verification key has been obtained, but to generate');
  console.log('   the Solidity contract, you need:');
  console.log('\n   1. Install bb CLI (see instructions below)');
  console.log('   2. Save VK:');
  console.log('      Write the VK bytes to: circuits/solvency/target/vk');
  console.log('   3. Generate verifier:');
  console.log('      bb write_solidity_verifier -k ./target/vk -o ./target/Verifier.sol');
  
  console.log('\n📖 Installation options:');
  console.log('   - Check: https://barretenberg.aztec.network/');
  console.log('   - Build from source (requires Rust):');
  console.log('     git clone https://github.com/noir-lang/barretenberg.git');
  console.log('     cd barretenberg && cargo build --release --bin bb');
  
  await backend.destroy();
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  await backend.destroy();
  process.exit(1);
}
