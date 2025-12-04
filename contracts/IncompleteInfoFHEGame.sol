// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract IncompleteInfoFHEGame is SepoliaConfig {
    struct EncryptedGameState {
        uint256 gameId;
        euint32 encryptedBoard; // Encrypted board state
        euint32 encryptedTurn;  // Encrypted turn information
        uint256 timestamp;
    }

    struct DecryptedGameState {
        string board;
        string turn;
        bool isRevealed;
    }

    uint256 public gameCount;
    mapping(uint256 => EncryptedGameState) public encryptedGames;
    mapping(uint256 => DecryptedGameState) public decryptedGames;

    mapping(string => euint32) private encryptedWinCounts;
    string[] private playerList;
    mapping(uint256 => uint256) private requestToGameId;

    event GameCreated(uint256 indexed gameId, uint256 timestamp);
    event DecryptionRequested(uint256 indexed gameId);
    event GameDecrypted(uint256 indexed gameId);

    modifier onlyPlayer(uint256 gameId) {
        // Placeholder access control
        _;
    }

    /// @notice Create a new encrypted game
    function createEncryptedGame(
        euint32 encryptedBoard,
        euint32 encryptedTurn
    ) public {
        gameCount += 1;
        uint256 newGameId = gameCount;

        encryptedGames[newGameId] = EncryptedGameState({
            gameId: newGameId,
            encryptedBoard: encryptedBoard,
            encryptedTurn: encryptedTurn,
            timestamp: block.timestamp
        });

        decryptedGames[newGameId] = DecryptedGameState({
            board: "",
            turn: "",
            isRevealed: false
        });

        emit GameCreated(newGameId, block.timestamp);
    }

    /// @notice Request decryption of a game state
    function requestGameDecryption(uint256 gameId) public onlyPlayer(gameId) {
        EncryptedGameState storage game = encryptedGames[gameId];
        require(!decryptedGames[gameId].isRevealed, "Already decrypted");

        bytes32[] memory ciphertexts = new bytes32[](2);
        ciphertexts[0] = FHE.toBytes32(game.encryptedBoard);
        ciphertexts[1] = FHE.toBytes32(game.encryptedTurn);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptGame.selector);
        requestToGameId[reqId] = gameId;

        emit DecryptionRequested(gameId);
    }

    /// @notice Callback for decrypted game data
    function decryptGame(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 gameId = requestToGameId[requestId];
        require(gameId != 0, "Invalid request");

        EncryptedGameState storage eGame = encryptedGames[gameId];
        DecryptedGameState storage dGame = decryptedGames[gameId];
        require(!dGame.isRevealed, "Already decrypted");

        FHE.checkSignatures(requestId, cleartexts, proof);

        string[] memory results = abi.decode(cleartexts, (string[]));
        dGame.board = results[0];
        dGame.turn = results[1];
        dGame.isRevealed = true;

        // Update player win count if necessary
        if (FHE.isInitialized(encryptedWinCounts[results[1]]) == false) {
            encryptedWinCounts[results[1]] = FHE.asEuint32(0);
            playerList.push(results[1]);
        }
        encryptedWinCounts[results[1]] = FHE.add(
            encryptedWinCounts[results[1]],
            FHE.asEuint32(1)
        );

        emit GameDecrypted(gameId);
    }

    /// @notice Get decrypted game details
    function getDecryptedGame(uint256 gameId) public view returns (
        string memory board,
        string memory turn,
        bool isRevealed
    ) {
        DecryptedGameState storage g = decryptedGames[gameId];
        return (g.board, g.turn, g.isRevealed);
    }

    /// @notice Get encrypted win count
    function getEncryptedWinCount(string memory player) public view returns (euint32) {
        return encryptedWinCounts[player];
    }

    /// @notice Request win count decryption
    function requestWinCountDecryption(string memory player) public {
        euint32 count = encryptedWinCounts[player];
        require(FHE.isInitialized(count), "Player not found");

        bytes32[] memory ciphertexts = new bytes32[](1);
        ciphertexts[0] = FHE.toBytes32(count);

        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptWinCount.selector);
        requestToGameId[reqId] = bytes32ToUint(keccak256(abi.encodePacked(player)));
    }

    /// @notice Callback for decrypted win count
    function decryptWinCount(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 playerHash = requestToGameId[requestId];
        string memory player = getPlayerFromHash(playerHash);

        FHE.checkSignatures(requestId, cleartexts, proof);

        uint32 count = abi.decode(cleartexts, (uint32));
        // Handle decrypted count as needed
    }

    function bytes32ToUint(bytes32 b) private pure returns (uint256) {
        return uint256(b);
    }

    function getPlayerFromHash(uint256 hash) private view returns (string memory) {
        for (uint i = 0; i < playerList.length; i++) {
            if (bytes32ToUint(keccak256(abi.encodePacked(playerList[i]))) == hash) {
                return playerList[i];
            }
        }
        revert("Player not found");
    }
}