import dotenv from "dotenv";
dotenv.config();

import http from "http";
import app from "./app.js";
import connectDB from "./config/db.js";
import { initSocket } from "./socket/socket.server.js"; 

const PORT = process.env.PORT || 5000;

async function startServer() {
  try {
    await connectDB();

    const server = http.createServer(app);

    // Attach Socket.IO here
    initSocket(server);

    server.listen(PORT, "0.0.0.0", () => {
      console.log(`SwiftRide API running on http://192.168.1.7:${PORT}/api/`);
      console.log(`Socket.IO running on http://192.168.1.7:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();

// Trigger nodemon restart
