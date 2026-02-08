import { createThirdwebClient, getContract } from "thirdweb";

// Initialize Thirdweb client
const clientId = import.meta.env.VITE_THIRDWEB_CLIENT_ID;

if (!clientId) {
  console.warn('VITE_THIRDWEB_CLIENT_ID not set. Using demo mode.');
}

export const client = createThirdwebClient({
  clientId: clientId || "demo",
});

// Polygon Amoy Testnet configuration
export const polygonAmoy = {
  id: 80002,
  name: 'Polygon Amoy',
  nativeCurrency: { name: 'MATIC', symbol: 'MATIC', decimals: 18 },
  rpc: import.meta.env.VITE_RPC_URL || 'https://rpc-amoy.polygon.technology',
  blockExplorers: [
    { name: 'PolygonScan', url: 'https://amoy.polygonscan.com' }
  ],
  testnet: true,
};

export const chain = polygonAmoy;

// Contract addresses from environment
export const CONTRACTS = {
  battleFactory: import.meta.env.VITE_BATTLE_FACTORY || "",
  battleArena: import.meta.env.VITE_BATTLE_ARENA || "",
  usdc: import.meta.env.VITE_MOCK_USDC || "",
};

// USDC ABI (minimal for balance and approval)
export const ERC20_ABI = [
  {
    "inputs": [{"internalType": "address", "name": "account", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "spender", "type": "address"}, {"internalType": "uint256", "name": "amount", "type": "uint256"}],
    "name": "approve",
    "outputs": [{"internalType": "bool", "name": "", "type": "bool"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "address", "name": "owner", "type": "address"}, {"internalType": "address", "name": "spender", "type": "address"}],
    "name": "allowance",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "decimals",
    "outputs": [{"internalType": "uint8", "name": "", "type": "uint8"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "symbol",
    "outputs": [{"internalType": "string", "name": "", "type": "string"}],
    "stateMutability": "view",
    "type": "function"
  }
];

// BattleFactory ABI (from deployed contract)
export const BATTLE_FACTORY_ABI = [
  {
    "inputs": [{"internalType": "address", "name": "_usdc", "type": "address"}, {"internalType": "address", "name": "_arena", "type": "address"}],
    "stateMutability": "nonpayable",
    "type": "constructor"
  },
  // Error definitions
  {
    "inputs": [],
    "name": "InvalidImplementation",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidFeeRecipient",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidUSDC",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidParameters",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "DeploymentFailed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BattleNotFound",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotBattleOwner",
    "type": "error"
  },
  // BattleArena errors (all custom errors from BattleArena.sol)
  {
    "inputs": [],
    "name": "BattleAlreadyExists",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BattleNotFound",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BattleAlreadySettled",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BattleNotEnded",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidAgent",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidCollateral",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidPrice",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InvalidProof",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "AgentAlreadyLiquidated",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "NotAgent",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ProofTimeout",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "ProofTooEarly",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BettingClosed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "InsufficientBet",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "BattleInProgress",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "TransferFailed",
    "type": "error"
  },
  {
    "inputs": [],
    "name": "PrizeDistributionFailed",
    "type": "error"
  },
  // BattleArena functions
  {
    "inputs": [{"internalType": "bytes32", "name": "battleId", "type": "bytes32"}, {"internalType": "uint8", "name": "agentIndex", "type": "uint8"}, {"internalType": "uint256", "name": "amount", "type": "uint256"}],
    "name": "placeBet",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "bool", "name": "isBull", "type": "bool"}, {"internalType": "uint256", "name": "stake", "type": "uint256"}],
    "name": "createSecondaryLobby",
    "outputs": [{"internalType": "bytes32", "name": "battleId", "type": "bytes32"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "bytes32", "name": "battleId", "type": "bytes32"}, {"internalType": "bool", "name": "isBull", "type": "bool"}],
    "name": "joinSecondaryLobby",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "bytes32", "name": "battleId", "type": "bytes32"}],
    "name": "cancelLobby",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "createPrimaryBattle",
    "outputs": [{"internalType": "bytes32", "name": "battleId", "type": "bytes32"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "bytes32", "name": "battleId", "type": "bytes32"}, {"internalType": "bool", "name": "bullWon", "type": "bool"}],
    "name": "settleBattle",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"internalType": "bytes32", "name": "battleId", "type": "bytes32"}],
    "name": "getBattle",
    "outputs": [
      {"components": [
        {"internalType": "uint8", "name": "tier", "type": "uint8"},
        {"internalType": "uint8", "name": "status", "type": "uint8"},
        {"components": [
          {"internalType": "address", "name": "sponsor", "type": "address"},
          {"internalType": "uint256", "name": "stake", "type": "uint256"},
          {"internalType": "bool", "name": "isLong", "type": "bool"},
          {"internalType": "uint256", "name": "leverage", "type": "uint256"},
          {"internalType": "uint256", "name": "entryPrice", "type": "uint256"},
          {"internalType": "bool", "name": "alive", "type": "bool"},
          {"internalType": "uint256", "name": "lastProofTime", "type": "uint256"}
        ], "internalType": "struct BattleFactory.Agent", "name": "bull", "type": "tuple"},
        {"components": [
          {"internalType": "address", "name": "sponsor", "type": "address"},
          {"internalType": "uint256", "name": "stake", "type": "uint256"},
          {"internalType": "bool", "name": "isLong", "type": "bool"},
          {"internalType": "uint256", "name": "leverage", "type": "uint256"},
          {"internalType": "uint256", "name": "entryPrice", "type": "uint256"},
          {"internalType": "bool", "name": "alive", "type": "bool"},
          {"internalType": "uint256", "name": "lastProofTime", "type": "uint256"}
        ], "internalType": "struct BattleFactory.Agent", "name": "bear", "type": "tuple"},
        {"internalType": "uint256", "name": "startTime", "type": "uint256"},
        {"internalType": "uint256", "name": "endTime", "type": "uint256"},
        {"internalType": "uint256", "name": "totalPool", "type": "uint256"},
        {"internalType": "uint256", "name": "createdAt", "type": "uint256"},
        {"internalType": "bytes32", "name": "battleId", "type": "bytes32"},
        {"internalType": "bool", "name": "bullWon", "type": "bool"}
      ], "internalType": "struct BattleFactory.Battle", "name": "", "type": "tuple"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getBattleCount",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getActiveBattles",
    "outputs": [{"internalType": "bytes32[]", "name": "", "type": "bytes32[]"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getWaitingLobbies",
    "outputs": [{"internalType": "bytes32[]", "name": "", "type": "bytes32[]"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getCurrentPrimary",
    "outputs": [{"internalType": "bytes32", "name": "", "type": "bytes32"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "currentEthPrice",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
];

// Get BattleFactory contract instance
export function getBattleFactoryContract() {
  return getContract({
    client,
    chain,
    address: CONTRACTS.battleFactory,
  });
}

// Get USDC contract instance
export function getUSDCContract() {
  return getContract({
    client,
    chain,
    address: CONTRACTS.usdc,
  });
}
