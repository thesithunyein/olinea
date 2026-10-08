// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Stand-in for Arc's PQ precompile so the vault can be tested without Arc's execution layer.
/// @dev Plain Foundry/Anvil cannot execute Arc's precompiles — Arc Foundry (`arc-anvil --network arc`)
///      is required for that. This mock reproduces the semantics that matter:
///      - a bad signature returns `false` and does **not** revert (the footgun),
///      - malformed input reverts,
///      - a valid signature is bound to the exact message signed.
contract MockPQ {
    enum Mode {
        DigestOnly, // returns true only for messages registered with accept()
        AlwaysFalse, // every signature is treated as forged (no revert) — models a forgery
        RevertOnCall // models malformed input, e.g. a wrong signature length
    }

    Mode public mode;
    mapping(bytes32 messageHash => bool accepted) public acceptedMessage;

    function setMode(Mode newMode) external {
        mode = newMode;
    }

    function accept(bytes32 messageHash, bool value) external {
        acceptedMessage[messageHash] = value;
    }

    function verifySlhDsaSha2128s(bytes calldata, bytes calldata message, bytes calldata)
        external
        view
        returns (bool)
    {
        if (mode == Mode.RevertOnCall) revert("Invalid signature length");
        if (mode == Mode.AlwaysFalse) return false;
        return acceptedMessage[keccak256(message)];
    }
}
