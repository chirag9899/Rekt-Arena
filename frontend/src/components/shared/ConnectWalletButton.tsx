import { ConnectButton } from 'thirdweb/react';
import { client, chain } from '@/lib/thirdweb';
import { formatCurrency, formatAddress } from '@/lib/utils';
import { Wallet } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ConnectWalletButtonProps {
  onBalanceChange?: (balance: number) => void;
}

export function ConnectWalletButton({ onBalanceChange }: ConnectWalletButtonProps) {
  return (
    <div className="[&_button]:!h-7 [&_button]:!min-w-0 [&_button]:!px-2.5 [&_button]:!text-xs">
      <ConnectButton
        client={client}
        chain={chain}
        connectButton={{
          label: (
            <span className="flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5" />
              <span>Connect</span>
            </span>
          ),
          className: "bg-long hover:bg-long-dark text-white text-xs h-7 px-2.5 rounded-md font-medium transition-colors",
        }}
      connectedButton={(props) => {
        const { account, displayBalance } = props;
        const balance = displayBalance ? parseFloat(displayBalance.split(' ')[0]) : 0;
        
        // Notify parent of balance change
        if (onBalanceChange && balance > 0) {
          onBalanceChange(balance);
        }
        
        return (
          <div className="flex items-center gap-2">
            <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-terminal-elevated border border-terminal-border">
              <Wallet className="w-3.5 h-3.5 text-terminal-muted" />
              <span className="font-mono text-xs">
                {displayBalance ? formatCurrency(balance) : '$0.00'}
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="border-terminal-border hover:bg-terminal-elevated text-xs h-8 px-2.5"
            >
              {formatAddress(account.address)}
            </Button>
          </div>
        );
      }}
      detailsButton={{
        className: "hidden",
      }}
      />
    </div>
  );
}
