import cors from "cors";
import dotenv from "dotenv";
import type { Express, Request, Response } from "express";
import express from "express";
import { createServer, Server as HTTPServer } from "http";
import { dirname, join } from "path";
import { Server as IOServer } from "socket.io";
import { fileURLToPath } from "url";
import { DatabaseManager, Player } from "./core/database";
import { GameEngine } from "./core/engine";
import { SocketManager } from "./core/socket";
import routes from "./routes/index";
import { CryptoService } from "./services/crypto";
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class Application {
  app: Express;
  server: HTTPServer;
  io: IOServer;
  port: number;
  cryptoService!: CryptoService;
  gameEngine!: GameEngine;
  socketManager!: SocketManager;

  constructor() {
    this.app = express();
    this.server = createServer(this.app);
    this.io = new IOServer(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"],
        credentials: true,
      },
    });
    this.port = Number(process.env.PORT) || 3000;
    this.init();
  }

  async init(): Promise<void> {
    this.setupMiddleware();
    await this.connectDatabase();
    await this.seedInitialData();
    this.setupServices();
    this.setupRoutes();
    this.setupSocketHandlers();
    this.startEngine();
    this.setupHealthCheck();
  }

  setupMiddleware(): void {
    this.app.use(
      cors({
        origin: "*",
        credentials: true,
      })
    );
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.static(join(__dirname, "public")));

    this.app.use((req: Request, res: Response, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS"
      );
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      next();
    });
  }

  async connectDatabase(): Promise<void> {
    const mongoUri = process.env.MONGODB_URI || "";
    await DatabaseManager.connect(mongoUri);
  }

  async seedInitialData(): Promise<void> {
    try {
      const existingPlayers = await Player.countDocuments();
      if (existingPlayers === 0) {
        const defaultPlayers = [
          { playerName: "demo", wallet: { BTC: 0.1, ETH: 2.0 } },
          { playerName: "player1", wallet: { BTC: 0.05, ETH: 1.5 } },
          { playerName: "player2", wallet: { BTC: 0.08, ETH: 2.5 } },
          { playerName: "test", wallet: { BTC: 0.15, ETH: 3.0 } },
          { playerName: "guest", wallet: { BTC: 0.2, ETH: 5.0 } },
        ];
        await Player.insertMany(defaultPlayers);
        console.log("Initial player data seeded");
      }
    } catch (error) {
      console.error("Seeding error:", error);
    }
  }

  setupServices(): void {
    this.cryptoService = new CryptoService();
    this.gameEngine = new GameEngine(this.io, this.cryptoService);
    this.socketManager = new SocketManager(this.io, this.gameEngine);
  }

  setupRoutes(): void {
    this.app.use("/api", routes(this.gameEngine, this.cryptoService));
    this.app.get("/", (req: Request, res: Response) => {
      res.sendFile(join(__dirname, "public", "index.html"));
    });
  }

  setupSocketHandlers(): void {
    if (typeof this.socketManager.initialize === "function") {
      this.socketManager.initialize();
    }
  }

  setupHealthCheck(): void {
    this.app.get("/health", (req: Request, res: Response) => {
      if (typeof this.gameEngine.getCurrentState === "function") {
        res.json({
          status: "healthy",
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          gameState: this.gameEngine.getCurrentState(),
        });
      } else {
        res.json({
          status: "healthy",
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
        });
      }
    });
  }

  startEngine(): void {
    if (typeof this.gameEngine.start === "function") {
      this.gameEngine.start();
    }
  }

  listen(): void {
    this.server.listen(this.port, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${this.port}`);
      console.log(`🌐 Environment: ${process.env.NODE_ENV || "development"}`);
      console.log(`📊 Health check: /health`);
    });
  }
}

const app = new Application();
app.listen();

process.on("SIGTERM", () => {
  console.log("SIGTERM received, shutting down gracefully");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("SIGINT received, shutting down gracefully");
  process.exit(0);
});
