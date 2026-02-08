import { useState, useEffect } from 'react';
import { BattleCard, BetModal } from '@/components/shared';
import { formatCurrency } from '@/lib/utils';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useWallet } from '@/hooks/useWallet';
import { useBetting } from '@/hooks/useBetting';
import type { BattleSide } from '@/types';

interface HomePageProps {
  walletBalance: number;
  onNavigate: (page: string) => void;
}

// No default battle data - all battles come from WebSocket/blockchain

export function HomePage({ walletBalance, onNavigate }: HomePageProps) {
  const { isConnected, currentPrice, priceChange, battles } = useWebSocket();
  const { walletState } = useWallet();
  const { placeBet, isPending: isBettingPending, error: bettingError } = useBetting();
  const [betModalOpen, setBetModalOpen] = useState(false);
  const [selectedBattle, setSelectedBattle] = useState<string | null>(null);
  const [bettingStatus, setBettingStatus] = useState<'idle' | 'validating' | 'approving' | 'placing' | 'success' | 'error'>('idle');

  // Filter out null/undefined battles (filtered/stuck battles from backend)
  // Also deduplicate by ID to prevent showing same battle multiple times
  const validBattles = battles
    .filter(b => b !== null && b !== undefined)
    .filter((b, index, self) => 
      index === self.findIndex(battle => battle.id === b.id)
    );
  
  // Debug logging
  useEffect(() => {
    console.log('🏠 HomePage - Battle Debug:', {
      totalBattles: battles.length,
      validBattles: validBattles.length,
      isConnected,
      battles: battles.map(b => ({
        id: b?.id?.substring(0, 20),
        status: b?.status,
        tier: b?.tier,
        bullAmount: b?.bullAmount,
        bearAmount: b?.bearAmount,
      })),
    });
  }, [battles, validBattles, isConnected]);
  
  // Find primary battle (battle with tier === 'PRIMARY' or first live battle with both sides funded)
  const primaryBattle = validBattles.find(b => 
    b && (b.tier === 'PRIMARY' || (b.status === 'live' && b.bullAmount > 0 && b.bearAmount > 0))
  ) || null;
  
  // Secondary battles (excluding primary by ID AND tier check)
  const secondaryBattles = validBattles.filter(b => {
    if (!b) return false;
    // Exclude primary battle by ID
    if (primaryBattle && b.id === primaryBattle.id) return false;
    // Also exclude any battle with tier === 'PRIMARY'
    if (b.tier === 'PRIMARY') return false;
    return true;
  });

  const handleBet = (battleId: string) => {
    setSelectedBattle(battleId);
    setBetModalOpen(true);
  };

  const handleConfirmBet = async (side: BattleSide, amount: number) => {
    if (!selectedBattle || !walletState.address) {
      setBettingStatus('error');
      return;
    }
    
    const battle = battles.find(b => b.id === selectedBattle);
    if (!battle || !battle.battleAddress) {
      setBettingStatus('error');
      return;
    }
    
    setBettingStatus('validating');
    
    try {
      // Place bet via contract
      const result = await placeBet(
        selectedBattle,
        battle.battleAddress,
        side,
        amount
      );
      
      if (result.success) {
        setBettingStatus('success');
        // Close modal after showing success
        setTimeout(() => {
    setBetModalOpen(false);
          setSelectedBattle(null);
          setBettingStatus('idle');
        }, 2000);
      }
    } catch (error: any) {
      console.error('Failed to place bet:', error);
      setBettingStatus('error');
      // Error will be shown via bettingError from hook
    }
  };

  const handleSponsor = () => {
    onNavigate('create');
  };

  const handleWatch = () => {
    onNavigate('arena');
  };

  // Show all secondary battles (no filtering needed - separate pages handle filtering)
  const filteredBattles = secondaryBattles.filter(battle => battle !== null && battle !== undefined);

  // Use WebSocket price (real price from API)
  const displayPrice = currentPrice || 0;
  const displayChange = (() => {
    const change = priceChange ?? 0;
    // Handle Infinity, NaN, or invalid values
    if (!isFinite(change) || isNaN(change)) {
      return 0;
    }
    return change;
  })();
  const isPositive = displayChange >= 0;

  return (
    <div className="min-h-screen bg-terminal-bg pt-14">
      {/* Hero Section */}
      <section className="relative min-h-[50vh] flex items-center justify-center px-4 py-10 grid-bg">
        <div className="relative z-10 w-full max-w-3xl">
          {/* Connection Status */}
          <div className="absolute top-0 right-0 flex items-center gap-2 text-xs">
            <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
            <span className="text-terminal-muted">
              {isConnected ? 'Live' : 'Offline'} 
              {battles.length > 0 && ` • ${battles.length} battle${battles.length !== 1 ? 's' : ''}`}
            </span>
          </div>

          {/* Price Display */}
          <div className="text-center mb-8">
            <div className="text-xs text-terminal-muted mb-2 tracking-wider">ETH-PERP MARK PRICE</div>
            <div className="font-mono text-5xl md:text-6xl font-medium tracking-tight">
              {displayPrice > 0 ? formatCurrency(displayPrice) : (
                <span className="text-terminal-muted">Loading...</span>
              )}
            </div>
            {displayPrice > 0 && (
            <div className={`inline-flex items-center gap-1 mt-2 text-sm font-mono ${isPositive ? 'text-long' : 'text-short'}`}>
                <span>{isPositive ? '+' : ''}{displayChange.toFixed(2)}%</span>
              <span className="text-terminal-muted">24h</span>
            </div>
            )}
          </div>

          {/* Primary Battle Card */}
          {primaryBattle ? (
          <BattleCard
            battle={primaryBattle}
            onBet={handleBet}
            onWatch={handleWatch}
            onSponsor={handleSponsor}
            variant="primary"
          />
          ) : (
            <div className="text-center py-12 text-terminal-muted">
              <p className="text-lg mb-2">No active battles</p>
              <p className="text-sm">Create a battle to get started!</p>
              <button
                onClick={handleSponsor}
                className="mt-4 px-6 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Create Battle
              </button>
            </div>
          )}
        </div>
      </section>

      {/* Secondary Battles Section */}
      {filteredBattles.length > 0 && (
        <section className="px-4 py-8">
          <div className="max-w-6xl mx-auto">
            {/* Battles Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredBattles.map((battle) => (
                <BattleCard
                  key={battle.id}
                  battle={battle}
                  onBet={handleBet}
                  onWatch={handleWatch}
                  onSponsor={handleSponsor}
                />
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Bet Modal */}
      <BetModal
        isOpen={betModalOpen}
        onClose={() => {
          setBetModalOpen(false);
          setSelectedBattle(null);
          setBettingStatus('idle');
        }}
        onConfirm={handleConfirmBet}
        availableBalance={walletState.balance || walletBalance}
        minBet={selectedBattle ? battles.find(b => b.id === selectedBattle)?.minBet : 10}
        isLoading={isBettingPending || bettingStatus !== 'idle'}
        error={bettingError || (bettingStatus === 'error' ? 'Failed to place bet' : null)}
      />
    </div>
  );
}
