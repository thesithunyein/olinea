// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {IUSDC} from "./interfaces/IUSDC.sol";
import {OlineaVault} from "./OlineaVault.sol";

/// @title OlineaFactory — a personal post-quantum vault in one transaction
/// @notice Creating a vault is the one step a user cannot take from a browser alone: contracts are
///         not created by signatures. This factory turns "deploy your own vault with a build tool
///         and a funded private key" into one transaction from the user's own wallet.
///
///         It holds no funds, has no owner, no pause and no upgrade path, and it is a convenience
///         rather than an authority. A vault created by any other means is equally valid: the app
///         trusts a vault because it can read that vault's verifying key, never because this
///         contract says so. That is why `isVault` is informational and nothing depends on it.
contract OlineaFactory {
    IUSDC public immutable usdc;

    /// @notice Verifier given to every vault, or address(0) for the canonical Arc precompile.
    address public immutable verifier;

    mapping(address owner => address[] vaults) private _vaultsOf;
    address[] private _allVaults;

    /// @notice Whether this factory created `vault`. Informational only — see the contract note.
    mapping(address vault => bool) public isVault;

    /// @notice `verifyingKeyHash` is indexed so a vault can be found from a backed-up key alone.
    event VaultCreated(
        address indexed owner, address indexed vault, bytes32 indexed verifyingKeyHash, bytes verifyingKey
    );

    /// @param usdc_     Arc USDC ERC-20 interface (6 decimals).
    /// @param verifier_ PQ verifier address, or address(0) to use the canonical Arc precompile.
    constructor(IUSDC usdc_, address verifier_) {
        usdc = usdc_;
        verifier = verifier_;
    }

    /// @notice Create a vault whose releases are authorized by `verifyingKey`.
    /// @dev Reverts with `OlineaVault.InvalidVerifyingKeyLength` unless the key is exactly 32 bytes.
    ///      Anyone may create any number of vaults: the caller pays the gas and gains no authority
    ///      over the vault, because the verifying key — not the creator — authorizes every release.
    ///      Funds sent to a vault created with the wrong key are unrecoverable, so the app derives
    ///      the key from a backup phrase and shows it before this is called.
    function createVault(bytes calldata verifyingKey) external returns (address vault) {
        vault = address(new OlineaVault(usdc, verifyingKey, verifier));

        _vaultsOf[msg.sender].push(vault);
        _allVaults.push(vault);
        isVault[vault] = true;

        emit VaultCreated(msg.sender, vault, keccak256(verifyingKey), verifyingKey);
    }

    /// @notice Every vault created through this factory by `owner`, oldest first.
    /// @dev Convenience for the app, not a source of truth. The vault keeps no owner, so this is a
    ///      history of creations; the app still verifies each candidate vault's key before trusting
    ///      it, and a vault created elsewhere is added by address on the same terms.
    function vaultsOf(address owner) external view returns (address[] memory) {
        return _vaultsOf[owner];
    }

    /// @notice Total vaults created through this factory.
    function vaultCount() external view returns (uint256) {
        return _allVaults.length;
    }

    /// @notice The vault created at `index`, for enumeration. Reverts past the end.
    function vaultAt(uint256 index) external view returns (address) {
        return _allVaults[index];
    }
}
