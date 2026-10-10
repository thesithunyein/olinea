// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {OlineaVault} from "../src/OlineaVault.sol";
import {NaiveVault} from "../src/mocks/NaiveVault.sol";
import {MockPQ} from "../src/mocks/MockPQ.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {IUSDC} from "../src/interfaces/IUSDC.sol";

contract OlineaVaultTest is Test {
    event Released(address indexed to, uint256 amount, uint256 nonce, bytes32 digest);

    address internal constant CANONICAL_PQ = 0x1800000000000000000000000000000000000004;

    MockUSDC internal usdc;
    MockPQ internal pq;
    OlineaVault internal vault;

    bytes32 internal constant VK = bytes32(uint256(0xA11CE5EED));
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    uint256 internal constant ONE_USDC = 1_000_000; // 6 decimals

    function setUp() public {
        usdc = new MockUSDC();
        pq = new MockPQ();
        vault = new OlineaVault(IUSDC(address(usdc)), abi.encodePacked(VK), address(pq));

        usdc.mint(address(this), 100 * ONE_USDC);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(10 * ONE_USDC);
    }

    /* ------------------------------------------------------------------ deployment */

    function test_defaultVerifierIsTheCanonicalPrecompile() public {
        OlineaVault production = new OlineaVault(IUSDC(address(usdc)), abi.encodePacked(VK), address(0));
        assertEq(production.pqVerifier(), CANONICAL_PQ);
    }

    /// @notice Exercises the exact configuration that goes to mainnet: verifier = address(0), which
    ///         resolves to 0x1800..0004. The precompile cannot run under plain Foundry (Arc Foundry is
    ///         required), so its code is etched in — what is proven here is that the production
    ///         configuration calls that address and decodes the returned boolean correctly, both ways.
    function test_productionConfigurationCallsCanonicalPrecompileAndDecodesBool() public {
        OlineaVault production = new OlineaVault(IUSDC(address(usdc)), abi.encodePacked(VK), address(0));
        usdc.mint(address(this), 2 * ONE_USDC);
        usdc.approve(address(production), type(uint256).max);
        production.deposit(2 * ONE_USDC);

        vm.etch(CANONICAL_PQ, address(new TruePQ()).code);
        production.release(BOB, ONE_USDC, 1, hex"deadbeef");
        assertEq(usdc.balanceOf(BOB), ONE_USDC);

        vm.etch(CANONICAL_PQ, address(new FalsePQ()).code);
        vm.expectRevert(OlineaVault.InvalidPostQuantumSignature.selector);
        production.release(BOB, ONE_USDC, 2, hex"deadbeef");
        assertEq(usdc.balanceOf(BOB), ONE_USDC);
    }

    function test_constructorRejectsVerifyingKeyOfWrongLength() public {
        vm.expectRevert(abi.encodeWithSelector(OlineaVault.InvalidVerifyingKeyLength.selector, 31));
        new OlineaVault(IUSDC(address(usdc)), new bytes(31), address(pq));

        vm.expectRevert(abi.encodeWithSelector(OlineaVault.InvalidVerifyingKeyLength.selector, 33));
        new OlineaVault(IUSDC(address(usdc)), new bytes(33), address(pq));

        vm.expectRevert(abi.encodeWithSelector(OlineaVault.InvalidVerifyingKeyLength.selector, 0));
        new OlineaVault(IUSDC(address(usdc)), "", address(pq));
    }

    /* ---------------------------------------------------------------------- deposit */

    function test_depositMovesUsdc() public {
        assertEq(vault.balance(), 10 * ONE_USDC);
        vault.deposit(5 * ONE_USDC);
        assertEq(vault.balance(), 15 * ONE_USDC);
    }

    function test_depositRejectsZero() public {
        vm.expectRevert(OlineaVault.ZeroAmount.selector);
        vault.deposit(0);
    }

    /* ----------------------------------------------------------- the happy release */

    function test_releaseWithValidAuthorizationMovesFunds() public {
        _acceptRelease(BOB, ONE_USDC, 1);

        vm.expectEmit(true, false, false, true, address(vault));
        emit Released(BOB, ONE_USDC, 1, vault.authorizationDigest(BOB, ONE_USDC, 1));

        vault.release(BOB, ONE_USDC, 1, hex"deadbeef");

        assertEq(usdc.balanceOf(BOB), ONE_USDC);
        assertEq(vault.balance(), 9 * ONE_USDC);
        assertTrue(vault.nonceUsed(1));
    }

    function test_anyoneCanRelayAValidAuthorization() public {
        _acceptRelease(BOB, ONE_USDC, 7);
        address relayer = makeAddr("relayer");
        vm.prank(relayer);
        vault.release(BOB, ONE_USDC, 7, hex"deadbeef");
        assertEq(usdc.balanceOf(BOB), ONE_USDC);
    }

    /* ------------------------------------------------- the footgun, and its inverse */

    function test_releaseRejectsForgedSignatureThatDoesNotRevert() public {
        // The precompile returns false WITHOUT reverting for a forgery.
        pq.setMode(MockPQ.Mode.AlwaysFalse);

        vm.expectRevert(OlineaVault.InvalidPostQuantumSignature.selector);
        vault.release(BOB, ONE_USDC, 1, hex"deadbeef");

        assertEq(usdc.balanceOf(BOB), 0);
        assertEq(vault.balance(), 10 * ONE_USDC);
    }

    function test_releaseRevertsWhenPrecompileRevertsOnMalformedInput() public {
        pq.setMode(MockPQ.Mode.RevertOnCall);

        vm.expectRevert(OlineaVault.PrecompileCallFailed.selector);
        vault.release(BOB, ONE_USDC, 1, hex"deadbeef");
    }

    /// @notice The reference implementation of the bug: it accepts the forged signature above.
    function test_naiveVaultAcceptsForgery_documentingTheFootgun() public {
        NaiveVault naive = new NaiveVault(IUSDC(address(usdc)), abi.encodePacked(VK), address(pq));
        usdc.mint(address(naive), 10 * ONE_USDC);
        pq.setMode(MockPQ.Mode.AlwaysFalse); // every signature is forged

        naive.release(BOB, ONE_USDC, 1, hex"deadbeef");

        assertEq(usdc.balanceOf(BOB), ONE_USDC, "the naive vault moved funds on a forged signature");
    }

    /* ---------------------------------------------------------------- replay rules */

    function test_nonceCannotBeReused() public {
        _acceptRelease(BOB, ONE_USDC, 1);
        vault.release(BOB, ONE_USDC, 1, hex"deadbeef");

        vm.expectRevert(abi.encodeWithSelector(OlineaVault.NonceAlreadyUsed.selector, 1));
        vault.release(BOB, ONE_USDC, 1, hex"deadbeef");
    }

    function test_authorizationCannotBeReplayedInAnotherVault() public {
        OlineaVault other = new OlineaVault(IUSDC(address(usdc)), abi.encodePacked(VK), address(pq));
        // register the authorization for `other`, not for `vault`
        pq.accept(keccak256(abi.encodePacked(other.authorizationDigest(BOB, ONE_USDC, 1))), true);

        vm.expectRevert(OlineaVault.InvalidPostQuantumSignature.selector);
        vault.release(BOB, ONE_USDC, 1, hex"deadbeef");
    }

    function test_authorizationIsBoundToAmountRecipientAndNonce() public {
        _acceptRelease(BOB, ONE_USDC, 1);

        vm.expectRevert(OlineaVault.InvalidPostQuantumSignature.selector);
        vault.release(ALICE, ONE_USDC, 1, hex"deadbeef");

        vm.expectRevert(OlineaVault.InvalidPostQuantumSignature.selector);
        vault.release(BOB, 2 * ONE_USDC, 1, hex"deadbeef");

        vm.expectRevert(OlineaVault.InvalidPostQuantumSignature.selector);
        vault.release(BOB, ONE_USDC, 2, hex"deadbeef");
    }

    function test_digestBindsChainIdVaultRecipientAmountAndNonce() public {
        bytes32 base = vault.authorizationDigest(BOB, ONE_USDC, 1);
        OlineaVault other = new OlineaVault(IUSDC(address(usdc)), abi.encodePacked(VK), address(pq));

        assertTrue(vault.authorizationDigest(BOB, ONE_USDC, 2) != base, "nonce");
        assertTrue(vault.authorizationDigest(ALICE, ONE_USDC, 1) != base, "recipient");
        assertTrue(vault.authorizationDigest(BOB, 2 * ONE_USDC, 1) != base, "amount");
        assertTrue(other.authorizationDigest(BOB, ONE_USDC, 1) != base, "vault");

        vm.chainId(5042 + 1);
        assertTrue(vault.authorizationDigest(BOB, ONE_USDC, 1) != base, "chain id");
    }

    /* --------------------------------------------------------------------- bounds */

    function test_releaseRejectsAmountAboveBalance() public {
        _acceptRelease(BOB, 11 * ONE_USDC, 1);
        vm.expectRevert(
            abi.encodeWithSelector(OlineaVault.InsufficientBalance.selector, 11 * ONE_USDC, 10 * ONE_USDC)
        );
        vault.release(BOB, 11 * ONE_USDC, 1, hex"deadbeef");
    }

    function test_releaseRejectsZeroAmountAndZeroRecipient() public {
        _acceptRelease(address(0), ONE_USDC, 1);
        vm.expectRevert(OlineaVault.InvalidRecipient.selector);
        vault.release(address(0), ONE_USDC, 1, hex"deadbeef");

        _acceptRelease(BOB, 0, 2);
        vm.expectRevert(OlineaVault.ZeroAmount.selector);
        vault.release(BOB, 0, 2, hex"deadbeef");
    }

    /* ------------------------------------------------- a token that refuses to move */

    /// @notice Circle can deny an address and Arc's USDC then reverts the transfer. A genuine
    ///         authorization cannot get around it, and the nonce rolls back with the revert — so the
    ///         same signed authorization still works once the deny is lifted. This is the largest
    ///         caveat in the project, and this is what it actually does rather than what it implies.
    function test_aDeniedAddressKeepsItsFundsAndItsNonce() public {
        _acceptRelease(BOB, ONE_USDC, 1);
        usdc.setTransfersRevert(true);

        vm.expectRevert(bytes("USDC: address blacklisted"));
        vault.release(BOB, ONE_USDC, 1, hex"deadbeef");

        assertEq(vault.balance(), 10 * ONE_USDC, "the balance is still there to read");
        assertEq(usdc.balanceOf(BOB), 0, "and nothing left the vault");
        assertFalse(vault.nonceUsed(1), "the revert took the nonce back with it");

        usdc.setTransfersRevert(false);
        vault.release(BOB, ONE_USDC, 1, hex"deadbeef");
        assertEq(usdc.balanceOf(BOB), ONE_USDC, "the same authorization works once the deny is lifted");
        assertTrue(vault.nonceUsed(1));
    }

    /// @notice The deny also closes the door on the way in: a denied vault cannot be topped up either.
    function test_aDepositIntoADeniedVaultReverts() public {
        usdc.setTransfersRevert(true);
        vm.expectRevert(bytes("USDC: address blacklisted"));
        vault.deposit(ONE_USDC);
    }

    /* ---------------------------------------------------------------------- fuzz */

    function testFuzz_arbitraryUnauthorizedReleaseAlwaysFails(uint256 amount, uint256 nonce) public {
        amount = bound(amount, 1, 10 * ONE_USDC);
        // no authorization is registered for any (amount, nonce) pair
        vm.expectRevert(OlineaVault.InvalidPostQuantumSignature.selector);
        vault.release(BOB, amount, nonce, hex"deadbeef");
        assertEq(vault.balance(), 10 * ONE_USDC);
    }

    /* ------------------------------------------------------------------- helpers */

    function _acceptRelease(address to, uint256 amount, uint256 nonce) internal {
        pq.accept(keccak256(abi.encodePacked(vault.authorizationDigest(to, amount, nonce))), true);
    }
}

/// @dev Stateless stand-ins etched at the canonical precompile address for the production-path test.
contract TruePQ {
    function verifySlhDsaSha2128s(bytes calldata, bytes calldata, bytes calldata)
        external
        pure
        returns (bool)
    {
        return true;
    }
}

contract FalsePQ {
    function verifySlhDsaSha2128s(bytes calldata, bytes calldata, bytes calldata)
        external
        pure
        returns (bool)
    {
        return false;
    }
}
