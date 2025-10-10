import { config } from '../config.js';
import { TelegramService } from './telegram.js';
import { TokenService } from './token.js';
import { PriceCacheService } from './priceCache.js';
import { LiquidityFilterService } from './liquidityFilter.js';
import { SecurityChecksService } from './securityChecks.js';

export class PairMonitorService {
  constructor(provider) {
    this.provider = provider;
    this.telegram = new TelegramService();
    this.tokenService = new TokenService(provider);
    this.priceCache = new PriceCacheService();
    this.liquidityFilter = new LiquidityFilterService(provider.provider, this.priceCache);
    this.securityChecks = new SecurityChecksService(provider.provider);
    this.processedPairs = new Set();
    this.isMonitoring = false;
    this.pollInterval = null;
    this.statsInterval = null;
    this.startTime = null;
    
    // Statistics
    this.stats = {
      total: 0,
      filtered: 0,
      vip: 0,
      public: 0,
      errors: 0,
    };
  }

  async initialize() {
    console.log('Initializing pair monitor service...');
    
    // Initialize price cache
    this.priceCache.initialize();
    
    // Initialize Telegram bot
    this.telegram.initialize();
    
    // Send startup notification
    await this.telegram.sendStartupMessage();
    
    console.log('Pair monitor service initialized');
  }

  async start() {
    if (this.isMonitoring) {
      console.log('⚠️ Monitoring already active');
      return;
    }

    this.isMonitoring = true;
    this.startTime = Date.now();
    console.log('▶️  Starting pair monitoring...');
    
    // Start statistics reporting if enabled
    if (config.features.sendStats && config.monitoring.statsInterval > 0) {
      console.log(`📊 Statistics reporting enabled (every ${Math.floor(config.monitoring.statsInterval / 60000)} minutes)`);
      this.statsInterval = setInterval(() => {
        this.sendPeriodicStatistics();
      }, config.monitoring.statsInterval);
    }
    
    await this.monitorPairs();
  }

  async stop() {
    console.log('⏸️  Stopping pair monitoring...');
    this.isMonitoring = false;
    
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
    
    // Send shutdown message with final statistics
    if (this.startTime) {
      const uptime = Date.now() - this.startTime;
      await this.telegram.sendShutdownMessage(this.stats, uptime);
    }
    
    // Shutdown services
    this.priceCache.shutdown();
    await this.telegram.shutdown();
    
    // Print statistics
    this.printStatistics();
    
    console.log('✅ Pair monitoring stopped');
  }

  async monitorPairs() {
    const factoryAddress = config.factory.address;
    const pollInterval = config.monitoring.eventPollInterval;

    console.log(`🔍 Monitoring factory: ${factoryAddress}`);
    console.log(`💧 VIP liquidity threshold: $${config.liquidity.minVIP.toLocaleString()}`);
    console.log(`💧 Public liquidity threshold: $${config.liquidity.minPublic.toLocaleString()}`);
    console.log(`⏱️  Poll interval: ${pollInterval}ms\n`);

    // Factory ABI (minimal - only PairCreated event)
    const factoryAbi = [
      'event PairCreated(address indexed token0, address indexed token1, address pair, uint256)'
    ];

    const factory = new this.provider.ethers.Contract(
      factoryAddress,
      factoryAbi,
      this.provider.provider
    );

    let lastBlock = await this.provider.provider.getBlockNumber();
    console.log(`📍 Starting from block: ${lastBlock}\n`);

    const checkForNewPairs = async () => {
      try {
        const currentBlock = await this.provider.provider.getBlockNumber();

        if (currentBlock > lastBlock) {
          console.log(`🔎 Checking blocks ${lastBlock + 1} to ${currentBlock}...`);

          const filter = factory.filters.PairCreated();
          const events = await factory.queryFilter(filter, lastBlock + 1, currentBlock);

          if (events.length > 0) {
            console.log(`✨ Found ${events.length} new pair(s)!\n`);

            for (const event of events) {
              await this.processPairCreatedEvent(event);
            }
          } else {
            console.log(`   No new pairs found`);
          }

          lastBlock = currentBlock;
        }
      } catch (error) {
        console.error('❌ Error checking for new pairs:', error.message);
        this.stats.errors++;
        // Only send error notifications for critical errors, not every poll failure
        if (error.message.includes('CALL_EXCEPTION') || error.message.includes('missing revert')) {
          await this.telegram.sendError(error);
        }
      }
    };

    // Initial check
    await checkForNewPairs();

    // Set up polling
    this.pollInterval = setInterval(checkForNewPairs, pollInterval);
  }

  async processPairCreatedEvent(event) {
    const pairAddress = event.args.pair;

    if (this.processedPairs.has(pairAddress)) {
      console.log(`⏭️  Skipping already processed pair: ${pairAddress}`);
      return;
    }

    this.processedPairs.add(pairAddress);
    this.stats.total++;

    console.log(`\n🆕 New pair detected!`);
    console.log(`   Address: ${pairAddress}`);
    console.log(`   Block: ${event.blockNumber}`);
    console.log(`   TX: ${event.transactionHash}`);

    try {
      // Step 1: Analyze liquidity
      console.log('   💧 Analyzing liquidity...');
      const liquidityAnalysis = await this.liquidityFilter.analyzePair(pairAddress);

      if (!liquidityAnalysis.success) {
        console.log(`   ⏭️  Filtered: ${liquidityAnalysis.message}`);
        this.stats.filtered++;
        return;
      }

      console.log(`   💧 Liquidity: ${this.liquidityFilter.formatLiquidity(liquidityAnalysis.liquidityUSD)}`);

      // Check if meets thresholds
      if (!liquidityAnalysis.shouldAlertVIP && !liquidityAnalysis.shouldAlertPublic) {
        console.log(`   ⏭️  Below minimum liquidity threshold`);
        this.stats.filtered++;
        return;
      }

      // Step 2: Fetch token information
      console.log('   🪙 Fetching token info...');
      const token0Info = await this.tokenService.getTokenInfo(event.args.token0);
      const token1Info = await this.tokenService.getTokenInfo(event.args.token1);

      console.log(`   Token0: ${token0Info.symbol} (${token0Info.name})`);
      console.log(`   Token1: ${token1Info.symbol} (${token1Info.name})`);

      // Step 3: Security checks
      console.log('   🔒 Running security checks...');
      const securityChecks = await this.securityChecks.performChecks(
        event.args.token0,
        pairAddress
      );

      const checksFormat = this.securityChecks.formatChecks(securityChecks);
      console.log(`   Security: ${checksFormat.shortFormat}`);

      // Step 4: Prepare pair data
      const pairData = {
        pairAddress,
        token0: {
          address: event.args.token0,
          symbol: token0Info.symbol,
          name: token0Info.name,
          decimals: token0Info.decimals,
          reserve: liquidityAnalysis.reserves.reserve0,
        },
        token1: {
          address: event.args.token1,
          symbol: token1Info.symbol,
          name: token1Info.name,
          decimals: token1Info.decimals,
          reserve: liquidityAnalysis.reserves.reserve1,
        },
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
        liquidityUSD: liquidityAnalysis.liquidityUSD,
        liquidityFormatted: this.liquidityFilter.formatLiquidity(liquidityAnalysis.liquidityUSD),
        securityChecks: checksFormat,
      };

      // Step 5: Send to appropriate channels (both instant!)
      const channels = [];
      
      if (liquidityAnalysis.shouldAlertVIP) {
        channels.push('VIP');
        this.stats.vip++;
      }

      if (liquidityAnalysis.shouldAlertPublic) {
        channels.push('Public');
        this.stats.public++;
      }

      console.log(`   📱 Sending to: ${channels.join(' + ')}`);

      // Determine which channel parameter to use
      let channelParam = 'both';
      if (liquidityAnalysis.shouldAlertVIP && !liquidityAnalysis.shouldAlertPublic) {
        channelParam = 'vip';
      } else if (!liquidityAnalysis.shouldAlertVIP && liquidityAnalysis.shouldAlertPublic) {
        channelParam = 'public';
      }

      await this.telegram.sendPairCreated(pairData, channelParam);

      console.log(`✅ Pair processed successfully\n`);

    } catch (error) {
      console.error(`❌ Error processing pair ${pairAddress}:`, error.message);
      this.stats.errors++;
      await this.telegram.sendError(error);
    }
  }

  async sendPeriodicStatistics() {
    try {
      const uptime = Date.now() - this.startTime;
      console.log('\n📊 Sending periodic statistics...');
      await this.telegram.sendStatistics(this.stats, uptime);
      console.log('✅ Statistics sent\n');
    } catch (error) {
      console.error('❌ Failed to send periodic statistics:', error.message);
    }
  }

  printStatistics() {
    console.log('\n📊 MONITORING STATISTICS:');
    console.log(`   Total pairs detected: ${this.stats.total}`);
    console.log(`   Filtered (low liquidity): ${this.stats.filtered}`);
    console.log(`   Sent to VIP (>${config.liquidity.minVIP / 1000}k): ${this.stats.vip}`);
    console.log(`   Sent to Public (>${config.liquidity.minPublic / 1000}k): ${this.stats.public}`);
    console.log(`   Processing errors: ${this.stats.errors}`);
    
    if (this.stats.vip > 0 || this.stats.public > 0) {
      const filterRate = ((this.stats.filtered / this.stats.total) * 100).toFixed(1);
      console.log(`   Filter efficiency: ${filterRate}% filtered out`);
    }
    
    if (this.startTime) {
      const uptime = Date.now() - this.startTime;
      const uptimeHours = Math.floor(uptime / 3600000);
      const uptimeMinutes = Math.floor((uptime % 3600000) / 60000);
      console.log(`   Uptime: ${uptimeHours}h ${uptimeMinutes}m`);
    }
    
    console.log('');
  }
}
