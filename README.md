# Crypto Crash Game Backend

A real-time multiplayer cryptocurrency crash gambling game with WebSocket support, built with Node.js, Express, MongoDB, and Socket.IO.

## 🚀 Quick Deploy to Render

### Prerequisites

- MongoDB Atlas account (free tier works)
- Render account (free tier works)
- Git repository

### Environment Variables for Render

```bash
PORT=3000
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/crypto-crash?retryWrites=true&w=majority
SECRET_SEED=your-super-secret-seed-for-provably-fair-algorithm
```

### Development Run Steps

1. **Install Packages**
   ```bash
   npm install
   ```
2. **Run Application**
   ```bash
   npm run dev
   ```

### Deploy Steps

1. **Create MongoDB Atlas Database**

   - Sign up at Mongo Atlas
   - Create a new cluster (free tier)
   - Create database user and get connection string
   - Whitelist all IPs (0.0.0.0/0) for Render deployment

2. **Deploy to Render**

   - Connect your GitHub repository to Render
   - Create new Web Service
   - Set start command: `node dist/server.js`
   - Add environment variables above
   - Deploy

3. **Auto-Seeding**
   - App automatically creates sample players on first run
   - No manual seeding required

## 🎮 Game Features

- **Real-time Multiplayer**: WebSocket-based real-time updates
- **Provably Fair**: Cryptographically secure crash algorithm
- **Crypto Integration**: Live BTC/ETH prices from CoinGecko API
- **Simulated Wallets**: Player crypto balances with USD conversion
- **Transaction History**: Complete betting and cashout logs
- **Responsive Design**: Works on mobile and desktop

## 📡 API Endpoints

### Game Endpoints

- `POST /api/bet` - Place a bet
- `POST /api/cashout` - Cash out during round
- `GET /api/game/state` - Current game state
- `GET /api/game/history` - Round history

### Player Endpoints

- `POST /api/player/create` - Create new player
- `GET /api/wallet/:playerName` - Get wallet balance
- `GET /api/transactions/:playerName` - Transaction history
- `GET /api/player/:playerName/stats` - Player statistics

### Market Data

- `GET /api/crypto/prices` - Current crypto prices
- `GET /api/leaderboard` - Top players
- `GET /api/health` - Health check

## 🔌 WebSocket Events

### Client → Server

- `join_game` - Join game room
- `cashout_request` - Request cashout

### Server → Client

- `round_start` - New round started
- `multiplier_update` - Multiplier change (100ms intervals)
- `round_crash` - Round crashed
- `player_cashout` - Player cashed out
- `bet_placed` - Bet was placed
- `game_state` - Current game state

## 🎯 Provably Fair Algorithm

Each round uses cryptographically secure randomization:

1. Generate random seed (32 bytes)
2. Combine with round ID and secret
3. Create SHA-256 hash
4. Convert to crash multiplier (1.01x - 120x)
5. Provide seed + hash for verification

## 💰 Crypto Price Integration

- **Source**: CoinGecko API (free tier)
- **Update Frequency**: Every 10 seconds
- **Caching**: 10-second cache with fallback prices
- **Supported**: BTC, ETH
- **Conversion**: Real-time USD ⟷ Crypto
