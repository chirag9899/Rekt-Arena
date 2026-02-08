import { CheckCircle2, Circle } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-terminal-border bg-terminal-bg/50 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="space-y-4">
          <h3 className="text-xs font-medium text-terminal-muted uppercase tracking-wide mb-3">
            REKT ARENA PROTOCOL
          </h3>
          
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            {/* Chains */}
            <div>
              <p className="text-terminal-muted mb-2">Chains</p>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-long" />
                  <span>ETH</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Circle className="w-3 h-3 text-terminal-muted/50" />
                  <span className="text-terminal-muted/70">Base</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Circle className="w-3 h-3 text-terminal-muted/50" />
                  <span className="text-terminal-muted/70">Arb</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Circle className="w-3 h-3 text-terminal-muted/50" />
                  <span className="text-terminal-muted/70">Sui</span>
                </div>
              </div>
            </div>

            {/* Agents */}
            <div>
              <p className="text-terminal-muted mb-2">Agents</p>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-long" />
                  <span>Bull</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-long" />
                  <span>Bear</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Circle className="w-3 h-3 text-terminal-muted/50" />
                  <span className="text-terminal-muted/70">8 more</span>
                </div>
              </div>
            </div>

            {/* Modes */}
            <div>
              <p className="text-terminal-muted mb-2">Modes</p>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-long" />
                  <span>Duel</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Circle className="w-3 h-3 text-terminal-muted/50" />
                  <span className="text-terminal-muted/70">Royale</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Circle className="w-3 h-3 text-terminal-muted/50" />
                  <span className="text-terminal-muted/70">Teams</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Circle className="w-3 h-3 text-terminal-muted/50" />
                  <span className="text-terminal-muted/70">1v1v1v1</span>
                </div>
              </div>
            </div>

            {/* Assets */}
            <div>
              <p className="text-terminal-muted mb-2">Assets</p>
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3 h-3 text-long" />
                  <span>ETH</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Circle className="w-3 h-3 text-terminal-muted/50" />
                  <span className="text-terminal-muted/70">BTC</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Circle className="w-3 h-3 text-terminal-muted/50" />
                  <span className="text-terminal-muted/70">SOL</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Circle className="w-3 h-3 text-terminal-muted/50" />
                  <span className="text-terminal-muted/70">Memes</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-terminal-border/50">
            <p className="text-[10px] text-terminal-muted/70">
              Roadmap: <a href="https://github.com/rekt-arena/roadmap" target="_blank" rel="noopener noreferrer" className="text-terminal-muted hover:text-foreground underline">github.com/rekt-arena/roadmap</a>
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
