import { useActiveAccount, useActiveWallet, useDisconnect, useReadContract } from 'thirdweb/react';
import { useEffect, useState, useCallback } from 'react';
import { CONTRACTS, getUSDCContract } from '@/lib/thirdweb';
import type { WalletState } from '@/types';

const USDC_DECIMALS = 6;

export function useWallet() {
  const account = useActiveAccount();
  const wallet = useActiveWallet();
  const { disconnect } = useDisconnect();
  
  const [walletState, setWalletState] = useState<WalletState>({
    address: null,
    balance: 0,
    isConnected: false,
  });
  
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // USDC contract for balance
  const usdcContract = getUSDCContract();

  // State to force refetch
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  
  // Listen for balance refresh events
  useEffect(() => {
    const handleRefresh = () => {
      setRefreshTrigger(prev => prev + 1);
    };
    window.addEventListener('refreshBalance', handleRefresh);
    return () => window.removeEventListener('refreshBalance', handleRefresh);
  }, []);
  
  // Fetch USDC balance when account changes
  const { data: balanceData, error: balanceError, refetch: refetchBalance } = useReadContract({
    contract: usdcContract,
    method: "function balanceOf(address account) view returns (uint256)",
    params: account?.address ? [account.address] : undefined,
    queryOptions: {
      enabled: !!account?.address && !!CONTRACTS.usdc,
      refetchInterval: 10000, // Refetch every 10 seconds
    },
  });
  
  // Force refetch when refreshTrigger changes
  useEffect(() => {
    if (refreshTrigger > 0 && account?.address) {
      refetchBalance();
    }
  }, [refreshTrigger, account?.address, refetchBalance]);
  
  // Log balance errors and debug info
  useEffect(() => {
    if (balanceError) {
      console.warn('USDC balance fetch error:', balanceError);
      if (!CONTRACTS.usdc) {
        console.warn('⚠️ USDC contract address not configured. Set VITE_MOCK_USDC in .env');
      }
    }
    
    // Debug logging
    if (account?.address) {
      console.log('🔍 Wallet balance debug:', {
        address: account.address,
        usdcContract: CONTRACTS.usdc,
        balanceData: balanceData?.toString(),
        balanceError: balanceError?.message,
        hasBalance: balanceData !== undefined && balanceData !== null,
      });
    }
  }, [balanceError, account?.address, balanceData]);

  // Update wallet state when account changes
  useEffect(() => {
    if (account?.address) {
      if (balanceData !== undefined && balanceData !== null) {
        // balanceData is BigInt, convert to number
        const balance = typeof balanceData === 'bigint' 
          ? Number(balanceData) / Math.pow(10, USDC_DECIMALS)
          : Number(balanceData || 0) / Math.pow(10, USDC_DECIMALS);
        
        setWalletState({
          address: account.address,
          balance,
          isConnected: true,
        });
      } else {
        // If balance data is not available yet, keep previous state or set to 0
        setWalletState(prev => ({
          address: account.address,
          balance: prev.balance || 0,
          isConnected: true,
        }));
      }
    } else {
      setWalletState({
        address: null,
        balance: 0,
        isConnected: false,
      });
    }
  }, [account?.address, balanceData]);

  // Connect function - opens wallet modal (handled by ConnectButton)
  const connect = useCallback(() => {
    console.log('Connect requested - use ConnectButton component');
  }, []);

  // Disconnect function
  const handleDisconnect = useCallback(() => {
    disconnect();
  }, [disconnect]);

  return {
    walletState,
    connect,
    handleDisconnect,
    isLoading,
    error,
    account,
    wallet,
  };
}

export default useWallet;
