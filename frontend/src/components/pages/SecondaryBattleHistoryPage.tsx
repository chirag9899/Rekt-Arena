import { BattleHistoryPage } from './BattleHistoryPage';

export function SecondaryBattleHistoryPage({ onNavigate }: { onNavigate: (page: string) => void }) {
  return <BattleHistoryPage onNavigate={onNavigate} tier="SECONDARY" />;
}
