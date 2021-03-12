// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.6.12;

import "hardhat/console.sol";

interface IBridge {
    function deposit(
        uint8 destinationChainID,
        bytes32 resourceID,
        bytes calldata data
    ) external;
}

interface IPolicy {
    function globalAmpleforthEpochAndAMPLSupply() external view returns (uint256, uint256);
}

/**
 * @title ChainBridgeBatchRebaseReport
 * @notice Utility that executes rebase report 'deposit' transactions in batch.
 */
contract ChainBridgeBatchRebaseReport {
    function execute(
        address policy,
        address bridge,
        uint8[] memory destinationChainIDs,
        bytes32 resourceID
    ) external {
        for (uint256 i = 0; i < destinationChainIDs.length; i++) {
            uint8 destinationChainID = destinationChainIDs[i];

            uint256 epoch;
            uint256 totalSupply;
            (epoch, totalSupply) = IPolicy(policy).globalAmpleforthEpochAndAMPLSupply();

            uint256 dataLen = 64;
            IBridge(bridge).deposit(
                destinationChainID,
                resourceID,
                abi.encode(dataLen, epoch, totalSupply)
            );
        }
    }
}
