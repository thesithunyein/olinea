// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IPQ} from "../interfaces/IPQ.sol";
import {IUSDC} from "../interfaces/IUSDC.sol";

/// @title NaiveVault — DELIBERATELY INCORRECT reference, kept only as a test fixture
/// @notice This is the bug this project exists to document. It checks only that the precompile call
///         *succeeded*, and never decodes the returned boolean:
///
///             (bool ok, ) = PQ.staticcall(...);
///             require(ok, "verify failed");   // <-- true for EVERY forged signature
///
///         Because an invalid signature returns `false` without reverting, `ok` is true even when the
///         signature is a forgery, so anyone can drain this vault. The test suite asserts that this
///         contract DOES accept a forgery, and that OlineaVault does not.
contract NaiveVault {
    IUSDC private immutable _usdc;
    address private immutable _verifier;
    bytes private _verifyingKey;

    constructor(IUSDC usdc_, bytes memory verifyingKey_, address verifier_) {
        _usdc = usdc_;
        _verifyingKey = verifyingKey_;
        _verifier = verifier_;
    }

    function deposit(uint256 amount) external {
        _usdc.transferFrom(msg.sender, address(this), amount);
    }

    function release(address to, uint256 amount, uint256, bytes calldata signature) external {
        bytes32 digest = keccak256(abi.encode(block.chainid, address(this), to, amount, uint256(0)));
        (bool ok,) = _verifier.staticcall(
            abi.encodeWithSelector(
                IPQ.verifySlhDsaSha2128s.selector, _verifyingKey, abi.encodePacked(digest), signature
            )
        );
        require(ok, "verify failed");
        _usdc.transfer(to, amount);
    }
}
