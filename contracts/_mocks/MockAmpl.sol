// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.7.3;

contract MockAmpl {
    uint256 public totalSupply;

    function updateTotalSupply(uint256 totalSupply_) external {
        totalSupply = totalSupply_;
    }
}
