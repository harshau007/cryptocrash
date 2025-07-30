import axios from "axios";

export interface PriceHistoryEntry {
  price: number;
  timestamp: number;
}

export class CryptoService {
  prices: Map<string, number>;
  lastUpdate: number;
  updateInterval: number;
  retryInterval: number;
  maxRetries: number;
  supportedCryptos: Record<string, string>;
  fallbackPrices: Record<string, number>;
  priceHistory: Map<string, PriceHistoryEntry[]>;

  constructor() {
    this.prices = new Map();
    this.lastUpdate = 0;
    this.updateInterval = 10000;
    this.retryInterval = 5000;
    this.maxRetries = 3;
    this.supportedCryptos = {
      bitcoin: "BTC",
      ethereum: "ETH",
    };
    this.fallbackPrices = {
      BTC: 45000,
      ETH: 2500,
    };
    this.priceHistory = new Map();
    this.init();
  }

  async init(): Promise<void> {
    await this.updatePrices();
    setInterval(() => this.updatePrices(), this.updateInterval);
    console.log("💰 Crypto service initialized");
  }

  async updatePrices(retryCount = 0): Promise<void> {
    try {
      const apiUrl = "https://api.coingecko.com/api/v3/simple/price";
      const cryptoIds = Object.keys(this.supportedCryptos).join(",");

      const response = await axios.get(apiUrl, {
        params: {
          ids: cryptoIds,
          vs_currencies: "usd",
          include_24hr_change: true,
        },
        timeout: 5000,
      });

      Object.entries(this.supportedCryptos).forEach(([cryptoId, symbol]) => {
        const priceData = response.data[cryptoId];
        if (priceData?.usd) {
          const price = priceData.usd;
          this.prices.set(symbol, price);
          this.updatePriceHistory(symbol, price);
        }
      });

      this.lastUpdate = Date.now();
      console.log("📈 Prices updated:", this.getAllPrices());
    } catch (error: any) {
      console.error("Price update failed:", error.message);

      if (retryCount < this.maxRetries) {
        setTimeout(() => {
          this.updatePrices(retryCount + 1);
        }, this.retryInterval);
      } else {
        this.useFallbackPrices();
      }
    }
  }

  updatePriceHistory(symbol: string, price: number): void {
    if (!this.priceHistory.has(symbol)) {
      this.priceHistory.set(symbol, []);
    }

    const history = this.priceHistory.get(symbol)!;
    history.push({ price, timestamp: Date.now() });

    if (history.length > 100) {
      history.shift();
    }
  }

  useFallbackPrices(): void {
    console.log("🔄 Using fallback prices");
    Object.entries(this.fallbackPrices).forEach(([symbol, price]) => {
      if (!this.prices.has(symbol)) {
        this.prices.set(symbol, price);
      }
    });
    this.lastUpdate = Date.now();
  }

  async getPrice(symbol: string): Promise<number> {
    if (!this.isValidSymbol(symbol)) {
      throw new Error(`Unsupported cryptocurrency: ${symbol}`);
    }

    if (this.shouldUpdatePrices()) {
      await this.updatePrices();
    }

    const price = this.prices.get(symbol);
    if (!price) {
      this.useFallbackPrices();
      return this.prices.get(symbol) || this.fallbackPrices[symbol];
    }

    return price;
  }

  isValidSymbol(symbol: string): boolean {
    return Object.values(this.supportedCryptos).includes(symbol);
  }

  shouldUpdatePrices(): boolean {
    return Date.now() - this.lastUpdate > this.updateInterval * 2;
  }

  getAllPrices(): Record<string, number | boolean> {
    const result: Record<string, number | boolean> = {};
    this.prices.forEach((price, symbol) => {
      result[symbol] = price;
    });
    result.lastUpdated = this.lastUpdate;
    result.isStale = this.shouldUpdatePrices();
    return result;
  }

  getPriceHistory(symbol: string, limit = 20): PriceHistoryEntry[] {
    const history = this.priceHistory.get(symbol) || [];
    return history.slice(-limit);
  }

  getMarketStatus(): Record<string, any> {
    return {
      supportedCryptos: Object.values(this.supportedCryptos),
      lastUpdate: this.lastUpdate,
      isHealthy: !this.shouldUpdatePrices(),
      prices: this.getAllPrices(),
    };
  }
} 