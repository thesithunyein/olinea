// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {Test} from "forge-std/Test.sol";
import {OlineaFactory} from "../src/OlineaFactory.sol";
import {OlineaVault} from "../src/OlineaVault.sol";
import {MockPQ} from "../src/mocks/MockPQ.sol";
import {MockUSDC} from "../src/mocks/MockUSDC.sol";
import {IUSDC} from "../src/interfaces/IUSDC.sol";

contract OlineaFactoryTest is Test {
    event VaultCreated(
        address indexed owner, address indexed vault, bytes32 indexed verifyingKeyHash, bytes verifyingKey
    );

    address internal constant CANONICAL_PQ = 0x1800000000000000000000000000000000000004;
    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    uint256 internal constant ONE_USDC = 1_000_000; // 6 decimals

    bytes32 internal constant VK = bytes32(uint256(0xA11CE5EED));
    bytes32 internal constant VK2 = bytes32(uint256(0xB0B5EED));

    MockUSDC internal usdc;
    MockPQ internal pq;
    OlineaFactory internal factory;

    function setUp() public {
        usdc = new MockUSDC();
        pq = new MockPQ();
        factory = new OlineaFactory(IUSDC(address(usdc)), address(pq));

        usdc.mint(ALICE, 100 * ONE_USDC);
        usdc.mint(BOB, 100 * ONE_USDC);
    }

    /* --------------------------------------------------------------- configuration */

    function test_createdVaultIsConfiguredWithTheGivenKey() public {
        vm.prank(ALICE);
        OlineaVault vault = OlineaVault(factory.createVault(abi.encodePacked(VK)));

        assertEq(vault.verifyingKey(), abi.encodePacked(VK));
        assertEq(address(vault.usdc()), address(usdc));
        assertEq(vault.pqVerifier(), address(pq));
    }

    /// @dev Production passes address(0) to the factory; the vault resolves it to the precompile.
    function test_factoryCanPointVaultsAtTheCanonicalPrecompile() public {
        OlineaFactory production = new OlineaFactory(IUSDC(address(usdc)), address(0));

        vm.prank(ALICE);
        OlineaVault vault = OlineaVault(production.createVault(abi.encodePacked(VK)));

        assertEq(vault.pqVerifier(), CANONICAL_PQ);
        assertEq(production.verifier(), address(0));
    }

    /* -------------------------------------------------------------------- registry */

    function test_registryAttributesVaultsToTheirCreator() public {
        vm.prank(ALICE);
        address aliceVault = factory.createVault(abi.encodePacked(VK));

        vm.prank(BOB);
        address bobVault = factory.createVault(abi.encodePacked(VK2));

        address[] memory aliceVaults = factory.vaultsOf(ALICE);
        assertEq(aliceVaults.length, 1);
        assertEq(aliceVaults[0], aliceVault);

        address[] memory bobVaults = factory.vaultsOf(BOB);
        assertEq(bobVaults.length, 1);
        assertEq(bobVaults[0], bobVault);

        assertEq(factory.vaultsOf(makeAddr("stranger")).length, 0, "no vaults for an unrelated account");
        assertEq(factory.vaultCount(), 2);
        assertEq(factory.vaultAt(0), aliceVault);
        assertEq(factory.vaultAt(1), bobVault);
        assertTrue(factory.isVault(aliceVault));
        assertFalse(factory.isVault(address(usdc)));
    }

    /// @dev Key rotation is a new vault, so one owner must be able to hold several.
    function test_oneOwnerCanCreateSeveralVaults() public {
        vm.startPrank(ALICE);
        address first = factory.createVault(abi.encodePacked(VK));
        address second = factory.createVault(abi.encodePacked(VK2));
        vm.stopPrank();

        address[] memory vaults = factory.vaultsOf(ALICE);
        assertEq(vaults.length, 2);
        assertEq(vaults[0], first, "oldest first");
        assertEq(vaults[1], second);
        assertTrue(first != second, "each vault is its own contract");
    }

    function test_creatingAVaultEmitsTheKeyItWasCreatedWith() public {
        vm.expectEmit(true, false, false, false, address(factory));
        emit VaultCreated(ALICE, address(0), bytes32(0), "");

        vm.prank(ALICE);
        factory.createVault(abi.encodePacked(VK));
    }

    /* ------------------------------------------------------------- the vault works */

    /// @notice The point of the factory: what it returns is a fully working vault, not a shell.
    function test_vaultCreatedByTheFactoryMovesFunds() public {
        vm.prank(ALICE);
        OlineaVault vault = OlineaVault(factory.createVault(abi.encodePacked(VK)));

        vm.startPrank(ALICE);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(10 * ONE_USDC);
        vm.stopPrank();

        assertEq(vault.balance(), 10 * ONE_USDC);
        assertEq(usdc.balanceOf(address(factory)), 0, "the factory never holds funds");

        // the authorization the app would sign, registered on the stand-in verifier
        pq.accept(keccak256(abi.encodePacked(vault.authorizationDigest(BOB, ONE_USDC, 1))), true);

        // anyone may relay it
        vm.prank(makeAddr("relayer"));
        vault.release(BOB, ONE_USDC, 1, hex"deadbeef");

        assertEq(usdc.balanceOf(BOB), 101 * ONE_USDC, "bob received the release");
        assertEq(vault.balance(), 9 * ONE_USDC);
        assertTrue(vault.nonceUsed(1));
    }

    /// @notice Two vaults from the same owner with different keys are independent.
    function test_vaultsFromOneOwnerDoNotAuthorizeEachOther() public {
        vm.startPrank(ALICE);
        OlineaVault first = OlineaVault(factory.createVault(abi.encodePacked(VK)));
        OlineaVault second = OlineaVault(factory.createVault(abi.encodePacked(VK2)));
        usdc.approve(address(first), type(uint256).max);
        first.deposit(5 * ONE_USDC);
        vm.stopPrank();

        // an authorization for `second` must not release from `first`
        pq.accept(keccak256(abi.encodePacked(second.authorizationDigest(BOB, ONE_USDC, 1))), true);

        vm.expectRevert(OlineaVault.InvalidPostQuantumSignature.selector);
        first.release(BOB, ONE_USDC, 1, hex"deadbeef");

        assertEq(first.balance(), 5 * ONE_USDC);
    }

    /* ------------------------------------------------- what a lost deployer key costs */

    /// @notice The key that deployed the factory cannot be un-lost, and this is why it does not
    ///         matter: a vault is its own contract with no owner and no link back to the factory.
    ///         Erase the factory's code entirely — which is what losing the key means to every vault
    ///         that already exists — and the vault still releases.
    function test_theVaultOutlivesTheFactory() public {
        vm.prank(ALICE);
        OlineaVault vault = OlineaVault(factory.createVault(abi.encodePacked(VK)));

        vm.startPrank(ALICE);
        usdc.approve(address(vault), type(uint256).max);
        vault.deposit(10 * ONE_USDC);
        vm.stopPrank();

        vm.etch(address(factory), new bytes(0)); // the factory, and the key that deployed it, are gone

        pq.accept(keccak256(abi.encodePacked(vault.authorizationDigest(BOB, ONE_USDC, 1))), true);
        vault.release(BOB, ONE_USDC, 1, hex"deadbeef");

        assertEq(usdc.balanceOf(BOB), 101 * ONE_USDC);
        assertEq(vault.balance(), 9 * ONE_USDC);
        assertEq(address(factory).code.length, 0, "and nothing needed to call it");
    }

    /* ------------------------------------------------------- replacing the algorithm */

    /// @notice The only migration a vault has, by design: a release signed by the old key, into a
    ///         vault created with a new one. There is no rotation inside a vault, because rotation
    ///         needs an authority, and an authority is the key this project does not have. So
    ///         "upgrade in five years" is this, from the old vault's side.
    function test_replacingAKeyIsAReleaseIntoTheNewVault() public {
        vm.startPrank(ALICE);
        OlineaVault oldVault = OlineaVault(factory.createVault(abi.encodePacked(VK)));
        usdc.approve(address(oldVault), type(uint256).max);
        oldVault.deposit(10 * ONE_USDC);
        OlineaVault newVault = OlineaVault(factory.createVault(abi.encodePacked(VK2)));
        vm.stopPrank();

        // every last unit, to the replacement, authorized by the old key
        pq.accept(
            keccak256(abi.encodePacked(oldVault.authorizationDigest(address(newVault), 10 * ONE_USDC, 0))),
            true
        );
        oldVault.release(address(newVault), 10 * ONE_USDC, 0, hex"deadbeef");

        assertEq(newVault.balance(), 10 * ONE_USDC, "the replacement holds everything the old one did");
        assertEq(oldVault.balance(), 0, "and the old one holds nothing");
        assertTrue(oldVault.nonceUsed(0));

        // the old key is now empty; the new vault answers to the new one
        pq.setMode(MockPQ.Mode.AlwaysFalse);
        vm.expectRevert(OlineaVault.InvalidPostQuantumSignature.selector);
        newVault.release(BOB, ONE_USDC, 0, hex"deadbeef");
    }

    /* -------------------------------------------------------------------- inputs */

    function test_createVaultRejectsAKeyThatIsNot32Bytes() public {
        vm.expectRevert(abi.encodeWithSelector(OlineaVault.InvalidVerifyingKeyLength.selector, 31));
        factory.createVault(new bytes(31));

        vm.expectRevert(abi.encodeWithSelector(OlineaVault.InvalidVerifyingKeyLength.selector, 33));
        factory.createVault(new bytes(33));

        vm.expectRevert(abi.encodeWithSelector(OlineaVault.InvalidVerifyingKeyLength.selector, 0));
        factory.createVault("");
    }

    function testFuzz_onlyA32ByteKeyCreatesAVault(uint8 length) public {
        vm.assume(length != 32);
        bytes memory key = new bytes(length);

        vm.expectRevert(abi.encodeWithSelector(OlineaVault.InvalidVerifyingKeyLength.selector, length));
        factory.createVault(key);

        assertEq(factory.vaultCount(), 0, "a rejected key leaves no vault behind");
    }

    function testFuzz_anyKeyOfTheRightLengthIsAccepted(bytes32 key) public {
        vm.prank(ALICE);
        OlineaVault vault = OlineaVault(factory.createVault(abi.encodePacked(key)));

        assertEq(vault.verifyingKey(), abi.encodePacked(key));
        assertEq(factory.vaultCount(), 1);
    }
}
