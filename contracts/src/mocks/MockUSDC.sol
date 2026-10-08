// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Minimal 6-decimal USDC stand-in for local tests.
contract MockUSDC {
    string public constant name = "USD Coin (mock)";
    string public constant symbol = "USDC";
    uint8 public constant decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    /// @notice When true, transfers revert — models Arc's denylist revert on value transfers.
    bool public transfersRevert;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function setTransfersRevert(bool value) external {
        transfersRevert = value;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        if (transfersRevert) revert("USDC: address blacklisted");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        if (transfersRevert) revert("USDC: address blacklisted");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function isBlacklisted(address) external pure returns (bool) {
        return false;
    }
}
