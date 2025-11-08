const http = require("http");
const express = require("express");
const path = require('path');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

/*
// Socket.io
io.on("connection", (socket) => {
  socket.on('user-message', (message) => {
    socket.broadcast.emit("message", message);
    console.log(`User : ${socket.id} sent a message ${message}`);
  });
  
});
*/

const PORT = 9000;
app.use(express.static(path.resolve("./Git_Projects/"))); // To get absolute path

// Serve the index.html file
app.get("/", (req, res) => {
  res.sendFile("/Git_Projects/Project_3/frontend/roll_updat.html");
});

/*
server.listen(port, () => {
  console.log(`listening on ${port}`);
});
*/

// ---
// Backend Server for Roll Higher (server.js)
// ---
// This server now manages multiple game rooms.
// 1. Make sure you have Node.js installed.
// 2. In your terminal, run: npm install express socket.io
// 3. Then, run: node server.js
// 4. Open http://localhost:3000 in two different browser tabs.
// ---

// --- Game State (Server-Side) ---
// We now store all game states in an object, indexed by roomId.
let games = {};
// We also need to map socket IDs to their room to find them easily.
let playerRooms = {};

/**
 * Generates a unique 6-digit room ID.
 */
function generateRoomId() {
    let id = Math.floor(100000 + Math.random() * 900000).toString();
    // Ensure it's unique (unlikely collision, but good practice)
    while (games[id]) {
        id = Math.floor(100000 + Math.random() * 900000).toString();
    }
    return id;
}

/**
 * Creates a new, blank game state object.
 */
function createNewGameState() {
    return {
        scores: [0, 0],       // [P1 Wins, P2 Wins]
        currentrollp1: 0,     // Index for P1's current ball
        currentrollp2: 0,     // Index for P2's current ball
        p1RoundRolls: ['', '', ''], // Store P1's rolls for the scorecard
        p2RoundRolls: ['', '', ''], // Store P2's rolls for the scorecard
        currentRound: 1,      // Current round number (1 to 3)
        currentPlayer: 1,     // Current player (1 or 2)
        roundDice: [0, 0],    // [P1 Roll, P2 Roll] for the current round
        isGameOver: false,
        winner: null,         // Final winner (1 or 2 or 0 for tie)
        diceSymbols: ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'],
        message: "Waiting for Player 1 to connect...",
        players: { 1: null, 2: null } // Stores socket.id for P1 and P2
    };
}

/**
 * Generates a random number between 1 and 6 (inclusive).
 */
function rollDice() {
    return Math.floor(Math.random() * 6) + 1;
}

/**
 * Resolves the round for a specific game.
 */
function resolveRound(game) {
    const p1Roll = game.roundDice[0];
    const p2Roll = game.roundDice[1];
    let roundMsg;

    if (p1Roll > p2Roll) {
        game.scores[0]++;
        roundMsg = `Player 1 wins Round ${game.currentRound} with ${p1Roll} against ${p2Roll}!`;
    } else if (p2Roll > p1Roll) {
        game.scores[1]++;
        roundMsg = `Player 2 wins Round ${game.currentRound} with ${p2Roll} against ${p1Roll}!`;
    } else {
        roundMsg = `Round ${game.currentRound} is a tie! Both players rolled ${p1Roll}.`;
    }

    // Check for game over condition
    checkGameOver(game, roundMsg);
}

/**
 * Checks for game over in a specific game.
 */
function checkGameOver(game, roundMsg) {
    const p1Wins = game.scores[0];
    const p2Wins = game.scores[1];

    if (p1Wins >= 2 || p2Wins >= 2 || game.currentRound === 3) {
        // Determine Final Winner
        if (p1Wins > p2Wins) {
            game.winner = 1;
            game.message = `${roundMsg} 🔥 Player 1 WINS THE GAME with ${p1Wins} round wins!`;
        } else if (p2Wins > p1Wins) {
            game.winner = 2;
            game.message = `${roundMsg} 🔥 Player 2 WINS THE GAME with ${p2Wins} round wins!`;
        } else {
            game.winner = 0;
            game.message = `${roundMsg} The game ends in a tie! Both players won ${p1Wins} rounds.`;
        }
        game.isGameOver = true;
    } else {
        // Game continues to next round
        game.currentRound++;
        game.currentrollp1++;
        game.currentrollp2++;
        game.currentPlayer = 1;
        game.roundDice = [0, 0];
        game.message = `${roundMsg} Now starting Round ${game.currentRound}. Player 1, roll the dice.`;
    }
}

// --- Socket.io Connection Logic ---
io.on('connection', (socket) => {
    console.log(`A user connected: ${socket.id}`);

    // --- Lobby Handlers ---
    socket.on('createRoom', () => {
        const roomId = generateRoomId();
        playerRooms[socket.id] = roomId; // Map this player to the room
        games[roomId] = createNewGameState(); // Create the game state
        
        games[roomId].players[1] = socket.id; // Assign as Player 1
        
        socket.join(roomId); // Put the socket in the socket.io room
        
        // Tell the creator their room ID and player number
        socket.emit('roomCreated', roomId);
        socket.emit('playerAssignment', 1);
        
        games[roomId].message = "Player 1 joined. Waiting for Player 2...";
        socket.emit('updateState', games[roomId]); // Send initial state
    });

    socket.on('joinRoom', (roomId) => {
        if (!games[roomId]) {
            socket.emit('errorMessage', 'Room not found. Please check the ID.');
            return;
        }

        if (games[roomId].players[2]) {
            socket.emit('errorMessage', 'This room is full.');
            return;
        }

        playerRooms[socket.id] = roomId; // Map this player
        games[roomId].players[2] = socket.id; // Assign as Player 2
        
        socket.join(roomId); // Join the socket.io room
        
        socket.emit('playerAssignment', 2); // Tell them they are P2
        
        games[roomId].message = "Player 2 joined! Player 1, roll to start.";
        
        // Tell *everyone* in the room the game is starting
        // This tells the client to hide the lobby and show the game
        io.to(roomId).emit('gameStart', games[roomId]);
    });


    // --- Game Handlers ---
    socket.on('roll', () => {
        const roomId = playerRooms[socket.id];
        // Ignore if player isn't in a room or game
        if (!roomId || !games[roomId]) return; 
        
        let game = games[roomId];

        // Check if the game is over or if it's the wrong player
        if (game.isGameOver || game.players[game.currentPlayer] !== socket.id) {
            return; // Ignore the roll
        }

        const roll = rollDice();

        if (game.currentPlayer === 1) {
            game.roundDice[0] = roll;
            game.p1RoundRolls[game.currentrollp1] = roll;
            game.currentPlayer = 2;
            game.message = `Player 1 rolled a ${roll}. Player 2, roll to finish Round ${game.currentRound}.`;
        } else {
            game.roundDice[1] = roll;
            game.p2RoundRolls[game.currentrollp2] = roll;
            resolveRound(game); // Pass the specific game state
        }

        // Broadcast the updated state to this room ONLY
        io.to(roomId).emit('updateState', game);
    });

    socket.on('restart', () => {
        const roomId = playerRooms[socket.id];
        if (!roomId || !games[roomId]) return;

        let game = games[roomId];
        let p1SocketId = game.players[1];
        let p2SocketId = game.players[2];

        // Create a new game state for this room
        games[roomId] = createNewGameState();
        let newGame = games[roomId];

        // Re-assign players if they are still connected
        if (p1SocketId && io.sockets.sockets.get(p1SocketId)) {
            newGame.players[1] = p1SocketId;
        }
        if (p2SocketId && io.sockets.sockets.get(p2SocketId)) {
            newGame.players[2] = p2SocketId;
        }

        // Handle cases where one player disconnected
        if (newGame.players[1] && newGame.players[2]) {
            newGame.message = "Both players ready! Player 1, roll to start.";
        } else if (newGame.players[1]) {
            newGame.message = "Player 1 is ready. Waiting for Player 2...";
        } else if (newGame.players[2]) {
            // If only P2 is left, make them P1
            newGame.players[1] = newGame.players[2];
            newGame.players[2] = null;
            playerRooms[newGame.players[1]] = roomId; // Update map
            newGame.message = "Player 1 is ready. Waiting for Player 2...";
            // Tell that player they are P1 now
            io.to(newGame.players[1]).emit('playerAssignment', 1);
        } else {
            // No players left
            delete games[roomId]; // Clean up the empty room
            return; // Don't broadcast
        }

        // Broadcast the new game state to the room
        io.to(roomId).emit('updateState', newGame);
    });

    // Handle disconnections
    socket.on('disconnect', () => {
        console.log(`A user disconnected: ${socket.id}`);
        const roomId = playerRooms[socket.id];
        if (!roomId || !games[roomId]) {
            // Player wasn't in a room, nothing to do
            return;
        }
        
        let game = games[roomId];
        const playerNum = game.players[1] === socket.id ? 1 : (game.players[2] === socket.id ? 2 : 0);
        
        delete playerRooms[socket.id]; // Remove from mapping
        
        if (playerNum > 0) {
            game.players[playerNum] = null;
        }

        // Check if room is now empty
        if (!game.players[1] && !game.players[2]) {
            console.log(`Room ${roomId} is empty. Deleting.`);
            delete games[roomId]; // Clean up
        } else {
            // Tell the other player
            game.isGameOver = true;
            game.message = `Player ${playerNum} disconnected. Game over.`;
            // Broadcast to the remaining player in the room
            io.to(roomId).emit('updateState', game);
        }
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}`);
});