# DEX Scanner

A background worker service that monitors DEX (Decentralized Exchange) factory contracts for new trading pair creation events.

## Features

- 🔍 Real-time monitoring of DEX pair creation
- 📊 Dual monitoring strategy: Event listeners + Polling
- 📱 Telegram notifications for new pairs
- 💧 Dual-channel alerts: VIP ($10k+) and Public ($35k+) liquidity thresholds
- 📈 Periodic statistics reporting to Telegram
- 🔗 Explorer and DEX links in notifications for quick access
- ⛓️ Multi-chain support (Ethereum, BSC, Polygon, Arbitrum)
- 🔒 Security checks (code verification, owner renouncement, LP lock status)
- 🔄 Automatic fallback to polling when event filters aren't supported
- ⏱️ Uptime tracking and error monitoring

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
   - `TELEGRAM_BOT_TOKEN`: Your Telegram bot token from @BotFather
   
   **Telegram Channels** (choose one approach):
   - **Legacy**: `TELEGRAM_CHAT_ID` - Single channel for all alerts
   - **Recommended**: Dual channels for better organization:
     - `TELEGRAM_CHAT_ID_VIP` - High-value pairs (>$10k liquidity)
     - `TELEGRAM_CHAT_ID_PUBLIC` - Very high-value pairs (>$35k liquidity)
   
   **Optional Configuration**:
   - `MIN_LIQUIDITY_VIP`: Minimum liquidity for VIP alerts (default: 10000 USD)
   - `MIN_LIQUIDITY_PUBLIC`: Minimum liquidity for Public alerts (default: 35000 USD)
   - `STATS_INTERVAL`: How often to send statistics (default: 3600000ms = 1 hour)
   - `SEND_STATS`: Enable/disable periodic statistics (default: true)
   - `INCLUDE_LINKS`: Include explorer/DEX links in messages (default: true)

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

The scanner uses a multi-layered approach:

1. **Event Listening**: Attempts to listen for `PairCreated` events in real-time
   - Requires RPC provider support for `eth_newFilter`
   - Falls back gracefully if not supported

2. **Polling**: Periodically checks for new pairs
   - Primary monitoring method
   - Works with any RPC provider
   - Configurable interval via `POLL_INTERVAL`

3. **Liquidity Filtering**: Analyzes pair liquidity before sending alerts
   - VIP channel: Pairs with >$10k liquidity (configurable)
   - Public channel: Pairs with >$35k liquidity (configurable)
   - Automatic USD conversion via price cache

4. **Security Checks**: Validates token safety
   - Contract verification on block explorer
   - Owner renouncement status
   - LP lock detection

5. **Statistics Reporting**: Periodic updates via Telegram
   - Uptime tracking
   - Pair detection stats
   - Filter efficiency metrics
   - Error monitoring

## Telegram Notifications

The bot sends several types of messages:

### 1. New Pair Alerts
When a new pair meeting liquidity thresholds is detected:
- Token information (name, symbol, address)
- Current liquidity in USD
- Security check results (verification, renouncement, LP lock)
- Quick links to explorers and DEX (if enabled)
- Transaction details

### 2. Periodic Statistics (optional)
Sent at configurable intervals (default: 1 hour):
- Bot uptime
- Total pairs detected
- Alerts sent to each channel
- Filter efficiency
- Error count

### 3. Error Notifications
When critical errors occur during monitoring

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

## Configuration Examples

### Single Channel Setup (Simple)
Best for personal use or testing:
```env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_CHAT_ID=-1001234567890
```

### Dual Channel Setup (Recommended)
Separate channels for different liquidity tiers:
```env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_CHAT_ID_VIP=-1001234567890
TELEGRAM_CHAT_ID_PUBLIC=@myPublicChannel
MIN_LIQUIDITY_VIP=10000
MIN_LIQUIDITY_PUBLIC=35000
```

### Advanced Configuration
Full control over all features:
```env
# Monitoring intervals
POLL_INTERVAL=60000           # Check for new pairs every 60s
EVENT_POLL_INTERVAL=30000     # Poll events every 30s
STATS_INTERVAL=1800000        # Send stats every 30 minutes

# Features
SEND_STATS=true               # Enable periodic statistics
INCLUDE_LINKS=true            # Include explorer/DEX links in messages

# Liquidity thresholds
MIN_LIQUIDITY_VIP=15000       # Custom VIP threshold ($15k)
MIN_LIQUIDITY_PUBLIC=50000    # Custom Public threshold ($50k)
```

## Deployment

The service is configured for deployment on Render.com via `render.yaml`. Make sure to set all required environment variables in your Render dashboard.

## License

MIT