interface HealthBarProps {
  health: number;
  side: 'bull' | 'bear';
  showPercentage?: boolean;
  size?: 'sm' | 'md' | 'lg';
}

export function HealthBar({ 
  health, 
  side, 
  showPercentage = true,
  size = 'md' 
}: HealthBarProps) {
  const colorClass = side === 'bull' ? 'bg-long' : 'bg-short';
  
  const sizeClasses = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-2.5',
  };

  return (
    <div className="w-full">
      <div className={`health-bar ${sizeClasses[size]}`}>
        <div
          className={`health-bar-fill ${colorClass}`}
          style={{ width: `${Math.max(0, Math.min(100, health))}%` }}
        />
      </div>
      {showPercentage && (
        <div className="flex justify-between mt-1">
          <span className="text-xs text-terminal-muted">Health</span>
          <span className={`text-xs font-mono ${side === 'bull' ? 'text-long' : 'text-short'}`}>
            {health.toFixed(0)}%
          </span>
        </div>
      )}
    </div>
  );
}
