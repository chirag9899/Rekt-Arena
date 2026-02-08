import { ArrowLeft } from 'lucide-react';
import { Tabs } from '@/components/shared/AnimatedTabs';
import { BattleHistoryPage } from './BattleHistoryPage';
import { TransactionHistoryPage } from './TransactionHistoryPage';
import { MyBetsPage } from './MyBetsPage';

interface UnifiedHistoryPageProps {
  onNavigate: (page: string) => void;
}

export function UnifiedHistoryPage({ onNavigate }: UnifiedHistoryPageProps) {
  const tabs = [
    {
      title: "Primary History",
      value: "primary",
      content: <BattleHistoryPage onNavigate={onNavigate} tier="PRIMARY" hideHeader={true} />,
    },
    {
      title: "Secondary History",
      value: "secondary",
      content: <BattleHistoryPage onNavigate={onNavigate} tier="SECONDARY" hideHeader={true} />,
    },
    {
      title: "My Bets",
      value: "my-bets",
      content: <MyBetsPage onNavigate={onNavigate} />,
    },
    {
      title: "Transactions",
      value: "transactions",
      content: <TransactionHistoryPage onNavigate={onNavigate} />,
    },
  ];

  return (
    <div className="min-h-screen bg-terminal-bg pt-14">
      {/* Header */}
      <div className="fixed top-14 left-0 right-0 z-40 bg-terminal-bg border-b border-terminal-border">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => onNavigate('home')}
              className="p-1.5 rounded hover:bg-terminal-elevated transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <h1 className="text-lg font-medium">History</h1>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-24 pb-12 px-4 max-w-6xl mx-auto">
        <Tabs
          tabs={tabs}
          containerClassName="mb-8"
          activeTabClassName="bg-terminal-accent border-terminal-accent"
          tabClassName="hover:text-foreground transition-colors"
          contentClassName="min-h-[600px]"
        />
      </div>
    </div>
  );
}
