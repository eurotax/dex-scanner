# Sprint 1 Deployment Checklist

## Pre-Deployment

### 1. Environment Setup

- [ ] Node.js 20+ installed
- [ ] npm dependencies updated (`npm install`)
- [ ] .env file configured
- [ ] RPC endpoints tested and verified
- [ ] Telegram bot token and chat IDs configured

### 2. Optional Services

- [ ] Redis installed (optional, recommended for production)
  ```bash
  # Ubuntu/Debian
  sudo apt-get install redis-server
  sudo service redis-server start
  
  # Test connection
  redis-cli ping  # Should return "PONG"
  ```

- [ ] Multiple RPC endpoints configured (optional, recommended)
  ```env
  RPC_URL=https://bsc-dataseed1.binance.org
  RPC_SECONDARY_URL=https://bsc-dataseed2.binance.org
  RPC_TERTIARY_URL=https://bsc-dataseed3.binance.org
  ```

### 3. Configuration Review

- [ ] Review all tier thresholds in .env
- [ ] Verify Telegram channel IDs (VIP, Public)
- [ ] Check factory address for your chain
- [ ] Confirm Etherscan API key is valid
- [ ] Set appropriate poll intervals

### 4. Testing

- [ ] Test with V1 first (baseline)
  ```bash
  # Temporarily use V1 in index.js
  npm start
  ```

- [ ] Test V2 in development
  ```bash
  # Switch to V2 in index.js
  npm start
  ```

- [ ] Verify Telegram notifications work
- [ ] Check logs for errors
- [ ] Monitor for at least 1 hour

## Deployment Options

### Option 1: Local/VPS Deployment

#### Step 1: Update Code

```bash
# Pull latest code
git pull origin main

# Install dependencies
npm install

# Review .env configuration
nano .env
```

#### Step 2: Choose Version

**For V1 (Stable):**
```javascript
// index.js
import { PairMonitorService } from './src/services/pairMonitor.js';

const monitor = new PairMonitorService(provider);
```

**For V2 (Sprint 1):**
```javascript
// index.js
import { PairMonitorV2Service } from './src/services/pairMonitorV2.js';

const monitor = new PairMonitorV2Service();
```

#### Step 3: Start Service

**Using npm:**
```bash
npm start
```

**Using PM2 (recommended for production):**
```bash
# Install PM2 if not already installed
npm install -g pm2

# Start application
pm2 start index.js --name dex-scanner

# View logs
pm2 logs dex-scanner

# Monitor
pm2 monit

# Auto-restart on reboot
pm2 startup
pm2 save
```

**Using systemd:**
```bash
# Create service file
sudo nano /etc/systemd/system/dex-scanner.service
```

```ini
[Unit]
Description=DEX Scanner V2
After=network.target

[Service]
Type=simple
User=your-user
WorkingDirectory=/path/to/dex-scanner
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
# Enable and start
sudo systemctl enable dex-scanner
sudo systemctl start dex-scanner

# Check status
sudo systemctl status dex-scanner

# View logs
journalctl -u dex-scanner -f
```

### Option 2: Docker Deployment

#### Step 1: Build Image

The project includes a Dockerfile. Build the image:

```bash
docker build -t dex-scanner:v2 .
```

#### Step 2: Run Container

**Without Redis:**
```bash
docker run -d \
  --name dex-scanner \
  --env-file .env \
  --restart unless-stopped \
  dex-scanner:v2
```

**With Redis:**
```bash
# Start Redis first
docker run -d \
  --name redis \
  --restart unless-stopped \
  redis:7-alpine

# Start scanner with Redis link
docker run -d \
  --name dex-scanner \
  --env-file .env \
  --link redis:redis \
  -e REDIS_URL=redis://redis:6379 \
  --restart unless-stopped \
  dex-scanner:v2
```

**Using Docker Compose:**

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  redis:
    image: redis:7-alpine
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data

  dex-scanner:
    build: .
    restart: unless-stopped
    env_file: .env
    environment:
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis

volumes:
  redis-data:
```

Start:
```bash
docker-compose up -d

# View logs
docker-compose logs -f dex-scanner
```

### Option 3: Render.com Deployment

The project includes `render.yaml` for easy deployment:

1. Push code to GitHub
2. Connect Render.com to your repository
3. Configure environment variables in Render dashboard
4. Deploy

**For V2 with Redis:**
1. Add Redis service in Render dashboard
2. Copy Redis internal URL
3. Add to environment variables: `REDIS_URL=<redis-url>`

## Post-Deployment Verification

### 1. Check Startup Logs

Look for these indicators:

**V1:**
```
✅ Pair monitor service initialized
📍 Starting from block: 12345678
```

**V2:**
```
✅ Multi-RPC Provider Service initialized
✅ Redis connected successfully
✅ Price Cache V2 Service initialized
✅ Pair Monitor V2 Service initialized
💧 3-Tier Filtering System:
   🌟 Early Gems: $1,000+ (VIP only)
   💎 High Liquidity: $10,000+ (VIP) / $35,000+ (Public)
   🚀 Mega Pairs: $50,000+ (All)
```

### 2. Monitor First Hour

- [ ] No critical errors in logs
- [ ] Telegram startup message received
- [ ] At least 1 pair detected (if chain is active)
- [ ] Price cache updates successfully
- [ ] RPC connections healthy (V2)

### 3. Check Statistics

After 1 hour, verify in logs:

```
📊 MONITORING STATISTICS (V2):
   Total pairs detected: 5
   Filtered (below threshold): 3
   🌟 Early Gems: 1
   💎 High Liquidity: 1
   🚀 Mega Pairs: 0
   Sent to VIP: 2
   Sent to Public: 0
   Processing errors: 0
   RPC failovers: 0
```

### 4. Test Failover (V2 Only)

If using Multi-RPC:

```bash
# In logs, you should see health checks every minute
🏥 Performing health checks...
✅ Provider [0] (450ms)
✅ Provider [1] (520ms)
✅ Provider [2] (380ms)
```

## Monitoring

### Key Metrics to Track

1. **Uptime**
   - Target: 99%+ (V2 with multi-RPC)
   - Check: `pm2 status` or systemd status

2. **Error Rate**
   - Target: <5% (V2)
   - Check: Telegram error notifications

3. **Detection Rate**
   - Target: 50+ pairs/hour (active chains)
   - Check: Statistics in Telegram

4. **Filter Efficiency**
   - Target: 70%+ pass rate (V2)
   - Check: Statistics logs

5. **RPC Health** (V2)
   - Target: All providers healthy
   - Check: Health check logs

### Setting Up Alerts

**PM2 Monitoring:**
```bash
# Install PM2 Plus for monitoring
pm2 install pm2-server-monit

# Link to PM2 Plus dashboard (optional)
pm2 link <secret> <public>
```

**Log Monitoring:**
```bash
# Set up log rotation
pm2 install pm2-logrotate

# Configure
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
```

## Troubleshooting

### Issue: Redis Connection Failed

**Symptoms:**
```
⚠️  Redis connection failed: ECONNREFUSED
📝 Falling back to in-memory cache
```

**Solutions:**
1. Check Redis is running: `redis-cli ping`
2. Verify REDIS_URL in .env
3. If Redis not needed, ignore (in-memory fallback works)

### Issue: RPC Provider Unhealthy

**Symptoms:**
```
❌ Provider [0] marked as unhealthy
🔄 Failover: [0] → [1]
```

**Solutions:**
1. Normal behavior - failover working
2. Add more RPC endpoints in .env
3. Consider premium RPC provider

### Issue: No Pairs Detected

**Symptoms:**
```
🔎 Checking blocks... No new pairs found
```

**Solutions:**
1. Verify chain is active (check block explorer)
2. Check factory address is correct
3. Verify RPC connection is working
4. Wait longer - some chains have low activity

### Issue: All Pairs Filtered

**Symptoms:**
```
⏭️  Below all tier thresholds
```

**Solutions:**
1. Lower tier thresholds in .env
2. Wait for higher liquidity pairs
3. Verify price cache is working

## Rollback Procedure

If V2 has issues:

### Quick Rollback (No Code Change)

```javascript
// index.js - switch back to V1
import { PairMonitorService } from './src/services/pairMonitor.js';

const monitor = new PairMonitorService(provider);
```

```bash
# Restart
pm2 restart dex-scanner
# or
sudo systemctl restart dex-scanner
```

### Full Rollback

```bash
# Checkout previous version
git checkout v1.1.0

# Reinstall dependencies
npm install

# Restart
pm2 restart dex-scanner
```

## Maintenance

### Daily

- [ ] Check Telegram for error notifications
- [ ] Review statistics messages
- [ ] Verify service is running

### Weekly

- [ ] Review logs for warnings
- [ ] Check disk space
- [ ] Verify all RPC providers healthy (V2)
- [ ] Update RPC endpoints if needed

### Monthly

- [ ] Update dependencies: `npm update`
- [ ] Review and adjust tier thresholds
- [ ] Analyze detection vs. filter rates
- [ ] Plan capacity scaling if needed

## Scaling

### Horizontal Scaling

**NOT recommended** - Multiple instances will detect duplicate pairs.

**If needed:**
1. Use Redis for shared cache
2. Implement distributed lock (advanced)
3. Divide chains across instances

### Vertical Scaling

**Recommended approach:**

1. **More RPC endpoints** - Better uptime
2. **Better RPC provider** - Faster responses
3. **More memory** - Larger cache
4. **Redis cluster** - Production workloads

## Security

### Production Best Practices

- [ ] Never commit .env file
- [ ] Rotate API keys regularly
- [ ] Use environment-specific configs
- [ ] Enable firewall rules
- [ ] Use HTTPS for Redis connections
- [ ] Restrict Redis to localhost
- [ ] Monitor for suspicious activity
- [ ] Keep dependencies updated

### Secrets Management

**For production:**

```bash
# Use environment variables (not .env file)
export TELEGRAM_BOT_TOKEN="your-token"
export ETHERSCAN_API_KEY="your-key"

# Or use secrets manager
# AWS Secrets Manager, HashiCorp Vault, etc.
```

## Support

### Getting Help

1. Check logs first: `pm2 logs` or `journalctl -u dex-scanner -f`
2. Review this checklist
3. Check MIGRATION_SPRINT1.md
4. Review GitHub issues

### Reporting Issues

Include:
- Version (V1 or V2)
- Environment (OS, Node version)
- Configuration (without secrets)
- Full error logs
- Steps to reproduce

## Checklist Summary

### Pre-Deployment
- [x] Dependencies installed
- [x] .env configured
- [x] Redis ready (optional)
- [x] RPC endpoints tested
- [x] Local testing complete

### Deployment
- [ ] Code deployed
- [ ] Service started
- [ ] Logs verified
- [ ] Telegram notifications working

### Post-Deployment
- [ ] First hour monitoring complete
- [ ] Statistics verified
- [ ] No critical errors
- [ ] Performance acceptable

### Ongoing
- [ ] Daily health checks
- [ ] Weekly log reviews
- [ ] Monthly updates
- [ ] Continuous monitoring

---

**Deployment complete!** Monitor closely for the first 24 hours. 🚀
