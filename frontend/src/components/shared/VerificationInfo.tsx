import { Info, Shield } from 'lucide-react';
import { VerificationStatus } from './VerificationStatus';

interface VerificationInfoProps {
  bullStatus: 'verified' | 'pending' | 'failed' | 'verifying' | 'none';
  bearStatus: 'verified' | 'pending' | 'failed' | 'verifying' | 'none';
  bullLastProofTime?: number | null;
  bearLastProofTime?: number | null;
}

export function VerificationInfo({ 
  bullStatus, 
  bearStatus, 
  bullLastProofTime,
  bearLastProofTime 
}: VerificationInfoProps) {
  return (
    <div className="p-4 rounded-lg bg-terminal-elevated border border-terminal-border">
      <div className="flex items-start gap-3 mb-3">
        <div className="w-8 h-8 rounded-lg bg-long/10 flex items-center justify-center border border-long/30 flex-shrink-0">
          <Shield className="w-4 h-4 text-long" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium mb-2">ZK Proof Verification</h3>
          <p className="text-xs text-terminal-muted mb-3">
            Agents must submit zero-knowledge proofs to prove solvency. Proofs are verified on-chain using cryptographic verification.
          </p>
          
          <div className="space-y-3">
            {/* Bull Verification */}
            <div className="flex items-center justify-between p-2 rounded bg-terminal-card/50">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-long">LONG</span>
                <VerificationStatus
                  status={bullStatus}
                  agentType="bull"
                  lastProofTime={bullLastProofTime}
                  compact={true}
                />
              </div>
              {bullLastProofTime && (
                <span className="text-xs text-terminal-muted font-mono">
                  {new Date(bullLastProofTime * 1000).toLocaleTimeString()}
                </span>
              )}
            </div>
            
            {/* Bear Verification */}
            <div className="flex items-center justify-between p-2 rounded bg-terminal-card/50">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-short">SHORT</span>
                <VerificationStatus
                  status={bearStatus}
                  agentType="bear"
                  lastProofTime={bearLastProofTime}
                  compact={true}
                />
              </div>
              {bearLastProofTime && (
                <span className="text-xs text-terminal-muted font-mono">
                  {new Date(bearLastProofTime * 1000).toLocaleTimeString()}
                </span>
              )}
            </div>
          </div>
          
          {/* Info Box */}
          <div className="mt-3 pt-3 border-t border-terminal-border">
            <div className="flex items-start gap-2 text-xs text-terminal-muted">
              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <p><strong className="text-foreground">Verified:</strong> Proof validated on-chain - agent is solvent</p>
                <p><strong className="text-foreground">Verifying:</strong> Proof submitted, awaiting blockchain confirmation</p>
                <p><strong className="text-foreground">Pending:</strong> Waiting for agent to submit proof</p>
                <p><strong className="text-foreground">Failed:</strong> Proof verification failed - agent may be insolvent</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
