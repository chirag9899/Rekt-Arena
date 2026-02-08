import { useState, useEffect } from 'react';
import { ArrowLeft, Clock, Copy, Twitter, MessageCircle, Send, Users, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatTimeRemaining, formatAddress } from '@/lib/utils';

interface LobbyPageProps {
  onNavigate: (page: string) => void;
}

export function LobbyPage({ onNavigate }: LobbyPageProps) {
  const [timeRemaining, setTimeRemaining] = useState(23 * 3600 + 45 * 60 + 12);
  const [copied, setCopied] = useState(false);
  const [earlyBettors] = useState([
    { address: '0x8a2...4f1b', amount: 20 },
    { address: '0x3c7...9e2a', amount: 15 },
    { address: '0x1d4...7b3c', amount: 10 },
  ]);

  const battleId = '52';
  const userStake = 100;
  const opponentFilled = 0;
  const opponentTarget = 100;

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeRemaining(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleCopy = () => {
    navigator.clipboard.writeText(`https://liquidation.arena/battle/${battleId}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCancel = () => {
    if (confirm('Cancel market? Your stake will be refunded.')) {
      onNavigate('home');
    }
  };

  const totalEarlyBets = earlyBettors.reduce((sum, b) => sum + b.amount, 0);

  return (
    <div className="min-h-screen bg-terminal-bg pt-14">
      {/* Header */}
      <div className="fixed top-14 left-0 right-0 z-40 bg-terminal-bg border-b border-terminal-border">
        <div className="max-w-lg mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => onNavigate('home')}
              className="p-1.5 rounded hover:bg-terminal-elevated transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div>
              <span className="font-mono text-sm">MARKET #{battleId}</span>
              <span className="ml-2 text-xs text-terminal-muted">LOBBY</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-24 pb-12 px-4 max-w-lg mx-auto">
        {/* Status */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded bg-warning/10 border border-warning/20 mb-3">
            <Clock className="w-3.5 h-3.5 text-warning" />
            <span className="text-warning text-xs font-medium uppercase tracking-wide">Awaiting Opponent</span>
          </div>
          <div className="font-mono text-3xl font-medium">
            {formatTimeRemaining(timeRemaining)}
          </div>
          <p className="text-xs text-terminal-muted mt-1">Time until expiry</p>
        </div>

        {/* Market Preview */}
        <div className="terminal-card p-6 mb-6">
          <div className="flex items-center justify-between">
            {/* Long Side (User) */}
            <div className="text-center flex-1">
              <div className="w-14 h-14 mx-auto mb-3 rounded-lg bg-long/10 flex items-center justify-center border border-long/30">
                <span className="text-xl">BULL</span>
              </div>
              <p className="font-mono text-lg font-medium text-long">{formatCurrency(userStake)}</p>
              <div className="flex items-center justify-center gap-1 mt-1">
                <Check className="w-3 h-3 text-long" />
                <span className="text-xs text-long">FUNDED</span>
              </div>
              <p className="text-xs text-terminal-muted mt-1">{formatAddress('0x742...8f3a')}</p>
              <div className="mt-2 inline-flex items-center gap-1 px-2 py-0.5 rounded bg-terminal-elevated text-xs">
                <span>YOU</span>
              </div>
            </div>

            {/* VS */}
            <div className="px-4">
              <span className="text-xs font-mono text-terminal-muted">VS</span>
            </div>

            {/* Short Side (Empty) */}
            <div className="text-center flex-1">
              <div className="w-14 h-14 mx-auto mb-3 rounded-lg bg-terminal-elevated flex items-center justify-center border border-dashed border-terminal-border">
                <span className="text-xl opacity-30">⏳</span>
              </div>
              <p className="font-mono text-lg font-medium text-terminal-muted">
                ${opponentFilled}/${opponentTarget}
              </p>
              <div className="flex items-center justify-center gap-1 mt-1">
                <span className="w-1.5 h-1.5 rounded-full bg-terminal-muted animate-pulse-subtle" />
                <span className="text-xs text-terminal-muted">WAITING</span>
              </div>
              <p className="text-xs text-terminal-muted mt-1">Open</p>
            </div>
          </div>
        </div>

        {/* Share Section */}
        <div className="mb-6">
          <h3 className="text-xs font-medium text-terminal-muted uppercase tracking-wide mb-3 text-center">Share Market</h3>
          <div className="flex justify-center gap-2">
            <button
              onClick={handleCopy}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-all text-xs ${
                copied
                  ? 'bg-long/10 text-long border border-long/30'
                  : 'bg-terminal-elevated text-terminal-muted hover:text-foreground border border-terminal-border'
              }`}
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
            
            <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-terminal-elevated text-[#1DA1F2] hover:bg-[#1DA1F2]/10 border border-terminal-border transition-colors text-xs">
              <Twitter className="w-3.5 h-3.5" />
              <span>Tweet</span>
            </button>
            
            <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-terminal-elevated text-[#5865F2] hover:bg-[#5865F2]/10 border border-terminal-border transition-colors text-xs">
              <MessageCircle className="w-3.5 h-3.5" />
              <span>Discord</span>
            </button>
            
            <button className="flex items-center gap-2 px-3 py-2 rounded-lg bg-terminal-elevated text-[#0088cc] hover:bg-[#0088cc]/10 border border-terminal-border transition-colors text-xs">
              <Send className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">TG</span>
            </button>
          </div>
        </div>

        {/* Early Bettors */}
        {earlyBettors.length > 0 && (
          <div className="terminal-card p-4 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Users className="w-3.5 h-3.5 text-terminal-muted" />
              <h3 className="text-xs font-medium text-terminal-muted uppercase tracking-wide">Pending Orders</h3>
            </div>
            <p className="text-xs text-terminal-muted mb-3">
              {earlyBettors.length} orders totaling {formatCurrency(totalEarlyBets)} USDC
              <span className="block mt-0.5">(execute on market start)</span>
            </p>
            <div className="space-y-1">
              {earlyBettors.map((bettor, index) => (
                <div 
                  key={index}
                  className="flex items-center justify-between py-1.5 px-2 rounded bg-terminal-elevated text-sm"
                >
                  <span className="font-mono text-xs text-terminal-muted">{formatAddress(bettor.address)}</span>
                  <span className="font-mono text-xs text-long">${bettor.amount}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Cancel Button */}
        <Button
          onClick={handleCancel}
          variant="outline"
          className="w-full border-short/30 text-short hover:bg-short/10"
        >
          Cancel Market — Refund {formatCurrency(userStake)}
        </Button>
      </div>
    </div>
  );
}
