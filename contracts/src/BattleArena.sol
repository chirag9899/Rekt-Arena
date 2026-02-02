// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title BattleArena
 * @dev Main battle contract for Liquidation Arena
 * Agents enter with leveraged positions and submit ZK proofs of solvency
 */
contract BattleArena is ReentrancyGuard, Ownable {
    // ============ Errors ============
    error BattleAlreadyExists();
    error BattleNotFound();
    error BattleAlreadySettled();
    error BattleNotEnded();
    error InvalidAgent();
    error InvalidCollateral();
    error InvalidPrice();
    error InvalidProof();
    error AgentAlreadyLiquidated();
    error NotAgent();
    error ProofTimeout();
    error ProofTooEarly();
    error BettingClosed();
    error InsufficientBet();
    error BattleInProgress();
    error TransferFailed();
    error PrizeDistributionFailed();

    // ============ Enums ============
    enum BattleStatus {
        Pending,    // Battle created, waiting to start
        Active,     // Battle in progress
        Settled     // Battle ended, prizes distributed
    }

    // ============ Structs ============
    struct Agent {
        address wallet;
        uint256 collateral;      // USDC collateral (6 decimals)
        bool isLong;            // true = Bull, false = Bear
        uint256 leverage;       // Fixed 10x = 1000
        uint256 entryPrice;     // ETH price at start (8 decimals)
        bool alive;
        uint256 lastProofTime;  // Last time proof was submitted
        uint256 totalBets;      // Total bets on this agent
    }

    struct Battle {
        Agent agentA;          // Bull
        Agent agentB;          // Bear
        uint256 startTime;
        uint256 endTime;       // When battle should end
        uint256 totalPool;     // Total USDC in battle
        BattleStatus status;
        address winner;
        uint256 entryFee;      // Fee to enter battle
        uint256 eliminationThreshold; // Price move % that triggers liquidation (e.g., 950 = 9.5%)
    }

    struct Bet {
        address bettor;
        uint256 amount;
        uint8 agentIndex;      // 0 = agentA, 1 = agentB
        uint256 timestamp;
    }

    // ============ State Variables ============
    IERC20 public immutable usdc;
    
    // Battle ID => Battle
    mapping(bytes32 => Battle) public battles;
    
    // Battle ID => Bet ID => Bet
    mapping(bytes32 => mapping(uint256 => Bet)) public bets;
    
    // Battle ID => bet count
    mapping(bytes32 => uint256) public betCount;
    
    // Battle ID => bettor => total bet amount
    mapping(bytes32 => mapping(address => uint256)) public bettorTotal;
    
    // Protocol fee (basis points, e.g., 250 = 2.5%)
    uint256 public protocolFeeBps = 250;
    
    // Protocol fee recipient
    address public feeRecipient;
    
    // Proof submission interval (seconds)
    uint256 public proofInterval = 30;
    
    // Minimum collateral required (100 USDC with 6 decimals)
    uint256 public constant MIN_COLLATERAL = 100 * 1e6;
    
    // Fixed leverage (10x = 1000 basis points representation)
    uint256 public constant LEVERAGE_BPS = 1000;
    
    // Maintenance margin (5% = 500 basis points)
    uint256 public constant MAINTENANCE_MARGIN_BPS = 500;
    
    // Price precision (8 decimals for ETH/USD)
    uint256 public constant PRICE_PRECISION = 1e8;

    // ============ Events ============
    event BattleCreated(
        bytes32 indexed battleId,
        address indexed agentA,
        address indexed agentB,
        uint256 entryPrice,
        uint256 startTime,
        uint256 endTime,
        uint256 entryFee
    );
    
    event ProofSubmitted(
        bytes32 indexed battleId,
        uint8 indexed agentIndex,
        uint256 timestamp,
        bytes32 proofHash
    );
    
    event AgentLiquidated(
        bytes32 indexed battleId,
        uint8 indexed agentIndex,
        address indexed agent,
        uint256 timestamp,
        uint256 liquidationPrice
    );
    
    event BattleSettled(
        bytes32 indexed battleId,
        address indexed winner,
        uint256 prizeAmount,
        uint256 timestamp
    );
    
    event BetPlaced(
        bytes32 indexed battleId,
        address indexed bettor,
        uint8 agentIndex,
        uint256 amount
    );
    
    event PrizeDistributed(
        bytes32 indexed battleId,
        address indexed winner,
        uint256 winnerPrize,
        uint256 spectatorPrize
    );
    
    event ProtocolFeeUpdated(uint256 newFeeBps);
    event FeeRecipientUpdated(address newRecipient);
    event ProofIntervalUpdated(uint256 newInterval);

    // ============ Modifiers ============
    modifier battleExists(bytes32 battleId) {
        if (battles[battleId].startTime == 0) revert BattleNotFound();
        _;
    }

    modifier battleActive(bytes32 battleId) {
        if (battles[battleId].status != BattleStatus.Active) revert BattleNotEnded();
        _;
    }

    // ============ Constructor ============
    constructor(address _usdc, address _feeRecipient) Ownable(msg.sender) {
        if (_usdc == address(0)) revert InvalidAgent();
        if (_feeRecipient == address(0)) revert InvalidAgent();
        usdc = IERC20(_usdc);
        feeRecipient = _feeRecipient;
    }

    // ============ External Functions ============
    
    /**
     * @dev Creates a new battle between two agents
     * @param battleId Unique identifier for the battle
     * @param agentA Address of Bull agent
     * @param agentB Address of Bear agent
     * @param entryPrice Current ETH price (8 decimals)
     * @param duration Battle duration in seconds
     * @param entryFee Fee to enter the battle (6 decimals)
     * @param eliminationThreshold Price move % that triggers liquidation (basis points)
     */
    function createBattle(
        bytes32 battleId,
        address agentA,
        address agentB,
        uint256 entryPrice,
        uint256 duration,
        uint256 entryFee,
        uint256 eliminationThreshold
    ) external onlyOwner {
        if (battles[battleId].startTime != 0) revert BattleAlreadyExists();
        if (agentA == address(0) || agentB == address(0) || agentA == agentB) revert InvalidAgent();
        if (entryPrice == 0) revert InvalidPrice();
        if (duration == 0) revert InvalidCollateral();

        uint256 startTime = block.timestamp;
        uint256 endTime = startTime + duration;

        battles[battleId] = Battle({
            agentA: Agent({
                wallet: agentA,
                collateral: MIN_COLLATERAL,
                isLong: true,
                leverage: LEVERAGE_BPS,
                entryPrice: entryPrice,
                alive: true,
                lastProofTime: startTime,
                totalBets: 0
            }),
            agentB: Agent({
                wallet: agentB,
                collateral: MIN_COLLATERAL,
                isLong: false,
                leverage: LEVERAGE_BPS,
                entryPrice: entryPrice,
                alive: true,
                lastProofTime: startTime,
                totalBets: 0
            }),
            startTime: startTime,
            endTime: endTime,
            totalPool: MIN_COLLATERAL * 2,
            status: BattleStatus.Active,
            winner: address(0),
            entryFee: entryFee,
            eliminationThreshold: eliminationThreshold
        });

        emit BattleCreated(
            battleId,
            agentA,
            agentB,
            entryPrice,
            startTime,
            endTime,
            entryFee
        );
    }

    /**
     * @dev Submit ZK proof of solvency
     * @param battleId Battle identifier
     * @param agentIndex 0 for agentA (Bull), 1 for agentB (Bear)
     * @param currentPrice Current ETH price (8 decimals)
     * @param proofHash Hash of the ZK proof
     */
    function submitProof(
        bytes32 battleId,
        uint8 agentIndex,
        uint256 currentPrice,
        bytes32 proofHash
    ) external battleExists(battleId) battleActive(battleId) {
        Battle storage battle = battles[battleId];
        Agent storage agent = agentIndex == 0 ? battle.agentA : battle.agentB;
        
        if (msg.sender != agent.wallet) revert NotAgent();
        if (!agent.alive) revert AgentAlreadyLiquidated();
        if (currentPrice == 0) revert InvalidPrice();
        if (proofHash == bytes32(0)) revert InvalidProof();
        
        // Check proof timing
        if (block.timestamp < agent.lastProofTime + proofInterval) {
            revert ProofTooEarly();
        }
        if (block.timestamp > agent.lastProofTime + proofInterval + 10) {
            revert ProofTimeout();
        }

        // Check if agent should be liquidated based on price movement
        bool shouldLiquidate = _checkLiquidation(agent, currentPrice, battle.eliminationThreshold);
        
        if (shouldLiquidate) {
            _liquidate(battleId, agentIndex, currentPrice);
        } else {
            agent.lastProofTime = block.timestamp;
            emit ProofSubmitted(battleId, agentIndex, block.timestamp, proofHash);
        }
    }

    /**
     * @dev Place a bet on an agent
     * @param battleId Battle identifier
     * @param agentIndex 0 for agentA (Bull), 1 for agentB (Bear)
     * @param amount Bet amount in USDC (6 decimals)
     */
    function placeBet(
        bytes32 battleId,
        uint8 agentIndex,
        uint256 amount
    ) external battleExists(battleId) nonReentrant {
        Battle storage battle = battles[battleId];
        
        if (battle.status != BattleStatus.Active) revert BettingClosed();
        if (agentIndex > 1) revert InvalidAgent();
        if (amount == 0) revert InsufficientBet();

        Agent storage agent = agentIndex == 0 ? battle.agentA : battle.agentB;
        
        // Transfer USDC from bettor
        bool success = usdc.transferFrom(msg.sender, address(this), amount);
        if (!success) revert TransferFailed();

        // Record bet
        uint256 betId = betCount[battleId];
        bets[battleId][betId] = Bet({
            bettor: msg.sender,
            amount: amount,
            agentIndex: agentIndex,
            timestamp: block.timestamp
        });
        betCount[battleId]++;
        
        agent.totalBets += amount;
        battle.totalPool += amount;
        bettorTotal[battleId][msg.sender] += amount;

        emit BetPlaced(battleId, msg.sender, agentIndex, amount);
    }

    /**
     * @dev Settle the battle and distribute prizes
     * @param battleId Battle identifier
     * @param finalPrice Final ETH price for settlement (8 decimals)
     */
    function settleBattle(
        bytes32 battleId,
        uint256 finalPrice
    ) external battleExists(battleId) battleActive(battleId) nonReentrant {
        Battle storage battle = battles[battleId];
        
        if (block.timestamp < battle.endTime) revert BattleNotEnded();
        if (finalPrice == 0) revert InvalidPrice();

        // Check for any pending liquidations
        if (battle.agentA.alive && _checkLiquidation(battle.agentA, finalPrice, battle.eliminationThreshold)) {
            _liquidate(battleId, 0, finalPrice);
        }
        if (battle.agentB.alive && _checkLiquidation(battle.agentB, finalPrice, battle.eliminationThreshold)) {
            _liquidate(battleId, 1, finalPrice);
        }

        // Determine winner
        address winner;
        if (!battle.agentA.alive && battle.agentB.alive) {
            winner = battle.agentB.wallet;
        } else if (battle.agentA.alive && !battle.agentB.alive) {
            winner = battle.agentA.wallet;
        } else if (!battle.agentA.alive && !battle.agentB.alive) {
            // Both liquidated - winner is the one who survived longer
            winner = battle.agentA.lastProofTime > battle.agentB.lastProofTime 
                ? battle.agentA.wallet 
                : battle.agentB.wallet;
        } else {
            // Both alive - compare PnL
            int256 pnlA = _calculatePnL(battle.agentA, finalPrice);
            int256 pnlB = _calculatePnL(battle.agentB, finalPrice);
            winner = pnlA >= pnlB ? battle.agentA.wallet : battle.agentB.wallet;
        }

        battle.winner = winner;
        battle.status = BattleStatus.Settled;

        // Calculate prizes
        uint256 protocolFee = (battle.totalPool * protocolFeeBps) / 10000;
        uint256 remainingPool = battle.totalPool - protocolFee;
        uint256 winnerPrize = (remainingPool * 75) / 100; // 75% to winner
        uint256 spectatorPrize = remainingPool - winnerPrize; // 25% to winning bettors

        // Transfer protocol fee
        if (protocolFee > 0) {
            bool feeSuccess = usdc.transfer(feeRecipient, protocolFee);
            if (!feeSuccess) revert PrizeDistributionFailed();
        }

        // Transfer winner prize
        bool winnerSuccess = usdc.transfer(winner, winnerPrize);
        if (!winnerSuccess) revert PrizeDistributionFailed();

        // Distribute spectator prizes
        _distributeSpectatorPrizes(battleId, winner == battle.agentA.wallet ? 0 : 1, spectatorPrize);

        emit BattleSettled(battleId, winner, winnerPrize, block.timestamp);
        emit PrizeDistributed(battleId, winner, winnerPrize, spectatorPrize);
    }

    /**
     * @dev Force liquidation check by anyone (for oracle/keeper purposes)
     * @param battleId Battle identifier
     * @param agentIndex Agent to check
     * @param currentPrice Current ETH price
     */
    function checkAndLiquidate(
        bytes32 battleId,
        uint8 agentIndex,
        uint256 currentPrice
    ) external battleExists(battleId) battleActive(battleId) {
        Battle storage battle = battles[battleId];
        Agent storage agent = agentIndex == 0 ? battle.agentA : battle.agentB;
        
        if (!agent.alive) revert AgentAlreadyLiquidated();
        
        if (_checkLiquidation(agent, currentPrice, battle.eliminationThreshold)) {
            _liquidate(battleId, agentIndex, currentPrice);
        }
    }

    // ============ View Functions ============
    
    /**
     * @dev Check if an agent is solvent at current price
     * @param battleId Battle identifier
     * @param agentIndex Agent to check
     * @param currentPrice Current ETH price
     * @return isSolvent True if agent is solvent
     */
    function checkSolvency(
        bytes32 battleId,
        uint8 agentIndex,
        uint256 currentPrice
    ) external view battleExists(battleId) returns (bool isSolvent) {
        Battle storage battle = battles[battleId];
        Agent storage agent = agentIndex == 0 ? battle.agentA : battle.agentB;
        
        if (!agent.alive) return false;
        
        return !_checkLiquidation(agent, currentPrice, battle.eliminationThreshold);
    }

    /**
     * @dev Calculate agent's PnL at current price
     * @param battleId Battle identifier
     * @param agentIndex Agent to check
     * @param currentPrice Current ETH price
     * @return pnl Profit/loss (can be negative)
     */
    function calculatePnL(
        bytes32 battleId,
        uint8 agentIndex,
        uint256 currentPrice
    ) external view battleExists(battleId) returns (int256 pnl) {
        Battle storage battle = battles[battleId];
        Agent storage agent = agentIndex == 0 ? battle.agentA : battle.agentB;
        return _calculatePnL(agent, currentPrice);
    }

    /**
     * @dev Get battle details
     */
    function getBattle(bytes32 battleId) external view returns (Battle memory) {
        return battles[battleId];
    }

    /**
     * @dev Get agent health ratio (collateral / maintenance margin)
     * @param battleId Battle identifier
     * @param agentIndex Agent to check
     * @param currentPrice Current ETH price
     * @return healthRatio Health ratio in basis points (10000 = 100%)
     */
    function getHealthRatio(
        bytes32 battleId,
        uint8 agentIndex,
        uint256 currentPrice
    ) external view battleExists(battleId) returns (uint256 healthRatio) {
        Battle storage battle = battles[battleId];
        Agent storage agent = agentIndex == 0 ? battle.agentA : battle.agentB;
        
        if (!agent.alive) return 0;
        
        int256 pnl = _calculatePnL(agent, currentPrice);
        int256 equity = int256(agent.collateral) + pnl;
        
        if (equity <= 0) return 0;
        
        uint256 positionSize = (agent.collateral * agent.leverage) / 100;
        uint256 maintenanceMargin = (positionSize * MAINTENANCE_MARGIN_BPS) / 10000;
        
        return (uint256(equity) * 10000) / maintenanceMargin;
    }

    // ============ Admin Functions ============
    
    function setProtocolFee(uint256 newFeeBps) external onlyOwner {
        require(newFeeBps <= 1000, "Fee too high"); // Max 10%
        protocolFeeBps = newFeeBps;
        emit ProtocolFeeUpdated(newFeeBps);
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert InvalidAgent();
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(newRecipient);
    }

    function setProofInterval(uint256 newInterval) external onlyOwner {
        proofInterval = newInterval;
        emit ProofIntervalUpdated(newInterval);
    }

    // ============ Internal Functions ============
    
    function _checkLiquidation(
        Agent storage agent,
        uint256 currentPrice,
        uint256 threshold
    ) internal view returns (bool) {
        // Calculate price change percentage
        uint256 priceDiff;
        if (currentPrice > agent.entryPrice) {
            priceDiff = currentPrice - agent.entryPrice;
        } else {
            priceDiff = agent.entryPrice - currentPrice;
        }
        
        uint256 priceChangeBps = (priceDiff * 10000) / agent.entryPrice;
        
        // For longs: liquidate if price drops by threshold
        // For shorts: liquidate if price rises by threshold
        if (agent.isLong && currentPrice < agent.entryPrice) {
            return priceChangeBps >= threshold;
        } else if (!agent.isLong && currentPrice > agent.entryPrice) {
            return priceChangeBps >= threshold;
        }
        
        return false;
    }

    function _liquidate(
        bytes32 battleId,
        uint8 agentIndex,
        uint256 liquidationPrice
    ) internal {
        Battle storage battle = battles[battleId];
        Agent storage agent = agentIndex == 0 ? battle.agentA : battle.agentB;
        
        agent.alive = false;
        
        emit AgentLiquidated(battleId, agentIndex, agent.wallet, block.timestamp, liquidationPrice);
    }

    function _calculatePnL(Agent storage agent, uint256 currentPrice) internal view returns (int256) {
        uint256 positionSize = (agent.collateral * agent.leverage) / 100;
        
        if (agent.isLong) {
            // Long: PnL = position_size * (current - entry) / entry
            if (currentPrice >= agent.entryPrice) {
                return int256((positionSize * (currentPrice - agent.entryPrice)) / agent.entryPrice);
            } else {
                return -int256((positionSize * (agent.entryPrice - currentPrice)) / agent.entryPrice);
            }
        } else {
            // Short: PnL = position_size * (entry - current) / entry
            if (agent.entryPrice >= currentPrice) {
                return int256((positionSize * (agent.entryPrice - currentPrice)) / agent.entryPrice);
            } else {
                return -int256((positionSize * (currentPrice - agent.entryPrice)) / agent.entryPrice);
            }
        }
    }

    function _distributeSpectatorPrizes(
        bytes32 battleId,
        uint8 winningAgentIndex,
        uint256 totalPrize
    ) internal {
        uint256 winningBetsTotal = winningAgentIndex == 0 
            ? battles[battleId].agentA.totalBets 
            : battles[battleId].agentB.totalBets;
        
        if (winningBetsTotal == 0) return;

        uint256 betCount_ = betCount[battleId];
        
        for (uint256 i = 0; i < betCount_; i++) {
            Bet storage bet = bets[battleId][i];
            if (bet.agentIndex == winningAgentIndex) {
                uint256 share = (bet.amount * totalPrize) / winningBetsTotal;
                if (share > 0) {
                    bool success = usdc.transfer(bet.bettor, share);
                    // Continue even if one transfer fails
                    if (!success) {
                        continue;
                    }
                }
            }
        }
    }
}
