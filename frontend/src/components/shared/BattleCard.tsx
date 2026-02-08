import { Clock, Users, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatCompactNumber } from '@/lib/utils';
import { CountdownTimer } from './CountdownTimer';
import { VerificationStatus } from './VerificationStatus';
import type { Battle } from '@/types';

interface BattleCardProps {
  battle: Battle;
  onBet: (battleId: string) => void;
  onWatch?: (battleId: string) => void;
  onSponsor?: (battleId: string) => void;
  variant?: 'default' | 'compact' | 'primary';
}

export function BattleCard({ 
  battle, 
  onBet, 
  onWatch,
  onSponsor,
  variant = 'default' 
}: BattleCardProps) {
  // Determine if this is a primary battle
  // Primary battles have tier === 'PRIMARY' or both sides funded (not a lobby)
  const isPrimary = variant === 'primary' || 
    (battle.tier === 'PRIMARY' || (battle.status === 'live' && battle.bullAmount > 0 && battle.bearAmount > 0));

  const getStatusBadge = () => {
    switch (battle.status) {
      case 'live':
        return (
          <span className="badge-live">
            <span className="w-1.5 h-1.5 rounded-full bg-short animate-pulse-subtle" />
            LIVE
          </span>
        );
      case 'waiting':
        return (
          <span className="badge-waiting">
            <Clock className="w-3 h-3" />
            WAITING
          </span>
        );
      case 'starting':
        return (
          <span className="badge-starting">
            <span className="w-1.5 h-1.5 rounded-full bg-info animate-pulse-subtle" />
            STARTING
          </span>
        );
      default:
        return null;
    }
  };

  const bullRatio = battle.bullAmount / (battle.bullAmount + battle.bearAmount || 1);
  const bearRatio = 1 - bullRatio;

  if (isPrimary) {
    // Check if this is actually a secondary lobby (waiting for opponent)
    // A true primary battle has tier='PRIMARY' AND (both sides funded OR battle is live with agents)
    // For PRIMARY battles, TVL might be 0 temporarily during sync, so check tier first
    const isWaitingForOpponent = battle.status === 'waiting' || 
      battle.tier === 'SECONDARY' || 
      (battle.tier !== 'PRIMARY' && battle.tvl === 0) || // Only check TVL if not explicitly PRIMARY
      (battle.bullAmount === 0 && battle.bearAmount === 0 && battle.tier !== 'PRIMARY'); // Both sides empty AND not PRIMARY
    
    return (
      <div className="primary-card p-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            {isWaitingForOpponent ? (
              <>
                <Clock className="w-3 h-3 text-terminal-muted" />
                <span className="font-medium text-sm tracking-wide text-terminal-muted">SECONDARY LOBBY</span>
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-short animate-pulse-subtle" />
                <span className="font-medium text-sm tracking-wide">PRIMARY ARENA</span>
              </>
            )}
          </div>
          <span className="font-mono text-xs text-terminal-muted">ROUND #{battle.round}</span>
        </div>

        {/* Battle Display */}
        <div className="grid grid-cols-2 gap-6 mb-6">
          {/* Long Side */}
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-3 rounded-lg bg-long/10 flex items-center justify-center border border-long/30">
              <TrendingUp className="w-8 h-8 text-long" />
            </div>
            <div className="h-2 rounded-sm overflow-hidden bg-terminal-border mb-2">
              <div 
                className="h-full bg-long transition-all duration-500"
                style={{ width: `${battle.bullHealth}%` }}
              />
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-terminal-muted">Health</span>
              <span className="font-mono text-long">{battle.bullHealth}%</span>
            </div>
            <div className="mt-2 font-mono text-xs text-terminal-muted">
              {battle.bullLeverage}x Lev
            </div>
          </div>

          {/* VS */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <span className="text-xs font-mono text-terminal-muted">VS</span>
          </div>

          {/* Short Side */}
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-3 rounded-lg bg-short/10 flex items-center justify-center border border-short/30">
              <TrendingDown className="w-8 h-8 text-short" />
            </div>
            <div className="h-2 rounded-sm overflow-hidden bg-terminal-border mb-2">
              <div 
                className="h-full bg-short transition-all duration-500"
                style={{ width: `${battle.bearHealth}%` }}
              />
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-terminal-muted">Health</span>
              <span className="font-mono text-short">{battle.bearHealth}%</span>
            </div>
            <div className="mt-2 font-mono text-xs text-terminal-muted">
              {battle.bearLeverage}x Lev
            </div>
            {/* Verification Status */}
            <div className="mt-2">
              <VerificationStatus
                status={battle.bearProofStatus || (battle.bearZKVerified ? 'verified' : 'none')}
                agentType="bear"
                lastProofTime={battle.bearLastProofTime}
                compact={true}
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <Button 
            onClick={() => onBet(battle.id)}
            className="btn-long"
          >
            LONG
          </Button>
          <Button 
            onClick={() => onBet(battle.id)}
            className="btn-short"
          >
            SHORT
          </Button>
        </div>

        {/* Stats */}
        <div className="flex items-center justify-center gap-4 text-xs text-terminal-muted mb-4">
          <span>Min {formatCurrency(battle.minBet)}</span>
          <span className="w-1 h-1 rounded-full bg-terminal-border" />
          <span>TVL {formatCompactNumber(battle.tvl)}</span>
        </div>

        {/* Countdown Timers - Show urgency and progression */}
        <div className="flex flex-col gap-2">
          {battle.nextEscalationTime && battle.escalationLevel !== undefined && battle.escalationLevel < 3 && (
            <CountdownTimer 
              targetTime={battle.nextEscalationTime}
              label={`Next: ${[10, 20, 50][battle.escalationLevel]}x`}
              urgentThreshold={15}
            />
          )}
          {battle.startTime && battle.escalationLevel === 3 && (
            <CountdownTimer 
              targetTime={battle.startTime + (4 * 60 * 1000)} // 4 minutes from start
              label="AUTO-LIQUIDATION"
              urgentThreshold={30}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="terminal-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-terminal-muted">#{battle.round}</span>
          {getStatusBadge()}
        </div>
        {battle.viewers > 0 && (
          <div className="flex items-center gap-1 text-xs text-terminal-muted">
            <Users className="w-3 h-3" />
            {battle.viewers}
          </div>
        )}
      </div>

      {/* Amounts Bar */}
      <div className="relative h-1.5 rounded-sm overflow-hidden bg-terminal-border mb-3">
        <div 
          className="absolute left-0 top-0 h-full bg-long transition-all duration-500"
          style={{ width: `${bullRatio * 100}%` }}
        />
        <div 
          className="absolute right-0 top-0 h-full bg-short transition-all duration-500"
          style={{ width: `${bearRatio * 100}%` }}
        />
      </div>

      {/* Amounts */}
      <div className="flex justify-between mb-4 text-sm">
        <div className="flex items-center gap-1.5">
          <TrendingUp className="w-3.5 h-3.5 text-long" />
          <span className="font-mono">{formatCurrency(battle.bullAmount)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="font-mono">{formatCurrency(battle.bearAmount)}</span>
          <TrendingDown className="w-3.5 h-3.5 text-short" />
        </div>
      </div>

      {/* Action Button */}
      {battle.status === 'waiting' && onSponsor && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onSponsor(battle.id)}
          className="w-full border-short/30 text-short hover:bg-short/10 text-xs"
        >
          SPONSOR SHORT ${battle.minBet - (battle.bearAmount % battle.minBet)}
        </Button>
      )}

      {battle.status === 'starting' && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onBet(battle.id)}
          className="w-full border-info/30 text-info hover:bg-info/10 text-xs"
        >
          ENTER POSITION
          <span className="ml-2 text-terminal-muted">
            {battle.timeRemaining}
          </span>
        </Button>
      )}

      {battle.status === 'live' && onWatch && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onWatch(battle.id)}
          className="w-full border-short/30 text-short hover:bg-short/10 text-xs"
        >
          WATCH
          <span className="ml-2 text-terminal-muted">
            {battle.viewers}
          </span>
        </Button>
      )}
    </div>
  );
}
