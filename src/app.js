//=====================
// below is the code for vercel deployment
//=====================
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import apiRoutes from "./routes/index.js";
import { notFoundHandler, errorHandler } from "./middlewares/error.middleware.js";

// 1. IMPORT DB CONNECTION HERE
import connectDB from "./config/db.js";

const app = express();
app.set("trust proxy", 1);

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://swiftride-frontend.vercel.app",
];

const corsOptions = {
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (
      allowedOrigins.includes(origin) ||
      origin.endsWith(".vercel.app")
    ) {
      return cb(null, true);
    }
    return cb(new Error("Not allowed by CORS"), false);
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // IMPORTANT
app.use((req, res, next) => {
  res.setHeader("X-From-App", "swiftride-express");
  next();
});



// Regular Middleware
app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(morgan("dev"));

// Serve uploaded files as static assets
// app.use('/uploads', express.static('uploads'));

// 3. ADD DB CONNECTION MIDDLEWARE
app.use(async (req, res, next) => {
  if (req.method === "OPTIONS") return next();
  try {
    await connectDB();
    next();
  } catch (err) {
    next(err);
  }
});


app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "swiftride-api 0.0.0" });
});

app.use("/api", apiRoutes);

app.use(notFoundHandler);
app.use(errorHandler);

export default app;