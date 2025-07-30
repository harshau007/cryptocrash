import { NextFunction, Request, Response, Router } from "express";
import { Bet, Player, Round, Transaction } from "../core/database";
import { GameEngine } from "../core/engine";
import { CryptoService } from "../services/crypto";

export default (gameEngine: GameEngine, cryptoService: CryptoService) => {
  const router = Router();

  const validateBetInput = (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const { playerName, usdAmount, cryptocurrency } = req.body;
    if (!playerName || typeof playerName !== "string") {
      return res.status(400).json({ error: "Valid playerName required" });
    }
    if (
      !usdAmount ||
      typeof usdAmount !== "number" ||
      usdAmount <= 0 ||
      usdAmount > 1000
    ) {
      return res.status(400).json({ error: "Invalid USD amount (0.01-1000)" });
    }
    if (!cryptocurrency || !["BTC", "ETH"].includes(cryptocurrency)) {
      return res
        .status(400)
        .json({ error: "Invalid cryptocurrency (BTC/ETH only)" });
    }
    next();
  };

  router.post("/bet", validateBetInput, async (req: Request, res: Response) => {
    try {
      const { playerName, usdAmount, cryptocurrency } = req.body;
      const result = await gameEngine.placeBet(
        playerName,
        usdAmount,
        cryptocurrency
      );
      res.json({
        success: true,
        ...result,
        timestamp: Date.now(),
        gameState: gameEngine.getCurrentState(),
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message,
        timestamp: Date.now(),
      });
    }
  });

  router.post("/cashout", async (req: Request, res: Response) => {
    try {
      const { playerName, betId } = req.body;
      if (!playerName || !betId) {
        return res.status(400).json({ error: "playerName and betId required" });
      }
      const result = await gameEngine.cashOut(playerName, betId);
      res.json({
        success: true,
        ...result,
        timestamp: Date.now(),
      });
    } catch (error: any) {
      res.status(400).json({
        success: false,
        error: error.message,
        timestamp: Date.now(),
      });
    }
  });

  router.get("/wallet/:playerName", async (req: Request, res: Response) => {
    try {
      const player = await Player.findOne({
        playerName: req.params.playerName,
      });
      if (!player) {
        return res.status(404).json({ error: "Player not found" });
      }
      const prices = cryptoService.getAllPrices();
      const btcUsd = player.wallet.BTC * ((prices.BTC as number) || 0);
      const ethUsd = player.wallet.ETH * ((prices.ETH as number) || 0);
      const wallet = {
        playerName: player.playerName,
        crypto: {
          BTC: Math.round(player.wallet.BTC * 100000000) / 100000000,
          ETH: Math.round(player.wallet.ETH * 100000000) / 100000000,
        },
        usdEquivalent: {
          BTC: Math.round(btcUsd * 100) / 100,
          ETH: Math.round(ethUsd * 100) / 100,
          total: Math.round((btcUsd + ethUsd) * 100) / 100,
        },
        stats: {
          totalWagered: player.totalWagered || 0,
          totalWon: player.totalWon || 0,
          gamesPlayed: player.gamesPlayed || 0,
          profit:
            Math.round(
              ((player.totalWon || 0) - (player.totalWagered || 0)) * 100
            ) / 100,
        },
        currentPrices: prices,
        lastUpdated: player.updatedAt,
      };
      res.json(wallet);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get(
    "/transactions/:playerName",
    async (req: Request, res: Response) => {
      try {
        const { page = 1, limit = 20 } = req.query;
        const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
        const transactions = await Transaction.find({
          playerName: req.params.playerName,
        })
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(parseInt(limit as string));
        const total = await Transaction.countDocuments({
          playerName: req.params.playerName,
        });
        res.json({
          transactions: transactions.map((tx) => ({
            ...tx.toObject(),
            cryptoAmount: Math.round(tx.cryptoAmount * 100000000) / 100000000,
            usdAmount: Math.round(tx.usdAmount * 100) / 100,
          })),
          pagination: {
            current: parseInt(page as string),
            limit: parseInt(limit as string),
            total,
            pages: Math.ceil(total / parseInt(limit as string)),
          },
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    }
  );

  router.get("/crypto/prices", (req: Request, res: Response) => {
    const prices = cryptoService.getAllPrices();
    res.json({
      ...prices,
      marketStatus: cryptoService.getMarketStatus(),
    });
  });

  // Get current game state
  router.get("/game/state", (req: Request, res: Response) => {
    res.json({
      ...gameEngine.getCurrentState(),
      timestamp: Date.now(),
    });
  });

  router.get("/game/history", async (req: Request, res: Response) => {
    try {
      const { page = 1, limit = 20 } = req.query;
      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
      const rounds = await Round.find({ status: "crashed" })
        .sort({ endTime: -1 })
        .skip(skip)
        .limit(parseInt(limit as string));
      const total = await Round.countDocuments({ status: "crashed" });
      res.json({
        rounds: rounds.map((round) => ({
          roundId: round.roundId,
          crashMultiplier: round.crashMultiplier,
          startTime: round.startTime,
          endTime: round.endTime,
          totalBets: round.totalBets || 0,
          hash: round.hash.substring(0, 8) + "...",
        })),
        pagination: {
          current: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          pages: Math.ceil(total / parseInt(limit as string)),
        },
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.post("/player/create", async (req: Request, res: Response) => {
    try {
      const { playerName } = req.body;
      if (
        !playerName ||
        typeof playerName !== "string" ||
        playerName.length < 3
      ) {
        return res
          .status(400)
          .json({ error: "Valid playerName required (min 3 chars)" });
      }
      const existingPlayer = await Player.findOne({ playerName });
      if (existingPlayer) {
        return res.json({
          success: true,
          message: "Player already exists",
          player: existingPlayer,
        });
      }
      const player = new Player({
        playerName,
        wallet: { BTC: 0.1, ETH: 2.0 },
      });
      await player.save();
      res.json({
        success: true,
        message: "Player created successfully",
        player,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get(
    "/player/:playerName/stats",
    async (req: Request, res: Response) => {
      try {
        const player = await Player.findOne({
          playerName: req.params.playerName,
        });
        if (!player) {
          return res.status(404).json({ error: "Player not found" });
        }
        const recentBets = await Bet.find({ playerName: req.params.playerName })
          .sort({ createdAt: -1 })
          .limit(10);
        const wins = recentBets.filter(
          (bet) => bet.status === "cashed_out"
        ).length;
        const losses = recentBets.filter((bet) => bet.status === "lost").length;
        const winRate =
          recentBets.length > 0 ? (wins / recentBets.length) * 100 : 0;
        res.json({
          playerName: player.playerName,
          stats: {
            totalWagered: player.totalWagered || 0,
            totalWon: player.totalWon || 0,
            gamesPlayed: player.gamesPlayed || 0,
            profit:
              Math.round(
                ((player.totalWon || 0) - (player.totalWagered || 0)) * 100
              ) / 100,
            winRate: Math.round(winRate * 100) / 100,
            recentGames: {
              wins,
              losses,
              total: recentBets.length,
            },
          },
          recentBets: recentBets.map((bet) => ({
            betId: bet.betId,
            usdAmount: bet.usdAmount,
            cryptocurrency: bet.cryptocurrency,
            status: bet.status,
            cashoutMultiplier: bet.cashoutMultiplier,
            profit: bet.profit || 0,
            createdAt: bet.createdAt,
          })),
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    }
  );

  router.get("/leaderboard", async (req: Request, res: Response) => {
    try {
      const players = await Player.find({}).sort({ totalWon: -1 }).limit(10);
      const leaderboard = players.map((player, index) => ({
        rank: index + 1,
        playerName: player.playerName,
        totalWon: player.totalWon || 0,
        totalWagered: player.totalWagered || 0,
        profit:
          Math.round(
            ((player.totalWon || 0) - (player.totalWagered || 0)) * 100
          ) / 100,
        gamesPlayed: player.gamesPlayed || 0,
      }));
      res.json({ leaderboard });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  router.get("/health", (req: Request, res: Response) => {
    res.json({
      status: "healthy",
      timestamp: Date.now(),
      gameState: gameEngine.getCurrentState(),
      cryptoPrices: cryptoService.getAllPrices(),
    });
  });

  return router;
};
