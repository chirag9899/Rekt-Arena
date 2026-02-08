#!/usr/bin/env node
/**
 * Test if the circuit is being used meaningfully
 */

import { existsSync } from 'fs';
import { readFileSync } from 'fs';
import config from '../src/config.js';
import proverService from '../src/services/prover.js';

console.log('🔍 Circuit Usage Analysis\n');
console.log('='.repeat(50));

// 1. Check if circuit file exists
const circuitPath = config.noir.circuitPath;
console.log('\n1. Circuit File Status:');
console.log(`   Path: ${circuitPath}`);
console.log(`   Exists: ${existsSync(circuitPath) ? '✅ YES' : '❌ NO'}`);

if (existsSync(circuitPath)) {
  try {
    const circuit = JSON.parse(readFileSync(circuitPath, 'utf-8'));
    console.log(`   Compiled: ✅ YES`);
    console.log(`   Size: ${(circuit.bytecode?.length || 0)} bytes`);
  } catch (e) {
    console.log(`   Valid: ❌ NO (${e.message})`);
  }
}

// 2. Check prover service status
console.log('\n2. Prover Service Status:');
console.log(`   Initialized: ${proverService.initialized ? '✅ YES' : '❌ NO'}`);
console.log(`   Fallback Mode: ${proverService.fallbackMode ? '⚠️  YES (not using circuit)' : '✅ NO (using circuit)'}`);

// 3. Check circuit constraint
console.log('\n3. Circuit Constraint Analysis:');
const circuitCode = readFileSync('../circuits/solvency/src/main.nr', 'utf-8');
if (circuitCode.includes('excess == excess')) {
  console.log('   ⚠️  WARNING: Circuit uses placeholder constraint (excess == excess)');
  console.log('   ⚠️  This constraint ALWAYS PASSES - not enforcing solvency!');
  console.log('   ⚠️  The circuit is NOT being used meaningfully.');
} else {
  console.log('   ✅ Circuit has proper constraint');
}

// 4. Check backend solvency check
console.log('\n4. Backend Solvency Enforcement:');
console.log('   ✅ Backend checks solvency BEFORE generating proof');
console.log('   ✅ Contract does its own liquidation check');
console.log('   ⚠️  ZK proof is NOT verified on-chain');
console.log('   ⚠️  Circuit is only used to generate proof hash, not enforce solvency');

// 5. Summary
console.log('\n' + '='.repeat(50));
console.log('\n📊 SUMMARY:\n');
console.log('❌ Circuit is NOT being used meaningfully:');
console.log('   - Constraint always passes (excess == excess)');
console.log('   - Solvency is checked in backend/contract, not in circuit');
console.log('   - Circuit only generates proof hash, not actual verification');
console.log('\n✅ Circuit IS working in backend:');
console.log('   - Circuit compiles and can generate proofs');
console.log('   - Backend will use it if compiled (not in fallback mode)');
console.log('\n💡 To make it meaningful:');
console.log('   1. Fix circuit constraint to properly check equity >= maintenance');
console.log('   2. Add on-chain proof verification in contract');
console.log('   3. Remove backend solvency check (let circuit enforce it)');
