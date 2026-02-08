import { BattleHistoryPage } from './BattleHistoryPage';

export function PrimaryBattleHistoryPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  return <BattleHistoryPage onNavigate={onNavigate} tier="PRIMARY" />;
}
