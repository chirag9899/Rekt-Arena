// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/BattleArena.sol";
import "../src/MockUSDC.sol";

contract BattleArenaTest is Test {
    BattleArena public battleArena;
    MockUSDC public mockUSDC;
    
    // Events for vm.expectEmit - must match BattleArena events exactly
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
    
    event BetPlaced(
        bytes32 indexed battleId,
        address indexed bettor,
        uint8 agentIndex,
        uint256 amount
    );
    
    address public owner;
    address public feeRecipient;
    address public agentA;
    address public agentB;
    address public bettor1;
    address public bettor2;
    
    bytes32 public constant BATTLE_ID = keccak256("test_battle_1");
    uint256 constant INITIAL_PRICE = 3000 * 1e8; // $3000 ETH
    uint256 constant BATTLE_DURATION = 300; // 5 minutes
    uint256 constant ENTRY_FEE = 1 * 1e6; // 1 USDC
    uint256 constant ELIMINATION_THRESHOLD = 950; // 9.5%
    
    function setUp() public {
        owner = address(this);
        feeRecipient = makeAddr("feeRecipient");
        agentA = makeAddr("agentA");
        agentB = makeAddr("agentB");
        bettor1 = makeAddr("bettor1");
        bettor2 = makeAddr("bettor2");
        
        // Deploy contracts
        mockUSDC = new MockUSDC(owner);
        battleArena = new BattleArena(address(mockUSDC), feeRecipient);
        
        // Mint USDC to agents and bettors
        mockUSDC.mint(agentA, 100000 * 1e6);
        mockUSDC.mint(agentB, 100000 * 1e6);
        mockUSDC.mint(bettor1, 100000 * 1e6);
        mockUSDC.mint(bettor2, 100000 * 1e6);
        
        // Approve battle arena
        vm.prank(agentA);
        mockUSDC.approve(address(battleArena), type(uint256).max);
        
        vm.prank(agentB);
        mockUSDC.approve(address(battleArena), type(uint256).max);
        
        vm.prank(bettor1);
        mockUSDC.approve(address(battleArena), type(uint256).max);
        
        vm.prank(bettor2);
        mockUSDC.approve(address(battleArena), type(uint256).max);
    }

    // ============ Create Battle Tests ============
    
    function test_CreateBattle() public {
        battleArena.createBattle(
            BATTLE_ID,
            agentA,
            agentB,
            INITIAL_PRICE,
            BATTLE_DURATION,
            ENTRY_FEE,
            ELIMINATION_THRESHOLD
        );
        
        BattleArena.Battle memory battle = battleArena.getBattle(BATTLE_ID);
        
        assertEq(battle.agentA.wallet, agentA);
        assertEq(battle.agentB.wallet, agentB);
        assertEq(battle.agentA.isLong, true);
        assertEq(battle.agentB.isLong, false);
        assertEq(battle.agentA.entryPrice, INITIAL_PRICE);
        assertEq(battle.agentB.entryPrice, INITIAL_PRICE);
        assertEq(battle.agentA.alive, true);
        assertEq(battle.agentB.alive, true);
        assertEq(battle.totalPool, 200 * 1e6); // 100 USDC each
        assertEq(uint256(battle.status), uint256(BattleArena.BattleStatus.Active));
    }

    function test_CreateBattleEmitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit BattleCreated(
            BATTLE_ID,
            agentA,
            agentB,
            INITIAL_PRICE,
            block.timestamp,
            block.timestamp + BATTLE_DURATION,
            ENTRY_FEE
        );
        
        battleArena.createBattle(
            BATTLE_ID,
            agentA,
            agentB,
            INITIAL_PRICE,
            BATTLE_DURATION,
            ENTRY_FEE,
            ELIMINATION_THRESHOLD
        );
    }

    function test_RevertCreateDuplicateBattle() public {
        battleArena.createBattle(
            BATTLE_ID,
            agentA,
            agentB,
            INITIAL_PRICE,
            BATTLE_DURATION,
            ENTRY_FEE,
            ELIMINATION_THRESHOLD
        );
        
        vm.expectRevert(BattleArena.BattleAlreadyExists.selector);
        battleArena.createBattle(
            BATTLE_ID,
            agentA,
            agentB,
            INITIAL_PRICE,
            BATTLE_DURATION,
            ENTRY_FEE,
            ELIMINATION_THRESHOLD
        );
    }

    function test_RevertCreateBattleWithZeroAddress() public {
        vm.expectRevert(BattleArena.InvalidAgent.selector);
        battleArena.createBattle(
            BATTLE_ID,
            address(0),
            agentB,
            INITIAL_PRICE,
            BATTLE_DURATION,
            ENTRY_FEE,
            ELIMINATION_THRESHOLD
        );
    }

    function test_RevertCreateBattleWithSameAgent() public {
        vm.expectRevert(BattleArena.InvalidAgent.selector);
        battleArena.createBattle(
            BATTLE_ID,
            agentA,
            agentA,
            INITIAL_PRICE,
            BATTLE_DURATION,
            ENTRY_FEE,
            ELIMINATION_THRESHOLD
        );
    }

    function test_RevertCreateBattleWithZeroPrice() public {
        vm.expectRevert(BattleArena.InvalidPrice.selector);
        battleArena.createBattle(
            BATTLE_ID,
            agentA,
            agentB,
            0,
            BATTLE_DURATION,
            ENTRY_FEE,
            ELIMINATION_THRESHOLD
        );
    }

    // ============ Proof Submission Tests ============
    
    function test_SubmitProof() public {
        battleArena.createBattle(
            BATTLE_ID,
            agentA,
            agentB,
            INITIAL_PRICE,
            BATTLE_DURATION,
            ENTRY_FEE,
            ELIMINATION_THRESHOLD
        );
        
        // Wait for proof interval
        skip(30);
        
        vm.prank(agentA);
        battleArena.submitProof(BATTLE_ID, 0, INITIAL_PRICE, keccak256("proof1"));
        
        BattleArena.Battle memory battle = battleArena.getBattle(BATTLE_ID);
        assertEq(battle.agentA.lastProofTime, block.timestamp);
    }

    function test_SubmitProofEmitsEvent() public {
        battleArena.createBattle(
            BATTLE_ID,
            agentA,
            agentB,
            INITIAL_PRICE,
            BATTLE_DURATION,
            ENTRY_FEE,
            ELIMINATION_THRESHOLD
        );
        
        skip(30);
        
        bytes32 proofHash = keccak256("proof1");
        
        vm.expectEmit(true, true, true, true);
        emit ProofSubmitted(BATTLE_ID, 0, block.timestamp, proofHash);
        
        vm.prank(agentA);
        battleArena.submitProof(BATTLE_ID, 0, INITIAL_PRICE, proofHash);
    }

    function test_RevertSubmitProofTooEarly() public {
        battleArena.createBattle(
            BATTLE_ID,
            agentA,
            agentB,
            INITIAL_PRICE,
            BATTLE_DURATION,
            ENTRY_FEE,
            ELIMINATION_THRESHOLD
        );
        
        vm.prank(agentA);
        vm.expectRevert(BattleArena.ProofTooEarly.selector);
        battleArena.submitProof(BATTLE_ID, 0, INITIAL_PRICE, keccak256("proof1"));
    }

    function test_RevertSubmitProofTimeout() public {
        battleArena.createBattle(
            BATTLE_ID,
            agentA,
            agentB,
            INITIAL_PRICE,
            BATTLE_DURATION,
            ENTRY_FEE,
            ELIMINATION_THRESHOLD
        );
        
        skip(45); // Past 30 + 10 second grace period
        
        vm.prank(agentA);
        vm.expectRevert(BattleArena.ProofTimeout.selector);
        battleArena.submitProof(BATTLE_ID, 0, INITIAL_PRICE, keccak256("proof1"));
    }

    function test_RevertSubmitProofNotAgent() public {
        battleArena.createBattle(
            BATTLE_ID,
            agentA,
            agentB,
            INITIAL_PRICE,
            BATTLE_DURATION,
            ENTRY_FEE,
            ELIMINATION_THRESHOLD
        );
        
        skip(30);
        
        vm.prank(bettor1);
        vm.expectRevert(BattleArena.NotAgent.selector);
        battleArena.submitProof(BATTLE_ID, 0, INITIAL_PRICE, keccak256("proof1"));
    }

    function test_RevertSubmitProofInvalidProof() public {
        battleArena.createBattle(
            BATTLE_ID,
            agentA,
            agentB,
            INITIAL_PRICE,
            BATTLE_DURATION,
            ENTRY_FEE,
            ELIMINATION_THRESHOLD
        );
        
        skip(30);
        
        vm.prank(agentA);
        vm.expectRevert(BattleArena.InvalidProof.selector);
        battleArena.submitProof(BATTLE_ID, 0, INITIAL_PRICE, bytes32(0));
    }

    // ============ Liquidation Tests ============
    
    function test_LiquidateLongOnPriceDrop() public {
        battleArena.createBattle(
            BATTLE_ID,
            agentA,
            agentB,
            INITIAL_PRICE,
            BATTLE_DURATION,
            ENTRY_FEE,
            ELIMINATION_THRESHOLD
        );
        
        skip(30);
        
        // Price drops 10% (more than 9.5% threshold)
        uint256 newPrice = (INITIAL_PRICE * 90) / 100;
        
        vm.expectEmit(true, true, true, true);
        emit AgentLiquidated(BATTLE_ID, 0, agentA, block.timestamp, newPrice);
        
        vm.prank(agentA);
        battleArena.submitProof(BATTLE_ID, 0, newPrice, keccak256("proof1"));
        
        BattleArena.Battle memory battle = battleArena.getBattle(BATTLE_ID);
        assertEq(battle.agentA.alive, false);
    }

    function test_LiquidateShortOnPriceRise() public {
        battleArena.createBattle(
            BATTLE_ID,
            agentA,
            agentB,
            INITIAL_PRICE,
            BATTLE_DURATION,
            ENTRY_FEE,
            ELIMINATION_THRESHOLD
        );
        
        skip(30);
        
        // Price rises 10% (more than 9.5% threshold)
        uint256 newPrice = (INITIAL_PRICE * 110) / 100;
        
        vm.expectEmit(true, true, true, true);
        emit AgentLiquidated(BATTLE_ID, 1, agentB, block.timestamp, newPrice);
        
        vm.prank(agentB);
        battleArena.submitProof(BATTLE_ID, 1, newPrice, keccak256("proof1"));
        
        BattleArena.Battle memory battle = battleArena.getBattle(BATTLE_ID);
        assertEq(battle.agentB.alive, false);
    }

    function test_CheckAndLiquidate() public {
        battleArena.createBattle(
            BATTLE_ID,
            agentA,
            agentB,
            INITIAL_PRICE,
            BATTLE_DURATION,
            ENTRY_FEE,
            ELIMINATION_THRESHOLD
        );
        
        // Price drops 10%
        uint256 newPrice = (INITIAL_PRICE * 90) / 100;
        
        battleArena.checkAndLiquidate(BATTLE_ID, 0, newPrice);
        
        BattleArena.Battle memory battle = battleArena.getBattle(BATTLE_ID);
        assertEq(battle.agentA.alive, false);
    }

    function test_RevertLiquidateAlreadyLiquidated() public {
        battleArena.createBattle(
            BATTLE_ID,
            agentA,
            agentB,
            INITIAL_PRICE,
            BATTLE_DURATION,
            ENTRY_FEE,
            ELIMINATION_THRESHOLD
        );
        
        uint256 newPrice = (INITIAL_PRICE * 90) / 100;
        battleArena.checkAndLiquidate(BATTLE_ID, 0, newPrice);
        
        vm.expectRevert(BattleArena.AgentAlreadyLiquidated.selector);
        battleArena.checkAndLiquidate(BATTLE_ID, 0, newPrice);
    }

    // ============ Betting Tests ============
    
    function test_PlaceBet() public {
        battleArena.createBattle(
            BATTLE_ID,
            agentA,
            agentB,
            INITIAL_PRICE,
            BATTLE_DURATION,
            ENTRY_FEE,
            ELIMINATION_THRESHOLD
        );
        
        vm.prank(bettor1);
        battleArena.placeBet(BATTLE_ID, 0, 50 * 1e6); // Bet 50 USDC on agentA
        
        BattleArena.Battle memory battle = battleArena.getBattle(BATTLE_ID);
        assertEq(battle.agentA.totalBets, 50 * 1e6);
        assertEq(battle.totalPool, 250 * 1e6); // 200 + 50
        assertEq(battleArena.bettorTotal(BATTLE_ID, bettor1), 50 * 1e6);
    }

    function test_PlaceBetEmitsEvent() public {
        battleArena.createBattle(
            BATTLE_ID,
            agentA,
            agentB,
            INITIAL_PRICE,
            BATTLE_DURATION,
            ENTRY_FEE,
            ELIMINATION_THRESHOLD
        );
        
        vm.expectEmit(true, true, true, true);
        emit BetPlaced(BATTLE_ID, bettor1, 0, 50 * 1e6);
        
        vm.prank(bettor1);
        battleArena.placeBet(BATTLE_ID, 0, 50 * 1e6);

    }

    function test_RevertBetWithZeroAmount() public {
        battleArena.createBattle(
            BATTLE_ID,
            agentA,
            agentB,
            INITIAL_PRICE,
            BATTLE_DURATION,
            ENTRY_FEE,
            ELIMINATION_THRESHOLD
        );
        
        vm.prank(bettor1);
        vm.expectRevert(BattleArena.InsufficientBet.selector);
        battleArena.placeBet(BATTLE_ID, 0, 0);
    }


    function test_RevertSettleBeforeEndTime() public {
        battleArena.createBattle(
            BATTLE_ID,
            agentA,
            agentB,
            INITIAL_PRICE,
            BATTLE_DURATION,
            ENTRY_FEE,
            ELIMINATION_THRESHOLD
        );
        
        vm.expectRevert(BattleArena.BattleNotEnded.selector);
        battleArena.settleBattle(BATTLE_ID, INITIAL_PRICE);
    }


    // ============ View Function Tests ============
    
    function test_CheckSolvency() public {
        battleArena.createBattle(
            BATTLE_ID,
            agentA,
            agentB,
            INITIAL_PRICE,
            BATTLE_DURATION,
            ENTRY_FEE,
            ELIMINATION_THRESHOLD
        );
        
        // At entry price, both should be solvent
        assertTrue(battleArena.checkSolvency(BATTLE_ID, 0, INITIAL_PRICE));
        assertTrue(battleArena.checkSolvency(BATTLE_ID, 1, INITIAL_PRICE));
        
        // After 10% drop, long should be insolvent
        uint256 dropPrice = (INITIAL_PRICE * 90) / 100;
        assertFalse(battleArena.checkSolvency(BATTLE_ID, 0, dropPrice));
        assertTrue(battleArena.checkSolvency(BATTLE_ID, 1, dropPrice));
    }

    function test_CalculatePnL() public {
        battleArena.createBattle(
            BATTLE_ID,
            agentA,
            agentB,
            INITIAL_PRICE,
            BATTLE_DURATION,
            ENTRY_FEE,
            ELIMINATION_THRESHOLD
        );
        
        // Price up 10%
        uint256 upPrice = (INITIAL_PRICE * 110) / 100;
        int256 pnlA = battleArena.calculatePnL(BATTLE_ID, 0, upPrice);
        int256 pnlB = battleArena.calculatePnL(BATTLE_ID, 1, upPrice);
        
        assertTrue(pnlA > 0); // Long profits
        assertTrue(pnlB < 0); // Short loses
        
        // Price down 10%
        uint256 downPrice = (INITIAL_PRICE * 90) / 100;
        pnlA = battleArena.calculatePnL(BATTLE_ID, 0, downPrice);
        pnlB = battleArena.calculatePnL(BATTLE_ID, 1, downPrice);
        
        assertTrue(pnlA < 0); // Long loses
        assertTrue(pnlB > 0); // Short profits
    }

    function test_GetHealthRatio() public {
        battleArena.createBattle(
            BATTLE_ID,
            agentA,
            agentB,
            INITIAL_PRICE,
            BATTLE_DURATION,
            ENTRY_FEE,
            ELIMINATION_THRESHOLD
        );
        
        uint256 healthA = battleArena.getHealthRatio(BATTLE_ID, 0, INITIAL_PRICE);
        uint256 healthB = battleArena.getHealthRatio(BATTLE_ID, 1, INITIAL_PRICE);
        
        assertTrue(healthA > 0);
        assertTrue(healthB > 0);
        
        // After liquidation, health should be 0
        uint256 dropPrice = (INITIAL_PRICE * 90) / 100;
        battleArena.checkAndLiquidate(BATTLE_ID, 0, dropPrice);
        
        healthA = battleArena.getHealthRatio(BATTLE_ID, 0, dropPrice);
        assertEq(healthA, 0);
    }

    // ============ Admin Function Tests ============
    
    function test_SetProtocolFee() public {
        battleArena.setProtocolFee(500); // 5%
        assertEq(battleArena.protocolFeeBps(), 500);
    }

    function test_SetFeeRecipient() public {
        address newRecipient = makeAddr("newRecipient");
        battleArena.setFeeRecipient(newRecipient);
        assertEq(battleArena.feeRecipient(), newRecipient);
    }

    function test_SetProofInterval() public {
        battleArena.setProofInterval(60);
        assertEq(battleArena.proofInterval(), 60);
    }


    function test_RevertSetFeeRecipientToZero() public {
        vm.expectRevert(BattleArena.InvalidAgent.selector);
        battleArena.setFeeRecipient(address(0));
    }


    // ============ Integration Tests ============
    
}
