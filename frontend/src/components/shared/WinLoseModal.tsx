import { useEffect, useState } from 'react';
import { X, Trophy, AlertCircle, Coins } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency } from '@/lib/utils';

interface WinLoseModalProps {
  isOpen: boolean;
  type: 'win' | 'lose' | 'sponsor_win';
  amount?: number;
  winnings?: number;
  battleId?: string;
  onClose: () => void;
  onClaim?: () => void;
}

export function WinLoseModal({
  isOpen,
  type,
  amount = 0,
  winnings = 0,
  battleId,
  onClose,
  onClaim,
}: WinLoseModalProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setShow(true);
    } else {
      // Delay hiding for animation
      setTimeout(() => setShow(false), 300);
    }
  }, [isOpen]);

  if (!show) return null;

  const isWin = type === 'win' || type === 'sponsor_win';
  const isSponsorWin = type === 'sponsor_win';

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-300 ${
        isOpen ? 'opacity-100' : 'opacity-0'
      }`}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-void/80 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className={`relative bg-terminal-card border-2 rounded-lg p-6 max-w-md w-full transform transition-all duration-300 ${
          isOpen ? 'scale-100' : 'scale-95'
        } ${isWin ? 'border-long' : 'border-short'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-terminal-muted hover:text-foreground transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Icon with animation */}
        <div className="flex justify-center mb-6">
          <div
            className={`w-24 h-24 rounded-full flex items-center justify-center relative ${
              isWin 
                ? 'bg-gradient-to-br from-long/30 to-long/10 border-4 border-long/50 shadow-2xl shadow-long/30 animate-pulse' 
                : 'bg-short/20 border-2 border-short/30'
            }`}
          >
            {isWin ? (
              <>
                <Trophy className="w-12 h-12 text-long drop-shadow-lg" />
                <div className="absolute inset-0 rounded-full bg-long/20 animate-ping" />
              </>
            ) : (
              <AlertCircle className="w-12 h-12 text-short" />
            )}
          </div>
        </div>

        {/* Title with celebration */}
        <h2
          className={`text-4xl font-extrabold text-center mb-3 ${
            isWin ? 'text-long' : 'text-short'
          }`}
        >
          {isWin ? (
            <>
              🎉 YOU WON! 🎉
            </>
          ) : (
            'You Lost'
          )}
        </h2>

        {/* Message */}
        <p className="text-terminal-muted text-sm text-center mb-6">
          {isWin
            ? isSponsorWin
              ? 'Your agent survived and won the battle!'
              : 'Your bet was correct!'
            : 'Your bet was incorrect. Better luck next time!'}
        </p>

        {/* Stats */}
        <div className={`rounded-lg p-5 mb-6 space-y-4 ${
          isWin 
            ? 'bg-gradient-to-br from-long/20 via-long/10 to-terminal-elevated border-2 border-long/40 shadow-lg' 
            : 'bg-terminal-elevated border border-terminal-border'
        }`}>
          {isWin && (
            <>
              <div className="flex justify-between items-center py-2">
                <span className="text-terminal-muted text-sm font-medium">Your Bet</span>
                <span className="font-mono text-base font-semibold">{formatCurrency(amount)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-t border-long/30">
                <span className="text-terminal-muted text-sm font-medium">Profit</span>
                <span className="font-mono text-xl text-long font-bold">
                  +{formatCurrency(winnings)}
                </span>
              </div>
              <div className="border-t-2 border-long/50 pt-4 mt-2 flex justify-between items-center">
                <span className="text-terminal-muted text-base font-bold">Total Return</span>
                <span className="font-mono text-2xl text-long font-extrabold">
                  {formatCurrency(amount + winnings)}
                </span>
              </div>
              {winnings > 0 && (
                <div className="text-center pt-2">
                  <span className="text-xs text-terminal-muted font-mono">
                    {((amount + winnings) / amount).toFixed(2)}x Payout
                  </span>
                </div>
              )}
            </>
          )}
          {!isWin && (
            <>
              <div className="flex justify-between items-center">
                <span className="text-terminal-muted text-sm">Your Bet</span>
                <span className="font-mono text-sm">{formatCurrency(amount)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-terminal-muted text-sm">Loss</span>
                <span className="font-mono text-sm text-short font-semibold">
                  -{formatCurrency(amount)}
                </span>
              </div>
            </>
          )}
          {battleId && (
            <div className="flex justify-between items-center pt-3 border-t border-terminal-border">
                <span className="text-terminal-muted text-xs">Battle ID</span>
                <span className="font-mono text-xs">{battleId.slice(0, 8)}...</span>
              </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          {isWin && onClaim && (
            <Button
              onClick={onClaim}
              className="flex-1 bg-long hover:bg-long-dark text-white"
            >
              <Coins className="w-4 h-4 mr-2" />
              Claim Winnings
            </Button>
          )}
          <Button
            onClick={onClose}
            variant="outline"
            className={`flex-1 border-terminal-border hover:bg-terminal-elevated ${
              !isWin || !onClaim ? 'flex-1' : ''
            }`}
          >
            {isWin && onClaim ? 'Close' : 'Continue'}
          </Button>
        </div>
      </div>
    </div>
  );
}
