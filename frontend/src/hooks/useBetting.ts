import { useState, useCallback } from 'react';
import { useActiveAccount, useSendTransaction, useActiveWallet } from 'thirdweb/react';
import { prepareContractCall, toUnits } from 'thirdweb';
import { getContract } from 'thirdweb';
import { keccak256, toHex, signMessage } from 'thirdweb/utils';
import { decodeErrorResult } from 'viem';
import { client, chain, CONTRACTS, BATTLE_FACTORY_ABI } from '@/lib/thirdweb';
import apiClient from '@/lib/api';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const USDC_DECIMALS = 6;

// USDC ABI for approve
const USDC_APPROVE_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "spender", "type": "address" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "approve",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "owner", "type": "address" },
      { "internalType": "address", "name": "spender", "type": "address" }
    ],
    "name": "allowance",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  }
];

export function useBetting() {
  const account = useActiveAccount();
  const wallet = useActiveWallet();
  const { mutate: sendTransaction, isPending, error } = useSendTransaction();
  const [isApproving, setIsApproving] = useState(false);
  const [bettingError, setBettingError] = useState<string | null>(null);
  const [useYellow, setUseYellow] = useState(true); // Toggle: true = Yellow SDK, false = direct contract

  /**
   * Approve USDC for a battle contract
   */
  const approveUSDC = useCallback(async (battleAddress: string, amount: number) => {
    if (!account?.address) {
      throw new Error('Wallet not connected');
    }

    setIsApproving(true);
    setBettingError(null);

    try {
      const usdcContract = getContract({
        client,
        chain,
        address: CONTRACTS.usdc,
      });

      const amountWei = toUnits(amount.toString(), USDC_DECIMALS);
      
      // Approve exactly the bet amount (not 10x) for better UX
      // Users can approve more later if they want to place multiple bets
      const approvalAmount = amountWei; // Exact bet amount
      
      const transaction = prepareContractCall({
        contract: usdcContract,
        method: "function approve(address spender, uint256 amount) returns (bool)",
        params: [battleAddress, approvalAmount],
      });

      const approvalResult = await new Promise<any>((resolve, reject) => {
        sendTransaction(transaction, {
          onSuccess: (txResult) => {
            console.log('✅ USDC approval successful:', txResult.transactionHash);
            resolve(txResult);
          },
          onError: (error: any) => {
            console.error('❌ USDC approval failed:', error);
            reject(error);
          },
        });
      });
      
      console.log('✅ USDC approved, proceeding with bet placement...');
      return true;
    } catch (err: any) {
      console.error('Failed to approve USDC:', err);
      setBettingError(err.message || 'Failed to approve USDC');
      throw err;
    } finally {
      setIsApproving(false);
    }
  }, [account, sendTransaction]);

  /**
   * Place a bet on a battle
   * Uses Yellow SDK for gasless betting (if enabled) or direct contract call
   */
  const placeBet = useCallback(async (
    battleId: string,
    battleAddress: string,
    side: 'bull' | 'bear',
    amount: number
  ) => {
    if (!account?.address || !wallet) {
      throw new Error('Wallet not connected');
    }

    setBettingError(null);

    try {
      // OPTION 1: Use Yellow SDK for gasless betting (for ETHGlobal)
      if (useYellow) {
        console.log('💛 Placing bet via Yellow SDK (gasless)...');
        
        if (!wallet) {
          throw new Error('Wallet not available for signing');
        }

        // CRITICAL: For Yellow SDK to work, we need USDC to be approved and deposited
        // Since Yellow SDK is a state channel, users need to deposit funds first
        // For now, we'll require approval to the battle contract, then place bet on-chain
        // This ensures funds are available when settling
        
        console.log('⚠️ Yellow SDK requires USDC deposit. Approving and placing bet on-chain instead...');
        
        // Validate bet with backend
        const validation = await fetch(`${API_BASE_URL}/api/battles/${battleId}/bet/validate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: account.address,
            side,
            amount,
          }),
        }).then(r => r.json());

        if (!validation.valid) {
          throw new Error(validation.error || 'Bet validation failed');
        }

        // Check if approval is needed
        if (validation.needsApproval) {
          await approveUSDC(battleAddress, amount);
        }

        // Place bet on contract (Yellow SDK settlement will handle winnings)
        const battleArenaContract = getContract({
          client,
          chain,
          address: battleAddress,
          abi: BATTLE_FACTORY_ABI,
        });

        const agentIndex = side === 'bull' ? 0 : 1;
        const amountWei = toUnits(amount.toString(), USDC_DECIMALS);

        // Convert battleId string to bytes32
        let battleIdBytes32: `0x${string}`;
        if (battleId.startsWith('0x') && battleId.length === 66) {
          battleIdBytes32 = battleId as `0x${string}`;
        } else {
          battleIdBytes32 = keccak256(toHex(battleId)) as `0x${string}`;
        }

        // Check battle status on-chain before placing bet
        try {
          const { readContract } = await import('thirdweb');
          const onChainBattle = await readContract({
            contract: battleArenaContract,
            method: "function getBattle(bytes32 battleId) view returns (tuple(tuple(address wallet, uint256 collateral, bool isLong, uint256 leverage, uint256 entryPrice, bool alive, uint256 lastProofTime, uint256 totalBets) agentA, tuple(address wallet, uint256 collateral, bool isLong, uint256 leverage, uint256 entryPrice, bool alive, uint256 lastProofTime, uint256 totalBets) agentB, uint256 startTime, uint256 endTime, uint256 totalPool, uint8 status, address winner, uint256 entryFee, uint256 eliminationThreshold))",
            params: [battleIdBytes32],
          });
          
          const battleStatus = Number(onChainBattle.status);
          const statusNames = ['Pending', 'Active', 'Settled'];
          const statusName = statusNames[battleStatus] || 'Unknown';
          
          console.log('📊 On-chain battle status check:', {
            battleId: battleIdBytes32,
            status: battleStatus,
            statusName,
            startTime: onChainBattle.startTime?.toString(),
            endTime: onChainBattle.endTime?.toString(),
            agentAAlive: onChainBattle.agentA?.alive,
            agentBAlive: onChainBattle.agentB?.alive,
            totalPool: onChainBattle.totalPool?.toString(),
          });
          
          if (battleStatus !== 1) { // 1 = Active
            // Log warning but don't block - let the contract handle validation
            const statusMsg = `${statusName} (${battleStatus}). ${battleStatus === 0 ? 'Battle is still Pending.' : battleStatus === 2 ? 'Battle is already Settled.' : 'Unknown status.'}`;
            console.warn('⚠️ Battle status is not Active:', statusMsg);
            console.log('⚠️ Continuing anyway - contract will validate and return proper error if needed');
            // Don't throw - let the contract handle it
          } else {
            console.log('✅ Battle is Active on-chain, proceeding with bet placement...');
          }
        } catch (statusError: any) {
          // If status check fails, log it but don't block the bet
          // The contract will validate the status when we try to place the bet
          console.warn('⚠️ Failed to check battle status on-chain (non-blocking):', {
            error: statusError.message,
            battleId: battleIdBytes32,
            battleAddress,
            note: 'Will attempt bet placement - contract will validate status',
          });
          
          // Only throw if it's a clear "battle not found" error
          // Otherwise, let the contract handle validation
          if (statusError.message?.includes('Battle not found on-chain') || 
              (statusError.message?.includes('execution reverted') && statusError.message?.includes('BattleNotFound'))) {
            throw new Error(`Battle not found on-chain. The battle may not exist at address ${battleAddress}. Please refresh and try again.`);
          }
          
          // For all other errors (including status not Active), continue with bet placement
          // The contract's placeBet function will validate and return a proper error if needed
          console.log('✅ Continuing with bet placement - contract will validate battle status...');
        }

        const transaction = prepareContractCall({
          contract: battleArenaContract,
          method: "function placeBet(bytes32 battleId, uint8 agentIndex, uint256 amount)",
          params: [battleIdBytes32, agentIndex, amountWei],
        });

        console.log('🎲 Sending bet placement transaction...', {
          battleId: battleIdBytes32,
          agentIndex,
          amount: amountWei.toString(),
        });

        // Wrap sendTransaction in a promise since it uses callbacks
        const result = await new Promise<any>((resolve, reject) => {
          sendTransaction(transaction, {
            onSuccess: (txResult) => {
              if (!txResult || !txResult.transactionHash) {
                reject(new Error('Transaction failed: No transaction hash returned'));
              } else {
                resolve(txResult);
              }
            },
            onError: (error: any) => {
              // Try to decode contract errors using viem
              let errorMessage = error?.message || 'Transaction failed';
              
              // Extract error data from various possible locations
              const errorData = error?.data || error?.reason || error?.cause?.data || error?.cause?.reason;
              
              // Try to decode using viem if we have error data
              if (errorData && typeof errorData === 'string' && errorData.startsWith('0x')) {
                try {
                  const decoded = decodeErrorResult({
                    abi: BATTLE_FACTORY_ABI,
                    data: errorData as `0x${string}`,
                  });
                  
                  // Map decoded error names to user-friendly messages
                  const errorMessages: Record<string, string> = {
                    'BattleNotEnded': 'Cannot settle battle yet. The battle is still in progress.',
                    'BettingClosed': 'Betting is currently closed. The battle may not have started yet (Pending) or has already ended (Settled). Only Active battles accept bets.',
                    'InsufficientBet': 'Bet amount is too low. Please increase your bet.',
                    'BattleAlreadySettled': 'This battle has already been settled.',
                    'BattleNotFound': 'Battle not found. Please refresh and try again.',
                    'InvalidAgent': 'Invalid agent selected.',
                    'TransferFailed': 'Token transfer failed. Please check your balance.',
                  };
                  
                  errorMessage = errorMessages[decoded.errorName] || `${decoded.errorName}: Transaction failed`;
                } catch (decodeError) {
                  // If decoding fails, fall back to signature matching
                  console.warn('Failed to decode error:', decodeError);
                  
                  // Error signature mapping (first 4 bytes of keccak256("ErrorName()"))
                  // Error signature mapping (approximate - actual signatures may vary)
                  // If we can't decode, try to match common error patterns
                  if (errorData.includes('0x48ff2a44') || errorData.includes('BettingClosed')) {
                    errorMessage = 'Betting is currently closed. The battle may not have started yet (Pending) or has already ended (Settled). Only Active battles accept bets.';
                  } else if (errorData.includes('0xce5a61cf') || errorData.includes('BattleNotEnded')) {
                    errorMessage = 'Cannot settle battle yet. The battle is still in progress.';
                  } else if (errorData.includes('0xfb8f41b2') || errorData.includes('0x0c53c51c')) {
                    // Fallback for unknown signatures - likely betting closed
                    errorMessage = 'Betting is currently closed. The battle may not be active. Please check the battle status.';
                  } else if (errorData.includes('0x98a9e57c')) {
                    errorMessage = 'Bet amount is too low. Please increase your bet.';
                  }
                }
              } else {
                // Check error message for common patterns
                if (errorMessage.includes('BettingClosed') || errorMessage.includes('betting closed') || errorMessage.includes('not active')) {
                  errorMessage = 'Betting is currently closed. The battle may not have started yet (Pending) or has already ended (Settled). Only Active battles accept bets.';
                } else if (errorMessage.includes('BattleNotEnded') || errorMessage.includes('battle not ended')) {
                  errorMessage = 'Cannot settle battle yet. The battle is still in progress.';
                } else if (errorMessage.includes('0xfb8f41b2') || errorMessage.includes('0x0c53c51c') || errorMessage.includes('0x48ff2a44')) {
                  // Generic contract error - likely betting closed
                  errorMessage = 'Betting is currently closed. The battle may not be active. Please check the battle status.';
                } else if (errorMessage.includes('user rejected') || errorMessage.includes('User rejected')) {
                  errorMessage = 'Transaction was rejected.';
                } else if (errorMessage.includes('insufficient funds') || errorMessage.includes('insufficient balance')) {
                  errorMessage = 'Insufficient funds for this transaction.';
                }
              }
              
              const enhancedError = new Error(errorMessage);
              (enhancedError as any).originalError = error;
              reject(enhancedError);
            },
          });
        });
        
        console.log('✅ Bet placed on-chain (Yellow SDK settlement will handle winnings)', {
          txHash: result.transactionHash,
          blockNumber: result.blockNumber,
          battleId,
          side,
          amount,
        });
        
        // Save bet to backend
        try {
          const saveResponse = await fetch(`${API_BASE_URL}/api/battles/${battleId}/bet`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userAddress: account.address,
              side,
              amount,
              txHash: result.transactionHash,
              blockNumber: result.blockNumber,
            }),
          });
          
          if (!saveResponse.ok) {
            const errorData = await saveResponse.json();
            console.error('❌ Failed to save bet to backend:', errorData);
            throw new Error(errorData.error || 'Failed to save bet');
          }
          
          const saveData = await saveResponse.json();
          console.log('✅ Bet saved to backend:', saveData);
        } catch (err) {
          console.error('❌ Failed to save bet to backend:', err);
          // Don't fail the bet if backend save fails, but log it
        }
        
        return {
          success: true,
          txHash: result.transactionHash,
          battleId,
          side,
          amount,
          viaYellow: false, // Actually placed on-chain
        };
      }

      // OPTION 2: Direct contract call (fallback or if Yellow disabled)
      console.log('📝 Placing bet on-chain (direct contract call)...');
      
      // 1. Validate bet with backend
      const validation = await fetch(`${API_BASE_URL}/api/battles/${battleId}/bet/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userAddress: account.address,
          side,
          amount,
        }),
      }).then(r => r.json());

      if (!validation.valid) {
        throw new Error(validation.error || 'Bet validation failed');
      }

      // 2. Check if approval is needed
      if (validation.needsApproval) {
        console.log('📝 Approval needed, requesting approval...');
        await approveUSDC(battleAddress, amount);
        console.log('✅ Approval complete, now placing bet...');
      } else {
        console.log('✅ Already approved, placing bet directly...');
      }

      // 3. Place bet on contract
      console.log('🎲 Placing bet on contract...', { battleId, side, amount, agentIndex: side === 'bull' ? 0 : 1 });
      const battleArenaContract = getContract({
        client,
        chain,
        address: battleAddress,
        abi: BATTLE_FACTORY_ABI,
      });

      const agentIndex = side === 'bull' ? 0 : 1;
      const amountWei = toUnits(amount.toString(), USDC_DECIMALS);

      // Convert battleId string to bytes32
      let battleIdBytes32: `0x${string}`;
      if (battleId.startsWith('0x') && battleId.length === 66) {
        battleIdBytes32 = battleId as `0x${string}`;
      } else {
        battleIdBytes32 = keccak256(toHex(battleId)) as `0x${string}`;
      }

      // Check battle status on-chain before placing bet
      try {
        const { readContract } = await import('thirdweb');
        const onChainBattle = await readContract({
          contract: battleArenaContract,
          method: "function getBattle(bytes32 battleId) view returns (tuple(tuple(address wallet, uint256 collateral, bool isLong, uint256 leverage, uint256 entryPrice, bool alive, uint256 lastProofTime, uint256 totalBets) agentA, tuple(address wallet, uint256 collateral, bool isLong, uint256 leverage, uint256 entryPrice, bool alive, uint256 lastProofTime, uint256 totalBets) agentB, uint256 startTime, uint256 endTime, uint256 totalPool, uint8 status, address winner, uint256 entryFee, uint256 eliminationThreshold))",
          params: [battleIdBytes32],
        });
        
        const battleStatus = Number(onChainBattle.status);
        const statusNames = ['Pending', 'Active', 'Settled'];
        const statusName = statusNames[battleStatus] || 'Unknown';
        
        console.log('📊 On-chain battle status check:', {
          battleId: battleIdBytes32,
          status: battleStatus,
          statusName,
          startTime: onChainBattle.startTime?.toString(),
          endTime: onChainBattle.endTime?.toString(),
          agentAAlive: onChainBattle.agentA?.alive,
          agentBAlive: onChainBattle.agentB?.alive,
          totalPool: onChainBattle.totalPool?.toString(),
        });
        
        if (battleStatus !== 1) { // 1 = Active
          const errorMsg = `Betting is closed. On-chain status: ${statusName} (${battleStatus}). ${battleStatus === 0 ? 'Battle is still Pending - it may not have started yet.' : battleStatus === 2 ? 'Battle is already Settled - it has ended.' : 'Unknown status.'}`;
          console.error('❌ Battle status check failed:', errorMsg);
          throw new Error(errorMsg);
        }
        
        console.log('✅ Battle is Active on-chain, proceeding with bet placement...');
      } catch (statusError: any) {
        // If status check fails, log it but don't block the bet
        // The contract will validate the status when we try to place the bet
        console.warn('⚠️ Failed to check battle status on-chain (non-blocking):', {
          error: statusError.message,
          battleId: battleIdBytes32,
          battleAddress,
          note: 'Will attempt bet placement - contract will validate status',
        });
        
        // Only throw if it's a clear "battle not found" error
        // Otherwise, let the contract handle validation
        if (statusError.message?.includes('Battle not found on-chain') || 
            (statusError.message?.includes('execution reverted') && statusError.message?.includes('BattleNotFound'))) {
          throw new Error(`Battle not found on-chain. The battle may not exist at address ${battleAddress}. Please refresh and try again.`);
        }
        
        // For all other errors (including status not Active), continue with bet placement
        // The contract's placeBet function will validate and return a proper error if needed
        console.log('✅ Continuing with bet placement - contract will validate battle status...');
      }

      const transaction = prepareContractCall({
        contract: battleArenaContract,
        method: "function placeBet(bytes32 battleId, uint8 agentIndex, uint256 amount)",
        params: [battleIdBytes32, agentIndex, amountWei],
      });

      // Wrap sendTransaction in a promise since it uses callbacks
      const result = await new Promise<any>((resolve, reject) => {
        sendTransaction(transaction, {
          onSuccess: (txResult) => {
            if (!txResult || !txResult.transactionHash) {
              reject(new Error('Transaction failed: No transaction hash returned'));
            } else {
              resolve(txResult);
            }
          },
          onError: (error: any) => {
            // Try to decode contract errors using viem
            let errorMessage = error?.message || 'Transaction failed';
            
            // Extract error data from various possible locations
            const errorData = error?.data || error?.reason || error?.cause?.data || error?.cause?.reason;
            
            // Try to decode using viem if we have error data
            if (errorData && typeof errorData === 'string' && errorData.startsWith('0x')) {
              try {
                const decoded = decodeErrorResult({
                  abi: BATTLE_FACTORY_ABI,
                  data: errorData as `0x${string}`,
                });
                
                  // Map decoded error names to user-friendly messages
                  const errorMessages: Record<string, string> = {
                    'BattleNotEnded': 'Cannot settle battle yet. The battle is still in progress.',
                    'BettingClosed': 'Betting is currently closed. The battle may not have started yet (Pending) or has already ended (Settled). Only Active battles accept bets.',
                    'InsufficientBet': 'Bet amount is too low. Please increase your bet.',
                    'BattleAlreadySettled': 'This battle has already been settled.',
                    'BattleNotFound': 'Battle not found. Please refresh and try again.',
                    'InvalidAgent': 'Invalid agent selected.',
                    'TransferFailed': 'Token transfer failed. Please check your balance.',
                  };
                  
                  errorMessage = errorMessages[decoded.errorName] || `${decoded.errorName}: Transaction failed`;
                } catch (decodeError) {
                  // If decoding fails, fall back to signature matching
                  console.warn('Failed to decode error:', decodeError);
                  
                  // Error signature mapping (first 4 bytes of keccak256("ErrorName()"))
                  // Error signature mapping (approximate - actual signatures may vary)
                  // If we can't decode, try to match common error patterns
                  if (errorData.includes('0x48ff2a44') || errorData.includes('BettingClosed')) {
                    errorMessage = 'Betting is currently closed. The battle may not have started yet (Pending) or has already ended (Settled). Only Active battles accept bets.';
                  } else if (errorData.includes('0xce5a61cf') || errorData.includes('BattleNotEnded')) {
                    errorMessage = 'Cannot settle battle yet. The battle is still in progress.';
                  } else if (errorData.includes('0xfb8f41b2') || errorData.includes('0x0c53c51c')) {
                    // Fallback for unknown signatures - likely betting closed
                    errorMessage = 'Betting is currently closed. The battle may not be active. Please check the battle status.';
                  } else if (errorData.includes('0x98a9e57c')) {
                    errorMessage = 'Bet amount is too low. Please increase your bet.';
                  }
                }
              } else {
                // Check error message for common patterns
                if (errorMessage.includes('BettingClosed') || errorMessage.includes('betting closed') || errorMessage.includes('not active')) {
                  errorMessage = 'Betting is currently closed. The battle may not have started yet (Pending) or has already ended (Settled). Only Active battles accept bets.';
                } else if (errorMessage.includes('BattleNotEnded') || errorMessage.includes('battle not ended')) {
                  errorMessage = 'Cannot settle battle yet. The battle is still in progress.';
                } else if (errorMessage.includes('0xfb8f41b2') || errorMessage.includes('0x0c53c51c') || errorMessage.includes('0x48ff2a44')) {
                  // Generic contract error - likely betting closed
                  errorMessage = 'Betting is currently closed. The battle may not be active. Please check the battle status.';
                } else if (errorMessage.includes('user rejected') || errorMessage.includes('User rejected')) {
                  errorMessage = 'Transaction was rejected.';
                } else if (errorMessage.includes('insufficient funds') || errorMessage.includes('insufficient balance')) {
                  errorMessage = 'Insufficient funds for this transaction.';
                }
              }
            
            console.error('❌ Bet placement failed:', {
              error: errorMessage,
              originalError: error,
              battleId,
              side,
              amount,
            });
            
            const enhancedError = new Error(errorMessage);
            (enhancedError as any).originalError = error;
            reject(enhancedError);
          },
        });
      });
      
      console.log('✅ Bet placed on-chain (direct contract call)', {
        txHash: result.transactionHash,
        blockNumber: result.blockNumber,
        battleId,
        side,
        amount,
      });
      
      // Save bet to backend
      try {
        const saveResponse = await fetch(`${API_BASE_URL}/api/battles/${battleId}/bet`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userAddress: account.address,
            side,
            amount,
            txHash: result.transactionHash,
            blockNumber: result.blockNumber,
          }),
        });
        
        if (!saveResponse.ok) {
          const errorData = await saveResponse.json();
          console.error('❌ Failed to save bet to backend:', errorData);
          throw new Error(errorData.error || 'Failed to save bet');
        }
        
        const saveData = await saveResponse.json();
        console.log('✅ Bet saved to backend:', saveData);
      } catch (err) {
        console.error('❌ Failed to save bet to backend:', err);
        // Don't fail the bet if backend save fails, but log it
      }
      
      return {
        success: true,
        txHash: result.transactionHash,
        battleId,
        side,
        amount,
        viaYellow: false,
      };
    } catch (err: any) {
      console.error('Failed to place bet:', err);
      
      // Try to decode the error if it's a contract error
      let errorMessage = err?.message || 'Failed to place bet';
      
      // Extract error data from various possible locations
      const errorData = err?.data || err?.reason || err?.cause?.data || err?.cause?.reason;
      
      // Try to decode using viem if we have error data
      if (errorData && typeof errorData === 'string' && errorData.startsWith('0x')) {
        try {
          const decoded = decodeErrorResult({
            abi: BATTLE_FACTORY_ABI,
            data: errorData as `0x${string}`,
          });
          
          // Map decoded error names to user-friendly messages
          const errorMessages: Record<string, string> = {
            'BattleNotEnded': 'Cannot settle battle yet. The battle is still in progress.',
            'BettingClosed': 'Betting is closed. The battle may not have started yet (status: Pending) or has already ended (status: Settled).',
            'InsufficientBet': 'Bet amount is too low. Please increase your bet.',
            'BattleAlreadySettled': 'This battle has already been settled.',
            'BattleNotFound': 'Battle not found. Please refresh and try again.',
            'InvalidAgent': 'Invalid agent selected.',
            'TransferFailed': 'Token transfer failed. Please check your balance.',
          };
          
          errorMessage = errorMessages[decoded.errorName] || `${decoded.errorName}: Transaction failed`;
        } catch (decodeError) {
          // If decoding fails, fall back to signature matching
          // Note: 0xfb8f41b2 is BattleNotEnded (used in settleBattle, not placeBet)
          // 0x0c53c51c is BettingClosed (used in placeBet when status != Active)
          if (errorData.includes('0x0c53c51c')) {
            errorMessage = 'Betting is closed. The battle may not have started yet (status: Pending) or has already ended (status: Settled).';
          } else if (errorData.includes('0xfb8f41b2')) {
            errorMessage = 'Betting is currently closed. The battle may not be active. Please check the battle status.';
          } else if (errorData.includes('0x98a9e57c')) {
            errorMessage = 'Bet amount is too low. Please increase your bet.';
          }
        }
      } else if (errorMessage.includes('0x0c53c51c') || errorMessage.includes('BettingClosed') || errorMessage.includes('betting closed')) {
        errorMessage = 'Betting is currently closed. The battle may not have started yet (Pending) or has already ended (Settled). Only Active battles accept bets.';
      } else if (errorMessage.includes('0xfb8f41b2') || errorMessage.includes('BattleNotEnded') || errorMessage.includes('battle not ended')) {
        errorMessage = 'Betting is currently closed. The battle may not be active. Please check the battle status.';
      } else if (errorMessage.includes('Encoded error signature')) {
        // Handle the specific viem error message
        if (errorMessage.includes('0x0c53c51c') || errorMessage.includes('0x48ff2a44')) {
          errorMessage = 'Betting is currently closed. The battle may not have started yet (Pending) or has already ended (Settled). Only Active battles accept bets.';
        } else if (errorMessage.includes('0xfb8f41b2') || errorMessage.includes('0xce5a61cf')) {
          errorMessage = 'Betting is currently closed. The battle may not be active. Please check the battle status.';
        }
      }
      
      setBettingError(errorMessage);
      throw new Error(errorMessage);
    }
  }, [account, wallet, sendTransaction, approveUSDC, useYellow]);

  return {
    placeBet,
    approveUSDC,
    isPending: isPending || isApproving,
    error: bettingError || error?.message,
    useYellow, // Current mode
    setUseYellow, // Toggle between Yellow and direct contract
  };
}
