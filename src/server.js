import dotenv from "dotenv";
dotenv.config();

import http from "http";
import os from "os";

// Dynamically get the local network IP (works even when router reassigns)
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const iface of Object.values(nets)) {
    for (const net of iface) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "localhost";
}
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
      const localIP = getLocalIP();
      console.log(`SwiftRide API running on http://${localIP}:${PORT}/api/`);
      console.log(`Socket.IO running on http://${localIP}:${PORT}`);
      console.log(`👉 Update android/.env → EXPO_PUBLIC_SERVER_IP=${localIP}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

startServer();

// Trigger nodemon restart
