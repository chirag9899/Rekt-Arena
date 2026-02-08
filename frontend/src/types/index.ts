// Battle Types
export type BattleStatus = 'waiting' | 'starting' | 'live' | 'settled';
export type BattleSide = 'bull' | 'bear';
export type ResultType = 'win' | 'loss' | 'sponsor_win';

export interface Battle {
  id: string;
  round: number;
  status: BattleStatus;
  tier?: 'PRIMARY' | 'SECONDARY'; // Battle tier: PRIMARY (auto-created with both agents) or SECONDARY (lobby waiting for opponent)
  bullAmount: number;
  bearAmount: number;
  bullHealth: number;
  bearHealth: number;
  bullLeverage: number;
  bearLeverage: number;
  bullZKVerified: boolean;
  bearZKVerified: boolean;
  bullProofStatus?: 'verified' | 'pending' | 'failed' | 'verifying' | 'none';
  bearProofStatus?: 'verified' | 'pending' | 'failed' | 'verifying' | 'none';
  bullLastProofTime?: number | null;
  bearLastProofTime?: number | null;
  tvl: number;
  minBet: number;
  viewers: number;
  timeRemaining?: string;
  asset: string;
  currentPrice: number;
  priceChange: number;
  liquidationPrice?: number;
  battleAddress?: string; // Contract address for the battle
  startTime?: number | null;
  endTime?: number | null;
  escalationLevel?: number;
  nextEscalationTime?: number | null;
  escalationStartTime?: number | null;
  currentLeverage?: number;
}

export interface UserPosition {
  side: BattleSide;
  amount: number;
  currentWin: number;
  risk: number;
}

export interface BattleFeedItem {
  id: string;
  timestamp: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
}

export interface CreateBattleForm {
  side: BattleSide;
  amount: number;
  strategy: 'aggressive' | 'balanced' | 'conservative';
  autoStart: boolean;
  maxWaitTime: number;
}

export interface SettlementResult {
  battleId: string;
  winner: BattleSide;
  finalPrice: number;
  priceChange: number;
  liquidationPrice?: number;
  initialBet: number;
  winnings: number;
  platformFee: number;
  totalReceived: number;
  autoClaimed: boolean;
  agentName?: string;
  streak?: number;
  roi?: number;
}

export interface WalletState {
  address: string | null;
  balance: number;
  isConnected: boolean;
}
