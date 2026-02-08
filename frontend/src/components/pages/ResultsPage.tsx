import { Trophy, Skull, TrendingUp, ExternalLink, Sword, TrendingDown, Check, Flame, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatAddress } from '@/lib/utils';
import type { ResultType, BattleSide } from '@/types';

interface ResultsPageProps {
  onNavigate: (page: string) => void;
  resultType?: ResultType;
}

// Variant A: User Won Bet
function VictoryResult({ onNavigate }: { onNavigate: (page: string) => void }) {
  const result = {
    battleId: '48',
    winner: 'bull' as BattleSide,
    finalPrice: 3150,
    priceChange: 5,
    liquidationPrice: 3142,
    initialBet: 25,
    winnings: 18.50,
    platformFee: 0.50,
    totalReceived: 43.00,
    autoClaimed: true,
  };

  return (
    <div className="min-h-screen bg-terminal-bg pt-14">
      <div className="max-w-md mx-auto px-4 py-10 text-center">
        {/* Header */}
        <div className="mb-6">
          <p className="text-xs text-terminal-muted mb-2">MARKET #{result.battleId} — SETTLED</p>
          <div className="inline-flex items-center gap-2 mb-3">
            <Trophy className="w-5 h-5 text-long" />
            <span className="text-lg font-medium">POSITION CLOSED</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <div className="w-10 h-10 rounded-lg bg-long/10 flex items-center justify-center border border-long/30">
              <TrendingUp className="w-5 h-5 text-long" />
            </div>
            <div className="text-left">
              <p className="text-sm font-medium text-long">LONG WINS</p>
              <p className="text-xs text-terminal-muted">{formatCurrency(result.finalPrice)} (+{result.priceChange}%)</p>
            </div>
          </div>
        </div>

        {/* PnL Card */}
        <div className="terminal-card p-5 mb-5 text-left">
          <h3 className="text-xs font-medium text-terminal-muted uppercase tracking-wide mb-4">Settlement</h3>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-terminal-muted">Position Size</span>
              <span className="font-mono">{formatCurrency(result.initialBet)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-terminal-muted">PnL</span>
              <span className="font-mono text-long">+{formatCurrency(result.winnings)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-terminal-muted">Fee</span>
              <span className="font-mono text-short">-{formatCurrency(result.platformFee)}</span>
            </div>
            <div className="h-px bg-terminal-border my-2" />
            <div className="flex justify-between">
              <span className="font-medium">Total Received</span>
              <span className="font-mono text-lg font-medium text-long">{formatCurrency(result.totalReceived)}</span>
            </div>
          </div>

          {result.autoClaimed && (
            <div className="mt-4 flex items-center justify-center gap-1.5 text-xs text-long">
              <Check className="w-3.5 h-3.5" />
              <span>Auto-settled</span>
            </div>
          )}
        </div>

        {/* Sponsor Results */}
        <div className="terminal-card p-4 mb-5 text-left">
          <h4 className="text-xs font-medium text-terminal-muted uppercase tracking-wide mb-3">Sponsor Results</h4>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-terminal-muted">Long ({formatAddress('0x742...8f3a')})</span>
              <span className="text-long">+$80</span>
            </div>
            <div className="flex justify-between">
              <span className="text-terminal-muted">Short</span>
              <span className="text-short">Liquidated</span>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            className="border-terminal-border hover:bg-terminal-elevated text-xs h-9"
          >
            <ExternalLink className="w-3.5 h-3.5 mr-2" />
            View Transaction
          </Button>
          <Button
            onClick={() => onNavigate('home')}
            className="btn-long text-xs h-9"
          >
            <Sword className="w-3.5 h-3.5 mr-2" />
            New Position
          </Button>
        </div>
      </div>
    </div>
  );
}

// Variant B: Sponsor Victory
function SponsorVictoryResult({ onNavigate }: { onNavigate: (page: string) => void }) {
  const result = {
    agentName: 'BULL_v7',
    streak: 12,
    staked: 100,
    received: 180,
    profit: 80,
    roi: 80,
    platformFee: 20,
  };

  return (
    <div className="min-h-screen bg-terminal-bg pt-14">
      <div className="max-w-md mx-auto px-4 py-10 text-center">
        {/* Header */}
        <div className="mb-6">
          <div className="inline-flex items-center gap-2 mb-3">
            <Trophy className="w-5 h-5 text-long" />
            <span className="text-lg font-medium">AGENT SURVIVED</span>
          </div>
        </div>

        {/* Agent Card */}
        <div className="terminal-card p-6 mb-5">
          <div className="w-16 h-16 mx-auto mb-3 rounded-lg bg-long/10 flex items-center justify-center border border-long/30">
            <span className="text-2xl">BULL</span>
          </div>
          <h3 className="font-mono text-lg font-medium mb-1">{result.agentName}</h3>
          <div className="flex items-center justify-center gap-2 text-xs">
            <span className="text-terminal-muted">Streak:</span>
            <span className="flex items-center gap-1 text-long">
              <Flame className="w-3 h-3" />
              {result.streak}
            </span>
          </div>
        </div>

        {/* Results */}
        <div className="terminal-card p-5 mb-5">
          <div className="space-y-3">
            <div className="flex justify-between text-sm">
              <span className="text-terminal-muted">Staked</span>
              <span className="font-mono">{formatCurrency(result.staked)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-terminal-muted">Received</span>
              <span className="font-mono text-long">{formatCurrency(result.received)}</span>
            </div>
            <div className="h-px bg-terminal-border" />
            <div className="flex justify-between">
              <span className="font-medium">Profit</span>
              <div className="text-right">
                <span className="font-mono text-xl font-medium text-long">+{formatCurrency(result.profit)}</span>
                <span className="block text-xs text-long">{result.roi}% ROI</span>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="grid grid-cols-3 gap-2">
          <Button
            onClick={() => onNavigate('create')}
            className="btn-long text-xs"
          >
            Deploy v8
          </Button>
          <Button
            variant="outline"
            className="border-terminal-border hover:bg-terminal-elevated text-xs"
          >
            Withdraw
          </Button>
          <Button
            variant="outline"
            className="border-long/30 text-long hover:bg-long/10 text-xs"
          >
            Compound
          </Button>
        </div>
      </div>
    </div>
  );
}

// Variant C: Loss (Liquidated)
function LossResult({ onNavigate }: { onNavigate: (page: string) => void }) {
  const result = {
    battleId: '48',
    loser: 'bear' as BattleSide,
    liquidationPrice: 2850,
    finalPrice: 2865,
    betPlaced: 25,
  };

  return (
    <div className="min-h-screen bg-terminal-bg pt-14">
      <div className="max-w-md mx-auto px-4 py-10 text-center">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-center gap-2 mb-3">
            <Skull className="w-5 h-5 text-short" />
            <span className="text-lg font-medium">LIQUIDATED</span>
          </div>
        </div>

        {/* Liquidated Position */}
        <div className="terminal-card p-6 mb-5 border-short/30">
          <div className="w-16 h-16 mx-auto mb-3 rounded-lg bg-short/10 flex items-center justify-center border border-short/30 grayscale">
            <TrendingDown className="w-6 h-6 text-short" />
          </div>
          <h3 className="font-medium text-short mb-1">
            {result.loser.toUpperCase()} LIQUIDATED
          </h3>
          
          <div className="mt-4 space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-terminal-muted">Liq. Price</span>
              <span className="font-mono text-short">{formatCurrency(result.liquidationPrice)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-terminal-muted">Mark Price</span>
              <span className="font-mono">{formatCurrency(result.finalPrice)}</span>
            </div>
          </div>
        </div>

        {/* Loss Summary */}
        <div className="terminal-card p-5 mb-5">
          <h3 className="text-xs font-medium text-terminal-muted uppercase tracking-wide mb-3">Position Closed</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-terminal-muted">Size</span>
              <span className="font-mono line-through text-terminal-muted">
                {formatCurrency(result.betPlaced)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-terminal-muted">Loss</span>
              <span className="font-mono text-short">-{formatCurrency(result.betPlaced)}</span>
            </div>
          </div>
          <p className="text-xs text-terminal-muted mt-4">
            Position closed due to liquidation.
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          <Button
            variant="outline"
            className="border-terminal-border hover:bg-terminal-elevated text-xs h-9"
          >
            <ExternalLink className="w-3.5 h-3.5 mr-2" />
            View Replay
          </Button>
          <Button
            onClick={() => onNavigate('home')}
            className="btn-long text-xs h-9"
          >
            <ArrowRight className="w-3.5 h-3.5 mr-2" />
            New Position
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ResultsPage({ onNavigate, resultType = 'win' }: ResultsPageProps) {
  switch (resultType) {
    case 'sponsor_win':
      return <SponsorVictoryResult onNavigate={onNavigate} />;
    case 'loss':
      return <LossResult onNavigate={onNavigate} />;
    case 'win':
    default:
      return <VictoryResult onNavigate={onNavigate} />;
  }
}
