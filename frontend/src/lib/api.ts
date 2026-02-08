/**
 * API Client for Liquidation Arena Backend
 * Handles all HTTP requests to the backend API with retry logic and error handling
 */

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

interface RetryOptions {
  maxRetries?: number;
  retryDelay?: number;
  retryableStatuses?: number[];
}

class ApiClient {
  private baseUrl: string;
  private defaultRetryOptions: RetryOptions = {
    maxRetries: 3,
    retryDelay: 1000, // 1 second
    retryableStatuses: [408, 429, 500, 502, 503, 504], // Timeout, rate limit, server errors
  };

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private isRetryableError(error: any, status?: number): boolean {
    // Network errors (no response)
    if (!status && (error instanceof TypeError || error.message?.includes('fetch'))) {
      return true;
    }
    // HTTP status codes that are retryable
    return status ? this.defaultRetryOptions.retryableStatuses!.includes(status) : false;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    retryOptions?: RetryOptions
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const retry = { ...this.defaultRetryOptions, ...retryOptions };
    let lastError: any;
    
    for (let attempt = 0; attempt <= retry.maxRetries!; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
          signal: AbortSignal.timeout(30000), // 30 second timeout
        });

        if (!response.ok) {
          const error = await response.json().catch(() => ({ 
            error: `HTTP ${response.status}: ${response.statusText}` 
          }));
          
          // Don't retry client errors (4xx) except 408, 429
          if (response.status >= 400 && response.status < 500 && 
              !retry.retryableStatuses!.includes(response.status)) {
            throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
          }
          
          // Retry server errors
          if (this.isRetryableError(null, response.status)) {
            lastError = new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
            if (attempt < retry.maxRetries!) {
              await this.sleep(retry.retryDelay! * Math.pow(2, attempt)); // Exponential backoff
              continue;
            }
          }
          
          throw new Error(error.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        return await response.json();
      } catch (error: any) {
        lastError = error;
        
        // Don't retry on abort/timeout or non-retryable errors
        if (error.name === 'AbortError' || error.name === 'TimeoutError') {
          throw new Error('Request timeout. Please check your connection and try again.');
        }
        
        if (this.isRetryableError(error) && attempt < retry.maxRetries!) {
          await this.sleep(retry.retryDelay! * Math.pow(2, attempt)); // Exponential backoff
          continue;
        }
        
        // Last attempt or non-retryable error
        if (attempt === retry.maxRetries!) {
          throw new Error(
            error.message || 
            'Request failed after multiple attempts. Please check your connection and try again.'
          );
        }
      }
    }
    
    throw lastError || new Error('Request failed');
  }

  // ============ State & Battles ============

  async getState() {
    return this.request<any>('/api/state');
  }

  async getAllBattles() {
    return this.request<{ battles: any[] }>('/api/battles');
  }

  async getBattle(battleId: string) {
    return this.request<{ battle: any }>(`/api/battles/${battleId}`);
  }

  async getActiveBattles() {
    return this.request<{ battles: any[] }>('/api/battles/active');
  }

  async getPrimaryBattle() {
    return this.request<{ battle: any }>('/api/battles/primary');
  }

  // ============ Price ============

  async getPrice() {
    return this.request<{ price: number; timestamp: number }>('/api/price');
  }

  async getPriceHistory(limit = 100) {
    return this.request<{ price: number; history: any[] }>(`/api/price/history?limit=${limit}`);
  }

  // ============ Betting ============

  async placeBet(battleId: string, side: 'bull' | 'bear', amount: number) {
    // For now, betting is handled via WebSocket
    // This could be extended to use HTTP API if needed
    return Promise.resolve({ success: true, battleId, side, amount });
  }

  // ============ Yellow State Channels ============

  async createBettingSession(userAddress: string, battleId: string, signedMessage?: string) {
    return this.request<any>('/api/yellow/session', {
      method: 'POST',
      body: JSON.stringify({ userAddress, battleId, signedMessage }),
    });
  }

  async placeBetViaYellow(userAddress: string, agent: 'bull' | 'bear', amount: number, signedMessage: string) {
    return this.request<any>('/api/yellow/bet', {
      method: 'POST',
      body: JSON.stringify({ userAddress, agent, amount, signedMessage }),
    });
  }

  // ============ Battle Creation ============

  async createBattle(battleData: {
    tier?: 'PRIMARY' | 'SECONDARY';
    status?: 'WAITING' | 'LIVE';
    asset?: {
      assetId: string;
      symbol: string;
      pairLabel: string;
    };
    bull?: {
      sponsor: string;
      stake: number;
      leverage: number;
    };
    bear?: {
      sponsor: string;
      stake: number;
      leverage: number;
    };
  }) {
    return this.request<{ success: boolean; battle: any }>('/admin/battles/mock', {
      method: 'POST',
      body: JSON.stringify(battleData),
    });
  }

  // ============ Agents ============

  async getAgents() {
    return this.request<{ agents: any[] }>('/api/agents');
  }

  async getBattleAgents(battleId: string) {
    return this.request<{ battleId: string; agents: any }>(`/api/battles/${battleId}/agents`);
  }

  // ============ History & Stats ============

  async getBattleHistory(limit = 50, skip = 0, tier?: 'PRIMARY' | 'SECONDARY') {
    const tierParam = tier ? `&tier=${tier}` : '';
    return this.request<{ 
      history: any[]; 
      count: number;
      totalCount: number;
      page: number;
      totalPages: number;
      limit: number;
      skip: number;
    }>(`/api/battles/history?limit=${limit}&skip=${skip}${tierParam}`);
  }

  async getStats(tier?: 'PRIMARY' | 'SECONDARY') {
    const tierParam = tier ? `?tier=${tier}` : '';
    // Add timestamp to prevent caching
    const cacheBuster = `&_t=${Date.now()}`;
    return this.request<{
      totalBattles: number;
      settledBattles: number;
      liveBattles: number;
      bullWins: number;
      bearWins: number;
      draws: number;
      totalTVL: number;
      totalVolume: number;
    }>(`/api/stats${tierParam}${cacheBuster}`);
  }

  // ============ Transactions ============

  async getTransactions(options?: {
    address?: string;
    battleId?: string;
    limit?: number;
    skip?: number;
  }) {
    const params = new URLSearchParams();
    if (options?.address) params.append('address', options.address);
    if (options?.battleId) params.append('battleId', options.battleId);
    if (options?.limit) params.append('limit', options.limit.toString());
    if (options?.skip) params.append('skip', options.skip.toString());
    
    const query = params.toString();
    return this.request<{
      success: boolean;
      transactions: Array<{
        type: 'BET' | 'BATTLE_CREATED' | 'BATTLE_SETTLED';
        txHash: string;
        blockNumber?: number;
        from: string;
        to: string;
        battleId?: string;
        amount?: number;
        side?: 'bull' | 'bear';
        timestamp: string;
        status: 'PENDING' | 'SETTLED';
      }>;
      count: number;
    }>(`/api/transactions${query ? `?${query}` : ''}`);
  }
}

export const apiClient = new ApiClient(API_BASE_URL);
export default apiClient;
