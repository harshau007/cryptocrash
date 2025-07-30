import mongoose, { ConnectOptions, Document, Model, Schema } from "mongoose";

export interface IPlayer extends Document {
  playerName: string;
  wallet: { BTC: number; ETH: number };
  totalWagered: number;
  totalWon: number;
  gamesPlayed: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface IRound extends Document {
  roundId: string;
  crashMultiplier: number;
  seed: string;
  hash: string;
  startTime: Date;
  endTime?: Date;
  status: "pending" | "active" | "crashed";
  totalBets: number;
  totalPayout: number;
}

export interface IBet extends Document {
  betId: string;
  roundId: string;
  playerName: string;
  usdAmount: number;
  cryptoAmount: number;
  cryptocurrency: "BTC" | "ETH";
  priceAtBet: number;
  status: "active" | "cashed_out" | "lost";
  cashoutMultiplier?: number;
  profit: number;
  createdAt: Date;
}

export interface ITransaction extends Document {
  transactionId: string;
  playerName: string;
  transactionType: "bet" | "cashout";
  usdAmount: number;
  cryptoAmount: number;
  cryptocurrency: "BTC" | "ETH";
  priceAtTime: number;
  transactionHash: string;
  betId?: string;
  roundId?: string;
  timestamp: Date;
}

export class DatabaseManager {
  static async connect(uri: string): Promise<void> {
    try {
      await mongoose.connect(uri, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      } as ConnectOptions);
      console.log("✅ Database connected successfully");
    } catch (error) {
      console.error("❌ Database connection failed:", error);
      setTimeout(() => this.connect(uri), 5000);
    }
  }
}

const PlayerSchema = new Schema<IPlayer>({
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

const RoundSchema = new Schema<IRound>({
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

const BetSchema = new Schema<IBet>({
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

const TransactionSchema = new Schema<ITransaction>({
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

export const Player: Model<IPlayer> = mongoose.model<IPlayer>(
  "Player",
  PlayerSchema
);
export const Round: Model<IRound> = mongoose.model<IRound>(
  "Round",
  RoundSchema
);
export const Bet: Model<IBet> = mongoose.model<IBet>("Bet", BetSchema);
export const Transaction: Model<ITransaction> = mongoose.model<ITransaction>(
  "Transaction",
  TransactionSchema
);
