#!/usr/bin/env node
/**
 * Check if the Noir circuit is compiled
 * Usage: node scripts/check-circuit.js
 */

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import config from '../src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use the circuit path from config (already resolved)
const circuitPath = config.noir.circuitPath;

console.log('🔍 Checking ZK Circuit Status...\n');
console.log(`Expected path: ${circuitPath}`);

if (existsSync(circuitPath)) {
  try {
    const circuit = JSON.parse(readFileSync(circuitPath, 'utf-8'));
    console.log('✅ Circuit is compiled and ready!');
    console.log(`   Circuit name: ${circuit.name || 'Unknown'}`);
    console.log(`   Backend can use real ZK proofs\n`);
    process.exit(0);
  } catch (error) {
    console.log('❌ Circuit file exists but is invalid JSON');
    console.log(`   Error: ${error.message}\n`);
    process.exit(1);
  }
} else {
  console.log('❌ Circuit is NOT compiled');
  console.log('\n📝 To compile the circuit:');
  console.log('   1. Install nargo: curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash');
  console.log('   2. Navigate to: cd circuits/solvency');
  console.log('   3. Compile: nargo compile');
  console.log('\n⚠️  Backend is currently using FALLBACK MODE (deterministic hashes, not real ZK proofs)\n');
  process.exit(1);
}
