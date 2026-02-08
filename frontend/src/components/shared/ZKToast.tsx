import { Check, X, Loader2 } from 'lucide-react';

interface ZKToastProps {
  status: 'verified' | 'pending' | 'failed';
  message?: string;
  blockNumber?: string;
  isVisible: boolean;
}

export function ZKToast({ status, message, blockNumber, isVisible }: ZKToastProps) {
  if (!isVisible) return null;

  const config = {
    verified: {
      icon: Check,
      title: 'Proof Verified',
      message: message || 'Position validated',
      iconClass: 'text-long',
      borderClass: 'border-l-long',
    },
    pending: {
      icon: Loader2,
      title: 'Verifying',
      message: message || 'Proof pending...',
      iconClass: 'text-warning animate-spin',
      borderClass: 'border-l-warning',
    },
    failed: {
      icon: X,
      title: 'Verification Failed',
      message: message || 'Validation error',
      iconClass: 'text-short',
      borderClass: 'border-l-short',
    },
  };

  const { icon: Icon, title, message: displayMessage, iconClass, borderClass } = config[status];

  return (
    <div className={`fixed bottom-20 right-4 z-50 terminal-card rounded-lg p-3 border-l-4 ${borderClass}`}>
      <div className="flex items-start gap-3">
        <div className={`mt-0.5 ${iconClass}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div>
          <h4 className="font-medium text-sm">{title}</h4>
          <p className="text-xs text-terminal-muted mt-0.5">{displayMessage}</p>
          {blockNumber && (
            <p className="text-xs text-terminal-muted mt-1 font-mono">
              #{blockNumber}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
