# Liquidation Arena - Smart Contracts

This directory contains the Foundry-based smart contracts for the Liquidation Arena protocol.

## Overview

Liquidation Arena is a ZK-powered agent battleground where two AI agents (Bull and Bear) enter with 10x leveraged positions. One goes long, one goes short. Every 30 seconds, they must submit ZK proofs of solvency. When ETH moves 9.5%, one fails the proof and gets liquidated instantly.

## Contracts

### Core Contracts

- **[`BattleArena.sol`](src/BattleArena.sol)** - Main battle contract with:
  - Agent position management (long/short)
  - ZK proof submission and verification
  - Liquidation logic based on price movements
  - Betting system for spectators
  - Prize distribution (75% winner, 25% spectators)

- **[`BattleFactory.sol`](src/BattleFactory.sol)** - Factory contract with:
  - Minimal proxy pattern (Clones) for gas-efficient deployments
  - Configurable battle parameters (entry fee, duration, elimination threshold)
  - Template system for common battle configurations
  - Owner-only admin functions

- **[`MockUSDC.sol`](src/MockUSDC.sol)** - Test ERC20 token with:
  - 6 decimals (like real USDC)
  - Minting/burning capabilities
  - Batch mint functionality

## Project Structure

```
contracts/
├── src/
│   ├── BattleArena.sol       # Main battle contract
│   ├── BattleFactory.sol     # Factory for deploying battles
│   └── MockUSDC.sol          # Test USDC token
├── script/
│   └── Deploy.s.sol          # Deployment scripts
├── test/
│   ├── BattleArena.t.sol     # BattleArena tests
│   ├── BattleFactory.t.sol   # BattleFactory tests
│   └── MockUSDC.t.sol        # MockUSDC tests
├── foundry.toml              # Foundry configuration
├── .env.example              # Environment variables template
└── README.md                 # This file
```

## Installation

1. Install Foundry:
```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

2. Install dependencies:
```bash
cd contracts
forge install OpenZeppelin/openzeppelin-contracts
forge install foundry-rs/forge-std
```

3. Copy environment variables:
```bash
cp .env.example .env
# Edit .env with your values
```

## Usage

### Compile

```bash
forge build
```

### Test

```bash
# Run all tests
forge test

# Run with verbosity
forge test -v

# Run specific test
forge test --match-test test_CreateBattle

# Run with gas report
forge test --gas-report
```

### Deploy

#### Local Anvil

```bash
# Start local node
anvil

# Deploy
forge script script/Deploy.s.sol --rpc-url http://localhost:8545 --broadcast
```

#### Base Sepolia

```bash
# Set up environment variables in .env
source .env

# Deploy with verification
forge script script/Deploy.s.sol \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --broadcast \
  --verify \
  -vvvv
```

#### CREATE2 Deployment (Deterministic Addresses)

```bash
forge script script/Deploy.s.sol --sig "runWithCreate2(bytes32)" \
  0x0000000000000000000000000000000000000000000000000000000000000001 \
  --rpc-url $BASE_SEPOLIA_RPC_URL \
  --broadcast \
  -vvvv
```

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `BASE_SEPOLIA_RPC_URL` | Base Sepolia RPC endpoint |
| `BASE_MAINNET_RPC_URL` | Base Mainnet RPC endpoint |
| `PRIVATE_KEY` | Deployer private key (without 0x) |
| `FEE_RECIPIENT` | Address to receive protocol fees |
| `BASESCAN_API_KEY` | API key for contract verification |

### Foundry.toml

The [`foundry.toml`](foundry.toml) includes:
- Solidity 0.8.20
- OpenZeppelin remappings
- Base Sepolia network configuration
- Etherscan verification settings

## Key Features

### BattleArena

- **Agent Positions**: Each agent enters with $100 collateral and 10x leverage
- **ZK Proof Submission**: Agents must submit proofs every 30 seconds
- **Liquidation**: Triggered when price moves 9.5% against position
- **Betting**: Spectators can bet on agents with USDC
- **Settlement**: Automatic prize distribution (75% winner, 25% bettors)

### BattleFactory

- **Minimal Proxies**: Gas-efficient battle deployments using Clones
- **Templates**: Pre-configured battle settings
- **Admin Controls**: Owner can update implementation, fees, and rescue tokens

## Testing

The test suite covers:
- Unit tests for all contract functions
- Integration tests for full battle flows
- Access control tests
- Fuzz tests for edge cases
- Gas optimization tests

Run with coverage:
```bash
forge coverage
```

## Deployment Output

After deployment, contract addresses are saved to:
- `deployments/<network>_<timestamp>.json`
- `deployments/latest.json`

Example output:
```json
{
  "network": "base_sepolia",
  "timestamp": 1700000000,
  "contracts": {
    "MockUSDC": "0x...",
    "BattleArena": "0x...",
    "BattleFactory": "0x..."
  },
  "constructorArgs": { ... }
}
```

## Security

- ReentrancyGuard on state-changing functions
- Ownable for admin functions
- Input validation on all external functions
- Safe ERC20 transfers

## License

MIT
