import { createHash, randomBytes } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { Bet, Player, Round, Transaction } from "./database.js";
export class GameEngine {
  constructor(io, cryptoService) {
    this.io = io;
    this.cryptoService = cryptoService;
    this.currentRound = null;
    this.multiplier = 1.0;
    this.isActive = false;
    this.isPending = false;
    this.startTime = null;
    this.crashPoint = 0;
    this.activeBets = new Map();
    this.roundInterval = null;
    this.multiplierInterval = null;
    this.pendingBets = new Map();
    this.roundDuration = 10000;
    this.maxMultiplier = 120;
    this.growthRate = 0.1;
  }
  generateRoundData() {
    const seed = randomBytes(32).toString("hex");
    const roundId = uuidv4();
    const combinedSeed = seed + roundId + process.env.SECRET_SEED;
    const hash = createHash("sha256").update(combinedSeed).digest("hex");
    const crashMultiplier = this.calculateCrashPoint(hash);
    return {
      roundId,
      seed,
      hash,
      crashMultiplier,
      startTime: new Date(),
    };
  }
  async createRound(data) {
    const round = new Round({
      ...data,
      status: "active",
    });
    await round.save();
    return round;
  }
  async processPendingBets() {
    if (this.pendingBets.size === 0) return;
    for (const [betId, bet] of this.pendingBets) {
      if (this.currentRound) bet.roundId = this.currentRound.roundId;
      await bet.save();
      this.activeBets.set(betId, bet);
    }
    this.pendingBets.clear();
  }
  async loadActiveBets() {
    if (!this.currentRound) return;
    const bets = await Bet.find({
      roundId: this.currentRound.roundId,
      status: "active",
    });
    bets.forEach((bet) => {
      this.activeBets.set(bet.betId, bet);
    });
  }
  startMultiplierUpdates() {
    this.multiplierInterval = setInterval(() => {
      if (!this.isActive) return;
      const elapsed = (Date.now() - (this.startTime ?? 0)) / 1000;
      this.multiplier = 1 + elapsed * this.growthRate;
      this.io.emit("multiplier_update", {
        multiplier: Math.round(this.multiplier * 100) / 100,
        timestamp: Date.now(),
      });
      if (this.multiplier >= this.crashPoint) {
        this.crashRound();
      }
    }, 100);
  }
  async crashRound() {
    this.isActive = false;
    if (this.multiplierInterval) clearInterval(this.multiplierInterval);
    try {
      await this.processLostBets();
      await this.updateRoundStatus();
      if (this.currentRound) {
        this.io.emit("round_crash", {
          crashMultiplier: this.crashPoint,
          roundId: this.currentRound.roundId,
          seed: this.currentRound.seed,
          hash: this.currentRound.hash,
        });
        console.log(
          `💥 Round ${this.currentRound.roundId} crashed at ${this.crashPoint}x`
        );
      }
      this.scheduleNextRound();
    } catch (error) {
      console.error("Error during crash:", error);
      this.scheduleNextRound();
    }
  }
  async startNewRound() {
    if (this.isActive) return;
    try {
      const roundData = this.generateRoundData();
      this.currentRound = await this.createRound(roundData);
      this.crashPoint = roundData.crashMultiplier;
      this.multiplier = 1.0;
      this.isActive = true;
      this.isPending = false;
      this.startTime = Date.now();
      await this.processPendingBets();
      await this.loadActiveBets();
      this.io.emit("round_start", {
        roundId: this.currentRound.roundId,
        timestamp: this.startTime,
        seed: this.currentRound.seed,
        hash: this.currentRound.hash,
      });
      this.startMultiplierUpdates();
      console.log(
        `🚀 Round ${this.currentRound.roundId} started - Crash at ${this.crashPoint}x`
      );
    } catch (error) {
      console.error("Error starting round:", error);
      this.scheduleNextRound();
    }
  }
  start() {
    this.scheduleNextRound();
    this.broadcastGameState();
    console.log("🎮 Game Engine started");
  }
  getCurrentState() {
    return {
      isActive: this.isActive,
      isPending: this.isPending,
      currentMultiplier: this.isActive
        ? Math.round(this.multiplier * 100) / 100
        : null,
      roundId: this.currentRound?.roundId,
      timeElapsed: this.isActive ? Date.now() - (this.startTime ?? 0) : null,
      activeBetsCount: this.activeBets.size,
      pendingBetsCount: this.pendingBets.size,
      nextRoundIn: this.isPending
        ? Math.max(
            0,
            this.roundDuration - (Date.now() - (this.startTime || Date.now()))
          )
        : null,
    };
  }
  scheduleNextRound() {
    this.isPending = true;
    this.broadcastGameState();
    setTimeout(async () => {
      await this.startNewRound();
    }, this.roundDuration);
  }
  broadcastGameState() {
    setInterval(() => {
      this.io.emit("game_state", this.getCurrentState());
    }, 1000);
  }
  calculateCrashPoint(hash) {
    const hex = hash.substring(0, 8);
    const intValue = parseInt(hex, 16);
    const normalized = intValue / 0xffffffff;
    const crashPoint = Math.max(
      1.01,
      Math.min(this.maxMultiplier, 1 / (1 - normalized * 0.99))
    );
    return Math.round(crashPoint * 100) / 100;
  }
  async processLostBets() {
    const lostBets = Array.from(this.activeBets.values());
    for (const bet of lostBets) {
      bet.status = "lost";
      bet.profit = -bet.usdAmount;
      await bet.save();
    }
    this.activeBets.clear();
  }
  async updateRoundStatus() {
    if (!this.currentRound) return;
    this.currentRound.status = "crashed";
    this.currentRound.endTime = new Date();
    this.currentRound.totalBets = this.activeBets.size;
    await this.currentRound.save();
  }
  async cashOut(playerName, betId) {
    if (!this.isActive) {
      throw new Error("No active round");
    }
    const bet = this.activeBets.get(betId);
    if (!bet || bet.playerName !== playerName || bet.status !== "active") {
      throw new Error("Invalid bet or already cashed out");
    }
    const currentMultiplier = Math.round(this.multiplier * 100) / 100;
    const cryptoPayout = bet.cryptoAmount * currentMultiplier;
    const currentPrice = await this.cryptoService.getPrice(bet.cryptocurrency);
    const usdEquivalent = cryptoPayout * currentPrice;
    const profit = usdEquivalent - bet.usdAmount;
    bet.status = "cashed_out";
    bet.cashoutMultiplier = currentMultiplier;
    bet.profit = profit;
    await bet.save();
    const player = await Player.findOne({ playerName });
    if (!player) throw new Error("Player not found");
    player.wallet[bet.cryptocurrency] += cryptoPayout;
    player.totalWon += usdEquivalent;
    player.updatedAt = new Date();
    await player.save();
    await this.createTransaction(
      playerName,
      "cashout",
      usdEquivalent,
      cryptoPayout,
      bet.cryptocurrency,
      currentPrice,
      betId
    );
    this.activeBets.delete(betId);
    this.io.emit("player_cashout", {
      playerName,
      betId,
      cryptoPayout: Math.round(cryptoPayout * 100000000) / 100000000,
      usdEquivalent: Math.round(usdEquivalent * 100) / 100,
      multiplier: currentMultiplier,
      profit: Math.round(profit * 100) / 100,
    });
    return {
      cryptoPayout,
      usdEquivalent,
      multiplier: currentMultiplier,
      profit,
    };
  }
  async createTransaction(
    playerName,
    type,
    usdAmount,
    cryptoAmount,
    cryptocurrency,
    price,
    betId
  ) {
    const transaction = new Transaction({
      transactionId: uuidv4(),
      playerName,
      transactionType: type,
      usdAmount: Math.round(usdAmount * 100) / 100,
      cryptoAmount: Math.round(cryptoAmount * 100000000) / 100000000,
      cryptocurrency,
      priceAtTime: price,
      transactionHash: randomBytes(32).toString("hex"),
      betId,
      roundId: this.currentRound?.roundId,
    });
    await transaction.save();
    return transaction;
  }
  async placeBet(playerName, usdAmount, cryptocurrency) {
    if (this.isActive) {
      throw new Error("Cannot place bet - round already started");
    }
    const player = await Player.findOne({ playerName });
    if (!player) {
      throw new Error("Player not found");
    }
    if (usdAmount <= 0 || usdAmount > 1000) {
      throw new Error("Invalid bet amount");
    }
    const price = await this.cryptoService.getPrice(cryptocurrency);
    const cryptoAmount = usdAmount / price;
    if (player.wallet[cryptocurrency] < cryptoAmount) {
      throw new Error("Insufficient balance");
    }
    const { v4: uuidv4 } = await import("uuid");
    const betId = uuidv4();
    const bet = new Bet({
      betId,
      roundId: this.currentRound?.roundId || "pending",
      playerName,
      usdAmount,
      cryptoAmount,
      cryptocurrency,
      priceAtBet: price,
    });
    await bet.save();
    player.wallet[cryptocurrency] -= cryptoAmount;
    player.totalWagered += usdAmount;
    player.gamesPlayed += 1;
    player.updatedAt = new Date();
    await player.save();
    await this.createTransaction(
      playerName,
      "bet",
      usdAmount,
      cryptoAmount,
      cryptocurrency,
      price,
      betId
    );
    if (!this.currentRound) {
      this.pendingBets.set(betId, bet);
    } else {
      this.activeBets.set(betId, bet);
    }
    this.io.emit("bet_placed", {
      playerName,
      betId,
      usdAmount,
      cryptoAmount,
      cryptocurrency,
    });
    return { betId, cryptoAmount, price };
  }
}
export default { GameEngine };
