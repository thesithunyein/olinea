// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPQ} from "./interfaces/IPQ.sol";
import {IUSDC} from "./interfaces/IUSDC.sol";

/// @title OlineaVault — USDC that only a post-quantum signature can move
/// @notice A USDC vault on Arc whose releases are authorized by an SLH-DSA-SHA2-128s signature
///         verified on-chain through Arc's PQ precompile at 0x1800..0004.
///
///         There is no owner, no admin key, no pause and no upgrade path: the 32-byte hash-based
///         verifying key fixed at deployment is the only authorization that can move funds, and it
///         is not an elliptic-curve key — so a quantum computer that breaks ECDSA cannot forge it.
///
///         Two details are load-bearing:
///         1. The precompile returns `false` for an invalid signature **without reverting**. This
///            contract decodes that boolean; checking only that the call succeeded would accept
///            every forgery (see mocks/NaiveVault.sol, which demonstrates exactly that bug).
///         2. The signed message binds chain id, this vault, recipient, amount and nonce, so a
///            signature cannot be replayed on another chain, in another vault, or twice here.
contract OlineaVault {
    /// @notice Canonical PQ Signature Verify precompile address on Arc mainnet.
    address internal constant CANONICAL_PQ_PRECOMPILE = 0x1800000000000000000000000000000000000004;

    IUSDC private immutable _usdc;
    address private immutable _verifier;
    bytes private _verifyingKey;

    /// @notice Nonces already consumed by a release.
    mapping(uint256 nonce => bool used) public nonceUsed;

    event Deposited(address indexed from, uint256 amount);
    event Released(address indexed to, uint256 amount, uint256 nonce, bytes32 digest);

    error InvalidVerifyingKeyLength(uint256 length);
    error InvalidRecipient();
    error ZeroAmount();
    error InsufficientBalance(uint256 requested, uint256 available);
    error NonceAlreadyUsed(uint256 nonce);
    error PrecompileCallFailed();
    error InvalidPostQuantumSignature();
    error TransferFailed();

    /// @param usdc_          Arc USDC ERC-20 interface (6 decimals).
    /// @param verifyingKey_  32-byte SLH-DSA-SHA2-128s verifying key.
    /// @param verifier_      PQ verifier address, or address(0) to use the canonical Arc precompile.
    ///                       The override exists only so the test suite can inject a mock; production
    ///                       deployments pass address(0).
    constructor(IUSDC usdc_, bytes memory verifyingKey_, address verifier_) {
        if (verifyingKey_.length != 32) revert InvalidVerifyingKeyLength(verifyingKey_.length);
        _usdc = usdc_;
        _verifyingKey = verifyingKey_;
        _verifier = verifier_ == address(0) ? CANONICAL_PQ_PRECOMPILE : verifier_;
    }

    function usdc() external view returns (address) {
        return address(_usdc);
    }

    /// @notice The address used for PQ verification (the canonical precompile by default).
    function pqVerifier() external view returns (address) {
        return _verifier;
    }

    /// @notice The 32-byte hash-based key that authorizes releases.
    function verifyingKey() external view returns (bytes memory) {
        return _verifyingKey;
    }

    /// @notice Current USDC held by the vault, in the 6-decimal ERC-20 unit.
    function balance() external view returns (uint256) {
        return _usdc.balanceOf(address(this));
    }

    /// @notice The exact 32 bytes an SLH-DSA key must sign to authorize one release.
    function authorizationDigest(address to, uint256 amount, uint256 nonce) public view returns (bytes32) {
        return keccak256(abi.encode(block.chainid, address(this), to, amount, nonce));
    }

    /// @notice Deposit USDC. Open to anyone; a deposit grants no rights — only the PQ key can release.
    function deposit(uint256 amount) external {
        if (amount == 0) revert ZeroAmount();
        if (!_usdc.transferFrom(msg.sender, address(this), amount)) revert TransferFailed();
        emit Deposited(msg.sender, amount);
    }

    /// @notice Release USDC to `to` when `signature` is a valid SLH-DSA authorization.
    /// @dev Anyone may relay a valid authorization; the relayer gains nothing.
    function release(address to, uint256 amount, uint256 nonce, bytes calldata signature) external {
        if (to == address(0)) revert InvalidRecipient();
        if (amount == 0) revert ZeroAmount();
        if (nonceUsed[nonce]) revert NonceAlreadyUsed(nonce);

        uint256 available = _usdc.balanceOf(address(this));
        if (amount > available) revert InsufficientBalance(amount, available);

        bytes32 digest = authorizationDigest(to, amount, nonce);
        (bool ok, bytes memory ret) = _verifier.staticcall(
            abi.encodeWithSelector(IPQ.verifySlhDsaSha2128s.selector, _verifyingKey, abi.encodePacked(digest), signature)
        );
        if (!ok) revert PrecompileCallFailed();
        if (ret.length != 32 || !abi.decode(ret, (bool))) revert InvalidPostQuantumSignature();

        nonceUsed[nonce] = true;
        if (!_usdc.transfer(to, amount)) revert TransferFailed();
        emit Released(to, amount, nonce, digest);
    }
}
