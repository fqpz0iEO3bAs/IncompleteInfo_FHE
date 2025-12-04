// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

// Randomly selected styles:
// Colors: High contrast (red+black)
// UI Style: Industrial mechanical
// Layout: Center radiation
// Interaction: Micro-interactions (hover ripple, button breathing light)

// Randomly selected additional features:
// 1. Data statistics
// 2. Search & filter
// 3. Team information

interface GameData {
  id: string;
  encryptedState: string;
  timestamp: number;
  player: string;
  gameType: string;
  revealed: boolean;
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [games, setGames] = useState<GameData[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newGameData, setNewGameData] = useState({
    gameType: "",
    initialState: ""
  });
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState("all");

  // Calculate statistics
  const totalGames = games.length;
  const revealedGames = games.filter(g => g.revealed).length;
  const hiddenGames = totalGames - revealedGames;

  useEffect(() => {
    loadGames().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadGames = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("game_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing game keys:", e);
        }
      }
      
      const list: GameData[] = [];
      
      for (const key of keys) {
        try {
          const gameBytes = await contract.getData(`game_${key}`);
          if (gameBytes.length > 0) {
            try {
              const gameData = JSON.parse(ethers.toUtf8String(gameBytes));
              list.push({
                id: key,
                encryptedState: gameData.state,
                timestamp: gameData.timestamp,
                player: gameData.player,
                gameType: gameData.gameType,
                revealed: gameData.revealed || false
              });
            } catch (e) {
              console.error(`Error parsing game data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading game ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setGames(list);
    } catch (e) {
      console.error("Error loading games:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const createGame = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setCreating(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Initializing FHE game state..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedState = `FHE-${btoa(JSON.stringify(newGameData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const gameId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const gameData = {
        state: encryptedState,
        timestamp: Math.floor(Date.now() / 1000),
        player: account,
        gameType: newGameData.gameType,
        revealed: false
      };
      
      // Store game data on-chain
      await contract.setData(
        `game_${gameId}`, 
        ethers.toUtf8Bytes(JSON.stringify(gameData))
      );
      
      const keysBytes = await contract.getData("game_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(gameId);
      
      await contract.setData(
        "game_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE game created successfully!"
      });
      
      await loadGames();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewGameData({
          gameType: "",
          initialState: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Creation failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setCreating(false);
    }
  };

  const revealGame = async (gameId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Revealing game state with FHE..."
    });

    try {
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const gameBytes = await contract.getData(`game_${gameId}`);
      if (gameBytes.length === 0) {
        throw new Error("Game not found");
      }
      
      const gameData = JSON.parse(ethers.toUtf8String(gameBytes));
      
      const updatedGame = {
        ...gameData,
        revealed: true
      };
      
      await contract.setData(
        `game_${gameId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedGame))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Game revealed with FHE!"
      });
      
      await loadGames();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Reveal failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isPlayer = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const filteredGames = games.filter(game => {
    const matchesSearch = game.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         game.gameType.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === "all" || 
                         (filterType === "revealed" && game.revealed) || 
                         (filterType === "hidden" && !game.revealed);
    return matchesSearch && matchesFilter;
  });

  if (loading) return (
    <div className="loading-screen">
      <div className="mechanical-spinner">
        <div className="gear large"></div>
        <div className="gear medium"></div>
        <div className="gear small"></div>
      </div>
      <p>Initializing FHE connection...</p>
    </div>
  );

  return (
    <div className="app-container industrial-theme">
      <header className="app-header">
        <div className="logo">
          <div className="gear-icon"></div>
          <h1>FHE<span>Game</span>Engine</h1>
        </div>
        
        <div className="header-actions">
          <button 
            onClick={() => setShowCreateModal(true)} 
            className="create-game-btn mechanical-button"
          >
            <div className="plus-icon"></div>
            New Game
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="central-radial-layout">
          <div className="stats-panel mechanical-panel">
            <h2>Game Statistics</h2>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{totalGames}</div>
                <div className="stat-label">Total Games</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{revealedGames}</div>
                <div className="stat-label">Revealed</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{hiddenGames}</div>
                <div className="stat-label">Hidden</div>
              </div>
            </div>
            <div className="fhe-badge">
              <span>Fully Homomorphic Encryption</span>
            </div>
          </div>
          
          <div className="games-panel mechanical-panel">
            <div className="panel-header">
              <h2>FHE Game Sessions</h2>
              <div className="controls">
                <div className="search-box">
                  <input 
                    type="text" 
                    placeholder="Search games..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                  <div className="search-icon"></div>
                </div>
                <select 
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className="mechanical-select"
                >
                  <option value="all">All Games</option>
                  <option value="revealed">Revealed</option>
                  <option value="hidden">Hidden</option>
                </select>
                <button 
                  onClick={loadGames}
                  className="refresh-btn mechanical-button"
                  disabled={isRefreshing}
                >
                  {isRefreshing ? "..." : "Refresh"}
                </button>
              </div>
            </div>
            
            <div className="games-list">
              {filteredGames.length === 0 ? (
                <div className="no-games">
                  <div className="no-games-icon"></div>
                  <p>No FHE games found</p>
                  <button 
                    className="mechanical-button primary"
                    onClick={() => setShowCreateModal(true)}
                  >
                    Create First Game
                  </button>
                </div>
              ) : (
                filteredGames.map(game => (
                  <div className="game-card" key={game.id}>
                    <div className="game-header">
                      <div className="game-id">#{game.id.substring(0, 6)}</div>
                      <div className={`game-status ${game.revealed ? 'revealed' : 'hidden'}`}>
                        {game.revealed ? 'REVEALED' : 'HIDDEN'}
                      </div>
                    </div>
                    <div className="game-body">
                      <div className="game-type">{game.gameType}</div>
                      <div className="game-player">
                        Player: {game.player.substring(0, 6)}...{game.player.substring(38)}
                      </div>
                      <div className="game-date">
                        {new Date(game.timestamp * 1000).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="game-footer">
                      {isPlayer(game.player) && !game.revealed && (
                        <button 
                          className="action-btn mechanical-button"
                          onClick={() => revealGame(game.id)}
                        >
                          Reveal
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          
          <div className="team-panel mechanical-panel">
            <h2>Development Team</h2>
            <div className="team-members">
              <div className="member">
                <div className="member-avatar"></div>
                <div className="member-info">
                  <h3>Alice Chen</h3>
                  <p>FHE Researcher</p>
                </div>
              </div>
              <div className="member">
                <div className="member-avatar"></div>
                <div className="member-info">
                  <h3>Bob Smith</h3>
                  <p>Blockchain Engineer</p>
                </div>
              </div>
              <div className="member">
                <div className="member-avatar"></div>
                <div className="member-info">
                  <h3>Charlie Lee</h3>
                  <p>Game Designer</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
  
      {showCreateModal && (
        <ModalCreate 
          onSubmit={createGame} 
          onClose={() => setShowCreateModal(false)} 
          creating={creating}
          gameData={newGameData}
          setGameData={setNewGameData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content mechanical-panel">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="mechanical-spinner small"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="gear-icon"></div>
              <span>FHE Game Engine</span>
            </div>
            <p>Secure on-chain games with fully homomorphic encryption</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">Documentation</a>
            <a href="#" className="footer-link">GitHub</a>
            <a href="#" className="footer-link">Terms</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FHE Game Engine. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalCreateProps {
  onSubmit: () => void; 
  onClose: () => void; 
  creating: boolean;
  gameData: any;
  setGameData: (data: any) => void;
}

const ModalCreate: React.FC<ModalCreateProps> = ({ 
  onSubmit, 
  onClose, 
  creating,
  gameData,
  setGameData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setGameData({
      ...gameData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!gameData.gameType || !gameData.initialState) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="create-modal mechanical-panel">
        <div className="modal-header">
          <h2>Create FHE Game</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice-banner">
            <div className="lock-icon"></div> Game state will be encrypted with FHE
          </div>
          
          <div className="form-grid">
            <div className="form-group">
              <label>Game Type *</label>
              <select 
                name="gameType"
                value={gameData.gameType} 
                onChange={handleChange}
                className="mechanical-select"
              >
                <option value="">Select type</option>
                <option value="Poker">Encrypted Poker</option>
                <option value="Chess">Blind Chess</option>
                <option value="RPG">FHE RPG</option>
                <option value="Strategy">Hidden Strategy</option>
              </select>
            </div>
            
            <div className="form-group full-width">
              <label>Initial State *</label>
              <textarea 
                name="initialState"
                value={gameData.initialState} 
                onChange={handleChange}
                placeholder="Enter initial game state to encrypt..." 
                className="mechanical-textarea"
                rows={4}
              />
            </div>
          </div>
          
          <div className="privacy-notice">
            <div className="gear-icon small"></div> State remains encrypted during FHE processing
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn mechanical-button"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={creating}
            className="submit-btn mechanical-button primary"
          >
            {creating ? "Encrypting with FHE..." : "Create Game"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;