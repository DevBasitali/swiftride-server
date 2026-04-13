import { Server } from "socket.io";
import { handleSocketConnection } from "../controllers/socket.controller.js";

let io;

const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://swiftride-frontend.vercel.app",
];

export function initSocket(server, options = {}) {
  io = new Server(server, {
    cors: options.cors ?? {
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (
          ALLOWED_ORIGINS.includes(origin) ||
          origin.endsWith(".vercel.app")
        ) {
          return cb(null, true);
        }
        return cb(new Error("Not allowed by CORS"), false);
      },
      methods: ["GET", "POST"],
      credentials: true,
    },
  });

  io.on("connection", (socket) => handleSocketConnection(io, socket));

  return { server, io };
}

export function getIO() {
  if (!io) throw new Error("Socket.IO not initialized. Call initSocket() first.");
  return io;
}