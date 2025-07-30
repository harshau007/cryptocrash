import mongoose, { Schema } from "mongoose";
export class DatabaseManager {
  static async connect(uri) {
    try {
      await mongoose.connect(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });
      console.log("✅ Database connected successfully");
    } catch (error) {
      console.error("❌ Database connection failed:", error);
      setTimeout(() => this.connect(uri), 5000);
    }
  }
}
const PlayerSchema = new Schema({
  playerName: { type: String, unique: true, required: true, index: true },
  wallet: {
    BTC: { type: Number, default: 0.1, min: 0 },
    ETH: { type: Number, default: 1.5, min: 0 },
  },
  totalWagered: { type: Number, default: 0 },
  totalWon: { type: Number, default: 0 },
  gamesPlayed: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});
const RoundSchema = new Schema({
  roundId: { type: String, unique: true, required: true, index: true },
  crashMultiplier: { type: Number, required: true, min: 1.01, max: 120 },
  seed: { type: String, required: true },
  hash: { type: String, required: true },
  startTime: { type: Date, required: true },
  endTime: { type: Date },
  status: {
    type: String,
    enum: ["pending", "active", "crashed"],
    default: "pending",
    index: true,
  },
  totalBets: { type: Number, default: 0 },
  totalPayout: { type: Number, default: 0 },
});
const BetSchema = new Schema({
  betId: { type: String, unique: true, required: true, index: true },
  roundId: { type: String, required: true, index: true },
  playerName: { type: String, required: true, index: true },
  usdAmount: { type: Number, required: true, min: 0.01 },
  cryptoAmount: { type: Number, required: true, min: 0 },
  cryptocurrency: { type: String, enum: ["BTC", "ETH"], required: true },
  priceAtBet: { type: Number, required: true, min: 0 },
  status: {
    type: String,
    enum: ["active", "cashed_out", "lost"],
    default: "active",
    index: true,
  },
  cashoutMultiplier: { type: Number, min: 1.01 },
  profit: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now, index: true },
});
const TransactionSchema = new Schema({
  transactionId: { type: String, unique: true, required: true, index: true },
  playerName: { type: String, required: true, index: true },
  transactionType: { type: String, enum: ["bet", "cashout"], required: true },
  usdAmount: { type: Number, required: true },
  cryptoAmount: { type: Number, required: true },
  cryptocurrency: { type: String, enum: ["BTC", "ETH"], required: true },
  priceAtTime: { type: Number, required: true },
  transactionHash: { type: String, required: true },
  betId: { type: String, index: true },
  roundId: { type: String, index: true },
  timestamp: { type: Date, default: Date.now, index: true },
});
PlayerSchema.index({ createdAt: -1 });
RoundSchema.index({ startTime: -1 });
BetSchema.index({ createdAt: -1, playerName: 1 });
TransactionSchema.index({ timestamp: -1, playerName: 1 });
export const Player = mongoose.model("Player", PlayerSchema);
export const Round = mongoose.model("Round", RoundSchema);
export const Bet = mongoose.model("Bet", BetSchema);
export const Transaction = mongoose.model("Transaction", TransactionSchema);
