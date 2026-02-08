import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface CountdownTimerProps {
  targetTime: number | null; // Unix timestamp
  label: string;
  urgentThreshold?: number; // Seconds when timer becomes urgent (default 30)
  onComplete?: () => void;
}

export const CountdownTimer = ({ 
  targetTime, 
  label, 
  urgentThreshold = 30,
  onComplete 
}: CountdownTimerProps) => {
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    if (!targetTime) {
      setTimeRemaining(0);
      return;
    }

    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((targetTime - now) / 1000));
      setTimeRemaining(remaining);
      setIsUrgent(remaining <= urgentThreshold && remaining > 0);

      if (remaining === 0 && onComplete) {
        onComplete();
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [targetTime, urgentThreshold, onComplete]);

  if (!targetTime || timeRemaining === 0) {
    return null;
  }

  const minutes = Math.floor(timeRemaining / 60);
  const seconds = timeRemaining % 60;
  const display = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  return (
    <div className={cn(
      "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
      isUrgent 
        ? "bg-red-500/20 text-red-400 animate-pulse border border-red-500/30" 
        : "bg-blue-500/10 text-blue-400 border border-blue-500/20"
    )}>
      <span className={cn(
        "w-2 h-2 rounded-full",
        isUrgent ? "bg-red-500 animate-pulse" : "bg-blue-500"
      )} />
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="font-mono font-bold">{display}</span>
    </div>
  );
};
