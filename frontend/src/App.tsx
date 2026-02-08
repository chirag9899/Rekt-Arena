import { useState, useEffect } from 'react';
import { Navbar, Footer, ErrorBoundary, FloatingDock } from '@/components/shared';
import { HomePage, ArenaPage, CreatePage, LobbyPage, ResultsPage, NotFoundPage, BattleHistoryPage, PrimaryBattleHistoryPage, SecondaryBattleHistoryPage, TransactionHistoryPage, UnifiedHistoryPage } from '@/components/pages';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Toaster } from 'sonner';
import { Home, History, Receipt, Plus, Swords } from 'lucide-react';
import type { ResultType } from '@/types';

type PageType = 'home' | 'arena' | 'create' | 'lobby' | 'results' | 'history' | 'primary-history' | 'secondary-history' | 'transactions' | 'unified-history' | '404';

function App() {
  const [currentPage, setCurrentPage] = useState<PageType>('home');
  const [resultType, setResultType] = useState<ResultType>('win');
  const [walletBalance, setWalletBalance] = useState(0);
  
  // Get live price data from WebSocket
  const { currentPrice, priceChange, battles } = useWebSocket();
  
  // Sync page state with URL
  useEffect(() => {
    const updatePageFromPath = () => {
      const path = window.location.pathname;
      if (path === '/primary-battle/history') {
        setCurrentPage('primary-history');
      } else if (path === '/secondary-battle/history') {
        setCurrentPage('secondary-history');
      } else if (path === '/history' || path === '/battle-history' || path === '/unified-history') {
        setCurrentPage('unified-history');
      } else if (path === '/transactions' || path === '/tx') {
        setCurrentPage('transactions');
      } else if (path === '/arena') {
        setCurrentPage('arena');
      } else if (path === '/create') {
        setCurrentPage('create');
      } else if (path === '/lobby') {
        setCurrentPage('lobby');
      } else if (path.startsWith('/results')) {
        setCurrentPage('results');
      } else if (path === '/' || path === '') {
        setCurrentPage('home');
      }
    };
    
    updatePageFromPath();
    
    // Listen for browser back/forward buttons
    window.addEventListener('popstate', updatePageFromPath);
    return () => window.removeEventListener('popstate', updatePageFromPath);
  }, []);
  
  // Find active/live battle for navbar
  const activeBattle = battles.find(b => b.status === 'live') || battles[0];
  const activeBattleLabel = activeBattle ? `#${activeBattle.round || activeBattle.id.split('-')[1] || '?'}` : null;

  const handleNavigate = (page: string) => {
    // Handle result variants
    if (page === 'results-win') {
      setResultType('win');
      setCurrentPage('results');
      window.history.pushState({}, '', '/results');
    } else if (page === 'results-loss') {
      setResultType('loss');
      setCurrentPage('results');
      window.history.pushState({}, '', '/results');
    } else if (page === 'results-sponsor') {
      setResultType('sponsor_win');
      setCurrentPage('results');
      window.history.pushState({}, '', '/results');
    } else if (page === 'primary-history') {
      setCurrentPage('primary-history');
      window.history.pushState({}, '', '/primary-battle/history');
    } else if (page === 'secondary-history') {
      setCurrentPage('secondary-history');
      window.history.pushState({}, '', '/secondary-battle/history');
    } else if (page === 'history' || page === 'unified-history') {
      setCurrentPage('unified-history');
      window.history.pushState({}, '', '/history');
    } else if (page === 'transactions') {
      setCurrentPage('transactions');
      window.history.pushState({}, '', '/transactions');
    } else {
      setCurrentPage(page as PageType);
      const pathMap: Record<string, string> = {
        'home': '/',
        'arena': '/arena',
        'create': '/create',
        'transactions': '/transactions',
        'lobby': '/lobby',
      };
      window.history.pushState({}, '', pathMap[page] || '/');
    }
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage walletBalance={walletBalance} onNavigate={handleNavigate} />;
      case 'arena':
        return <ArenaPage walletBalance={walletBalance} onNavigate={handleNavigate} />;
      case 'create':
        return <CreatePage walletBalance={walletBalance} onNavigate={handleNavigate} />;
      case 'lobby':
        return <LobbyPage onNavigate={handleNavigate} />;
      case 'results':
        return <ResultsPage onNavigate={handleNavigate} resultType={resultType} />;
      case 'history':
        return <BattleHistoryPage onNavigate={handleNavigate} />;
      case 'primary-history':
        return <PrimaryBattleHistoryPage onNavigate={handleNavigate} />;
      case 'secondary-history':
        return <SecondaryBattleHistoryPage onNavigate={handleNavigate} />;
      case 'transactions':
        return <TransactionHistoryPage onNavigate={handleNavigate} />;
      case 'unified-history':
        return <UnifiedHistoryPage onNavigate={handleNavigate} />;
      case '404':
        return <NotFoundPage onNavigate={handleNavigate} />;
      default:
        return <NotFoundPage onNavigate={handleNavigate} />;
    }
  };


  return (
    <div className="min-h-screen bg-void text-foreground">
      {/* Toast Notifications */}
      <Toaster 
        position="bottom-right" 
        richColors 
        expand={true}
        duration={8000}
      />
      
      {/* Navigation - Hidden on results page for immersive experience */}
      {currentPage !== 'results' && (
        <Navbar
          currentPrice={currentPrice}
          priceChange={priceChange}
          activeBattle={activeBattleLabel ? `${activeBattleLabel} LIVE` : undefined}
          onBalanceChange={setWalletBalance}
          onNavigate={handleNavigate}
        />
      )}

      {/* Main Content */}
      <main className="relative">
        <ErrorBoundary>
          {renderPage()}
        </ErrorBoundary>
      </main>

      {/* Footer - Hidden on results page */}
      {currentPage !== 'results' && <Footer />}

      {/* Floating Dock - Main Navigation */}
      {currentPage !== 'results' && (
        <FloatingDock
          items={[
            {
              title: 'Home',
              icon: <Home className="h-5 w-5" />,
              href: '#',
              onClick: (e: React.MouseEvent) => {
                e.preventDefault();
                handleNavigate('home');
              },
            },
            {
              title: 'Arena',
              icon: <Swords className="h-5 w-5" />,
              href: '#',
              onClick: (e: React.MouseEvent) => {
                e.preventDefault();
                handleNavigate('arena');
              },
            },
            {
              title: 'Create',
              icon: <Plus className="h-5 w-5" />,
              href: '#',
              onClick: (e: React.MouseEvent) => {
                e.preventDefault();
                handleNavigate('create');
              },
            },
            {
              title: 'History',
              icon: <History className="h-5 w-5" />,
              href: '#',
              onClick: (e: React.MouseEvent) => {
                e.preventDefault();
                handleNavigate('unified-history');
              },
            },
            {
              title: 'Transactions',
              icon: <Receipt className="h-5 w-5" />,
              href: '#',
              onClick: (e: React.MouseEvent) => {
                e.preventDefault();
                handleNavigate('transactions');
              },
            },
          ]}
          activeItem={(() => {
            const pageMap: Record<PageType, string> = {
              'home': 'home',
              'arena': 'arena',
              'create': 'create',
              'history': 'history',
              'unified-history': 'history',
              'primary-history': 'history',
              'secondary-history': 'history',
              'transactions': 'transactions',
              'lobby': 'home',
              'results': 'home',
              '404': 'home',
            };
            return pageMap[currentPage] || '';
          })()}
        />
      )}
    </div>
  );
}

export default App;
