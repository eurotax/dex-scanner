# Sample Telegram Messages

This document shows examples of the enhanced Telegram messages sent by the bot.

## 1. Startup Message

```
🚀 DEX Scanner Started

✅ Monitoring for new pairs
💧 VIP alerts: >$10k USD
💧 Public alerts: >$35k USD
🎯 Features: 📊 Stats every 60min, 🔗 Explorer links enabled
⏰ Started: 1/10/2025, 11:23:12 AM
```

## 2. New Pair Alert (Enhanced)

```
🆕 New High Liquidity Pair

📍 Pair: `0x1234...5678`

🪙 Token 0: USDC
   USD Coin
   `0xa0b8...c9d0`

🪙 Token 1: NEWTOKEN
   New Token Name
   `0x9876...5432`

💧 Liquidity: $45,300 USD

🔒 Security Checks:
✅ Code verified
✅ Owner renounced
❌ LP not locked
   Score: 2/3 🟡

🔗 Quick Links:
   View Pair
   Token0
   Token1
   Transaction
   Trade on DEX

🔗 Block: 19234567
📝 TX: `0xabcd...ef01`
```

## 3. Periodic Statistics Report

```
📊 Periodic Statistics Report

⏱️ Uptime: 2h 15m

🔍 Pair Detection:
   Total pairs detected: 127
   Filtered (low liquidity): 98
   Filter rate: 77.2%

📱 Alerts Sent:
   VIP channel (>10k): 18
   Public channel (>35k): 11
   Total alerts: 29

❌ Errors:
   Processing errors: 0

✅ Bot is running smoothly
```

## 4. Shutdown Message

```
🛑 DEX Scanner Shutdown

⏱️ Total Uptime: 5h 42m

📊 Final Statistics:
   Pairs detected: 342
   Alerts sent: 47 (VIP: 28, Public: 19)
   Filtered: 295 (86.3%)
   Errors: 2

👋 Scanner stopped at 1/10/2025, 5:05:34 PM
```

## 5. Error Notification (Critical Errors Only)

```
⚠️ Error Occurred

CALL_EXCEPTION: Factory contract not responding
```

---

## Message Comparison: Before vs After

### Before (Simple):
```
🆕 New High Liquidity Pair

📍 Pair: `0x1234...5678`
🪙 Token 0: NEWTOKEN (New Token)
🪙 Token 1: USDC (USD Coin)
💧 Liquidity: $45,300 USD
🔒 Security: ✅✅❌

🔗 Block: 19234567
📝 TX: `0xabcd...ef01`
```

### After (Enhanced):
- ✅ Full token information with addresses
- ✅ Direct links to explorers and DEX
- ✅ Detailed security breakdown with score
- ✅ Visual risk indicator (🟡)
- ✅ Better formatting and organization
- ✅ More actionable information

---

## Feature Highlights

### Links Section (when INCLUDE_LINKS=true)
The bot now includes clickable links to:
- **Block Explorer** (Etherscan, BSCscan, etc.) for:
  - Pair contract
  - Token 0 contract
  - Token 1 contract
  - Transaction hash
- **DEX Trading Interface** for immediate trading

### Security Score Indicators
- 🔴 **0/3** - High risk (no security features)
- 🟠 **1/3** - Medium-high risk (one feature)
- 🟡 **2/3** - Medium risk (two features)
- 🟢 **3/3** - Low risk (all security features present)

### Statistics Tracking
The bot now keeps track of:
- Total runtime (uptime)
- Pairs detected and processed
- Number of alerts sent to each channel
- Filter efficiency (percentage filtered out)
- Error count during operation
- Real-time monitoring health

---

## Configuration Impact on Messages

### With INCLUDE_LINKS=false
Links section is removed from pair alerts, making messages shorter but with less actionable information.

### With SEND_STATS=false
Periodic statistics reports are disabled. Only startup, shutdown, pair alerts, and critical errors are sent.

### Custom Liquidity Thresholds
Startup and statistics messages reflect your custom `MIN_LIQUIDITY_VIP` and `MIN_LIQUIDITY_PUBLIC` values.
