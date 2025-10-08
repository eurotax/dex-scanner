# DEX Scanner

A background worker service that monitors DEX (Decentralized Exchange) factory contracts for new trading pair creation events.

## Features

- 🔍 Real-time monitoring of DEX pair creation
- 📊 Dual monitoring strategy: Event listeners + Polling
- 📱 Telegram notifications for new pairs
- ⛓️ Multi-chain support (Ethereum, BSC, etc.)
- 🔄 Automatic fallback to polling when event filters aren't supported

## Prerequisites

- Node.js v18 or higher
- A Telegram bot token and chat ID
- An Etherscan (or compatible) API key
- Access to an RPC endpoint for your target blockchain

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

4. Configure your environment variables in `.env`:
   - `CHAIN_ID`: The blockchain network ID (1 for Ethereum mainnet, 56 for BSC)
   - `RPC_URL`: Your RPC endpoint URL
   - `FACTORY_ADDRESS`: **CRITICAL** - Must match your chain:
     - Ethereum (CHAIN_ID=1): `0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f` (Uniswap V2)
     - BSC (CHAIN_ID=56): `0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73` (PancakeSwap V2)
   - `ETHERSCAN_API_KEY`: Your Etherscan API key
   - `TELEGRAM_BOT_TOKEN`: Your Telegram bot token
   - `TELEGRAM_CHAT_ID`: Your Telegram chat ID

## Running

Development mode (with auto-reload):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## Architecture

The scanner uses a dual-strategy approach:

1. **Event Listening**: Attempts to listen for `PairCreated` events in real-time
   - Requires RPC provider support for `eth_newFilter`
   - Falls back gracefully if not supported

2. **Polling**: Periodically checks for new pairs
   - Primary monitoring method
   - Works with any RPC provider
   - Configurable interval via `POLL_INTERVAL`

## Troubleshooting

### Error: "method eth_newFilter not supported"

This is expected and handled gracefully. The scanner will continue using polling-only mode. This happens when your RPC provider doesn't support event filters.

### Error: "missing revert data" or "CALL_EXCEPTION"

This usually means:
- ❌ **Factory address doesn't match the chain**: Make sure `FACTORY_ADDRESS` is correct for your `CHAIN_ID`
- ❌ **RPC endpoint issues**: Try a different RPC provider
- ❌ **Network mismatch**: Verify your RPC URL matches your CHAIN_ID

Example of correct configuration:
```env
# For Ethereum mainnet
CHAIN_ID=1
RPC_URL=https://eth.llamarpc.com
FACTORY_ADDRESS=0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f

# For BSC mainnet  
CHAIN_ID=56
RPC_URL=https://bsc-dataseed.binance.org
FACTORY_ADDRESS=0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73
```

## Deployment

The service is configured for deployment on Render.com via `render.yaml`. Make sure to set all required environment variables in your Render dashboard.

## License

MIT