const { createServer } = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
require("dotenv").config();

const PORT = process.env.PORT || 3000; // Use the port provided by Render or fallback to 3000
const CLIENT = process.env.CLIENT; // Ensure this environment variable is set in Render

const express = require("express"); // Use express to handle HTTP routes
const app = express();
app.use(cors());

app.get("/", (req, res) => {
  res.send("Server is up and running");
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: CLIENT,
    methods: ["GET", "POST"]
  },
});

const allUsers = {};
const allRooms = [];

httpServer.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});

io.on("connection", (socket) => {
  allUsers[socket.id] = {
    socket: socket,
    online: true,
    playing: false,
  };

  socket.on("request_to_play", (data) => {
    const currentUser = allUsers[socket.id];
    currentUser.playerName = data.playerName;

    let opponentPlayer;

    for (const key in allUsers) {
      const user = allUsers[key];
      if (user.online && !user.playing && socket.id !== key) {
        opponentPlayer = user;
        break;
      }
    }

    if (opponentPlayer) {
      currentUser.playing = true;
      opponentPlayer.playing = true;

      allRooms.push({
        player1: opponentPlayer,
        player2: currentUser,
      });

      currentUser.socket.emit("OpponentFound", {
        opponentName: opponentPlayer.playerName,
        opponentSocketId: opponentPlayer.socket.id,
        playingAs: "circle",
      });

      opponentPlayer.socket.emit("OpponentFound", {
        opponentName: currentUser.playerName,
        opponentSocketId: currentUser.socket.id,
        playingAs: "cross",
      });

      const handlePlayerMoveFromClient = (data) => {
        opponentPlayer.socket.emit("playerMoveFromServer", data);
      };

      const handleOpponentPlayerMoveFromClient = (data) => {
        currentUser.socket.emit("playerMoveFromServer", data);
      };

      currentUser.socket.on("playerMoveFromClient", handlePlayerMoveFromClient);
      opponentPlayer.socket.on("playerMoveFromClient", handleOpponentPlayerMoveFromClient);

      socket.on("disconnect", () => {
        opponentPlayer.socket.emit("opponentLeftMatch");
        opponentPlayer.playing = false;

        // Clean up listeners
        currentUser.socket.off("playerMoveFromClient", handlePlayerMoveFromClient);
        opponentPlayer.socket.off("playerMoveFromClient", handleOpponentPlayerMoveFromClient);

        // Remove room
        const roomIndex = allRooms.findIndex(room => room.player1 === opponentPlayer || room.player2 === opponentPlayer);
        if (roomIndex !== -1) {
          allRooms.splice(roomIndex, 1);
        }
      });
    } else {
      currentUser.socket.emit("OpponentNotFound");
    }
  });

  socket.on("request_to_reset", (data) => {
    const currentUser = allUsers[socket.id];
    const opponent = allUsers[data.opponentId];
    opponent.socket.emit("reset_from_server");
    currentUser.socket.emit("reset_from_server");
  });

  socket.on("disconnect", () => {
    const currentUser = allUsers[socket.id];
    currentUser.online = false;
    currentUser.playing = false;

    for (let index = 0; index < allRooms.length; index++) {
      const { player1, player2 } = allRooms[index];

      if (player1.socket.id === socket.id) {
        player2.socket.emit("opponentLeftMatch");
        player2.playing = false;
        allRooms.splice(index, 1);
        break;
      }

      if (player2.socket.id === socket.id) {
        player1.socket.emit("opponentLeftMatch");
        player1.playing = false;
        allRooms.splice(index, 1);
        break;
      }
    }
  });
});
