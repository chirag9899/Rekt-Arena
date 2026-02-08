# Rekt Arena

**ZK-powered agent battleground** - Where AI traders fight to survive liquidation on-chain with gasless betting via Yellow state channels.

## 🎮 Overview

Rekt Arena is a decentralized battleground where two AI agents (BULL and BEAR) enter with leverage and fight to survive. Users bet on the survivor via **Yellow SDK** state channels—gasless, instant, settling on Polygon Amoy.

### The Battle

- **PRIMARY Battles**: Auto-created every 4 minutes with system agents
- **SECONDARY Battles**: User-created markets
- **Leverage Escalation**: 5x → 10x → 25x → 50x (every 60 seconds)
- **Auto-Liquidation**: Battles auto-settle after 4 minutes
- **ZK Solvency Proofs**: Agents must prove solvency every 10 seconds

## 🏗️ Architecture

```
┌─────────────────────────────────────┐
│   SMART CONTRACTS (Polygon Amoy)    │
│   - BattleFactory                   │
│   - BattleArena                     │
│   - SolvencyVerifier                │
│   ✅ Create battles                 │
│   ✅ Hold funds                     │
│   ✅ Settle outcomes                │
│   ✅ Source of truth                │
└─────────────────────────────────────┘
              ↑
              │ Settles on-chain
              │
┌─────────────────────────────────────┐
│   YELLOW SDK (ERC-7824/Nitrolite)   │
│   💛 Gasless betting               │
│   💛 Off-chain state channels      │
│   💛 Instant updates                │
│   💛 Better UX                      │
└─────────────────────────────────────┘
              ↑
              │ WebSocket
              │
┌─────────────────────────────────────┐
│   BACKEND (Node.js)                 │
│   - Agent Controller                │
│   - ZK Proof Generation             │
│   - Battle Settlement               │
│   - Yellow Service                  │
└─────────────────────────────────────┘
              ↑
              │ WebSocket
              │
┌─────────────────────────────────────┐
│   FRONTEND (React + Vite)           │
│   - Real-time battle arena          │
│   - Gasless betting UI              │
│   - Battle history                  │
└─────────────────────────────────────┘
```

## 💛 Yellow SDK Integration

Rekt Arena uses **Yellow SDK (ERC-7824/Nitrolite)** for gasless betting via state channels:

### How It Works

1. **Battle Creation** → **ON-CHAIN (Contract)**
   - Battles created via `BattleFactory` on Polygon Amoy
   - Contract is the source of truth

2. **Betting** → **YELLOW SDK (Gasless)**
   - Users bet via Yellow state channels (no gas fees)
   - Updates happen off-chain (instant)
   - Better UX with zero transaction costs

3. **Settlement** → **ON-CHAIN (Contract)**
   - When battle ends, Yellow settles on-chain
   - Final state written to contract
   - Winners get paid from contract

### Yellow Features

- ✅ **Gasless Betting**: No transaction fees for users
- ✅ **Instant Updates**: Real-time state channel updates
- ✅ **State Channels**: Off-chain interactions with on-chain settlement
- ✅ **ERC-7824 Compliant**: Standard state channel protocol

## 🔐 ZK Proof System

### Noir Circuits

- **Solvency Verification**: Proves agents have sufficient collateral
- **Equity Check**: Enforces equity >= maintenance margin (5%)
- **Position Validation**: Verifies position is solvent at current price

### Proof Flow

1. Agent calculates current health based on price movement
2. Generates ZK proof using Noir circuit
3. Submits proof to contract every 10 seconds
4. Contract verifies proof (or liquidates if proof fails)

## 🚀 Tech Stack

### Smart Contracts
- **Solidity** (Foundry)
- **Polygon Amoy** testnet
- **ERC20** (MockUSDC for testing)

### ZK Proofs
- **Noir** (ZK circuit language)
- **Barretenberg** (proof generation backend)

### Backend
- **Node.js** (Express)
- **WebSocket** (real-time updates)
- **MongoDB** (battle history)
- **Yellow SDK** (`@erc7824/nitrolite`)

### Frontend
- **React** + **TypeScript**
- **Vite** (build tool)
- **Tailwind CSS** (styling)
- **Wagmi** (wallet integration)

## 📁 Project Structure

```
rekt-arena/
├── contracts/              # Solidity smart contracts
│   ├── src/
│   │   ├── BattleFactory.sol
│   │   ├── BattleArena.sol
│   │   ├── SolvencyVerifier.sol
│   │   └── MockUSDC.sol
│   └── script/
│       └── Deploy.s.sol
│
├── circuits/               # Noir ZK circuits
│   └── solvency/
│       └── src/
│           └── main.nr
│
├── backend/                # Node.js backend
│   ├── src/
│   │   ├── services/
│   │   │   ├── yellow.js      # Yellow SDK integration
│   │   │   ├── battleSettlement.js
│   │   │   └── primaryBattle.js
│   │   ├── state.mjs
│   │   └── server.mjs
│   └── package.json
│
└── frontend/               # React frontend
    ├── src/
    │   ├── components/
    │   ├── hooks/
    │   └── App.tsx
    └── package.json
```

## 🎯 Key Features

### Battle System
- ✅ **PRIMARY Battles**: Auto-created every 4 minutes
- ✅ **SECONDARY Battles**: User-created markets
- ✅ **Leverage Escalation**: Dynamic leverage increases (5x → 50x)
- ✅ **Auto-Liquidation**: Automatic settlement after 4 minutes
- ✅ **Health Tracking**: Real-time PnL calculation

### Betting & Settlement
- ✅ **Gasless Betting**: Via Yellow state channels
- ✅ **Real-time Updates**: WebSocket connections
- ✅ **Automatic Settlement**: On battle end
- ✅ **Payout Calculation**: Winner takes 75%, spectators 25%

### Frontend
- ✅ **Real-time Arena**: Live battle visualization
- ✅ **Health Bars**: Agent health tracking
- ✅ **Battle History**: PRIMARY & SECONDARY tabs
- ✅ **Transaction History**: PolygonScan integration
- ✅ **My Bets**: Win/loss tracking

## 🚀 Quick Start

### Prerequisites

- Node.js 18+
- Foundry (for contracts)
- MongoDB (for battle history)
- Polygon Amoy testnet access

### 1. Smart Contracts

```bash
cd contracts

# Install dependencies
forge install

# Run tests
forge test

# Deploy to Polygon Amoy
forge script script/Deploy.s.sol --rpc-url polygon_amoy --broadcast
```

### 2. Backend

```bash
cd backend

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env
# Edit .env with your configuration

# Start server
npm run dev
```

### 3. Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start development server
npm run dev
```

## 📊 Battle Parameters

| Parameter | Value |
|-----------|-------|
| Collateral | 100 USDC |
| Initial Leverage | 5x |
| Max Leverage | 50x |
| Escalation Interval | 60 seconds |
| Battle Duration | 4 minutes |
| Proof Interval | 10 seconds |
| Maintenance Margin | 5% |
| Winner Prize | 75% of pool |
| Spectator Prize | 25% of pool |

## 🔒 Security

- ✅ **ReentrancyGuard**: All external functions protected
- ✅ **ZK Proofs**: Solvency verified off-chain
- ✅ **State Channels**: Front-running prevention
- ✅ **On-chain Settlement**: Final state always on-chain

## 🏆 Hackathon Tracks

### Yellow Network Prize
- ✅ State channels for gasless betting
- ✅ Real-time streaming bets
- ✅ Polygon Amoy settlement
- ✅ Nitrolite integration pattern

### ZK Prize
- ✅ Noir circuits for solvency proofs
- ✅ Off-chain proof generation
- ✅ On-chain verification interface

## 📜 License

MIT License - See LICENSE file

## 🤝 Credits

Built for ETHGlobal hackathon.

**Powered by:**
- 💛 **Yellow Network** (state channels)
- 🔷 **Polygon** (settlement layer)
- 🔐 **Noir** (ZK proofs)
- ⚒️ **Foundry** (smart contract development)
