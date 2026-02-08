import { CheckCircle2, Clock, XCircle, Shield, Loader2 } from 'lucide-react';

export type VerificationStatus = 'verified' | 'pending' | 'failed' | 'none' | 'verifying';

interface VerificationStatusProps {
  status: VerificationStatus;
  agentType: 'bull' | 'bear';
  lastProofTime?: number | null;
  compact?: boolean;
  showTooltip?: boolean;
}

export function VerificationStatus({ 
  status, 
  agentType, 
  lastProofTime,
  compact = false,
  showTooltip = true 
}: VerificationStatusProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'verified':
        return {
          icon: CheckCircle2,
          label: 'Verified',
          color: 'text-long',
          bgColor: 'bg-long/10',
          borderColor: 'border-long/30',
          description: 'ZK proof verified on-chain',
        };
      case 'verifying':
        return {
          icon: Loader2,
          label: 'Verifying',
          color: 'text-warning',
          bgColor: 'bg-warning/10',
          borderColor: 'border-warning/30',
          description: 'ZK proof verification in progress',
          animate: true,
        };
      case 'pending':
        return {
          icon: Clock,
          label: 'Pending',
          color: 'text-warning',
          bgColor: 'bg-warning/10',
          borderColor: 'border-warning/30',
          description: 'Waiting for proof submission',
        };
      case 'failed':
        return {
          icon: XCircle,
          label: 'Failed',
          color: 'text-short',
          bgColor: 'bg-short/10',
          borderColor: 'border-short/30',
          description: 'Proof verification failed',
        };
      case 'none':
      default:
        return {
          icon: Shield,
          label: 'No Proof',
          color: 'text-terminal-muted',
          bgColor: 'bg-terminal-border/50',
          borderColor: 'border-terminal-border',
          description: 'No proof submitted yet',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;
  const timeAgo = lastProofTime 
    ? getTimeAgo(lastProofTime) 
    : null;

  const content = (
    <div className={`flex items-center gap-1.5 ${compact ? 'text-xs' : 'text-sm'}`}>
      <div className={`relative ${config.animate ? 'animate-spin' : ''}`}>
        <Icon className={`w-3.5 h-3.5 ${config.color}`} />
      </div>
      {!compact && (
        <span className={`font-medium ${config.color}`}>
          {config.label}
        </span>
      )}
      {timeAgo && !compact && (
        <span className="text-xs text-terminal-muted font-mono">
          {timeAgo}
        </span>
      )}
    </div>
  );

  // Simple tooltip on hover using title attribute
  const tooltipText = `${config.label}: ${config.description}${agentType ? ` (${agentType === 'bull' ? 'Long' : 'Short'})` : ''}${lastProofTime ? ` - Last: ${new Date(lastProofTime * 1000).toLocaleTimeString()}` : ''}`;
  
  if (showTooltip) {
    return (
      <div title={tooltipText} className="cursor-help">
        {content}
      </div>
    );
  }

  return content;
}

function getTimeAgo(timestamp: number): string {
  const now = Math.floor(Date.now() / 1000);
  const diff = now - timestamp;
  
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

interface VerificationBadgeProps {
  status: VerificationStatus;
  agentType: 'bull' | 'bear';
  className?: string;
}

export function VerificationBadge({ status, agentType: _agentType, className = '' }: VerificationBadgeProps) {
  const getBadgeConfig = () => {
    switch (status) {
      case 'verified':
        return {
          bg: 'bg-long/20',
          border: 'border-long/40',
          text: 'text-long',
          label: '✓ Verified',
        };
      case 'verifying':
        return {
          bg: 'bg-warning/20',
          border: 'border-warning/40',
          text: 'text-warning',
          label: '⟳ Verifying',
        };
      case 'pending':
        return {
          bg: 'bg-warning/20',
          border: 'border-warning/40',
          text: 'text-warning',
          label: '⏱ Pending',
        };
      case 'failed':
        return {
          bg: 'bg-short/20',
          border: 'border-short/40',
          text: 'text-short',
          label: '✗ Failed',
        };
      default:
        return {
          bg: 'bg-terminal-border/50',
          border: 'border-terminal-border',
          text: 'text-terminal-muted',
          label: '○ No Proof',
        };
    }
  };

  const config = getBadgeConfig();

  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-medium border ${config.bg} ${config.border} ${config.text} ${className}`}>
      {config.label}
    </span>
  );
}
