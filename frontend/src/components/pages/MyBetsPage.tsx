import { useState, useEffect } from 'react';
import { ArrowLeft, Trophy, XCircle, Clock, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useWallet } from '@/hooks/useWallet';
import { formatCurrency } from '@/lib/utils';

interface Bet {
  id: string;
  battleId: string;
  side: 'bull' | 'bear';
  amount: number;
  txHash: string | null;
  settled: boolean;
  won: boolean | null;
  payout: number | null;
  createdAt: string;
  settledAt: string | null;
}

interface MyBetsPageProps {
  onNavigate: (page: string) => void;
}

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';
const BLOCK_EXPLORER_URL = 'https://amoy.polygonscan.com';

export function MyBetsPage({ onNavigate }: MyBetsPageProps) {
  const { walletState } = useWallet();
  const [bets, setBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'won' | 'lost' | 'pending'>('all');

  useEffect(() => {
    if (walletState.address) {
      loadBets();
    } else {
      setLoading(false);
    }
  }, [walletState.address, filter]);

  const loadBets = async () => {
    if (!walletState.address) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const settledParam = filter === 'pending' ? 'false' : filter === 'won' || filter === 'lost' ? 'true' : undefined;
      const url = `${API_BASE_URL}/api/bets/${walletState.address}?limit=100${settledParam ? `&settled=${settledParam}` : ''}`;
      
      const response = await fetch(url);
      const data = await response.json();
      
      let allBets = data.bets || [];
      
      // Apply additional filters
      if (filter === 'won') {
        allBets = allBets.filter((bet: Bet) => bet.settled && bet.won === true);
      } else if (filter === 'lost') {
        allBets = allBets.filter((bet: Bet) => bet.settled && bet.won === false);
      } else if (filter === 'pending') {
        allBets = allBets.filter((bet: Bet) => !bet.settled);
      }
      
      setBets(allBets);
    } catch (err: any) {
      setError(err.message || 'Failed to load bets');
      console.error('Failed to load bets:', err);
    } finally {
      setLoading(false);
    }
  };

  const getBetStatus = (bet: Bet) => {
    if (!bet.settled) {
      return { label: 'Pending', icon: Clock, color: 'text-warning' };
    }
    if (bet.won) {
      return { label: 'Won', icon: Trophy, color: 'text-long' };
    }
    return { label: 'Lost', icon: XCircle, color: 'text-short' };
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const isValidTxHash = (hash: string | null): boolean => {
    return hash !== null && hash.startsWith('0x') && hash.length === 66;
  };

  if (!walletState.address) {
    return (
      <div className="min-h-screen bg-terminal-bg pt-14">
        <div className="max-w-6xl mx-auto px-4 py-12 text-center">
          <p className="text-terminal-muted">Please connect your wallet to view your bets</p>
        </div>
      </div>
    );
  }

  const stats = {
    total: bets.length,
    won: bets.filter(b => b.settled && b.won).length,
    lost: bets.filter(b => b.settled && b.won === false).length,
    pending: bets.filter(b => !b.settled).length,
    totalWagered: bets.reduce((sum, b) => sum + b.amount, 0),
    totalWon: bets.filter(b => b.settled && b.won && b.payout).reduce((sum, b) => sum + (b.payout || 0), 0),
    totalLost: bets.filter(b => b.settled && b.won === false).reduce((sum, b) => sum + b.amount, 0),
  };

  return (
    <div className="min-h-screen bg-terminal-bg pt-14">
      {/* Header */}
      <div className="fixed top-14 left-0 right-0 z-40 bg-terminal-bg border-b border-terminal-border">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => onNavigate('home')}
                className="p-1.5 rounded hover:bg-terminal-elevated transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <h1 className="text-lg font-medium">My Bets</h1>
            </div>
            <div className="text-xs text-terminal-muted font-mono">
              {walletState.address.slice(0, 6)}...{walletState.address.slice(-4)}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="pt-24 pb-6 px-4 max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="terminal-card p-4">
            <div className="text-xs text-terminal-muted mb-1">Total Bets</div>
            <div className="text-2xl font-mono font-bold">{stats.total}</div>
          </div>
          <div className="terminal-card p-4">
            <div className="text-xs text-terminal-muted mb-1">Won</div>
            <div className="text-2xl font-mono font-bold text-long">{stats.won}</div>
          </div>
          <div className="terminal-card p-4">
            <div className="text-xs text-terminal-muted mb-1">Lost</div>
            <div className="text-2xl font-mono font-bold text-short">{stats.lost}</div>
          </div>
          <div className="terminal-card p-4">
            <div className="text-xs text-terminal-muted mb-1">Pending</div>
            <div className="text-2xl font-mono font-bold text-warning">{stats.pending}</div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="terminal-card p-4">
            <div className="text-xs text-terminal-muted mb-1">Total Wagered</div>
            <div className="text-lg font-mono font-bold">{formatCurrency(stats.totalWagered)}</div>
          </div>
          <div className="terminal-card p-4">
            <div className="text-xs text-terminal-muted mb-1">Total Won</div>
            <div className="text-lg font-mono font-bold text-long">{formatCurrency(stats.totalWon)}</div>
          </div>
          <div className="terminal-card p-4">
            <div className="text-xs text-terminal-muted mb-1">Total Lost</div>
            <div className="text-lg font-mono font-bold text-short">{formatCurrency(stats.totalLost)}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex gap-2 mb-4">
          <Button
            variant={filter === 'all' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('all')}
          >
            All
          </Button>
          <Button
            variant={filter === 'won' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('won')}
          >
            Won
          </Button>
          <Button
            variant={filter === 'lost' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('lost')}
          >
            Lost
          </Button>
          <Button
            variant={filter === 'pending' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter('pending')}
          >
            Pending
          </Button>
        </div>

        {/* Bets List */}
        {loading ? (
          <div className="terminal-card p-8 text-center">
            <div className="text-terminal-muted">Loading bets...</div>
          </div>
        ) : error ? (
          <div className="terminal-card p-8 text-center">
            <div className="text-short">{error}</div>
          </div>
        ) : bets.length === 0 ? (
          <div className="terminal-card p-8 text-center">
            <div className="text-terminal-muted">No bets found</div>
          </div>
        ) : (
          <div className="space-y-3">
            {bets.map((bet) => {
              const status = getBetStatus(bet);
              const StatusIcon = status.icon;
              const winnings = bet.settled && bet.won && bet.payout ? bet.payout - bet.amount : 0;
              const isWin = bet.settled && bet.won && bet.payout;
              const payoutRatio = bet.payout && bet.amount ? (bet.payout / bet.amount).toFixed(2) : '0.00';
              
              return (
                <div 
                  key={bet.id} 
                  className={`terminal-card p-5 transition-all ${
                    isWin 
                      ? 'border-2 border-long/50 bg-gradient-to-br from-long/5 to-long/10 shadow-lg shadow-long/20' 
                      : bet.settled && !bet.won
                      ? 'border border-short/30 bg-short/5'
                      : 'border border-terminal-border'
                  }`}
                >
                  {/* Win Badge */}
                  {isWin && (
                    <div className="flex items-center gap-2 mb-4 pb-3 border-b border-long/30">
                      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-long/20 border-2 border-long/50">
                        <Trophy className="w-6 h-6 text-long" />
                      </div>
                      <div className="flex-1">
                        <div className="text-sm font-bold text-long uppercase tracking-wide">Winner!</div>
                        <div className="text-xs text-terminal-muted">You won this bet</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-terminal-muted">Payout</div>
                        <div className="text-lg font-mono font-bold text-long">{payoutRatio}x</div>
                      </div>
                    </div>
                  )}

                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <StatusIcon className={`w-6 h-6 ${status.color}`} />
                      <div>
                        <div className="font-semibold text-base">
                          {bet.side.toUpperCase()} - {formatCurrency(bet.amount)}
                        </div>
                        <div className="text-xs text-terminal-muted font-mono mt-0.5">
                          Battle: {bet.battleId.slice(0, 10)}...
                        </div>
                      </div>
                    </div>
                    <div className={`text-sm font-semibold px-3 py-1 rounded-full ${
                      isWin 
                        ? 'bg-long/20 text-long border border-long/40' 
                        : bet.settled && !bet.won
                        ? 'bg-short/20 text-short border border-short/40'
                        : 'bg-warning/20 text-warning border border-warning/40'
                    }`}>
                      {status.label}
                    </div>
                  </div>
                  
                  {isWin && (
                    <div className="bg-gradient-to-r from-long/20 via-long/15 to-long/10 border-2 border-long/40 rounded-lg p-4 mb-3 shadow-inner">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-terminal-muted">Your Bet</span>
                        <span className="font-mono text-sm font-semibold">{formatCurrency(bet.amount)}</span>
                      </div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-terminal-muted">Profit</span>
                        <span className="font-mono text-lg font-bold text-long">
                          +{formatCurrency(winnings)}
                        </span>
                      </div>
                      <div className="border-t border-long/40 pt-2 mt-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-semibold text-terminal-muted">Total Return</span>
                          <span className="font-mono text-xl font-bold text-long">
                            {formatCurrency(bet.payout)}
                          </span>
                        </div>
                      </div>
                    </div>
                  )}

                  {bet.settled && !bet.won && (
                    <div className="bg-short/10 border border-short/30 rounded-lg p-3 mb-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-terminal-muted">Loss</span>
                        <span className="font-mono text-sm font-semibold text-short">
                          -{formatCurrency(bet.amount)}
                        </span>
                      </div>
                    </div>
                  )}
                  
                  <div className="flex items-center justify-between text-xs text-terminal-muted">
                    <div>
                      {bet.settled && bet.settledAt ? (
                        <span>Settled: {formatDate(bet.settledAt)}</span>
                      ) : (
                        <span>Placed: {formatDate(bet.createdAt)}</span>
                      )}
                    </div>
                    {isValidTxHash(bet.txHash) && (
                      <a
                        href={`${BLOCK_EXPLORER_URL}/tx/${bet.txHash}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 hover:text-foreground transition-colors"
                      >
                        View Tx <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
