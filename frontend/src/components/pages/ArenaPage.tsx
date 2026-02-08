import { useState, useEffect } from 'react';
import { ArrowLeft, Share2, TrendingUp, TrendingDown, Plus, X, Wifi, WifiOff, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HealthBar, BetModal, ZKToast, WinLoseModal, VerificationStatus, VerificationInfo } from '@/components/shared';
import { formatCurrency, formatTimeRemaining } from '@/lib/utils';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useBetting } from '@/hooks/useBetting';
import { useWallet } from '@/hooks/useWallet';
import type { BattleSide, Battle } from '@/types';

interface ArenaPageProps {
  walletBalance: number;
  onNavigate: (page: string) => void;
}

export function ArenaPage({ walletBalance, onNavigate }: ArenaPageProps) {
  const {
    isConnected,
    currentPrice,
    priceChange,
    battles,
    feed: wsFeed,
    error,
  } = useWebSocket();
  
  const { walletState, account } = useWallet();

  const [activeBattle, setActiveBattle] = useState<Battle | null>(null);
  const [betModalOpen, setBetModalOpen] = useState(false);
  const [bettingSide, setBettingSide] = useState<BattleSide | null>(null);
  const [zkToastVisible, setZkToastVisible] = useState(false);
  const [zkStatus, setZkStatus] = useState<'verified' | 'pending' | 'failed'>('verified');
  const [winLoseModalOpen, setWinLoseModalOpen] = useState(false);
  const [winLoseType, setWinLoseType] = useState<'win' | 'lose' | 'sponsor_win'>('win');
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [estimatedTimeToLiquidation, setEstimatedTimeToLiquidation] = useState<{ bull: number | null; bear: number | null }>({ bull: null, bear: null });
  const [escalationCountdown, setEscalationCountdown] = useState<number | null>(null);
  
  // User position - would come from real betting data
  // For now, track if user has placed a bet
  const [userPosition, setUserPosition] = useState<{
    side: BattleSide;
    amount: number;
    currentWin: number;
    risk: number;
  } | null>(null);

  // Set active battle from WebSocket data
  useEffect(() => {
    if (battles.length > 0) {
      // Find the first live battle or the most recent one
      const liveBattle = battles.find(b => b.status === 'live');
      const battle = liveBattle || battles[0];
      setActiveBattle(battle);
      
      // Calculate time remaining if battle has endTime
      if (battle) {
        // For escalation mechanic: use escalationStartTime + 4 minutes (240000ms)
        if (battle.escalationStartTime) {
          const escalationStart = typeof battle.escalationStartTime === 'number' 
            ? battle.escalationStartTime 
            : new Date(battle.escalationStartTime).getTime();
          const now = Date.now();
          const battleEndTime = escalationStart + 240000; // 4 minutes = 240000ms
          const remaining = Math.max(0, Math.floor((battleEndTime - now) / 1000));
          setTimeRemaining(remaining);
          console.log('⏱️ Battle timer calculated from escalationStartTime:', {
            escalationStart,
            now,
            battleEndTime,
            remaining,
            formatted: formatTimeRemaining(remaining)
          });
        } 
        // Fallback: Try endTime first (in milliseconds)
        else if (battle.endTime) {
          const endTime = typeof battle.endTime === 'number' ? battle.endTime : new Date(battle.endTime).getTime();
          const now = Date.now();
          const remaining = Math.max(0, Math.floor((endTime - now) / 1000));
          setTimeRemaining(remaining);
          console.log('⏱️ Battle timer calculated from endTime:', {
            endTime,
            now,
            remaining,
            formatted: formatTimeRemaining(remaining)
          });
        } 
        // Fallback: calculate from startTime + 4 minutes (escalation mechanic default)
        else if (battle.startTime) {
          const startTime = typeof battle.startTime === 'number' ? battle.startTime : new Date(battle.startTime).getTime();
          const now = Date.now();
          const battleEndTime = startTime + 240000; // 4 minutes = 240000ms
          const remaining = Math.max(0, Math.floor((battleEndTime - now) / 1000));
          setTimeRemaining(remaining);
          console.log('⏱️ Battle timer calculated from startTime (4min):', {
            startTime,
            now,
            battleEndTime,
            remaining,
            formatted: formatTimeRemaining(remaining)
          });
        } else {
          console.warn('⚠️ No startTime or escalationStartTime found for battle:', battle.id);
          setTimeRemaining(null);
        }
      }
    }
  }, [battles]);

  // Update countdown timer
  useEffect(() => {
    if (timeRemaining === null || timeRemaining <= 0) return;
    
    const interval = setInterval(() => {
      setTimeRemaining(prev => {
        if (prev === null || prev <= 0) return 0;
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(interval);
  }, [timeRemaining]);

  // Calculate escalation countdown (time until next leverage increase)
  useEffect(() => {
    if (!activeBattle) {
      setEscalationCountdown(null);
      return;
    }

    // If no nextEscalationTime, calculate it from escalationStartTime
    const calculateCountdown = () => {
      if (!activeBattle) {
        setEscalationCountdown(null);
        return;
      }

      let nextEscalation: number | null = null;
      
      if (activeBattle.nextEscalationTime) {
        nextEscalation = typeof activeBattle.nextEscalationTime === 'number'
          ? activeBattle.nextEscalationTime
          : new Date(activeBattle.nextEscalationTime).getTime();
      } else if (activeBattle.escalationStartTime && activeBattle.escalationLevel !== undefined) {
        // Calculate next escalation time from start time and current level
        const escalationStart = typeof activeBattle.escalationStartTime === 'number'
          ? activeBattle.escalationStartTime
          : new Date(activeBattle.escalationStartTime).getTime();
        const escalationLevel = activeBattle.escalationLevel ?? 0;
        const escalationInterval = 60000; // 60 seconds
        nextEscalation = escalationStart + (escalationLevel + 1) * escalationInterval;
      } else if (activeBattle.startTime && activeBattle.escalationLevel !== undefined) {
        // Fallback: use startTime
        const startTime = typeof activeBattle.startTime === 'number'
          ? activeBattle.startTime
          : new Date(activeBattle.startTime).getTime();
        const escalationLevel = activeBattle.escalationLevel ?? 0;
        const escalationInterval = 60000; // 60 seconds
        nextEscalation = startTime + (escalationLevel + 1) * escalationInterval;
      }

      if (nextEscalation === null) {
        setEscalationCountdown(null);
        return;
      }

      const now = Date.now();
      const remaining = Math.max(0, Math.floor((nextEscalation - now) / 1000));
      setEscalationCountdown(remaining);
      
      // Only show if escalation level is less than max (3 = 50x)
      if (activeBattle.escalationLevel !== undefined && activeBattle.escalationLevel >= 3) {
        setEscalationCountdown(null);
      }
    };

    // Calculate immediately
    calculateCountdown();

    // Update every second
    const interval = setInterval(calculateCountdown, 1000);

    return () => clearInterval(interval);
  }, [activeBattle?.nextEscalationTime, activeBattle?.escalationStartTime, activeBattle?.startTime, activeBattle?.escalationLevel]);


  // Get wallet address from useWallet hook
  const walletAddress = walletState.address;

  // Set global user address for WebSocket to check if winnings are for current user
  useEffect(() => {
    if (walletAddress) {
      (window as any).__currentUserAddress = walletAddress;
    } else {
      delete (window as any).__currentUserAddress;
    }
  }, [walletAddress]);

  // Listen for battle ended events and check user bets
  useEffect(() => {
    const handleBattleEnded = async (event: Event) => {
      const customEvent = event as CustomEvent;
      const { battleId, winner, payoutRatio } = customEvent.detail;
      
      // Only handle if this is the active battle or user has a position
      if (!activeBattle || activeBattle.id !== battleId) return;
      if (!walletAddress) return;
      
      try {
        // Fetch user's bets for this battle
        const apiUrl = import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
        const response = await fetch(`${apiUrl}/api/battles/${battleId}/bets/${walletAddress}`);
        const data = await response.json();
        
        if (data.bets && data.bets.length > 0) {
          // Find the most recent bet
          const userBet = data.bets[0];
          const userSide = userBet.side.toUpperCase() === 'BULL' ? 'BULL' : 'BEAR';
          const userWon = userSide === winner;
          
          // Calculate winnings
          // Use payout from database if available (more accurate), otherwise calculate from payoutRatio
          let winnings = 0;
          if (userBet.settled && userBet.won && userBet.payout) {
            // Use actual payout from database (includes bet amount + winnings)
            winnings = userBet.payout - userBet.amount; // winnings = total payout - bet amount
          } else if (userWon && payoutRatio > 0) {
            // Calculate from payout ratio (fallback)
            winnings = (userBet.amount * payoutRatio) - userBet.amount; // winnings = (bet * ratio) - bet
          }
          
          // Update user position
          setUserPosition({
            side: userBet.side as BattleSide,
            amount: userBet.amount,
            currentWin: winnings,
            risk: -userBet.amount,
          });
          
          // Show win/lose modal
          setWinLoseType(userWon ? 'win' : 'lose');
          setWinLoseModalOpen(true);
          
          // Log for debugging
          console.log('🎰 Bet result:', {
            battleId,
            userBet,
            userSide,
            winner,
            userWon,
            betAmount: userBet.amount,
            payoutRatio,
            winnings,
            settled: userBet.settled,
            payout: userBet.payout,
          });
        } else {
          console.log('⚠️ No bets found for user in this battle:', { battleId, walletAddress });
        }
      } catch (error) {
        console.error('❌ Failed to fetch user bets:', error);
      }
    };
    
    // Also listen for userWon event from WebSocket
    const handleUserWon = (event: Event) => {
      const customEvent = event as CustomEvent;
      const { betAmount, winnings, totalPayout, side, payoutRatio } = customEvent.detail;
      
      // Show impressive win modal
      setWinLoseType('win');
      setUserPosition({
        side: side === 'bull' ? 'bull' : 'bear',
        amount: betAmount,
        currentWin: winnings,
        risk: -betAmount,
      });
      setWinLoseModalOpen(true);
    };

    window.addEventListener('battleEnded', handleBattleEnded);
    window.addEventListener('userWon', handleUserWon);
    return () => {
      window.removeEventListener('battleEnded', handleBattleEnded);
      window.removeEventListener('userWon', handleUserWon);
    };
  }, [activeBattle, walletAddress]);

  const { placeBet, isPending: isBettingPending, error: bettingError } = useBetting();
  const [bettingStatus, setBettingStatus] = useState<'idle' | 'validating' | 'approving' | 'placing' | 'success' | 'error'>('idle');
  useEffect(() => {
    if (account?.address) {
      (window as any).__currentWalletAddress = account.address.toLowerCase();
    } else {
      delete (window as any).__currentWalletAddress;
    }
  }, [account?.address]);
  
  // Check if user is sponsor of either side (from battle data)
  const isBullSponsor = activeBattle && walletAddress && (activeBattle as any).bull?.sponsor?.toLowerCase() === walletAddress.toLowerCase();
  const isBearSponsor = activeBattle && walletAddress && (activeBattle as any).bear?.sponsor?.toLowerCase() === walletAddress.toLowerCase();

  const handleBet = (side: BattleSide) => {
    setBettingSide(side);
    setBetModalOpen(true);
  };

  const handleConfirmBet = async (side: BattleSide, amount: number) => {
    if (!activeBattle || !walletAddress || !activeBattle.battleAddress) {
      setBettingStatus('error');
      return;
    }
    
    setBettingStatus('validating');
    
    try {
      // Place bet via contract
      const result = await placeBet(
        activeBattle.id,
        activeBattle.battleAddress,
        side,
        amount
      );
      
      if (result.success) {
        setBettingStatus('success');
        
        // Update local position state
        setUserPosition({
          side,
          amount,
          currentWin: 0, // Will be calculated based on battle outcome
          risk: -amount, // Initial risk is the bet amount
        });
        
        // Close modal after showing success
        setTimeout(() => {
          setBetModalOpen(false);
          setBettingStatus('idle');
        }, 2000);
      }
    } catch (error: any) {
      console.error('Failed to place bet:', error);
      setBettingStatus('error');
    }
  };

  const handleCashOut = () => {
  };

  const showZKToast = (status: 'verified' | 'pending' | 'failed') => {
    setZkStatus(status);
    setZkToastVisible(true);
    setTimeout(() => setZkToastVisible(false), 3000);
  };

  // Use WebSocket price or active battle price
  const displayPrice = activeBattle?.currentPrice || currentPrice;
  const displayChange = (() => {
    const change = activeBattle?.priceChange ?? priceChange ?? 0;
    // Handle Infinity, NaN, or invalid values
    if (!isFinite(change) || isNaN(change)) {
      return 0;
    }
    return change;
  })();
  const isPositive = displayChange >= 0;

  // Get health and leverage from active battle or use defaults
  const bullHealth = activeBattle?.bullHealth ?? 85;
  const bearHealth = activeBattle?.bearHealth ?? 60;
  
  // Escalation data
  const escalationLevel = activeBattle?.escalationLevel ?? 0;
  const escalationLevels = [5, 10, 20, 50];
  const currentLeverage = (activeBattle as any)?.currentLeverage ?? escalationLevels[escalationLevel] ?? 5;
  
  // Get leverage from escalation or battle data
  const bullLeverage = activeBattle?.bullLeverage ?? currentLeverage;
  const bearLeverage = activeBattle?.bearLeverage ?? currentLeverage;
  const bullZK = activeBattle?.bullZKVerified ?? true;
  const bearZK = activeBattle?.bearZKVerified ?? false;

  // Calculate estimated time to liquidation based on current health and price volatility
  useEffect(() => {
    if (!activeBattle || !currentPrice) {
      setEstimatedTimeToLiquidation({ bull: null, bear: null });
      return;
    }

    // Estimate based on current health and typical price volatility
    // Assumes ~0.5% hourly volatility (conservative estimate for ETH)
    const hourlyVolatility = 0.005; // 0.5% per hour
    const leverage = 10;
    
    // Calculate how much health needs to drop to reach 5% (liquidation threshold)
    const bullHealthDropNeeded = Math.max(0, bullHealth - 5); // % health to lose
    const bearHealthDropNeeded = Math.max(0, bearHealth - 5);
    
    // With 10x leverage, 1% price move = 10% health change
    // So health drop needed = (price move needed) * leverage
    const bullPriceMoveNeeded = bullHealthDropNeeded / leverage; // % price move needed
    const bearPriceMoveNeeded = bearHealthDropNeeded / leverage;
    
    // Estimate time based on volatility (hours)
    const bullHoursEstimate = bullHealthDropNeeded > 0 ? bullPriceMoveNeeded / hourlyVolatility : null;
    const bearHoursEstimate = bearHealthDropNeeded > 0 ? bearPriceMoveNeeded / hourlyVolatility : null;
    
    setEstimatedTimeToLiquidation({
      bull: bullHoursEstimate ? Math.max(1, Math.floor(bullHoursEstimate * 3600)) : null, // Convert to seconds, min 1 second
      bear: bearHoursEstimate ? Math.max(1, Math.floor(bearHoursEstimate * 3600)) : null
    });
  }, [activeBattle, bullHealth, bearHealth, currentPrice]);

  return (
    <div className="min-h-screen bg-terminal-bg pt-14">
      {/* Top Bar */}
      <div className="fixed top-14 left-0 right-0 z-40 bg-terminal-bg border-b border-terminal-border">
        <div className="max-w-7xl mx-auto px-4 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => onNavigate('home')}
                className="p-1.5 rounded hover:bg-terminal-elevated transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-mono text-sm">
                  BATTLE #{activeBattle?.round || activeBattle?.id?.split('-')[1] || '48'}
                </span>
                <span className="badge-live">
                  <span className="w-1.5 h-1.5 rounded-full bg-short animate-pulse-subtle" />
                  {activeBattle?.tier === 'PRIMARY' 
                    ? 'PRIMARY ARENA' 
                    : activeBattle?.status === 'waiting' || (activeBattle?.bullAmount === 0 || activeBattle?.bearAmount === 0)
                    ? 'SECONDARY LOBBY'
                    : activeBattle?.status?.toUpperCase() || 'BATTLE'}
                </span>
                {/* Escalation Countdown */}
                {escalationCountdown !== null && escalationCountdown > 0 && activeBattle && activeBattle.escalationLevel !== undefined && activeBattle.escalationLevel < 3 && (
                  <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border transition-all ${
                    escalationCountdown <= 10 
                      ? 'bg-short/20 border-short/50 shadow-lg shadow-short/20' 
                      : escalationCountdown <= 30
                      ? 'bg-warning/20 border-warning/50 shadow-md shadow-warning/10'
                      : 'bg-terminal-elevated border-terminal-border'
                  }`}>
                    <Clock className={`w-4 h-4 ${escalationCountdown <= 10 ? 'text-short animate-pulse' : escalationCountdown <= 30 ? 'text-warning' : 'text-terminal-muted'}`} />
                    <div className="flex flex-col">
                      <span className={`font-mono text-xs leading-tight ${escalationCountdown <= 10 ? 'text-short font-bold' : escalationCountdown <= 30 ? 'text-warning' : 'text-terminal-muted'}`}>
                        Next Escalation
                      </span>
                      <span className={`font-mono text-sm font-bold leading-tight ${escalationCountdown <= 10 ? 'text-short' : escalationCountdown <= 30 ? 'text-warning' : 'text-foreground'}`}>
                        {formatTimeRemaining(escalationCountdown)} → {(() => {
                          const levels = [5, 10, 20, 50];
                          const nextLevel = activeBattle.escalationLevel !== undefined ? levels[activeBattle.escalationLevel + 1] : 10;
                          return nextLevel;
                        })()}x
                      </span>
                    </div>
                  </div>
                )}
                {timeRemaining !== null && timeRemaining > 0 ? (
                  <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md border ${
                    timeRemaining <= 60 
                      ? 'bg-short/20 border-short' 
                      : timeRemaining <= 120
                      ? 'bg-yellow-500/20 border-yellow-500'
                      : 'bg-terminal-elevated border-terminal-border'
                  }`}>
                    <Clock className={`w-3 h-3 ${timeRemaining <= 60 ? 'text-short' : 'text-terminal-muted'}`} />
                    <span className={`font-mono text-xs ${timeRemaining <= 60 ? 'text-short font-bold' : 'text-terminal-muted'}`}>
                      ⏱️ {formatTimeRemaining(timeRemaining)} until battle ends
                    </span>
                  </div>
                ) : timeRemaining === null ? (
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-terminal-elevated/50 border border-terminal-border/50">
                    <Clock className="w-3 h-3 text-terminal-muted/50" />
                    <span className="font-mono text-xs text-terminal-muted/70">No end time set</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-warning/20 border border-warning/30">
                    <Clock className="w-3 h-3 text-warning" />
                    <span className="font-mono text-xs text-warning">Ended - Settling...</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* Connection Status */}
              <div className={`flex items-center gap-1.5 text-xs ${isConnected ? 'text-long' : 'text-short'}`}>
                {isConnected ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{isConnected ? 'Live' : 'Offline'}</span>
              </div>
              <Button variant="ghost" size="sm" className="text-terminal-muted text-xs h-7">
                <Share2 className="w-3.5 h-3.5 mr-1.5" />
                Share
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Price Ticker */}
      <div className="fixed top-[6.5rem] left-0 right-0 z-30 bg-terminal-elevated/80 backdrop-blur-sm border-b border-terminal-border">
        <div className="max-w-7xl mx-auto px-4 py-2">
          <div className="flex items-center justify-between gap-4 text-xs">
            {/* Market */}
            <div className="flex items-center gap-2">
              <span className="text-terminal-muted">ETH-PERP</span>
              <span className={`font-mono font-medium ${isPositive ? 'text-long' : 'text-short'}`}>
                {formatCurrency(displayPrice)} {isPositive ? '+' : ''}{displayChange.toFixed(1)}%
              </span>
            </div>
            {/* Battle types (teaser tabs) */}
            <div className="hidden sm:flex items-center gap-1">
              <button
                type="button"
                className="px-3 py-1 rounded-full text-[11px] font-medium bg-terminal-card border border-terminal-border text-foreground"
              >
                TIER 1: Duel <span className="text-long ml-1">● Live</span>
              </button>
              <button
                type="button"
                disabled
                className="px-3 py-1 rounded-full text-[11px] font-medium bg-terminal-bg border border-terminal-border/60 text-terminal-muted cursor-not-allowed"
              >
                TIER 2: Royale <span className="ml-1 text-terminal-muted/70">Soon</span>
              </button>
              <button
                type="button"
                disabled
                className="px-3 py-1 rounded-full text-[11px] font-medium bg-terminal-bg border border-terminal-border/60 text-terminal-muted cursor-not-allowed"
              >
                TIER 3: Tournament <span className="ml-1 text-terminal-muted/70">Soon</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-28 pb-40 px-4 max-w-6xl mx-auto">
        {/* Win Conditions Info */}
        <div className="mb-4 p-4 rounded-lg bg-terminal-elevated border border-terminal-border">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-long/10 flex items-center justify-center border border-long/30 flex-shrink-0">
              <span className="text-lg">⚔️</span>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-medium mb-2">How Battles End & Who Wins</h3>
              <div className="space-y-1.5 text-xs text-terminal-muted">
                <div className="flex items-start gap-2">
                  <span className="text-short">•</span>
                  <span><strong className="text-foreground">Liquidation:</strong> If health drops below 5%, agent is eliminated</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-short">•</span>
                  <span><strong className="text-foreground">4-Minute Auto-Settle:</strong> Battle automatically ends after 4 minutes, winner determined by who survived longer</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-short">•</span>
                  <span><strong className="text-foreground">Winner:</strong> Last agent standing, or best PnL if both survive</span>
                </div>
                {activeBattle && (
                  <div className="mt-2 pt-2 border-t border-terminal-border space-y-2">
                    <div className="flex items-center gap-4 text-xs flex-wrap">
                      <span>Bull Health: <strong className={bullHealth <= 5 ? 'text-short' : 'text-foreground'}>{bullHealth.toFixed(1)}%</strong></span>
                      <span>Bear Health: <strong className={bearHealth <= 5 ? 'text-short' : 'text-foreground'}>{bearHealth.toFixed(1)}%</strong></span>
                      {timeRemaining !== null && timeRemaining > 0 && (
                        <span>Time Left: <strong className="text-foreground">{formatTimeRemaining(timeRemaining)}</strong></span>
                      )}
                      {timeRemaining === null && (
                        <span className="text-terminal-muted/70">Duration: 24 hours</span>
                      )}
                    </div>
                    {/* Estimated time to liquidation */}
                    {(estimatedTimeToLiquidation.bull || estimatedTimeToLiquidation.bear) && (
                      <div className="text-xs text-terminal-muted pt-1 border-t border-terminal-border/50">
                        <div className="font-medium text-foreground mb-1">⏱️ Estimated Time to Liquidation (if price continues current trend):</div>
                        <div className="flex items-center gap-4 flex-wrap">
                          {estimatedTimeToLiquidation.bull && bullHealth > 5 && (
                            <span>
                              Bull: <strong className="text-short">~{formatTimeRemaining(estimatedTimeToLiquidation.bull)}</strong>
                              <span className="text-terminal-muted/70 ml-1">(if ETH drops ~{((bullHealth - 5) / 10).toFixed(1)}%)</span>
                            </span>
                          )}
                          {estimatedTimeToLiquidation.bear && bearHealth > 5 && (
                            <span>
                              Bear: <strong className="text-short">~{formatTimeRemaining(estimatedTimeToLiquidation.bear)}</strong>
                              <span className="text-terminal-muted/70 ml-1">(if ETH rises ~{((bearHealth - 5) / 10).toFixed(1)}%)</span>
                            </span>
                          )}
                          {(bullHealth <= 5 || bearHealth <= 5) && (
                            <span className="text-short font-medium">⚠️ One agent near liquidation!</span>
                          )}
                        </div>
                        <div className="text-[10px] text-terminal-muted/70 mt-1 italic">
                          * Estimate based on 0.5% hourly volatility. Actual time depends on real price movements.
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Battle Arena */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
          {/* Long Side */}
          <div className="terminal-card p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-long/10 flex items-center justify-center border border-long/30">
                <TrendingUp className="w-5 h-5 text-long" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-sm">LONG</h3>
                  {isBullSponsor && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-long/20 text-long border border-long/30">
                      You Sponsored
                    </span>
                  )}
                </div>
                <p className="text-xs text-terminal-muted">Bull Position</p>
              </div>
            </div>

            <div className="space-y-4 mb-5">
              <div>
                <HealthBar health={bullHealth} side="bull" size="md" />
                {bullHealth <= 5 && (
                  <div className="mt-2 text-xs text-short font-medium flex items-center gap-1">
                    <span>⚠️</span>
                    <span>Near Liquidation - {bullHealth.toFixed(1)}% remaining</span>
                  </div>
                )}
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <span className="text-terminal-muted">Leverage</span>
                <span className="font-mono">{bullLeverage}x</span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-terminal-muted">ZK Proof</span>
                <VerificationStatus
                  status={activeBattle?.bullProofStatus || (bullZK ? 'verified' : 'none')}
                  agentType="bull"
                  lastProofTime={activeBattle?.bullLastProofTime}
                  compact={false}
                />
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-terminal-muted">Position PnL</span>
                <span className="font-mono text-long">+$450</span>
              </div>
            </div>

            <Button 
              onClick={() => handleBet('bull')}
              className="w-full btn-long"
            >
              {isBullSponsor ? 'ADD TO POSITION' : 'BET LONG'}
            </Button>
          </div>

          {/* Short Side */}
          <div className="terminal-card p-5">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-short/10 flex items-center justify-center border border-short/30">
                <TrendingDown className="w-5 h-5 text-short" />
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-sm">SHORT</h3>
                  {isBearSponsor && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-short/20 text-short border border-short/30">
                      You Sponsored
                    </span>
                  )}
                </div>
                <p className="text-xs text-terminal-muted">Bear Position</p>
              </div>
            </div>

            <div className="space-y-4 mb-5">
              <div>
                <HealthBar health={bearHealth} side="bear" size="md" />
                {bearHealth <= 5 && (
                  <div className="mt-2 text-xs text-short font-medium flex items-center gap-1">
                    <span>⚠️</span>
                    <span>Near Liquidation - {bearHealth.toFixed(1)}% remaining</span>
                  </div>
                )}
              </div>
              
              <div className="flex items-center justify-between text-sm">
                <span className="text-terminal-muted">Leverage</span>
                <span className="font-mono">{bearLeverage}x</span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-terminal-muted">ZK Proof</span>
                <VerificationStatus
                  status={activeBattle?.bearProofStatus || (bearZK ? 'verified' : 'none')}
                  agentType="bear"
                  lastProofTime={activeBattle?.bearLastProofTime}
                  compact={false}
                />
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-terminal-muted">Position PnL</span>
                <span className="font-mono text-short">-$380</span>
              </div>
            </div>

            <Button 
              onClick={() => handleBet('bear')}
              className="w-full btn-short"
            >
              {isBearSponsor ? 'ADD TO POSITION' : 'BET SHORT'}
            </Button>
          </div>
        </div>

        {/* Price Line Indicator */}
        <div className="relative h-8 bg-terminal-elevated rounded mb-6 overflow-hidden">
          <div className="absolute left-0 top-0 h-full w-1/3 bg-long/10" />
          <div className="absolute right-0 top-0 h-full w-1/3 bg-short/10" />
          <div 
            className="absolute top-0 w-0.5 h-full bg-info"
            style={{ left: '50%' }}
          />
          <div 
            className="absolute top-1/2 -translate-y-1/2 px-2 py-0.5 rounded text-xs font-mono bg-terminal-bg border border-terminal-border"
            style={{ left: '48%' }}
          >
            {formatCurrency(displayPrice)}
          </div>
        </div>

        {/* Battle Feed */}
        <div className="terminal-card p-4">
          <h4 className="text-xs font-medium text-terminal-muted uppercase tracking-wide mb-3">
            Event Log {wsFeed.length > 0 && <span className="text-long">({wsFeed.length})</span>}
          </h4>
          <div className="terminal-feed space-y-0 max-h-40 overflow-y-auto">
            {wsFeed.length === 0 ? (
              <div className="text-sm text-terminal-muted italic">Waiting for battle events...</div>
            ) : (
              wsFeed.map((item) => (
                <div 
                  key={item.id} 
                  className={`terminal-feed-item flex items-start gap-3 text-sm ${
                    item.type === 'warning' ? 'text-warning' :
                    item.type === 'success' ? 'text-long' :
                    item.type === 'error' ? 'text-short' : ''
                  }`}
                >
                  <span className="text-terminal-muted font-mono text-xs whitespace-nowrap">
                    {item.timestamp}
                  </span>
                  <span>{item.message}</span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mt-4 p-3 bg-short/10 border border-short/30 rounded text-sm text-short">
            Connection Error: {error}
          </div>
        )}
      </div>

      {/* My Position Footer - Only show if user has a position */}
      {userPosition && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-terminal-bg border-t border-terminal-border">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded flex items-center justify-center ${
                  userPosition.side === 'bull' ? 'bg-long/10' : 'bg-short/10'
                }`}>
                  {userPosition.side === 'bull' ? (
                    <TrendingUp className="w-4 h-4 text-long" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-short" />
                  )}
                </div>
                <div>
                  <p className="text-xs text-terminal-muted">
                    Position: <span className="font-mono text-foreground">${userPosition.amount}</span> {userPosition.side.toUpperCase()}
                  </p>
                  <p className="font-mono text-sm">
                    PnL: <span className="text-long">+${userPosition.currentWin}</span>
                    <span className="text-short ml-2">({userPosition.risk}% risk)</span>
                  </p>
                </div>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <Button 
                  variant="outline" 
                  size="sm"
                  className="flex-1 sm:flex-none border-terminal-border hover:bg-terminal-elevated text-xs h-8"
                >
                  <Plus className="w-3.5 h-3.5 mr-1.5" />
                  Add
                </Button>
                <Button 
                  size="sm"
                  onClick={handleCashOut}
                  variant="outline"
                  className="flex-1 sm:flex-none border-warning/30 text-warning hover:bg-warning/10 text-xs h-8"
                >
                  <X className="w-3.5 h-3.5 mr-1.5" />
                  Close
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Bet Modal */}
      <BetModal
        isOpen={betModalOpen}
        onClose={() => {
          setBetModalOpen(false);
          setBettingStatus('idle');
        }}
        onConfirm={handleConfirmBet}
        defaultSide={bettingSide || 'bull'}
        availableBalance={walletState.balance || walletBalance}
        isLoading={isBettingPending || bettingStatus !== 'idle'}
        error={bettingError || (bettingStatus === 'error' ? 'Failed to place bet' : null)}
      />

      {/* ZK Toast */}
      <ZKToast
        status={zkStatus}
        blockNumber="18473221"
        isVisible={zkToastVisible}
      />

      {/* Win/Lose Modal */}
      <WinLoseModal
        isOpen={winLoseModalOpen}
        type={winLoseType}
        amount={userPosition?.amount || 0}
        winnings={userPosition?.currentWin || 0}
        battleId={activeBattle?.id}
        onClose={() => {
          setWinLoseModalOpen(false);
          // Force balance refresh after closing modal to show updated USDC balance
          if (account?.address) {
            window.dispatchEvent(new CustomEvent('refreshBalance'));
          }
          // Navigate to results page after closing
          if (winLoseType === 'win' || winLoseType === 'sponsor_win') {
            onNavigate('results-win');
          } else {
            onNavigate('results-loss');
          }
        }}
        onClaim={() => {
          // Winnings are automatically distributed by contract, no claim needed
          // But we can show a message
          console.log('💰 Winnings should already be in your wallet (distributed automatically by contract)');
          setWinLoseModalOpen(false);
          // Force balance refresh
          if (account?.address) {
            window.dispatchEvent(new CustomEvent('refreshBalance'));
          }
          onNavigate('results-win');
        }}
      />
    </div>
  );
}
