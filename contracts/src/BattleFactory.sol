// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./BattleArena.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";

/**
 * @title BattleFactory
 * @dev Factory contract for deploying BattleArena instances with configurable parameters
 * Uses minimal proxy pattern (Clones) for gas-efficient deployments
 */
contract BattleFactory is Ownable {
    // ============ Errors ============
    error InvalidImplementation();
    error InvalidFeeRecipient();
    error InvalidUSDC();
    error InvalidParameters();
    error DeploymentFailed();
    error BattleNotFound();
    error NotBattleOwner();

    // ============ Structs ============
    struct BattleConfig {
        uint256 entryFee;              // Fee to enter battle (6 decimals)
        uint256 minPlayers;            // Minimum players required
        uint256 maxPlayers;            // Maximum players allowed
        uint256 timeLimit;             // Battle duration in seconds
        uint256 eliminationThreshold;  // Price move % for liquidation (basis points)
        bool enabled;                  // Whether this config is active
    }

    struct BattleInfo {
        address battleAddress;
        address creator;
        bytes32 battleId;
        uint256 createdAt;
        BattleConfig config;
    }

    // ============ State Variables ============
    
    // Implementation address for BattleArena
    address public battleImplementation;
    
    // USDC token address
    address public immutable usdc;
    
    // Protocol fee recipient
    address public feeRecipient;
    
    // Protocol fee in basis points (default 2.5%)
    uint256 public protocolFeeBps = 250;
    
    // Battle ID => BattleInfo
    mapping(bytes32 => BattleInfo) public battles;
    
    // Creator => battle IDs
    mapping(address => bytes32[]) public creatorBattles;
    
    // All battle IDs
    bytes32[] public allBattleIds;
    
    // Config templates
    mapping(uint256 => BattleConfig) public configTemplates;
    uint256 public configTemplateCount;

    // ============ Events ============
    event BattleCreated(
        bytes32 indexed battleId,
        address indexed battleAddress,
        address indexed creator,
        uint256 entryFee,
        uint256 timeLimit,
        uint256 eliminationThreshold
    );
    
    event ImplementationUpdated(
        address indexed oldImplementation,
        address indexed newImplementation
    );
    
    event FeeRecipientUpdated(address indexed newRecipient);
    event ProtocolFeeUpdated(uint256 newFeeBps);
    event ConfigTemplateAdded(uint256 indexed templateId, BattleConfig config);
    event ConfigTemplateUpdated(uint256 indexed templateId, BattleConfig config);
    
    event BattleInitialized(
        bytes32 indexed battleId,
        address indexed agentA,
        address indexed agentB,
        uint256 entryPrice
    );

    // ============ Modifiers ============
    modifier validConfig(BattleConfig memory config) {
        if (config.timeLimit == 0) revert InvalidParameters();
        if (config.eliminationThreshold == 0) revert InvalidParameters();
        if (config.minPlayers == 0) revert InvalidParameters();
        if (config.maxPlayers < config.minPlayers) revert InvalidParameters();
        _;
    }

    // ============ Constructor ============
    constructor(
        address _implementation,
        address _usdc,
        address _feeRecipient
    ) Ownable(msg.sender) {
        if (_implementation == address(0)) revert InvalidImplementation();
        if (_usdc == address(0)) revert InvalidUSDC();
        if (_feeRecipient == address(0)) revert InvalidFeeRecipient();
        
        battleImplementation = _implementation;
        usdc = _usdc;
        feeRecipient = _feeRecipient;
        
        // Add default config template
        _addConfigTemplate(BattleConfig({
            entryFee: 1e6,              // 1 USDC
            minPlayers: 2,
            maxPlayers: 2,
            timeLimit: 300,             // 5 minutes
            eliminationThreshold: 950,  // 9.5%
            enabled: true
        }));
    }

    // ============ External Functions ============
    
    /**
     * @dev Creates a new battle with specified configuration
     * @param battleId Unique identifier for the battle
     * @param config Configuration parameters
     * @param agentA Address of Bull agent
     * @param agentB Address of Bear agent
     * @param entryPrice Current ETH price (8 decimals)
     * @return battleAddress Address of the deployed battle contract
     */
    function createBattle(
        bytes32 battleId,
        BattleConfig calldata config,
        address agentA,
        address agentB,
        uint256 entryPrice
    ) external validConfig(config) returns (address battleAddress) {
        if (battles[battleId].battleAddress != address(0)) {
            revert DeploymentFailed();
        }

        // Deploy minimal proxy
        battleAddress = Clones.clone(battleImplementation);
        
        // Store battle info
        battles[battleId] = BattleInfo({
            battleAddress: battleAddress,
            creator: msg.sender,
            battleId: battleId,
            createdAt: block.timestamp,
            config: config
        });
        
        creatorBattles[msg.sender].push(battleId);
        allBattleIds.push(battleId);

        // Initialize the battle
        BattleArena battle = BattleArena(battleAddress);
        
        // Transfer ownership to factory first, then battle will transfer to creator
        // Note: This requires BattleArena to have an initialization pattern
        // For now, we use a simplified approach

        emit BattleCreated(
            battleId,
            battleAddress,
            msg.sender,
            config.entryFee,
            config.timeLimit,
            config.eliminationThreshold
        );

        return battleAddress;
    }

    /**
     * @dev Creates and initializes a battle in one transaction
     * @param battleId Unique identifier for the battle
     * @param config Configuration parameters
     * @param agentA Address of Bull agent
     * @param agentB Address of Bear agent
     * @param entryPrice Current ETH price (8 decimals)
     * @return battleAddress Address of the deployed battle contract
     */
    function createAndInitBattle(
        bytes32 battleId,
        BattleConfig calldata config,
        address agentA,
        address agentB,
        uint256 entryPrice
    ) external onlyOwner validConfig(config) returns (address battleAddress) {
        if (battles[battleId].battleAddress != address(0)) {
            revert DeploymentFailed();
        }

        // Deploy minimal proxy
        battleAddress = Clones.clone(battleImplementation);
        
        // Initialize the battle directly
        BattleArena battle = BattleArena(battleAddress);
        battle.createBattle(
            battleId,
            agentA,
            agentB,
            entryPrice,
            config.timeLimit,
            config.entryFee,
            config.eliminationThreshold
        );
        
        // Store battle info
        battles[battleId] = BattleInfo({
            battleAddress: battleAddress,
            creator: msg.sender,
            battleId: battleId,
            createdAt: block.timestamp,
            config: config
        });
        
        creatorBattles[msg.sender].push(battleId);
        allBattleIds.push(battleId);

        emit BattleCreated(
            battleId,
            battleAddress,
            msg.sender,
            config.entryFee,
            config.timeLimit,
            config.eliminationThreshold
        );
        
        emit BattleInitialized(battleId, agentA, agentB, entryPrice);

        return battleAddress;
    }

    /**
     * @dev Creates a battle using a predefined template
     * @param battleId Unique identifier for the battle
     * @param templateId ID of the config template
     * @param agentA Address of Bull agent
     * @param agentB Address of Bear agent
     * @param entryPrice Current ETH price (8 decimals)
     * @return battleAddress Address of the deployed battle contract
     */
    function createBattleFromTemplate(
        bytes32 battleId,
        uint256 templateId,
        address agentA,
        address agentB,
        uint256 entryPrice
    ) external returns (address battleAddress) {
        BattleConfig memory config = configTemplates[templateId];
        if (!config.enabled) revert InvalidParameters();
        
        return createAndInitBattle(battleId, config, agentA, agentB, entryPrice);
    }

    // ============ View Functions ============
    
    /**
     * @dev Get battle info by ID
     */
    function getBattle(bytes32 battleId) external view returns (BattleInfo memory) {
        return battles[battleId];
    }

    /**
     * @dev Get all battles created by an address
     */
    function getCreatorBattles(address creator) external view returns (bytes32[] memory) {
        return creatorBattles[creator];
    }

    /**
     * @dev Get all battle IDs
     */
    function getAllBattles() external view returns (bytes32[] memory) {
        return allBattleIds;
    }

    /**
     * @dev Get battle count
     */
    function getBattleCount() external view returns (uint256) {
        return allBattleIds.length;
    }

    /**
     * @dev Get config template
     */
    function getConfigTemplate(uint256 templateId) external view returns (BattleConfig memory) {
        return configTemplates[templateId];
    }

    /**
     * @dev Predict battle address before deployment (for CREATE2)
     * Note: This uses Clones.predictDeterministicAddress if using CREATE2
     */
    function predictBattleAddress(bytes32 salt) external view returns (address) {
        return Clones.predictDeterministicAddress(battleImplementation, salt, address(this));
    }

    // ============ Admin Functions ============
    
    /**
     * @dev Update the battle implementation address
     * @param newImplementation New implementation contract address
     */
    function setImplementation(address newImplementation) external onlyOwner {
        if (newImplementation == address(0)) revert InvalidImplementation();
        
        address oldImplementation = battleImplementation;
        battleImplementation = newImplementation;
        
        emit ImplementationUpdated(oldImplementation, newImplementation);
    }

    /**
     * @dev Update the fee recipient address
     * @param newRecipient New fee recipient address
     */
    function setFeeRecipient(address newRecipient) external onlyOwner {
        if (newRecipient == address(0)) revert InvalidFeeRecipient();
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(newRecipient);
    }

    /**
     * @dev Update protocol fee
     * @param newFeeBps New fee in basis points (max 1000 = 10%)
     */
    function setProtocolFee(uint256 newFeeBps) external onlyOwner {
        if (newFeeBps > 1000) revert InvalidParameters();
        protocolFeeBps = newFeeBps;
        emit ProtocolFeeUpdated(newFeeBps);
    }

    /**
     * @dev Add a new config template
     * @param config Configuration template
     * @return templateId ID of the new template
     */
    function addConfigTemplate(BattleConfig calldata config) 
        external 
        onlyOwner 
        validConfig(config) 
        returns (uint256 templateId) 
    {
        return _addConfigTemplate(config);
    }

    /**
     * @dev Update an existing config template
     * @param templateId Template ID to update
     * @param config New configuration
     */
    function updateConfigTemplate(uint256 templateId, BattleConfig calldata config) 
        external 
        onlyOwner 
        validConfig(config) 
    {
        configTemplates[templateId] = config;
        emit ConfigTemplateUpdated(templateId, config);
    }

    /**
     * @dev Enable/disable a config template
     * @param templateId Template ID
     * @param enabled Whether to enable or disable
     */
    function setTemplateEnabled(uint256 templateId, bool enabled) external onlyOwner {
        configTemplates[templateId].enabled = enabled;
        emit ConfigTemplateUpdated(templateId, configTemplates[templateId]);
    }

    /**
     * @dev Emergency pause a battle (call battle function if supported)
     * @param battleId Battle to pause
     */
    function emergencyPauseBattle(bytes32 battleId) external onlyOwner {
        BattleInfo memory info = battles[battleId];
        if (info.battleAddress == address(0)) revert BattleNotFound();
        
        // This would require BattleArena to have a pause function
        // For now, this is a placeholder for the pattern
    }

    /**
     * @dev Withdraw any stuck tokens (emergency only)
     * @param token Token to withdraw
     * @param amount Amount to withdraw
     */
    function rescueTokens(address token, uint256 amount) external onlyOwner {
        IERC20(token).transfer(owner(), amount);
    }

    // ============ Internal Functions ============
    
    function _addConfigTemplate(BattleConfig memory config) internal returns (uint256 templateId) {
        templateId = configTemplateCount;
        configTemplates[templateId] = config;
        configTemplateCount++;
        
        emit ConfigTemplateAdded(templateId, config);
    }
}
