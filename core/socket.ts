import { Server as IOServer } from "socket.io";
import { GameEngine } from "./engine";

export class SocketManager {
  io: IOServer;
  gameEngine: GameEngine;
  connectedPlayers: Map<string, string>;
  connectionCount: number;
  messageRateLimit: Map<string, number[]>;
  rateLimitWindow: number;
  maxMessagesPerWindow: number;

  constructor(io: IOServer, gameEngine: GameEngine) {
    this.io = io;
    this.gameEngine = gameEngine;
    this.connectedPlayers = new Map();
    this.connectionCount = 0;
    this.messageRateLimit = new Map();
    this.rateLimitWindow = 1000;
    this.maxMessagesPerWindow = 10;
  }

  public initialize(): void {
    this.io.on("connection", (socket) => {
      this.handleConnection(socket);
    });

    setInterval(() => {
      this.cleanupRateLimits();
    }, this.rateLimitWindow);

    console.log("🔌 Socket manager initialized");
  }

  public handleConnection(socket: any): void {
    this.connectionCount++;
    console.log(`👤 Player connected (${this.connectionCount} total)`);
    socket.on("join_game", (data: any) => {
      this.handleJoinGame(socket, data);
    });
    socket.on("cashout_request", (data: any) => {
      if (this.isRateLimited(socket.id)) {
        socket.emit("error", { message: "Rate limited" });
        return;
      }
      this.handleCashoutRequest(socket, data);
    });
    socket.on("get_game_state", () => {
      socket.emit("game_state", this.gameEngine.getCurrentState());
    });
    socket.on("disconnect", () => {
      this.handleDisconnect(socket);
    });
    socket.emit("game_state", this.gameEngine.getCurrentState());
    socket.emit("welcome", {
      message: "Connected to Crypto Crash Game",
      timestamp: Date.now(),
    });
  }
  public handleJoinGame(socket: any, data: any): void {
    if (!data?.playerName) {
      socket.emit("error", { message: "Invalid player ID" });
      return;
    }
    socket.playerName = data.playerName;
    this.connectedPlayers.set(socket.id, data.playerName);
    socket.join("game_room");
    socket.emit("joined", {
      playerName: data.playerName,
      gameState: this.gameEngine.getCurrentState(),
    });
    console.log(`🎮 Player ${data.playerName} joined game`);
  }
  public isRateLimited(socketId: string): boolean {
    const now = Date.now();
    const userLimits = this.messageRateLimit.get(socketId) || [];
    const recentMessages = userLimits.filter(
      (timestamp) => now - timestamp < this.rateLimitWindow
    );
    if (recentMessages.length >= this.maxMessagesPerWindow) {
      return true;
    }
    recentMessages.push(now);
    this.messageRateLimit.set(socketId, recentMessages);
    return false;
  }
  public async handleCashoutRequest(socket: any, data: any): Promise<void> {
    if (!socket.playerName || !data?.betId) {
      socket.emit("cashout_error", { message: "Invalid cashout request" });
      return;
    }
    try {
      const result = await this.gameEngine.cashOut(
        socket.playerName,
        data.betId
      );
      socket.emit("cashout_success", {
        success: true,
        ...result,
        timestamp: Date.now(),
      });
      console.log(
        `💰 ${socket.playerName} cashed out at ${result.multiplier}x`
      );
    } catch (error: any) {
      socket.emit("cashout_error", {
        success: false,
        message: error.message,
        timestamp: Date.now(),
      });
    }
  }
  public handleDisconnect(socket: any): void {
    this.connectionCount--;
    this.connectedPlayers.delete(socket.id);
    this.messageRateLimit.delete(socket.id);
    console.log(`👋 Player disconnected (${this.connectionCount} total)`);
  }
  public cleanupRateLimits(): void {
    const now = Date.now();
    this.messageRateLimit.forEach((timestamps, socketId) => {
      const validTimestamps = timestamps.filter(
        (timestamp) => now - timestamp < this.rateLimitWindow
      );
      if (validTimestamps.length === 0) {
        this.messageRateLimit.delete(socketId);
      } else {
        this.messageRateLimit.set(socketId, validTimestamps);
      }
    });
  }
}
