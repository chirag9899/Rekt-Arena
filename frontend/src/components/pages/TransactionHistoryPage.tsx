import { useState, useEffect } from 'react';
import { ArrowLeft, ExternalLink, Filter, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import apiClient from '@/lib/api';
import { formatCurrency } from '@/lib/utils';
import { useWallet } from '@/hooks/useWallet';

interface Transaction {
  type: 'BET' | 'BATTLE_CREATED' | 'BATTLE_SETTLED';
  txHash: string | null; // Can be null if invalid/missing
  blockNumber?: number;
  from: string;
  to: string;
  battleId?: string;
  amount?: number;
  side?: 'bull' | 'bear';
  timestamp: string;
  status: 'PENDING' | 'SETTLED';
  winner?: 'BULL' | 'BEAR' | 'DRAW';
}

interface TransactionHistoryPageProps {
  onNavigate: (page: string) => void;
}

const BLOCK_EXPLORER_URL = 'https://amoy.polygonscan.com';

export function TransactionHistoryPage({ onNavigate }: TransactionHistoryPageProps) {
  const { walletState } = useWallet();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    type: '' as '' | 'BET' | 'BATTLE_CREATED' | 'BATTLE_SETTLED',
    status: '' as '' | 'PENDING' | 'SETTLED',
    search: '',
  });
  const [page, setPage] = useState(0);
  const [totalCount, setTotalCount] = useState(0);
  const limit = 20;

  useEffect(() => {
    loadTransactions();
  }, [page, filters, walletState.address]);

  const loadTransactions = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.getTransactions({
        address: walletState.address || undefined,
        limit,
        skip: page * limit,
      });
      
      let filtered = result.transactions;
      
      // Apply filters
      if (filters.type) {
        filtered = filtered.filter(tx => tx.type === filters.type);
      }
      if (filters.status) {
        filtered = filtered.filter(tx => tx.status === filters.status);
      }
      if (filters.search) {
        const searchLower = filters.search.toLowerCase();
        filtered = filtered.filter(tx =>
          (tx.txHash && tx.txHash.toLowerCase().includes(searchLower)) ||
          tx.battleId?.toLowerCase().includes(searchLower) ||
          tx.from.toLowerCase().includes(searchLower) ||
          tx.to.toLowerCase().includes(searchLower)
        );
      }
      
      setTransactions(filtered);
      setTotalCount(result.count);
    } catch (err: any) {
      setError(err.message || 'Failed to load transactions');
      console.error('Failed to load transactions:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'BET': return 'Bet';
      case 'BATTLE_CREATED': return 'Battle Created';
      case 'BATTLE_SETTLED': return 'Battle Settled';
      default: return type;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'BET': return 'text-long';
      case 'BATTLE_CREATED': return 'text-info';
      case 'BATTLE_SETTLED': return 'text-warning';
      default: return 'text-terminal-muted';
    }
  };

  const getStatusColor = (status: string) => {
    return status === 'SETTLED' ? 'text-long' : 'text-warning';
  };

  const isValidTxHash = (hash: string | null | undefined): boolean => {
    if (!hash) return false;
    return /^0x[a-fA-F0-9]{64}$/.test(hash); // Must be 66 chars: 0x + 64 hex
  };

  const openExplorer = (txHash: string | null | undefined) => {
    if (!isValidTxHash(txHash)) {
      console.warn('Invalid transaction hash:', txHash);
      return; // Don't open explorer for invalid hashes
    }
    window.open(`${BLOCK_EXPLORER_URL}/tx/${txHash}`, '_blank');
  };

  if (loading && transactions.length === 0) {
    return (
      <div className="min-h-[400px] bg-terminal-bg px-4 py-8">
        <div className="max-w-6xl mx-auto">
          <div className="mb-6">
            <div className="animate-pulse">
              <div className="h-6 bg-terminal-border rounded w-48 mb-4" />
            </div>
          </div>
          <div className="space-y-3 pointer-events-none select-none">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-16 bg-terminal-border/50 rounded opacity-50" />
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[400px] bg-terminal-bg">
      {/* Main Content */}
      <div className="pb-12 px-4 max-w-6xl mx-auto">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-lg font-medium">Transaction History</h2>
          <div className="text-sm text-terminal-muted">
            {totalCount} transaction{totalCount !== 1 ? 's' : ''}
          </div>
        </div>
        {/* Filters */}
        <div className="mb-6 p-4 bg-terminal-card border border-terminal-border rounded-lg">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-xs text-terminal-muted mb-1">Search</label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-terminal-muted" />
                <input
                  type="text"
                  placeholder="Search by TX hash, battle ID, address..."
                  value={filters.search}
                  onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                  className="w-full pl-8 pr-3 py-2 bg-terminal-bg border border-terminal-border rounded text-sm focus:outline-none focus:border-terminal-accent"
                />
              </div>
            </div>
            
            <div className="min-w-[150px]">
              <label className="block text-xs text-terminal-muted mb-1">Type</label>
              <select
                value={filters.type}
                onChange={(e) => setFilters({ ...filters, type: e.target.value as any })}
                className="w-full px-3 py-2 bg-terminal-bg border border-terminal-border rounded text-sm focus:outline-none focus:border-terminal-accent"
              >
                <option value="">All Types</option>
                <option value="BET">Bet</option>
                <option value="BATTLE_CREATED">Battle Created</option>
                <option value="BATTLE_SETTLED">Battle Settled</option>
              </select>
            </div>
            
            <div className="min-w-[150px]">
              <label className="block text-xs text-terminal-muted mb-1">Status</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value as any })}
                className="w-full px-3 py-2 bg-terminal-bg border border-terminal-border rounded text-sm focus:outline-none focus:border-terminal-accent"
              >
                <option value="">All Status</option>
                <option value="PENDING">Pending</option>
                <option value="SETTLED">Settled</option>
              </select>
            </div>
            
            <Button
              onClick={() => {
                setFilters({ type: '', status: '', search: '' });
                setPage(0);
              }}
              variant="outline"
              size="sm"
            >
              Clear
            </Button>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-short/10 border border-short/30 rounded-lg text-short">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-12 text-terminal-muted">
            Loading transactions...
          </div>
        )}

        {/* Transactions Table */}
        {!loading && !error && (
          <>
            {transactions.length === 0 ? (
              <div className="text-center py-12 text-terminal-muted">
                <p className="text-lg mb-2">No transactions found</p>
                <p className="text-sm">
                  {filters.search || filters.type || filters.status
                    ? 'Try adjusting your filters'
                    : 'Your transaction history will appear here'}
                </p>
              </div>
            ) : (
              <div className="bg-terminal-card border border-terminal-border rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-terminal-elevated border-b border-terminal-border">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-terminal-muted uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-terminal-muted uppercase">Transaction</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-terminal-muted uppercase">Amount</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-terminal-muted uppercase">Status</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-terminal-muted uppercase">Time</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-terminal-muted uppercase">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-terminal-border">
                      {transactions.map((tx, index) => (
                        <tr key={`${tx.txHash}-${index}`} className="hover:bg-terminal-elevated/50 transition-colors">
                          <td className="px-4 py-3">
                            <span className={`text-sm font-medium ${getTypeColor(tx.type)}`}>
                              {getTypeLabel(tx.type)}
                            </span>
                            {tx.side && (
                              <span className="ml-2 text-xs text-terminal-muted">
                                ({tx.side})
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-1">
                              {tx.txHash && isValidTxHash(tx.txHash) ? (
                                <code className="text-xs font-mono text-terminal-muted">
                                  {tx.txHash.substring(0, 10)}...{tx.txHash.substring(tx.txHash.length - 8)}
                                </code>
                              ) : (
                                <span className="text-xs text-terminal-muted italic">
                                  {tx.txHash ? 'Invalid hash' : 'No transaction hash'}
                                </span>
                              )}
                              {tx.battleId && (
                                <code className="text-xs font-mono text-terminal-muted">
                                  Battle: {tx.battleId.substring(0, 10)}...
                                </code>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            {tx.amount ? (
                              <span className="text-sm font-medium">
                                {formatCurrency(tx.amount)}
                              </span>
                            ) : (
                              <span className="text-sm text-terminal-muted">-</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-sm font-medium ${getStatusColor(tx.status)}`}>
                              {tx.status}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-terminal-muted">
                              {formatDate(tx.timestamp)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {isValidTxHash(tx.txHash) ? (
                              <button
                                onClick={() => openExplorer(tx.txHash)}
                                className="flex items-center gap-1 text-xs text-info hover:text-info/80 transition-colors"
                              >
                                <ExternalLink className="w-3 h-3" />
                                View
                              </button>
                            ) : (
                              <span className="text-xs text-terminal-muted italic">
                                {tx.txHash ? 'Invalid' : '-'}
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Pagination */}
            {transactions.length > 0 && (
              <div className="mt-6 flex items-center justify-between">
                <div className="text-sm text-terminal-muted">
                  Showing {page * limit + 1} to {Math.min((page + 1) * limit, totalCount)} of {totalCount}
                </div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => setPage(p => Math.max(0, p - 1))}
                    disabled={page === 0}
                    variant="outline"
                    size="sm"
                  >
                    Previous
                  </Button>
                  <Button
                    onClick={() => setPage(p => p + 1)}
                    disabled={(page + 1) * limit >= totalCount}
                    variant="outline"
                    size="sm"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
