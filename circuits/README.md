# Noir Circuit Setup

This directory contains the ZK circuit for proving agent solvency.

## Circuit Overview

The `solvency` circuit proves that an agent has sufficient collateral to maintain their leveraged position. It verifies:
- Equity (collateral + PnL) >= Maintenance Margin
- Position is solvent (not liquidated)

## Prerequisites

Install Noir (Nargo):
```bash
# Install nargo (Noir package manager)
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
source ~/.bashrc  # or ~/.zshrc
noirup
```

Or follow official instructions: https://noir-lang.org/getting_started/nargo_installation

## Compiling the Circuit

1. Navigate to the circuit directory:
```bash
cd circuits/solvency
```

2. Compile the circuit:
```bash
nargo compile
```

This will generate:
- `target/solvency.json` - Compiled circuit (needed by backend)
- `target/solvency.sol` - Solidity verifier contract (optional)

3. Verify compilation:
```bash
ls -la target/
# Should see solvency.json
```

## Testing the Circuit

Run the circuit tests:
```bash
nargo test
```

This will run the test cases defined in `src/main.nr`:
- `test_long_solvency` - Bull position remains solvent
- `test_short_solvency` - Bear position remains solvent  
- `test_long_insolvency` - Bull gets liquidated (should fail)
- `test_short_insolvency` - Bear gets liquidated (should fail)

## Backend Integration

The backend's `ProverService` (`backend/src/services/prover.js`) looks for the compiled circuit at:
```
../circuits/solvency/target/solvency.json
```

If the circuit is not found, the backend will use **fallback mode** (deterministic hash-based proofs) instead of real ZK proofs.

## Current Status

⚠️ **Circuit is NOT compiled** - The backend is currently using fallback mode.

To enable real ZK proofs:
1. Install nargo (see Prerequisites above)
2. Run `nargo compile` in `circuits/solvency/`
3. Restart the backend

## Fallback Mode

When the circuit is not available, agents use deterministic proof hashes:
```javascript
proofHash = keccak256(agentId + battleId + price + collateral + leverage)
```

This is **NOT a real ZK proof** but allows the system to function without the circuit.

## Circuit Inputs

**Private inputs** (hidden):
- `collateral` - Agent's collateral amount
- `position_size` - Collateral × leverage
- `entry_price` - Entry price of the position

**Public inputs** (visible):
- `current_price` - Current ETH price
- `is_long` - 1 for long (Bull), 0 for short (Bear)
- `maintenance_percent` - Maintenance margin % (default: 5)

## Circuit Output

Returns a Pedersen hash commitment that can be verified on-chain.
