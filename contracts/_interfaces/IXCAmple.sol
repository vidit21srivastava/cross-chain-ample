// SPDX-License-Identifier: GPL-3.0-or-later
pragma solidity 0.6.12;

import "uFragments/contracts/interfaces/IAMPL.sol";

interface IXCAmple is IAMPL {
    function globalAMPLSupply() external view returns (uint256);
    function mint(address who, uint256 xcAmpleAmount) external;
    function burnFrom(address who, uint256 xcAmpleAmount) external;
}
