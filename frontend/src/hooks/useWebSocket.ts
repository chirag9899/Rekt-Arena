import { useState, useEffect, useRef, useCallback } from 'react';
import type { Battle, BattleFeedItem } from '@/types';
import { toast } from '@/lib/toast';

interface WebSocketState {
  isConnected: boolean;
  currentPrice: number;
  priceChange: number;
  battles: Battle[];
  activeBattle: Battle | null;
  feed: BattleFeedItem[];
  error: string | null;
}

// Utility to sanitize battle data and fill missing fields
const sanitizeBattle = (battle: Battle): Battle => {
  const escalationLevels = [5, 10, 20, 50];
  const escalationLevel = battle.escalationLevel ?? 0;
  const calculatedLeverage = escalationLevels[escalationLevel] || 5;
  
  // Calculate round from battleId if not present
  let round = battle.round;
  if (!round && battle.id) {
    // Try to extract round from battleId (format: 0x... or primary-1234567890)
    const roundMatch = battle.id.match(/-(\d+)$/);
    if (roundMatch) {
      round = parseInt(roundMatch[1]);
    } else {
      // Fallback: use timestamp from battleId or current time
      round = 1;
    }
  }
  
  // For PRIMARY battles, default TVL to 200 if missing (100 Bull + 100 Bear)
  const defaultTVL = battle.tier === 'PRIMARY' ? 200 : 0;
  const defaultBullAmount = battle.tier === 'PRIMARY' && !battle.bullAmount ? 100 : (battle.bullAmount ?? 0);
  const defaultBearAmount = battle.tier === 'PRIMARY' && !battle.bearAmount ? 100 : (battle.bearAmount ?? 0);
  
  return {
    ...battle,
    round: round || 1,
    bullHealth: battle.bullHealth ?? 100,
    bearHealth: battle.bearHealth ?? 100,
    bullLeverage: battle.bullLeverage || calculatedLeverage,
    bearLeverage: battle.bearLeverage || calculatedLeverage,
    tvl: battle.tvl || defaultTVL,
    minBet: battle.minBet ?? 10,
    bullAmount: defaultBullAmount,
    bearAmount: defaultBearAmount,
  };
};

interface WebSocketMessage {
  type: string;
  payload: any;
  timestamp: number;
}

export function useWebSocket() {
  const [state, setState] = useState<WebSocketState>({
    isConnected: false,
    currentPrice: 0, // No default price - will come from WebSocket
    priceChange: 0,
    battles: [],
    activeBattle: null,
    feed: [],
    error: null,
  });

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    // Don't create a new connection if one already exists and is open/connecting
    if (wsRef.current) {
      const state = wsRef.current.readyState;
      if (state === WebSocket.CONNECTING || state === WebSocket.OPEN) {
        return;
      }
      // Clean up old connection if it's closing/closed
      wsRef.current = null;
    }

    // Clear any pending reconnect
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    try {
      const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:3001';
      const ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        setState(prev => ({ ...prev, isConnected: true, error: null }));
        
        // Subscribe to battle updates
        ws.send(JSON.stringify({ type: 'GET_ALL_BATTLES' }));
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketMessage = JSON.parse(event.data);

          switch (message.type) {
            case 'INITIAL_STATE':
              setState(prev => ({
                ...prev,
                battles: (message.payload.battles || []).map(sanitizeBattle),
                currentPrice: message.payload.currentPrice || prev.currentPrice,
              }));
              break;

            case 'PRICE_UPDATE':
              setState(prev => ({
                ...prev,
                currentPrice: message.payload.price,
                priceChange: parseFloat(message.payload.change),
              }));
              break;

            case 'BATTLE_CREATED':
              {
                const battle = sanitizeBattle(message.payload.battle);
                const isPrimary = battle.tier === 'PRIMARY';
                
                setState(prev => {
                  // Check if battle already exists to prevent duplicates
                  const exists = prev.battles.some(b => b.id === battle.id);
                  if (exists) {
                    // Battle already exists, just update it
                    return {
                      ...prev,
                      battles: prev.battles.map(b =>
                        b.id === battle.id ? battle : b
                      ),
                    };
                  }
                  
                  // New battle, add it
                  return {
                    ...prev,
                    battles: [...prev.battles, battle],
                    feed: [
                      {
                        id: Date.now().toString(),
                        timestamp: new Date().toLocaleTimeString(),
                        message: `${isPrimary ? 'Primary' : 'New'} battle created`,
                        type: 'success',
                      },
                      ...prev.feed.slice(0, 19),
                    ],
                  };
                });
                
                // Show toast for new primary battles
                if (isPrimary) {
                  toast.success('New Primary Battle', {
                    id: `battle-created-${battle.id}`,
                    description: `Round #${battle.round || '?'} is now live. Place your bets!`,
                    duration: 5000,
                  });
                }
              }
              break;

            case 'BATTLE_UPDATE':
              setState(prev => ({
                ...prev,
                battles: prev.battles.map(b =>
                  b.id === message.payload.battle.id ? sanitizeBattle(message.payload.battle) : b
                ),
                activeBattle: prev.activeBattle?.id === message.payload.battle.id
                  ? sanitizeBattle(message.payload.battle)
                  : prev.activeBattle,
              }));
              break;

            case 'AGENT_HEALTH':
              // Update battle health in battles array
              setState(prev => ({
                ...prev,
                battles: prev.battles.map(b => {
                  if (b.id === message.payload.battleId) {
                    return {
                      ...b,
                      [`${message.payload.agentType}Health`]: message.payload.health as number,
                    };
                  }
                  return b;
                }),
                activeBattle: prev.activeBattle?.id === message.payload.battleId
                  ? {
                      ...prev.activeBattle,
                      [`${message.payload.agentType}Health`]: message.payload.health as number,
                    } as Battle
                  : prev.activeBattle,
                feed: [
                  {
                    id: Date.now().toString(),
                    timestamp: new Date().toLocaleTimeString(),
                    message: `${message.payload.agentType} health: ${message.payload.health}%`,
                    type: message.payload.health < 30 ? 'warning' : 'info',
                  },
                  ...prev.feed.slice(0, 19),
                ],
              }));
              break;

            case 'PROOF_SUBMITTED':
              // Update battle with proof submission status
              setState(prev => ({
                ...prev,
                battles: prev.battles.map(b => {
                  if (b.id === message.payload.battleId) {
                    const agentType = message.payload.agentType;
                    return {
                      ...b,
                      [`${agentType}ProofStatus`]: 'verifying' as const,
                      [`${agentType}LastProofTime`]: message.payload.timestamp,
                    };
                  }
                  return b;
                }),
                activeBattle: prev.activeBattle?.id === message.payload.battleId
                  ? {
                      ...prev.activeBattle,
                      [`${message.payload.agentType}ProofStatus`]: 'verifying' as const,
                      [`${message.payload.agentType}LastProofTime`]: message.payload.timestamp,
                    } as Battle
                  : prev.activeBattle,
                feed: [
                  {
                    id: Date.now().toString(),
                    timestamp: new Date().toLocaleTimeString(),
                    message: `${message.payload.agentType.toUpperCase()} proof submitted - verifying...`,
                    type: 'info' as const,
                  },
                  ...prev.feed.slice(0, 19),
                ],
              }));
              break;

            case 'PROOF_VERIFIED':
              // Update battle with verified status
              setState(prev => ({
                ...prev,
                battles: prev.battles.map(b => {
                  if (b.id === message.payload.battleId) {
                    const agentType = message.payload.agentType;
                    return {
                      ...b,
                      [`${agentType}ProofStatus`]: 'verified' as const,
                      [`${agentType}ZKVerified`]: true,
                      [`${agentType}LastProofTime`]: message.payload.timestamp,
                    };
                  }
                  return b;
                }),
                activeBattle: prev.activeBattle?.id === message.payload.battleId
                  ? {
                      ...prev.activeBattle,
                      [`${message.payload.agentType}ProofStatus`]: 'verified' as const,
                      [`${message.payload.agentType}ZKVerified`]: true,
                      [`${message.payload.agentType}LastProofTime`]: message.payload.timestamp,
                    } as Battle
                  : prev.activeBattle,
                feed: [
                  {
                    id: Date.now().toString(),
                    timestamp: new Date().toLocaleTimeString(),
                    message: `${message.payload.agentType.toUpperCase()} proof verified ✓`,
                    type: 'success' as const,
                  },
                  ...prev.feed.slice(0, 19),
                ],
              }));
              break;

            case 'PROOF_FAILED':
              // Update battle with failed status
              setState(prev => ({
                ...prev,
                battles: prev.battles.map(b => {
                  if (b.id === message.payload.battleId) {
                    const agentType = message.payload.agentType;
                    return {
                      ...b,
                      [`${agentType}ProofStatus`]: 'failed' as const,
                      [`${agentType}ZKVerified`]: false,
                    };
                  }
                  return b;
                }),
                activeBattle: prev.activeBattle?.id === message.payload.battleId
                  ? {
                      ...prev.activeBattle,
                      [`${message.payload.agentType}ProofStatus`]: 'failed' as const,
                      [`${message.payload.agentType}ZKVerified`]: false,
                    } as Battle
                  : prev.activeBattle,
                feed: [
                  {
                    id: Date.now().toString(),
                    timestamp: new Date().toLocaleTimeString(),
                    message: `${message.payload.agentType.toUpperCase()} proof verification failed: ${message.payload.reason || 'Invalid proof'}`,
                    type: 'error' as const,
                  },
                  ...prev.feed.slice(0, 19),
                ],
              }));
              break;

            case 'AGENT_LIQUIDATED':
              setState(prev => ({
                ...prev,
                feed: [
                  {
                    id: Date.now().toString(),
                    timestamp: new Date().toLocaleTimeString(),
                    message: `${message.payload.agentType} LIQUIDATED!`,
                    type: 'error',
                  },
                  ...prev.feed.slice(0, 19),
                ],
              }));
              break;

            case 'BATTLE_ESCALATED':
              const escalationLevels = [5, 10, 20, 50];
              const currentLeverage = message.payload.leverage || escalationLevels[message.payload.level] || 5;
              const nextLeverage = message.payload.level < escalationLevels.length - 1 
                ? escalationLevels[message.payload.level + 1] 
                : 'AUTO-LIQUIDATE';
              
              setState(prev => ({
                ...prev,
                battles: prev.battles.map(b => {
                  if (b.id === message.payload.battleId) {
                    return {
                      ...b,
                      escalationLevel: message.payload.level,
                      nextEscalationTime: message.payload.nextEscalationTime,
                      bullLeverage: currentLeverage,
                      bearLeverage: currentLeverage,
                    };
                  }
                  return b;
                }),
                activeBattle: prev.activeBattle?.id === message.payload.battleId
                  ? {
                      ...prev.activeBattle,
                      escalationLevel: message.payload.level,
                      nextEscalationTime: message.payload.nextEscalationTime,
                      bullLeverage: currentLeverage,
                      bearLeverage: currentLeverage,
                    } as Battle
                  : prev.activeBattle,
                feed: [
                  {
                    id: Date.now().toString(),
                    timestamp: new Date().toLocaleTimeString(),
                    message: `ESCALATION: Leverage increased to ${currentLeverage}x! Next: ${nextLeverage}x`,
                    type: currentLeverage >= 50 ? 'error' : 'warning',
                  },
                  ...prev.feed.slice(0, 19),
                ],
              }));
              
              // Show escalation toast
              const isMax = currentLeverage >= 50;
              
              toast.warning(`Leverage: ${currentLeverage}x`, {
                id: `escalation-${message.payload.battleId}-${currentLeverage}`,
                description: isMax 
                  ? 'MAX LEVERAGE! Battle auto-liquidates in 60s!' 
                  : `Next escalation: ${nextLeverage}x in 60s`,
                duration: 5000,
              });
              break;

            case 'BET_PLACED':
              setState(prev => ({
                ...prev,
                feed: [
                  {
                    id: Date.now().toString(),
                    timestamp: new Date().toLocaleTimeString(),
                    message: `New ${message.payload.side} bet: $${message.payload.amount}`,
                    type: 'success',
                  },
                  ...prev.feed.slice(0, 19),
                ],
              }));
              break;

            case 'ALL_BATTLES':
              // Handle full state update (e.g., after battles cleared)
              // Deduplicate battles by ID
              const allBattles = (message.payload.battles || []).map(sanitizeBattle);
              const uniqueBattles = allBattles.filter((battle: Battle, index: number, self: Battle[]) =>
                index === self.findIndex((b: Battle) => b.id === battle.id)
              );
              
              setState(prev => ({
                ...prev,
                battles: uniqueBattles,
                currentPrice: message.payload.currentPrice || prev.currentPrice,
              }));
              break;

            case 'BATTLE_ENDED':
              {
                const { winner, battleId, bullHealth, bearHealth, totalPool, payoutRatio, tier, winningPool, losingPool } = message.payload;
                const isPrimary = tier === 'PRIMARY';
                
                // Remove ended battle from battles array
                setState(prev => ({
                  ...prev,
                  battles: prev.battles.filter(b => b.id !== battleId),
                  activeBattle: prev.activeBattle?.id === battleId ? null : prev.activeBattle,
                  feed: [
                    {
                      id: Date.now().toString(),
                      timestamp: new Date().toLocaleTimeString(),
                      message: `Battle ${isPrimary ? '(PRIMARY)' : ''} ended - ${winner} wins!`,
                      type: 'success',
                    },
                    ...prev.feed.slice(0, 19),
                  ],
                }));

                // Show winner toast notification
                const loserName = winner === 'BULL' ? 'BEAR' : 'BULL';
                const payoutText = totalPool > 0 ? `\nPayout: ${payoutRatio.toFixed(2)}x` : '';
                
                toast.success(`${winner} WINS!`, {
                  id: `battle-ended-${battleId}`,
                  description: `${winner}: ${bullHealth.toFixed(1)}%\n${loserName}: ${bearHealth.toFixed(1)}%${payoutText}`,
                  duration: 10000,
                });
                
                // Emit custom event for ArenaPage to handle user bet results
                window.dispatchEvent(new CustomEvent('battleEnded', {
                  detail: {
                    battleId,
                    winner,
                    payoutRatio,
                    winningPool,
                    losingPool,
                  },
                }));
              }
              break;

            case 'WINNINGS_DISTRIBUTED':
              {
                const { bettor, betAmount, winnings, totalPayout, side, txHash, settlementTxHash, battleId, viaYellow } = message.payload;
                
                // Check if this is for the current user
                const currentUser = (window as any).__currentUserAddress?.toLowerCase();
                const isCurrentUser = currentUser && bettor.toLowerCase() === currentUser;
                
                const blockExplorerUrl = 'https://amoy.polygonscan.com';
                // Prefer settlement tx hash (shows the actual settlement transaction)
                // Otherwise use bet tx hash (shows when they placed the bet)
                const txHashToUse = settlementTxHash || txHash;
                const txLink = txHashToUse ? `${blockExplorerUrl}/tx/${txHashToUse}` : null;
                const source = viaYellow ? ' (Yellow SDK)' : '';
                const payoutRatio = betAmount > 0 ? (totalPayout / betAmount).toFixed(2) : '0.00';
                
                // Format bettor address for display (shortened)
                const bettorShort = `${bettor.slice(0, 6)}...${bettor.slice(-4)}`;
                
                if (isCurrentUser) {
                  // Show impressive celebration toast for current user
                  toast.success(`🎉 YOU WON ${winnings.toFixed(2)} USDC! 🎉`, {
                    id: `winnings-${bettor}-${battleId}`,
                    description: `Congratulations! Your ${betAmount.toFixed(2)} USDC bet on ${side.toUpperCase()} paid out ${payoutRatio}x!\n\n💰 Total Return: ${totalPayout.toFixed(2)} USDC\n💵 Profit: +${winnings.toFixed(2)} USDC`,
                    duration: 20000,
                    action: txLink ? {
                      label: 'View Transaction',
                      onClick: () => window.open(txLink, '_blank'),
                    } : undefined,
                  });
                  
                  // Also trigger a custom event for a modal or banner
                  window.dispatchEvent(new CustomEvent('userWon', {
                    detail: {
                      bettor,
                      betAmount,
                      winnings,
                      totalPayout,
                      side,
                      txHash: txHashToUse,
                      settlementTxHash,
                      battleId,
                      payoutRatio,
                    },
                  }));
                } else {
                  // Show regular toast for other users with transaction link
                  let description = `${bettorShort} won ${winnings.toFixed(2)} USDC${source}!\nBet: ${betAmount.toFixed(2)} USDC on ${side.toUpperCase()}\nTotal Payout: ${totalPayout.toFixed(2)} USDC`;
                  
                  toast.success(`${bettorShort} Won ${winnings.toFixed(2)} USDC${source}!`, {
                    id: `winnings-${bettor}-${battleId}`,
                    description: description,
                    duration: 15000,
                    action: txLink ? {
                      label: 'View Transaction',
                      onClick: () => window.open(txLink, '_blank'),
                    } : undefined,
                  });
                }
                
                // Update state to reflect winnings (for feed)
                setState(prev => ({
                  ...prev,
                  feed: [
                    {
                      id: Date.now().toString(),
                      timestamp: new Date().toLocaleTimeString(),
                      message: `${bettorShort} won ${winnings.toFixed(2)} USDC${source}!`,
                      type: 'success',
                    },
                    ...prev.feed.slice(0, 19),
                  ],
                }));
              }
              break;

            case 'PONG':
              // Heartbeat response
              break;

            case 'ERROR':
              console.error('WebSocket error:', message.payload.message);
              setState(prev => ({ ...prev, error: message.payload.message }));
              break;
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      ws.onclose = (event) => {
        setState(prev => ({ ...prev, isConnected: false }));
        
        // Only reconnect if it wasn't a manual close (code 1000)
        // and if we don't already have a reconnect scheduled
        if (event.code !== 1000 && !reconnectTimeoutRef.current) {
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            connect();
          }, 3000);
        }
      };

      ws.onerror = (error) => {
        // Don't log errors if connection is already closed (they're expected)
        if (ws.readyState !== WebSocket.CLOSED) {
          console.error('WebSocket error:', error);
          setState(prev => ({ ...prev, error: 'Connection error' }));
        }
      };

      wsRef.current = ws;
    } catch (err) {
      console.error('Failed to connect WebSocket:', err);
      setState(prev => ({ ...prev, error: 'Failed to connect' }));
    }
  }, []);

  const disconnect = useCallback(() => {
    // Clear reconnect timer
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    // Close WebSocket connection properly
    if (wsRef.current) {
      // Use code 1000 (normal closure) to prevent auto-reconnect
      wsRef.current.close(1000, 'Manual disconnect');
      wsRef.current = null;
    }
    
    setState(prev => ({ ...prev, isConnected: false }));
  }, []);

  const subscribeToBattle = useCallback((battleId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'SUBSCRIBE_BATTLE',
        payload: { battleId },
      }));
    }
  }, []);

  const placeBet = useCallback((battleId: string, side: 'bull' | 'bear', amount: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'PLACE_BET',
        payload: { battleId, side, amount },
      }));
    }
  }, []);

  useEffect(() => {
    // Small delay on initial connection to ensure backend is ready
    const connectTimeout = setTimeout(() => {
      connect();
    }, 500);

    // Send ping every 30 seconds to keep connection alive
    const pingInterval = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'PING' }));
      }
    }, 30000);

    return () => {
      clearTimeout(connectTimeout);
      clearInterval(pingInterval);
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    ...state,
    subscribeToBattle,
    placeBet,
    reconnect: connect,
  };
}
