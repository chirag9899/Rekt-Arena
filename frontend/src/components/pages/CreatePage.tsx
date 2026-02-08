import { useState } from 'react';
import { ArrowLeft, TrendingUp, TrendingDown, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
// Switch removed - unused
import { formatCurrency } from '@/lib/utils';
import { useWallet } from '@/hooks/useWallet';
import apiClient from '@/lib/api';
import type { BattleSide } from '@/types';
import { TokenETH, TokenBTC, TokenSOL, TokenMATIC } from '@web3icons/react';
import { useActiveAccount, useSendTransaction } from 'thirdweb/react';
import { prepareContractCall, toUnits, readContract } from 'thirdweb';
import { getBattleFactoryContract, getUSDCContract, CONTRACTS } from '@/lib/thirdweb';
import { keccak256, toHex } from 'thirdweb/utils';
import { useWebSocket } from '@/hooks/useWebSocket';

interface CreatePageProps {
  walletBalance: number;
  onNavigate: (page: string) => void;
}

const steps = [
  { id: 1, label: 'MARKET', description: 'Select asset' },
  { id: 2, label: 'SIDE', description: 'Select position' },
  { id: 3, label: 'DEPOSIT', description: 'Stake capital' },
  { id: 4, label: 'CONFIG', description: 'Set options' },
];

const AVAILABLE_MARKETS = [
  { id: 'ethereum', symbol: 'ETH', label: 'ETH-PERP', Icon: TokenETH },
  { id: 'bitcoin', symbol: 'BTC', label: 'BTC-PERP', Icon: TokenBTC },
  { id: 'solana', symbol: 'SOL', label: 'SOL-PERP', Icon: TokenSOL },
  { id: 'matic-network', symbol: 'MATIC', label: 'MATIC-PERP', Icon: TokenMATIC },
];

const USDC_DECIMALS = 6;

export function CreatePage({ walletBalance, onNavigate }: CreatePageProps) {
  const { walletState, account } = useWallet();
  const activeAccount = useActiveAccount();
  const { mutate: sendTransaction, isPending: isTxPending } = useSendTransaction();
  const { currentPrice } = useWebSocket(); // Get current price from WebSocket
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedMarket, setSelectedMarket] = useState(AVAILABLE_MARKETS[0]);
  const [selectedSide, setSelectedSide] = useState<BattleSide>('bull');
  const [amount, setAmount] = useState(100);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const minBet = 100;
  const potentialWin = amount * 1.8;
  const platformFee = amount * 0.1;
  // availableBalance removed - unused
  
  // Get wallet address from either walletState or account (fallback)
  const walletAddress = walletState.address || account?.address || activeAccount?.address;

  const handleNext = async () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    } else {
      // Create battle on-chain (contract is source of truth)
      setIsCreating(true);
      setError(null);
      
      try {
        if (!walletAddress || !activeAccount) {
          throw new Error('Please connect your wallet first');
        }

        // STEP 1: Create battle on-chain (contract)
        // This is the source of truth - battle exists on blockchain
        const battleFactory = getBattleFactoryContract();
        const usdcContract = getUSDCContract();
        const amountWei = toUnits(amount.toString(), USDC_DECIMALS);
        
        // Approve USDC for BattleFactory
        // Read allowance using readContract
        const allowance = await readContract({
          contract: usdcContract,
          method: "function allowance(address owner, address spender) view returns (uint256)",
          params: [walletAddress, CONTRACTS.battleFactory],
        });
        
        if (Number(allowance) < Number(amountWei)) {
          console.log('📝 Approving USDC for BattleFactory...');
          // Approve a reasonable amount (10x the stake) instead of unlimited
          const approvalAmount = amountWei * 10n; // 10x the stake amount
          const approveTx = prepareContractCall({
            contract: usdcContract,
            method: "function approve(address spender, uint256 amount) returns (bool)",
            params: [CONTRACTS.battleFactory, approvalAmount],
          });
          
          // Wrap sendTransaction in a promise
          await new Promise<any>((resolve, reject) => {
            sendTransaction(approveTx, {
              onSuccess: (result: any) => {
                console.log('✅ USDC approved:', result?.transactionHash);
                resolve(result);
              },
              onError: (error: any) => {
                if (error?.code === 4001 || error?.message?.includes('denied') || error?.message?.includes('rejected')) {
                  reject(new Error('Transaction was rejected. Please approve USDC to continue.'));
                } else {
                  reject(error);
                }
              },
            });
          });
        }

        // Create secondary battle on-chain using createBattleFromTemplate
        // Note: We skip the template check - the contract will revert with InvalidParameters
        // if template 0 is not enabled, which provides a clearer error message
        
        // Generate a unique battleId
        const battleIdBytes32 = keccak256(toHex(`secondary-${walletAddress}-${Date.now()}`));
        const templateId = 0; // Use default template
        
        // BattleArena.createBattle() requires:
        // 1. Both agents non-zero and different (line 199)
        // 2. entryPrice > 0 (line 200)
        // 3. duration > 0 (line 201) - this comes from template.timeLimit
        // 
        // For a secondary lobby where only one side is sponsored:
        // - Use user's address for their chosen side
        // - Use a placeholder for the opposite side (must be non-zero and different)
        // - The placeholder agent won't be able to submit proofs, but the battle can be created
        const placeholderAddress = '0x1111111111111111111111111111111111111111';
        const isBull = selectedSide === 'bull';
        const agentA = isBull ? walletAddress : placeholderAddress; // Bull
        const agentB = isBull ? placeholderAddress : walletAddress; // Bear
        
        // Validate addresses
        if (agentA === agentB || agentA === '0x0000000000000000000000000000000000000000' || agentB === '0x0000000000000000000000000000000000000000') {
          throw new Error('Invalid agent addresses');
        }
        
        // Get current price (8 decimals for contract)
        // Must be > 0, otherwise BattleArena.createBattle will revert
        const entryPrice = currentPrice > 0 
          ? BigInt(Math.floor(currentPrice * 1e8)) 
          : BigInt(2000 * 1e8); // Fallback to 2000 if price not available
        
        if (entryPrice === BigInt(0)) {
          throw new Error('Entry price cannot be zero. Please wait for price feed to update.');
        }
        
        console.log('🎮 Creating battle on-chain (createBattleFromTemplate):', { 
          battleId: battleIdBytes32,
          templateId,
          agentA,
          agentB,
          entryPrice: entryPrice.toString(),
          stake: amount 
        });
        
        const createTx = prepareContractCall({
          contract: battleFactory,
          method: "function createBattleFromTemplate(bytes32 battleId, uint256 templateId, address agentA, address agentB, uint256 entryPrice) returns (address)",
          params: [battleIdBytes32, templateId, agentA, agentB, entryPrice],
        });

        // Send transaction - wrap in promise to handle properly
        console.log('📤 Sending transaction to blockchain...');
        
        // Add timeout to prevent hanging forever
        const timeout = 120000; // 2 minutes
        const result = await Promise.race([
          new Promise<any>((resolve, reject) => {
            sendTransaction(createTx, {
              onSuccess: (txResult: any) => {
                console.log('📨 Transaction submitted:', txResult);
                if (!txResult || !txResult.transactionHash) {
                  console.error('❌ No transaction hash in result:', txResult);
                  reject(new Error('Transaction failed: No transaction hash returned'));
                } else {
                  console.log('✅ Transaction hash received:', txResult.transactionHash);
                  resolve(txResult);
                }
              },
              onError: (error: any) => {
                console.error('❌ Transaction error:', error);
                // User rejected transaction or other error
                if (error?.code === 4001 || error?.message?.includes('denied') || error?.message?.includes('rejected')) {
                  reject(new Error('Transaction was rejected. Please approve the transaction to create the battle.'));
                } else if (error?.message?.includes('SOCKET_NOT_CONNECTED') || error?.message?.includes('network')) {
                  reject(new Error('Network error: Unable to connect to blockchain. Please check your RPC connection and try again.'));
                } else {
                  reject(error);
                }
              },
            });
          }),
          new Promise<never>((_, reject) => {
            setTimeout(() => {
              reject(new Error('Transaction timeout: The transaction is taking too long. Please check MetaMask and try again.'));
            }, timeout);
          }),
        ]);

        const txHash = result.transactionHash;
        console.log('✅ Battle created on-chain:', txHash);
        
        // STEP 2: Create Yellow session for gasless betting (if Yellow is enabled)
        // This allows users to bet gaslessly on this battle
        try {
          if (activeAccount && walletAddress) {
            // Message signer for Yellow SDK - removed unused
            
            // Get battle address from transaction receipt or contract
            // For now, we'll use the battleId to create session later
            console.log('💛 Yellow session will be created when first bet is placed');
          }
        } catch (yellowErr) {
          console.warn('⚠️ Yellow session creation skipped (optional):', yellowErr);
          // Continue - battle is on-chain, Yellow is optional
        }
        
        // STEP 3: Notify backend about the on-chain battle
        // Backend will sync from chain, but we can also notify for faster UI updates
        try {
          await apiClient.createBattle({
            tier: 'SECONDARY',
            status: 'WAITING',
            asset: {
              assetId: selectedMarket.id,
              symbol: selectedMarket.symbol,
              pairLabel: selectedMarket.label,
            },
            [selectedSide]: {
              sponsor: walletAddress,
              stake: amount,
              leverage: 10, // Initial leverage (will escalate: 5x → 10x → 20x → 50x)
            },
          });
        } catch (apiErr) {
          console.warn('⚠️ Failed to notify backend (battle is still on-chain):', apiErr);
          // Continue - battle exists on-chain, backend will sync
        }
        
        // Navigate to home
        onNavigate('home');
      } catch (err: any) {
        console.error('❌ Failed to create battle:', err);
        let errorMessage = err.message || 'Failed to create battle. Please try again.';
        
        // Provide more helpful error messages
        if (errorMessage.includes('SOCKET_NOT_CONNECTED') || errorMessage.includes('network')) {
          errorMessage = 'Network error: Unable to connect to blockchain. Please check your internet connection and RPC settings, then try again.';
        } else if (errorMessage.includes('timeout')) {
          errorMessage = 'Transaction timeout: The transaction is taking too long. Please check MetaMask - you may need to approve the transaction.';
        } else if (errorMessage.includes('rejected') || errorMessage.includes('denied')) {
          errorMessage = 'Transaction was rejected. Please approve the transaction in MetaMask to create the battle.';
        }
        
        setError(errorMessage);
      } finally {
        setIsCreating(false);
      }
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    } else {
      onNavigate('home');
    }
  };

  const isStepComplete = (step: number) => {
    if (step === 1) return selectedMarket !== null;
    if (step === 2) return selectedSide !== null;
    if (step === 3) return amount >= minBet;
    return true;
  };

  return (
    <div className="min-h-screen bg-terminal-bg pt-14">
      {/* Header */}
      <div className="fixed top-14 left-0 right-0 z-40 bg-terminal-bg border-b border-terminal-border">
        <div className="max-w-xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3">
            <button 
              onClick={handleBack}
              className="p-1.5 rounded hover:bg-terminal-elevated transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-medium">CREATE SECONDARY MARKET</span>
            <span className="text-xs text-terminal-muted">(Lobby - Waiting for opponent)</span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="pt-24 pb-12 px-4 max-w-xl mx-auto">
        {/* Info Box */}
        <div className="mb-6 p-4 bg-terminal-card border border-terminal-border rounded-lg">
          <div className="flex items-start gap-3">
            <div className="text-terminal-muted text-sm">
              <p className="font-medium text-foreground mb-1">PRIMARY vs SECONDARY</p>
              <p className="text-xs">
                <strong>PRIMARY ARENA:</strong> Automated battles created by the system (always active, both sides funded)
              </p>
              <p className="text-xs mt-1">
                <strong>SECONDARY LOBBY:</strong> User-created battles waiting for an opponent (you're creating one now)
              </p>
            </div>
          </div>
        </div>

        {/* Step Indicator */}
        <div className="mb-8">
          <div className="flex items-center">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center flex-1">
                <div className="flex flex-col items-center">
                  <div className={`w-8 h-8 rounded flex items-center justify-center text-xs font-medium transition-all duration-200 ${
                    currentStep === step.id
                      ? 'bg-terminal-elevated text-foreground border border-terminal-border-hover'
                      : isStepComplete(step.id)
                      ? 'bg-long text-white'
                      : 'bg-terminal-card text-terminal-muted border border-terminal-border'
                  }`}>
                    {isStepComplete(step.id) && currentStep > step.id ? (
                      <Check className="w-4 h-4" />
                    ) : (
                      step.id
                    )}
                  </div>
                </div>
                {index < steps.length - 1 && (
                  <div className={`flex-1 h-px mx-2 ${
                    currentStep > step.id ? 'bg-long' : 'bg-terminal-border'
                  }`} />
                )}
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2">
            {steps.map((step) => (
              <span key={step.id} className={`text-xs ${
                currentStep === step.id ? 'text-foreground' : 'text-terminal-muted'
              }`}>
                {step.label}
              </span>
            ))}
          </div>
        </div>

        {/* Step Content */}
        <div className="space-y-6">
          {/* Step 1: Choose Market */}
          {currentStep === 1 && (
            <div>
              <h2 className="text-sm font-medium text-terminal-muted mb-4 uppercase tracking-wide">
                Select Market
              </h2>
              
              <div className="grid grid-cols-2 gap-3">
                {AVAILABLE_MARKETS.map((market) => {
                  const IconComponent = market.Icon;
                  return (
                    <button
                      key={market.id}
                      onClick={() => setSelectedMarket(market)}
                      className={`terminal-card p-5 text-center transition-all duration-150 ${
                        selectedMarket.id === market.id
                          ? 'border-long/50 bg-long/5'
                          : 'hover:border-terminal-border-hover'
                      }`}
                    >
                      <div className={`mb-2 flex justify-center ${selectedMarket.id === market.id ? 'opacity-100' : 'opacity-60'}`}>
                        <IconComponent className="w-12 h-12" />
                      </div>
                      <h3 className={`text-sm font-medium mb-1 ${selectedMarket.id === market.id ? 'text-long' : ''}`}>
                        {market.label}
                      </h3>
                      <p className="text-xs text-terminal-muted">{market.symbol}</p>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Step 2: Choose Side */}
          {currentStep === 2 && (
            <div>
              <h2 className="text-sm font-medium text-terminal-muted mb-4 uppercase tracking-wide">
                Select Position
              </h2>
              
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setSelectedSide('bull')}
                  className={`terminal-card p-5 text-center transition-all duration-150 ${
                    selectedSide === 'bull'
                      ? 'border-long/50 bg-long/5'
                      : 'hover:border-terminal-border-hover'
                  }`}
                >
                  <div className={`w-12 h-12 mx-auto mb-3 rounded-lg flex items-center justify-center ${
                    selectedSide === 'bull' ? 'bg-long/20' : 'bg-terminal-elevated'
                  }`}>
                    <TrendingUp className={`w-6 h-6 ${selectedSide === 'bull' ? 'text-long' : 'text-terminal-muted'}`} />
                  </div>
                  <h3 className={`text-sm font-medium mb-1 ${selectedSide === 'bull' ? 'text-long' : ''}`}>LONG</h3>
                  <p className="text-xs text-terminal-muted">Max 50x</p>
                </button>

                <button
                  onClick={() => setSelectedSide('bear')}
                  className={`terminal-card p-5 text-center transition-all duration-150 ${
                    selectedSide === 'bear'
                      ? 'border-short/50 bg-short/5'
                      : 'hover:border-terminal-border-hover'
                  }`}
                >
                  <div className={`w-12 h-12 mx-auto mb-3 rounded-lg flex items-center justify-center ${
                    selectedSide === 'bear' ? 'bg-short/20' : 'bg-terminal-elevated'
                  }`}>
                    <TrendingDown className={`w-6 h-6 ${selectedSide === 'bear' ? 'text-short' : 'text-terminal-muted'}`} />
                  </div>
                  <h3 className={`text-sm font-medium mb-1 ${selectedSide === 'bear' ? 'text-short' : ''}`}>SHORT</h3>
                  <p className="text-xs text-terminal-muted">Max 50x</p>
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Deposit Capital */}
          {currentStep === 3 && (
            <div>
              <h2 className="text-sm font-medium text-terminal-muted mb-4 uppercase tracking-wide">
                Deposit Capital
              </h2>

              <div className="terminal-card p-5">
                <div className="flex justify-between text-xs text-terminal-muted mb-4">
                  <span>Min {formatCurrency(minBet)}</span>
                  <span>Balance: {formatCurrency(walletBalance)} USDC</span>
                </div>

                {/* Amount Input */}
                <div className="mb-5">
                  <div className="relative mb-4">
                    <input
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      className="w-full px-4 py-3 text-2xl font-mono bg-terminal-elevated border border-terminal-border rounded-lg focus:border-terminal-border-hover focus:outline-none transition-colors"
                    />
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-terminal-muted text-sm">USDC</span>
                  </div>

                  <Slider
                    value={[amount]}
                    onValueChange={([value]) => setAmount(value)}
                    min={minBet}
                    max={Math.min(1000, walletBalance)}
                    step={10}
                    className="py-2"
                  />

                  <div className="flex justify-between text-xs text-terminal-muted mt-2">
                    <span>{formatCurrency(minBet)}</span>
                    <span>{formatCurrency(Math.min(1000, walletBalance))}</span>
                  </div>
                </div>

                {/* Calculation */}
                <div className="bg-terminal-elevated rounded-lg p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-terminal-muted">You Stake</span>
                    <span className="font-mono">{formatCurrency(amount)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-terminal-muted">Est. Return</span>
                    <span className="font-mono text-long">~{formatCurrency(potentialWin)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-terminal-muted">Platform Fee (10%)</span>
                    <span className="font-mono text-short">-{formatCurrency(platformFee)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {currentStep === 4 && (
            <div>
              <h2 className="text-sm font-medium text-terminal-muted mb-4 uppercase tracking-wide">
                Review & Create
              </h2>

              <div className="terminal-card p-5 space-y-4">
                {/* Battle Summary */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-2 border-b border-terminal-border">
                    <span className="text-xs text-terminal-muted">Market</span>
                    <span className="text-sm font-medium">{selectedMarket.label}</span>
                  </div>
                  
                  <div className="flex items-center justify-between py-2 border-b border-terminal-border">
                    <span className="text-xs text-terminal-muted">Position</span>
                    <span className={`text-sm font-medium ${selectedSide === 'bull' ? 'text-long' : 'text-short'}`}>
                      {selectedSide === 'bull' ? 'LONG' : 'SHORT'}
                    </span>
                  </div>
                  
                  <div className="flex items-center justify-between py-2 border-b border-terminal-border">
                    <span className="text-xs text-terminal-muted">Stake</span>
                    <span className="text-sm font-mono font-medium">{formatCurrency(amount)} USDC</span>
                  </div>
                  
                  <div className="flex items-center justify-between py-2 border-b border-terminal-border">
                    <span className="text-xs text-terminal-muted">Leverage</span>
                    <span className="text-sm font-medium">5x → 10x → 20x → 50x</span>
                  </div>
                  
                  <div className="flex items-center justify-between py-2">
                    <span className="text-xs text-terminal-muted">Duration</span>
                    <span className="text-sm font-medium">4-Minute Auto-Settle</span>
                  </div>
                </div>

                {/* Info Box */}
                <div className="bg-terminal-elevated rounded-lg p-4 space-y-2 text-xs">
                  <p className="text-terminal-muted">
                    <strong className="text-foreground">How it works:</strong> Leverage escalates every 60 seconds (5x → 10x → 20x → 50x). 
                    Battle automatically settles after 4 minutes or when one side is liquidated.
                  </p>
                  <p className="text-terminal-muted">
                    <strong className="text-foreground">Note:</strong> This creates a secondary lobby. An opponent must match your stake to start the battle.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* V2 Teaser */}
        <div className="mt-10">
          <div className="terminal-card p-5 border-dashed border-terminal-border/60 bg-terminal-bg/60">
            <h3 className="text-xs font-medium text-terminal-muted mb-3 uppercase tracking-wide flex items-center gap-2">
              <span className="text-warning">🚀 Coming in v2</span>
              <span className="text-[10px] px-2 py-0.5 rounded-full border border-terminal-border text-terminal-muted">
                Roadmap Teaser
              </span>
            </h3>
            <div className="grid grid-cols-2 gap-3 mb-4 text-xs">
              <button
                type="button"
                disabled
                className="terminal-card p-3 flex flex-col items-start gap-1 opacity-60 cursor-not-allowed"
              >
                <span className="text-sm">🦅 Hawk Agent</span>
                <span className="text-terminal-muted">Scalp dozens of times per day</span>
              </button>
              <button
                type="button"
                disabled
                className="terminal-card p-3 flex flex-col items-start gap-1 opacity-60 cursor-not-allowed"
              >
                <span className="text-sm">🐢 Tortoise Agent</span>
                <span className="text-terminal-muted">Slow, conservative swing trader</span>
              </button>
            </div>
            <p className="text-[11px] text-terminal-muted mb-1">
              Future versions will let you plug in custom strategies (Grid, Momentum, AI‑driven) and even upload your
              own agent logic.
            </p>
            <p className="text-[11px] text-terminal-muted">
              Multi‑chain battles (ETH, BTC, SOL) and custom agents are on the roadmap – today you get a rock‑solid Bull
              vs Bear duel on Polygon Amoy.
            </p>
          </div>
        </div>

        {/* Navigation Buttons */}
        <div className="flex gap-3 mt-6">
          <Button
            variant="outline"
            onClick={handleBack}
            className="flex-1 border-terminal-border hover:bg-terminal-elevated"
          >
            {currentStep === 1 ? 'Cancel' : 'Back'}
          </Button>
          <Button
            onClick={handleNext}
            disabled={!isStepComplete(currentStep) || isCreating || isTxPending}
            className={`flex-1 ${selectedSide === 'bull' ? 'btn-long' : 'btn-short'}`}
          >
            {isCreating || isTxPending ? 'Creating on-chain...' : currentStep === 4 ? 'CREATE MARKET' : 'Continue'}
          </Button>
          
          {error && (
            <p className="text-center text-xs text-short mt-2">{error}</p>
          )}
        </div>
      </div>
    </div>
  );
}
