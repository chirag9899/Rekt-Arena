// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "forge-std/Script.sol";
import "../src/MockUSDC.sol";
import "../src/BattleArena.sol";
import "../src/BattleFactory.sol";

/**
 * @title Deploy
 * @dev Deployment script for Liquidation Arena contracts
 * Usage: 
 *   forge script script/Deploy.s.sol --rpc-url <RPC_URL> --broadcast --verify
 *   forge script script/Deploy.s.sol --rpc-url amoy --broadcast --verify
 */
contract Deploy is Script {
    // ============ Deployment State ============
    struct DeploymentState {
        address mockUSDC;
        address battleArenaImpl;
        address battleFactory;
        uint256 deployTimestamp;
        string network;
    }

    DeploymentState public state;

    // ============ Environment Variables ============
    string public constant ENV_PRIVATE_KEY = "PRIVATE_KEY";
    string public constant ENV_FEE_RECIPIENT = "FEE_RECIPIENT";

    // ============ Events ============
    event ContractDeployed(string name, address addr, bytes32 salt);
    event DeploymentCompleted(uint256 timestamp);

    // ============ Errors ============
    error MissingEnvironmentVariable(string variable);
    error InvalidAddress(string variable);
    error DeploymentFailed(string contractName);

    // ============ Modifiers ============
    modifier validateEnvironment() {
        _validateEnvironment();
        _;
    }

    // ============ External Functions ============
    
    function run() external validateEnvironment {
        uint256 deployerPrivateKey = vm.envUint(ENV_PRIVATE_KEY);
        address deployer = vm.addr(deployerPrivateKey);
        address feeRecipient = vm.envAddress(ENV_FEE_RECIPIENT);
        
        string memory networkName = _detectNetwork();
        
        console.log("========================================");
        console.log("Liquidation Arena Deployment");
        console.log("========================================");
        console.log("Deployer:", deployer);
        console.log("Fee Recipient:", feeRecipient);
        console.log("Network:", networkName);
        console.log("Chain ID:", vm.toString(block.chainid));
        console.log("========================================");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy MockUSDC
        address mockUSDC = _deployMockUSDC(deployer);
        
        // Deploy BattleArena implementation
        address battleArenaImpl = _deployBattleArena(mockUSDC, feeRecipient);
        
        // Deploy BattleFactory
        address battleFactory = _deployBattleFactory(battleArenaImpl, mockUSDC, feeRecipient);

        vm.stopBroadcast();

        // Save deployment state
        state = DeploymentState({
            mockUSDC: mockUSDC,
            battleArenaImpl: battleArenaImpl,
            battleFactory: battleFactory,
            deployTimestamp: block.timestamp,
            network: networkName
        });

        // Write deployment JSON
        _writeDeploymentJson();

        console.log("========================================");
        console.log("Deployment Complete!");
        console.log("========================================");
        console.log("MockUSDC:", mockUSDC);
        console.log("BattleArena Implementation:", battleArenaImpl);
        console.log("BattleFactory:", battleFactory);
        console.log("========================================");

        emit DeploymentCompleted(block.timestamp);
    }

    /**
     * @dev Deploy with CREATE2 for deterministic addresses
     * Usage: forge script script/Deploy.s.sol --sig "runWithCreate2(bytes32)" --rpc-url <RPC_URL> --broadcast
     */
    function runWithCreate2(bytes32 salt) external validateEnvironment {
        uint256 deployerPrivateKey = vm.envUint(ENV_PRIVATE_KEY);
        address deployer = vm.addr(deployerPrivateKey);
        address feeRecipient = vm.envAddress(ENV_FEE_RECIPIENT);
        string memory networkName = _detectNetwork();

        console.log("========================================");
        console.log("Liquidation Arena Deployment (CREATE2)");
        console.log("========================================");
        console.log("Deployer:", deployer);
        console.log("Fee Recipient:", feeRecipient);
        console.log("Network:", networkName);
        console.log("Chain ID:", vm.toString(block.chainid));
        console.log("Salt:", vm.toString(salt));
        console.log("========================================");

        vm.startBroadcast(deployerPrivateKey);

        // Deploy MockUSDC with CREATE2
        address mockUSDC = _deployMockUSDCCreate2(salt, deployer);
        
        // Deploy BattleArena implementation with CREATE2
        address battleArenaImpl = _deployBattleArenaCreate2(salt, mockUSDC, feeRecipient);
        
        // Deploy BattleFactory with CREATE2
        address battleFactory = _deployBattleFactoryCreate2(salt, battleArenaImpl, mockUSDC, feeRecipient);

        vm.stopBroadcast();

        // Save deployment state
        state = DeploymentState({
            mockUSDC: mockUSDC,
            battleArenaImpl: battleArenaImpl,
            battleFactory: battleFactory,
            deployTimestamp: block.timestamp,
            network: networkName
        });

        // Write deployment JSON
        _writeDeploymentJson();

        console.log("========================================");
        console.log("CREATE2 Deployment Complete!");
        console.log("========================================");
        console.log("MockUSDC:", mockUSDC);
        console.log("BattleArena Implementation:", battleArenaImpl);
        console.log("BattleFactory:", battleFactory);
        console.log("========================================");

        emit DeploymentCompleted(block.timestamp);
    }

    /**
     * @dev Deploy only MockUSDC (for testing)
     */
    function deployMockUSDCOnly() external validateEnvironment {
        uint256 deployerPrivateKey = vm.envUint(ENV_PRIVATE_KEY);
        address deployer = vm.addr(deployerPrivateKey);

        vm.startBroadcast(deployerPrivateKey);
        
        MockUSDC mockUSDC = new MockUSDC(deployer);
        
        vm.stopBroadcast();

        console.log("MockUSDC deployed to:", address(mockUSDC));

        // Write single deployment
        _writeSingleDeployment("MockUSDC", address(mockUSDC));
    }

    // ============ Internal Functions ============
    
    function _validateEnvironment() internal view {
        // Check Private Key
        try vm.envUint(ENV_PRIVATE_KEY) returns (uint256) {
            // Valid private key
        } catch {
            revert MissingEnvironmentVariable(ENV_PRIVATE_KEY);
        }

        // Check Fee Recipient
        try vm.envAddress(ENV_FEE_RECIPIENT) returns (address feeRecipient) {
            if (feeRecipient == address(0)) {
                revert InvalidAddress(ENV_FEE_RECIPIENT);
            }
        } catch {
            revert MissingEnvironmentVariable(ENV_FEE_RECIPIENT);
        }

        console.log("Environment validation passed!");
    }
    
    function _detectNetwork() internal view returns (string memory) {
        uint256 chainId = block.chainid;
        
        // Common testnet chain IDs
        if (chainId == 80002) return "amoy";
        if (chainId == 84532) return "base_sepolia";
        if (chainId == 11155111) return "sepolia";
        if (chainId == 5) return "goerli";
        
        // Mainnet chain IDs
        if (chainId == 137) return "polygon";
        if (chainId == 8453) return "base";
        if (chainId == 1) return "ethereum";
        
        // Default to chain ID as string
        return vm.toString(chainId);
    }

    function _deployMockUSDC(address owner) internal returns (address) {
        MockUSDC mockUSDC = new MockUSDC(owner);
        emit ContractDeployed("MockUSDC", address(mockUSDC), bytes32(0));
        return address(mockUSDC);
    }

    function _deployBattleArena(address usdc, address feeRecipient) internal returns (address) {
        BattleArena battleArena = new BattleArena(usdc, feeRecipient);
        emit ContractDeployed("BattleArena", address(battleArena), bytes32(0));
        return address(battleArena);
    }

    function _deployBattleFactory(
        address implementation,
        address usdc,
        address feeRecipient
    ) internal returns (address) {
        BattleFactory factory = new BattleFactory(implementation, usdc, feeRecipient);
        emit ContractDeployed("BattleFactory", address(factory), bytes32(0));
        return address(factory);
    }

    function _deployMockUSDCCreate2(bytes32 salt, address owner) internal returns (address) {
        bytes memory bytecode = abi.encodePacked(
            type(MockUSDC).creationCode,
            abi.encode(owner)
        );
        
        address mockUSDC;
        assembly {
            mockUSDC := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
            if iszero(extcodesize(mockUSDC)) {
                revert(0, 0)
            }
        }
        
        emit ContractDeployed("MockUSDC", mockUSDC, salt);
        return mockUSDC;
    }

    function _deployBattleArenaCreate2(
        bytes32 salt,
        address usdc,
        address feeRecipient
    ) internal returns (address) {
        bytes memory bytecode = abi.encodePacked(
            type(BattleArena).creationCode,
            abi.encode(usdc, feeRecipient)
        );
        
        address battleArena;
        assembly {
            battleArena := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
            if iszero(extcodesize(battleArena)) {
                revert(0, 0)
            }
        }
        
        emit ContractDeployed("BattleArena", battleArena, salt);
        return battleArena;
    }

    function _deployBattleFactoryCreate2(
        bytes32 salt,
        address implementation,
        address usdc,
        address feeRecipient
    ) internal returns (address) {
        bytes memory bytecode = abi.encodePacked(
            type(BattleFactory).creationCode,
            abi.encode(implementation, usdc, feeRecipient)
        );
        
        address factory;
        assembly {
            factory := create2(0, add(bytecode, 0x20), mload(bytecode), salt)
            if iszero(extcodesize(factory)) {
                revert(0, 0)
            }
        }
        
        emit ContractDeployed("BattleFactory", factory, salt);
        return factory;
    }

    function _writeDeploymentJson() internal {
        string memory json = string.concat(
            '{\n',
            '  "network": "', state.network, '",\n',
            '  "timestamp": ', vm.toString(state.deployTimestamp), ',\n',
            '  "contracts": {\n',
            '    "MockUSDC": "', vm.toString(state.mockUSDC), '",\n',
            '    "BattleArena": "', vm.toString(state.battleArenaImpl), '",\n',
            '    "BattleFactory": "', vm.toString(state.battleFactory), '"\n',
            '  },\n',
            '  "constructorArgs": {\n',
            '    "BattleArena": {\n',
            '      "usdc": "', vm.toString(state.mockUSDC), '",\n',
            '      "feeRecipient": "', vm.toString(vm.envAddress(ENV_FEE_RECIPIENT)), '"\n',
            '    },\n',
            '    "BattleFactory": {\n',
            '      "implementation": "', vm.toString(state.battleArenaImpl), '",\n',
            '      "usdc": "', vm.toString(state.mockUSDC), '",\n',
            '      "feeRecipient": "', vm.toString(vm.envAddress(ENV_FEE_RECIPIENT)), '"\n',
            '    }\n',
            '  }\n',
            '}'
        );

        string memory filename = string.concat(
            "deployments/",
            state.network,
            "_",
            vm.toString(state.deployTimestamp),
            ".json"
        );

        // Try to write deployment files (may fail in restricted environments)
        // This is optional - addresses are already logged to console
        try vm.createDir("deployments", true) {
            vm.writeFile(filename, json);
            console.log("Deployment state written to:", filename);
            vm.writeFile("deployments/latest.json", json);
            console.log("Latest deployment state written to: deployments/latest.json");
        } catch {
            // Deployment files are optional - addresses are logged above
            console.log("Note: Could not write deployment files (restricted environment)");
        }
    }

    function _writeSingleDeployment(string memory name, address addr) internal {
        string memory networkName = _detectNetwork();
        string memory json = string.concat(
            '{\n',
            '  "network": "', networkName, '",\n',
            '  "timestamp": ', vm.toString(block.timestamp), ',\n',
            '  "contract": "', name, '",\n',
            '  "address": "', vm.toString(addr), '"\n',
            '}'
        );

        // Try to write deployment file (may fail in restricted environments)
        try vm.createDir("deployments", true) {
            vm.writeFile(
                string.concat("deployments/", name, "_", vm.toString(block.timestamp), ".json"),
                json
            );
        } catch {
            // Deployment files are optional - just log to console
            console.log("Deployment JSON:", json);
        }
    }
}
