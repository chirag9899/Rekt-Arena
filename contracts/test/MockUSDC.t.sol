// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Test.sol";
import "../src/MockUSDC.sol";

contract MockUSDCTest is Test {
    MockUSDC public mockUSDC;
    address public owner;
    address public user1;
    address public user2;

    uint256 constant INITIAL_MINT = 10000 * 1e6; // 10,000 USDC

    function setUp() public {
        owner = address(this);
        user1 = makeAddr("user1");
        user2 = makeAddr("user2");
        
        mockUSDC = new MockUSDC(owner);
    }

    // ============ Basic ERC20 Tests ============
    
    function test_InitialState() public view {
        assertEq(mockUSDC.name(), "Mock USDC");
        assertEq(mockUSDC.symbol(), "mUSDC");
        assertEq(mockUSDC.decimals(), 6);
        assertEq(mockUSDC.totalSupply(), 0);
        assertEq(mockUSDC.owner(), owner);
    }

    function test_Mint() public {
        mockUSDC.mint(user1, INITIAL_MINT);
        
        assertEq(mockUSDC.balanceOf(user1), INITIAL_MINT);
        assertEq(mockUSDC.totalSupply(), INITIAL_MINT);
    }

    function test_MintMultiple() public {
        mockUSDC.mint(user1, 1000 * 1e6);
        mockUSDC.mint(user2, 2000 * 1e6);
        
        assertEq(mockUSDC.balanceOf(user1), 1000 * 1e6);
        assertEq(mockUSDC.balanceOf(user2), 2000 * 1e6);
        assertEq(mockUSDC.totalSupply(), 3000 * 1e6);
    }

    function test_BatchMint() public {
        address[] memory recipients = new address[](3);
        recipients[0] = user1;
        recipients[1] = user2;
        recipients[2] = makeAddr("user3");
        
        uint256[] memory amounts = new uint256[](3);
        amounts[0] = 100 * 1e6;
        amounts[1] = 200 * 1e6;
        amounts[2] = 300 * 1e6;
        
        mockUSDC.batchMint(recipients, amounts);
        
        assertEq(mockUSDC.balanceOf(user1), 100 * 1e6);
        assertEq(mockUSDC.balanceOf(user2), 200 * 1e6);
        assertEq(mockUSDC.balanceOf(recipients[2]), 300 * 1e6);
        assertEq(mockUSDC.totalSupply(), 600 * 1e6);
    }

    function test_Burn() public {
        mockUSDC.mint(user1, INITIAL_MINT);
        
        vm.prank(user1);
        mockUSDC.burn(5000 * 1e6);
        
        assertEq(mockUSDC.balanceOf(user1), 5000 * 1e6);
        assertEq(mockUSDC.totalSupply(), 5000 * 1e6);
    }

    function test_BurnFrom() public {
        mockUSDC.mint(user1, INITIAL_MINT);
        
        vm.prank(user1);
        mockUSDC.approve(user2, 5000 * 1e6);
        
        vm.prank(user2);
        mockUSDC.burnFrom(user1, 3000 * 1e6);
        
        assertEq(mockUSDC.balanceOf(user1), 7000 * 1e6);
        assertEq(mockUSDC.allowance(user1, user2), 2000 * 1e6);
    }

    function test_Transfer() public {
        mockUSDC.mint(user1, INITIAL_MINT);
        
        vm.prank(user1);
        mockUSDC.transfer(user2, 5000 * 1e6);
        
        assertEq(mockUSDC.balanceOf(user1), 5000 * 1e6);
        assertEq(mockUSDC.balanceOf(user2), 5000 * 1e6);
    }

    function test_ApproveAndTransferFrom() public {
        mockUSDC.mint(user1, INITIAL_MINT);
        
        vm.prank(user1);
        mockUSDC.approve(user2, 5000 * 1e6);
        
        vm.prank(user2);
        mockUSDC.transferFrom(user1, makeAddr("user3"), 3000 * 1e6);
        
        assertEq(mockUSDC.balanceOf(user1), 7000 * 1e6);
        assertEq(mockUSDC.balanceOf(makeAddr("user3")), 3000 * 1e6);
        assertEq(mockUSDC.allowance(user1, user2), 2000 * 1e6);
    }

    // ============ Access Control Tests ============

    function test_OnlyOwnerCanMint() public {
        mockUSDC.mint(user1, INITIAL_MINT); // Owner can mint
        
        vm.prank(user1);
        vm.expectRevert();
        mockUSDC.mint(user2, INITIAL_MINT);
    }

    function test_OnlyOwnerCanBatchMint() public {
        address[] memory recipients = new address[](1);
        recipients[0] = user1;
        
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100 * 1e6;
        
        vm.prank(user1);
        vm.expectRevert();
        mockUSDC.batchMint(recipients, amounts);
    }

    function test_OwnershipTransfer() public {
        mockUSDC.transferOwnership(user1);
        
        vm.prank(user1);
        // MockUSDC uses Ownable, not Ownable2Step, so acceptOwnership() doesn't exist
        // Ownership is transferred directly with transferOwnership()
        
        assertEq(mockUSDC.owner(), user1);
        
        // Old owner can no longer mint
        vm.expectRevert();
        mockUSDC.mint(user2, INITIAL_MINT);
        
        // New owner can mint
        vm.prank(user1);
        mockUSDC.mint(user2, INITIAL_MINT);
        
        assertEq(mockUSDC.balanceOf(user2), INITIAL_MINT);
    }

    // ============ Error Cases ============

    function test_BatchMintLengthMismatch() public {
        address[] memory recipients = new address[](2);
        recipients[0] = user1;
        recipients[1] = user2;
        
        uint256[] memory amounts = new uint256[](1);
        amounts[0] = 100 * 1e6;
        
        vm.expectRevert("MockUSDC: length mismatch");
        mockUSDC.batchMint(recipients, amounts);
    }

    function test_BurnMoreThanBalance() public {
        mockUSDC.mint(user1, 1000 * 1e6);
        
        vm.prank(user1);
        vm.expectRevert();
        mockUSDC.burn(2000 * 1e6);
    }

    function test_BurnFromWithoutApproval() public {
        mockUSDC.mint(user1, INITIAL_MINT);
        
        vm.prank(user2);
        vm.expectRevert();
        mockUSDC.burnFrom(user1, 1000 * 1e6);
    }

    function test_TransferMoreThanBalance() public {
        mockUSDC.mint(user1, 1000 * 1e6);
        
        vm.prank(user1);
        vm.expectRevert();
        mockUSDC.transfer(user2, 2000 * 1e6);
    }

    // ============ Fuzz Tests ============

    function testFuzz_Mint(uint256 amount) public {
        vm.assume(amount > 0 && amount < type(uint128).max);
        
        mockUSDC.mint(user1, amount);
        
        assertEq(mockUSDC.balanceOf(user1), amount);
        assertEq(mockUSDC.totalSupply(), amount);
    }

    function testFuzz_Transfer(uint256 amount) public {
        vm.assume(amount > 0 && amount < type(uint128).max);
        
        mockUSDC.mint(user1, amount);
        
        vm.prank(user1);
        mockUSDC.transfer(user2, amount);
        
        assertEq(mockUSDC.balanceOf(user1), 0);
        assertEq(mockUSDC.balanceOf(user2), amount);
    }

    function testFuzz_Burn(uint256 mintAmount, uint256 burnAmount) public {
        vm.assume(mintAmount > 0 && mintAmount < type(uint128).max);
        vm.assume(burnAmount > 0 && burnAmount <= mintAmount);
        
        mockUSDC.mint(user1, mintAmount);
        
        vm.prank(user1);
        mockUSDC.burn(burnAmount);
        
        assertEq(mockUSDC.balanceOf(user1), mintAmount - burnAmount);
        assertEq(mockUSDC.totalSupply(), mintAmount - burnAmount);
    }
}
