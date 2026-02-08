import { useState } from 'react';
import { X, TrendingUp, TrendingDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { formatCurrency } from '@/lib/utils';
import type { BattleSide } from '@/types';

interface BetModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (side: BattleSide, amount: number) => void;
  availableBalance: number;
  minBet?: number;
  isLoading?: boolean;
  error?: string | null;
  defaultSide?: BattleSide;
}

export function BetModal({ 
  isOpen, 
  onClose, 
  onConfirm, 
  availableBalance,
  minBet = 10,
  isLoading = false,
  error = null,
  defaultSide = 'bull'
}: BetModalProps) {
  const [selectedSide, setSelectedSide] = useState<BattleSide>(defaultSide);
  const [amount, setAmount] = useState<string>('25');

  if (!isOpen) return null;

  const amountNum = parseFloat(amount) || 0;
  const potentialWin = amountNum * 1.8;
  const platformFee = amountNum * 0.02;
  const isValid = amountNum >= minBet && amountNum <= availableBalance;

  const handleConfirm = () => {
    if (isValid) {
      onConfirm(selectedSide, amountNum);
      onClose();
    }
  };

  const quickAmounts = [10, 25, 50, 100];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/70"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative w-full max-w-md terminal-card p-5">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-terminal-muted hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <h2 className="text-sm font-medium text-terminal-muted mb-5 uppercase tracking-wide">Place Order</h2>

        {/* Side Selection */}
        <div className="grid grid-cols-2 gap-2 mb-5">
          <button
            onClick={() => setSelectedSide('bull')}
            className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all duration-150 ${
              selectedSide === 'bull'
                ? 'border-long bg-long/10'
                : 'border-terminal-border hover:border-terminal-border-hover'
            }`}
          >
            <TrendingUp className={`w-5 h-5 ${selectedSide === 'bull' ? 'text-long' : 'text-terminal-muted'}`} />
            <span className={`text-sm font-medium ${selectedSide === 'bull' ? 'text-long' : 'text-terminal-muted'}`}>
              LONG
            </span>
          </button>

          <button
            onClick={() => setSelectedSide('bear')}
            className={`flex flex-col items-center gap-2 p-4 rounded-lg border transition-all duration-150 ${
              selectedSide === 'bear'
                ? 'border-short bg-short/10'
                : 'border-terminal-border hover:border-terminal-border-hover'
            }`}
          >
            <TrendingDown className={`w-5 h-5 ${selectedSide === 'bear' ? 'text-short' : 'text-terminal-muted'}`} />
            <span className={`text-sm font-medium ${selectedSide === 'bear' ? 'text-short' : 'text-terminal-muted'}`}>
              SHORT
            </span>
          </button>
        </div>

        {/* Amount Input */}
        <div className="mb-4">
          <div className="flex justify-between text-xs text-terminal-muted mb-2">
            <span>Amount (USDC)</span>
            <span>Available: {formatCurrency(availableBalance)}</span>
          </div>
          <div className="relative">
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="pr-4 py-3 text-lg font-mono bg-terminal-elevated border-terminal-border focus:border-terminal-border-hover"
              placeholder="0.00"
              min={minBet}
              max={availableBalance}
            />
          </div>
        </div>

        {/* Quick Amounts */}
        <div className="flex gap-2 mb-5">
          {quickAmounts.map((amt) => (
            <button
              key={amt}
              onClick={() => setAmount(amt.toString())}
              className={`flex-1 py-2 rounded text-xs font-mono transition-colors ${
                amountNum === amt
                  ? 'bg-terminal-elevated text-foreground border border-terminal-border-hover'
                  : 'bg-terminal-card text-terminal-muted border border-terminal-border hover:border-terminal-border-hover'
              }`}
            >
              ${amt}
            </button>
          ))}
        </div>

        {/* Order Summary */}
        <div className="bg-terminal-elevated rounded-lg p-4 mb-5 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-terminal-muted">Est. PnL</span>
            <span className="font-mono text-long">+{formatCurrency(potentialWin)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-terminal-muted">Fee (2%)</span>
            <span className="font-mono text-terminal-muted">-{formatCurrency(platformFee)}</span>
          </div>
        </div>

        {/* Confirm Button */}
        <Button
          onClick={handleConfirm}
          disabled={!isValid || isLoading}
          className={`w-full py-3 text-sm font-medium ${
            selectedSide === 'bull' ? 'btn-long' : 'btn-short'
          }`}
        >
          {isLoading ? (
            'Processing...'
          ) : (
            <>
              {selectedSide === 'bull' ? 'LONG' : 'SHORT'} {amountNum > 0 ? `$${amountNum}` : ''}
            </>
          )}
        </Button>

        {error && (
          <p className="text-center text-xs text-short mt-3">
            {error}
          </p>
        )}

        {!isValid && amountNum > 0 && !error && (
          <p className="text-center text-xs text-short mt-3">
            {amountNum < minBet ? `Minimum order is ${formatCurrency(minBet)}` : 'Insufficient balance'}
          </p>
        )}
      </div>
    </div>
  );
}
