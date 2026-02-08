import { Home, ArrowLeft, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface NotFoundPageProps {
  onNavigate?: (page: string) => void;
}

export function NotFoundPage({ onNavigate }: NotFoundPageProps) {
  const handleGoHome = () => {
    if (onNavigate) {
      onNavigate('home');
    } else {
      window.location.href = '/';
    }
  };

  return (
    <div className="min-h-screen bg-void flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        {/* 404 Icon */}
        <div className="mb-8 flex justify-center">
          <div className="relative">
            <div className="w-32 h-32 rounded-full bg-terminal-elevated border-2 border-terminal-border flex items-center justify-center">
              <AlertTriangle className="w-16 h-16 text-short" />
            </div>
            <div className="absolute -top-2 -right-2 w-12 h-12 rounded-full bg-short/20 border-2 border-short flex items-center justify-center">
              <span className="text-2xl font-bold text-short">404</span>
            </div>
          </div>
        </div>

        {/* Error Message */}
        <h1 className="text-3xl font-bold mb-4 text-foreground">Battle Not Found</h1>
        <p className="text-terminal-muted mb-8 text-sm">
          The arena you're looking for doesn't exist or has been settled.
          <br />
          <span className="text-[10px] text-terminal-muted/70 mt-2 block">
            All battles eventually end. This one is already history.
          </span>
        </p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button
            onClick={handleGoHome}
            className="bg-long hover:bg-long-dark text-white flex items-center gap-2"
          >
            <Home className="w-4 h-4" />
            Return to Arena
          </Button>
          <Button
            variant="outline"
            onClick={() => window.history.back()}
            className="border-terminal-border hover:bg-terminal-elevated flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Back
          </Button>
        </div>

        {/* Fun Message */}
        <div className="mt-12 p-4 rounded-lg bg-terminal-elevated border border-terminal-border">
          <p className="text-xs text-terminal-muted">
            💡 <span className="text-foreground font-medium">Tip:</span> Check the{' '}
            <span className="text-long">PRIMARY ARENA</span> for the current live battle, or create your own in{' '}
            <span className="text-short">SECONDARY MARKETS</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
