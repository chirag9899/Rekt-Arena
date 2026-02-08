import { useEffect, useState } from 'react';
import { Trophy, TrendingUp, TrendingDown, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';
import { apiClient } from '@/lib/api';

interface HistoricalBattle {
  id: string;
  round: number;
  winner: 'BULL' | 'BEAR' | 'DRAW';
  bullHealth: number;
  bearHealth: number;
  tvl: number;
  duration: number;
  endTime: number;
  payoutRatio: number;
}

interface Stats {
  totalBattles: number;
  bullWins: number;
  bearWins: number;
  draws: number;
  totalVolume: number;
  avgDuration: number;
}

interface BattleHistoryPageProps {
  onNavigate: (page: string) => void;
  tier?: 'PRIMARY' | 'SECONDARY';
  hideHeader?: boolean;
}

const ITEMS_PER_PAGE = 20;

export function BattleHistoryPage({ onNavigate, tier, hideHeader = false }: BattleHistoryPageProps) {
  const [history, setHistory] = useState<HistoricalBattle[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  const loadHistory = async (pageNum: number) => {
    setLoading(true);
    try {
      const skip = (pageNum - 1) * ITEMS_PER_PAGE;
      // Load history first (more important), stats can load separately
      const historyData = await apiClient.getBattleHistory(ITEMS_PER_PAGE, skip, tier);
      
      setHistory(historyData.history || []);
      setTotalPages(historyData.totalPages || 1);
      setTotalCount(historyData.totalCount || 0);
      setPage(historyData.page || pageNum);
      setLoading(false);
      
      // Load stats in background (non-blocking)
      // Add timestamp to prevent caching
      apiClient.getStats(tier).then(statsData => {
        console.log('📊 Stats loaded:', statsData); // Debug log
        setStats({
          totalBattles: statsData.settledBattles || statsData.totalBattles || 0,
          bullWins: statsData.bullWins || 0,
          bearWins: statsData.bearWins || 0,
          draws: statsData.draws || 0,
          totalVolume: statsData.totalVolume || 0,
          avgDuration: 0,
        });
      }).catch(err => {
        console.warn('Failed to load stats (non-critical):', err);
      });
    } catch (err) {
      console.error('Failed to load battle history:', err);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory(1);
    // Reset stats when tier changes to force reload
    setStats(null);
  }, [tier]);

  const handlePageChange = (newPage: number) => {
    if (newPage >= 1 && newPage <= totalPages) {
      loadHistory(newPage);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const tierLabel = tier === 'PRIMARY' ? 'Primary' : tier === 'SECONDARY' ? 'Secondary' : 'All';
  const pageTitle = tier ? `${tierLabel} Battle History` : 'Battle History';

  if (loading && history.length === 0) {
    return (
      <div className="min-h-[400px] bg-void px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {!hideHeader && (
            <div className="text-center mb-12">
              <div className="animate-pulse">
                <div className="h-8 bg-terminal-border rounded w-48 mx-auto mb-4" />
                <div className="h-4 bg-terminal-border rounded w-32 mx-auto" />
              </div>
            </div>
          )}
          <div className="space-y-3 pointer-events-none select-none">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="history-card opacity-50">
                  <div className="h-16 bg-terminal-border/50 rounded" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const bullWinRate = stats ? ((stats.bullWins / stats.totalBattles) * 100).toFixed(1) : '0';
  const bearWinRate = stats ? ((stats.bearWins / stats.totalBattles) * 100).toFixed(1) : '0';

  return (
    <div className="min-h-[400px] bg-void px-4 pb-8">
      <div className="max-w-6xl mx-auto">
        {/* Header - Only show if not in tabs */}
        {!hideHeader && (
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-long via-info to-short bg-clip-text text-transparent">
              {pageTitle}
            </h1>
            <p className="text-terminal-muted">
              {tier ? `Complete record of ${tierLabel.toLowerCase()} liquidation battles` : 'Complete record of all liquidation battles'}
            </p>
            {totalCount > 0 && (
              <p className="text-sm text-terminal-muted mt-2">
                Showing {((page - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(page * ITEMS_PER_PAGE, totalCount)} of {totalCount} battles
              </p>
            )}
          </div>
        )}
        
        {/* Show count when in tabs */}
        {hideHeader && totalCount > 0 && (
          <div className="mb-6 text-sm text-terminal-muted">
            Showing {((page - 1) * ITEMS_PER_PAGE) + 1}-{Math.min(page * ITEMS_PER_PAGE, totalCount)} of {totalCount} battles
          </div>
        )}

        {/* Stats Overview */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="stat-card">
              <div className="text-terminal-muted text-sm mb-1">Total Battles</div>
              <div className="text-2xl font-bold">{totalCount}</div>
            </div>
            <div className="stat-card">
              <div className="text-terminal-muted text-sm mb-1 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-long" />
                Bull Wins
              </div>
              <div className="text-2xl font-bold text-long">
                {stats.bullWins} <span className="text-sm">({bullWinRate}%)</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="text-terminal-muted text-sm mb-1 flex items-center gap-2">
                <TrendingDown className="w-4 h-4 text-short" />
                Bear Wins
              </div>
              <div className="text-2xl font-bold text-short">
                {stats.bearWins} <span className="text-sm">({bearWinRate}%)</span>
              </div>
            </div>
            <div className="stat-card">
              <div className="text-terminal-muted text-sm mb-1">Total Volume</div>
              <div className="text-2xl font-bold text-info">{formatCurrency(stats.totalVolume)}</div>
            </div>
          </div>
        )}

        {/* History List */}
        <div className="space-y-3">
          {history.length === 0 ? (
            <div className="text-center py-12 text-terminal-muted">
              <Trophy className="w-12 h-12 mx-auto mb-4 opacity-30" />
              <p>No {tierLabel.toLowerCase()} battle history yet.</p>
              {tier && <p className="text-sm mt-2">The first {tierLabel.toLowerCase()} battle is happening now!</p>}
            </div>
          ) : (
            history.map((battle, index) => {
              const date = new Date(battle.endTime);
              const duration = Math.floor(battle.duration / 1000 / 60); // minutes
              
              return (
                <div
                  key={battle.id}
                  className="history-card group hover:border-terminal-accent/50 transition-all"
                >
                  <div className="flex items-center justify-between">
                    {/* Left: Round & Winner */}
                    <div className="flex items-center gap-4">
                      <div className="text-terminal-muted font-mono text-sm">
                        #{((page - 1) * ITEMS_PER_PAGE) + index + 1}
                      </div>
                      <div className="flex items-center gap-2">
                        {battle.winner === 'BULL' ? (
                          <div className="flex items-center gap-2 text-long">
                            <TrendingUp className="w-5 h-5" />
                            <span className="font-bold">BULL WINS</span>
                          </div>
                        ) : battle.winner === 'BEAR' ? (
                          <div className="flex items-center gap-2 text-short">
                            <TrendingDown className="w-5 h-5" />
                            <span className="font-bold">BEAR WINS</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-terminal-muted">
                            <Trophy className="w-5 h-5" />
                            <span className="font-bold">DRAW</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Center: Health */}
                    <div className="flex items-center gap-6 text-sm">
                      <div className="flex items-center gap-2">
                        <span className="text-terminal-muted">Bull:</span>
                        <span className={`font-mono font-bold ${battle.winner === 'BULL' ? 'text-long' : 'text-terminal-muted'}`}>
                          {battle.bullHealth.toFixed(1)}%
                        </span>
                      </div>
                      <span className="text-terminal-muted">vs</span>
                      <div className="flex items-center gap-2">
                        <span className="text-terminal-muted">Bear:</span>
                        <span className={`font-mono font-bold ${battle.winner === 'BEAR' ? 'text-short' : 'text-terminal-muted'}`}>
                          {battle.bearHealth.toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    {/* Right: Details */}
                    <div className="flex items-center gap-6 text-sm text-terminal-muted">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4" />
                        <span>{duration}m</span>
                      </div>
                      <div className="font-mono">TVL: {formatCurrency(battle.tvl)}</div>
                      <div className="font-mono">
                        {battle.payoutRatio > 0 ? `${battle.payoutRatio.toFixed(2)}x` : '-'}
                      </div>
                      <div className="font-mono text-xs">
                        {date.toLocaleTimeString()}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-8">
            <button
              onClick={() => handlePageChange(page - 1)}
              disabled={page === 1}
              className="px-4 py-2 bg-terminal-card border border-terminal-border rounded-lg text-sm font-medium hover:border-terminal-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </button>
            
            <div className="flex items-center gap-2">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (page <= 3) {
                  pageNum = i + 1;
                } else if (page >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = page - 2 + i;
                }
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => handlePageChange(pageNum)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                      page === pageNum
                        ? 'bg-terminal-accent text-foreground'
                        : 'bg-terminal-card border border-terminal-border hover:border-terminal-accent'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            
            <button
              onClick={() => handlePageChange(page + 1)}
              disabled={page === totalPages}
              className="px-4 py-2 bg-terminal-card border border-terminal-border rounded-lg text-sm font-medium hover:border-terminal-accent transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Back Button - Only show if not in tabs */}
        {!hideHeader && (
          <div className="mt-8 text-center">
            <button
              onClick={() => onNavigate('home')}
              className="btn-secondary"
            >
              Back to Arena
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
