import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../.env') });

export const config = {
  server: {
    port: parseInt(process.env.PORT || '3001'),
    env: process.env.NODE_ENV || 'development',
  },
  
  blockchain: {
    rpcUrl: process.env.RPC_URL || 'https://sepolia.base.org',
    chainId: parseInt(process.env.CHAIN_ID || '84532'),
    privateKey: process.env.PRIVATE_KEY,
  },
  
  contracts: {
    battleArena: process.env.BATTLE_ARENA_ADDRESS,
    usdc: process.env.USDC_ADDRESS,
  },
  
  priceFeed: {
    url: process.env.PRICE_FEED_URL || 'https://api.coingecko.com/api/v3/simple/price',
    pollInterval: parseInt(process.env.ETH_PRICE_POLL_INTERVAL || '30000'), // 30 seconds to avoid rate limits
    // Default market is ETH; can be overridden via env for BTC, SOL, etc.
    assetId: process.env.PRICE_FEED_ASSET_ID || 'ethereum',      // CoinGecko asset id
    symbol: process.env.PRICE_FEED_SYMBOL || 'ETH',              // Ticker symbol
    pairLabel: process.env.PRICE_FEED_PAIR_LABEL || 'ETH-PERP',  // UI label for the market
  },
  
  agent: {
    proofInterval: parseInt(process.env.AGENT_PROOF_INTERVAL || '30000'),
    leverage: parseInt(process.env.AGENT_LEVERAGE || '10'),
    collateral: parseInt(process.env.AGENT_COLLATERAL || '100000000'), // $100 USDC
  },
  
  yellow: {
    nodeUrl: process.env.YELLOW_NODE_URL,
    apiKey: process.env.YELLOW_API_KEY,
  },
  
  noir: {
    circuitPath: process.env.NOIR_CIRCUIT_PATH || join(__dirname, '../../circuits/solvency/target/solvency.json'),
  },
  
  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

export default config;
