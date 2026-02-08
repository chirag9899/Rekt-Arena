import { useState } from 'react';
import { Bell, Menu, X, TrendingUp, ChevronDown, Home, History, Receipt, Plus, Swords } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { formatCurrency } from '@/lib/utils';
import { ConnectWalletButton } from './ConnectWalletButton';

interface NavbarProps {
  currentPrice?: number;
  priceChange?: number;
  activeBattle?: string;
  onBalanceChange?: (balance: number) => void;
}

export function Navbar({ 
  currentPrice = 3024.55, 
  priceChange = 2.3,
  activeBattle = '#48 LIVE',
  onBalanceChange,
  onNavigate
}: NavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const safePriceChange = (() => {
    const change = priceChange ?? 0;
    // Handle Infinity, NaN, or invalid values
    if (!isFinite(change) || isNaN(change)) {
      return 0;
    }
    return change;
  })();
  const isPositive = safePriceChange >= 0;

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-terminal-bg border-b border-terminal-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded bg-long flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-sm tracking-tight hidden sm:block">
              REKT<span className="text-terminal-muted">/</span>ARENA
            </span>
          </div>

          {/* Price Ticker - Desktop */}
          {currentPrice > 0 && (
            <div className="hidden md:flex items-center gap-4">
            <div className="flex items-center gap-2 text-sm">
                <span className="text-terminal-muted text-xs font-medium">ETH-PERP</span>
                <span className="font-mono font-semibold">{formatCurrency(currentPrice)}</span>
                {priceChange !== undefined && (
                  <span className={`text-xs font-mono font-medium ${isPositive ? 'text-long' : 'text-short'}`}>
                    {isPositive ? '+' : ''}{safePriceChange.toFixed(2)}%
              </span>
                )}
            </div>
              {activeBattle && (
                <>
            <div className="h-4 w-px bg-terminal-border" />
                  <div className="flex items-center gap-1.5 text-xs">
              <span className="w-1.5 h-1.5 rounded-full bg-short animate-pulse-subtle" />
                    <span className="text-terminal-muted">LIVE</span>
              <span className="font-mono text-short">{activeBattle}</span>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Right Side */}
          <div className="flex items-center gap-2">
            {/* Chain selector (teaser, disabled) */}
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-terminal-border bg-terminal-elevated text-terminal-muted cursor-not-allowed text-xs opacity-70 hover:opacity-100 transition-opacity"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-long" />
                  <span>ETH</span>
                  <ChevronDown className="w-3 h-3 opacity-40" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="bg-terminal-elevated border border-terminal-border text-terminal-muted">
                <p className="text-xs">Multi-chain support coming soon</p>
                <p className="text-[10px] text-terminal-muted/70 mt-0.5">Base, Arbitrum, Solana</p>
              </TooltipContent>
            </Tooltip>

            {/* Wallet - Thirdweb ConnectButton */}
            <ConnectWalletButton onBalanceChange={onBalanceChange} />

            {/* Notifications */}
            <Button
              variant="ghost"
              size="icon"
              className="relative text-terminal-muted hover:text-foreground h-8 w-8"
            >
              <Bell className="w-4 h-4" />
              <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-short" />
            </Button>

            {/* Mobile Menu Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-8 w-8"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-3 border-t border-terminal-border">
            <div className="flex items-center justify-between text-sm py-2">
              <span className="text-terminal-muted">ETH-PERP</span>
              <div className="flex items-center gap-2">
                <span className="font-mono">{formatCurrency(currentPrice)}</span>
                <span className={`text-xs font-mono ${isPositive ? 'text-long' : 'text-short'}`}>
                  {isPositive ? '+' : ''}{safePriceChange.toFixed(2)}%
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
