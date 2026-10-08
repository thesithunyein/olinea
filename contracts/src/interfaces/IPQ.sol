// SPDX-License-Identifier: Apache-2.0
// Mirrors circlefin/arc-node: contracts/src/pq/IPQ.sol (Apache-2.0).
pragma solidity ^0.8.20;

/// @title Arc's PQ Signature Verify precompile
/// @notice Genesis-fixed at 0x1800000000000000000000000000000000000004. Verifies
///         SLH-DSA-SHA2-128s (FIPS 205) signatures as an application-layer authorization
///         primitive: the signer does not need an Arc account.
interface IPQ {
    /// @param vk      32-byte SLH-DSA-SHA2-128s verifying key.
    /// @param message Arbitrary-length signed message.
    /// @param sig     7856-byte SLH-DSA-SHA2-128s signature.
    /// @return isValid `false` for an invalid signature. **A forgery does not revert** — only
    ///         malformed input does (`Input too short`, `Invalid selector`, `Invalid verifying key
    ///         length`, `Invalid signature length`). Callers must decode this boolean; a caller that
    ///         checks only whether the call succeeded accepts every forgery.
    function verifySlhDsaSha2128s(bytes calldata vk, bytes calldata message, bytes calldata sig)
        external
        view
        returns (bool isValid);
}
