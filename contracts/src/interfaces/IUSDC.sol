// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @title USDC ERC-20 interface on Arc
/// @notice Arc exposes USDC twice on one balance: natively (18 decimals, used for gas) and through
///         this ERC-20 interface (6 decimals) at 0x3600000000000000000000000000000000000000.
///         Mixing the two units is a 10^12 error — this project only ever uses the 6-decimal view.
interface IUSDC {
    function transfer(address to, uint256 amount) external returns (bool);

    function transferFrom(address from, address to, uint256 amount) external returns (bool);

    function balanceOf(address who) external view returns (uint256);

    /// @notice Arc's USDC exposes the protocol denylist to the token itself.
    function isBlacklisted(address who) external view returns (bool);
}
