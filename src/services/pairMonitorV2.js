import { ethers } from 'ethers';
import { config } from '../config.js';
import { TelegramService } from './telegram.js';
import { TokenService } from './token.js';
import { MultiRPCProviderService } from './multiRPCProvider.js';
import { PriceCacheV2Service } from './priceCacheV2.js';
import { VolumeAnalyzerService } from './volumeAnalyzer.js';
import { LiquidityFilterV2Service } from './liquidityFilterV2.js';
import { SecurityChecksService } from './securityChecks.js';

/**
 * Pair Monitor V2 Service
 * 
 * Features:
 * - Multi-RPC provider integration
 * - Redis-based price cache
 * - Volume analysis with Subgraph
 * - 3-tier filtering system
 * - Enhanced statistics tracking
 * 
 * Sprint 1 - ~380 lines of code
 */
export class PairMonitorV2Service {
  constructor(provider = null) {
    // Use Multi-RPC provider if available, fallback to single provider
    this.provider = provider;
    this.telegram = new TelegramService();
    this.tokenService = null; // Will be initialized after provider
    this.priceCache = new PriceCacheV2Service();
    this.volumeAnalyzer = new VolumeAnalyzerService();
    this.liquidityFilter = null; // Will be initialized after priceCache
    this.securityChecks = null; // Will be initialized after provider
    this.processedPairs = new Set();
    this.isMonitoring = false;
    this.pollInterval = null;
    this.statsInterval = null;
    this.startTime = null;
    
    // Enhanced statistics
    this.stats = {
      total: 0,
      filtered: 0,
      earlyGems: 0,
      highLiquidity: 0,
      mega: 0,
      vip: 0,
      public: 0,
      errors: 0,
      rpcFailovers: 0,
      cacheHits: 0,
    };
  }

  async initialize() {
    console.log('🚀 Initializing Pair Monitor V2 Service...');
    
    // Initialize Multi-RPC provider if not provided
    if (!this.provider) {
      this.provider = new MultiRPCProviderService();
      await this.provider.initialize();
    }

    // Get the actual provider instance
    const actualProvider = this.provider.getProvider ? this.provider.getProvider() : this.provider.provider;
    
    // Initialize dependent services
    this.tokenService = new TokenService(this.provider);
    this.securityChecks = new SecurityChecksService(actualProvider);
    
    // Initialize price cache
    await this.priceCache.initialize();
    
    // Initialize liquidity filter with all dependencies
    this.liquidityFilter = new LiquidityFilterV2Service(
      actualProvider,
      this.priceCache,
      this.volumeAnalyzer
    );
    
    // Initialize Telegram bot
    this.telegram.initialize();
    
    // Send startup notification
    await this.telegram.sendStartupMessage();
    
    console.log('✅ Pair Monitor V2 Service initialized');
  }

  async start() {
    if (this.isMonitoring) {
      console.log('⚠️ Monitoring already active');
      return;
    }

    this.isMonitoring = true;
    this.startTime = Date.now();
    console.log('▶️  Starting pair monitoring (V2)...');
    
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
    console.log('⏸️  Stopping pair monitoring (V2)...');
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
    await this.priceCache.shutdown();
    
    if (this.provider.disconnect) {
      await this.provider.disconnect();
    }
    
    await this.telegram.shutdown();
    
    // Print statistics
    this.printStatistics();
    
    console.log('✅ Pair monitoring stopped');
  }

  async monitorPairs() {
    const factoryAddress = config.factory.address;
    const pollInterval = config.monitoring.eventPollInterval;

    console.log(`🔍 Monitoring factory: ${factoryAddress}`);
    console.log(`💧 3-Tier Filtering System:`);
    console.log(`   🌟 Early Gems: $${this.liquidityFilter.tiers.earlyGems.minLiquidity.toLocaleString()}+ (VIP only)`);
    console.log(`   💎 High Liquidity: $${this.liquidityFilter.tiers.highLiquidity.minLiquidityVIP.toLocaleString()}+ (VIP) / $${this.liquidityFilter.tiers.highLiquidity.minLiquidityPublic.toLocaleString()}+ (Public)`);
    console.log(`   🚀 Mega Pairs: $${this.liquidityFilter.tiers.mega.minLiquidity.toLocaleString()}+ (All)`);
    console.log(`⏱️  Poll interval: ${pollInterval}ms\n`);

    // Factory ABI
    const factoryAbi = [
      'event PairCreated(address indexed token0, address indexed token1, address pair, uint256)'
    ];

    // Get provider
    const actualProvider = this.provider.getProvider ? this.provider.getProvider() : this.provider.provider;

    const factory = new ethers.Contract(
      factoryAddress,
      factoryAbi,
      actualProvider
    );

    // Get starting block
    let lastBlock;
    if (this.provider.getBlockNumber) {
      lastBlock = await this.provider.getBlockNumber();
    } else {
      lastBlock = await actualProvider.getBlockNumber();
    }
    
    console.log(`📍 Starting from block: ${lastBlock}\n`);

    const checkForNewPairs = async () => {
      try {
        // Get current block
        let currentBlock;
        if (this.provider.getBlockNumber) {
          currentBlock = await this.provider.getBlockNumber();
        } else {
          currentBlock = await actualProvider.getBlockNumber();
        }

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
        
        // Track RPC failovers if using Multi-RPC
        if (this.provider.getStats) {
          const rpcStats = this.provider.getStats();
          this.stats.rpcFailovers = rpcStats.failovers;
        }

      } catch (error) {
        console.error('❌ Error checking for new pairs:', error.message);
        this.stats.errors++;
        
        // Only send critical error notifications
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
      // Step 1: Analyze volume
      console.log('   📊 Analyzing volume...');
      const volumeData = await this.volumeAnalyzer.analyzePair(pairAddress);

      // Step 2: Analyze liquidity with volume data
      console.log('   💧 Analyzing liquidity...');
      const liquidityAnalysis = await this.liquidityFilter.analyzePair(pairAddress, volumeData);

      if (!liquidityAnalysis.success) {
        console.log(`   ⏭️  Filtered: ${liquidityAnalysis.message}`);
        this.stats.filtered++;
        return;
      }

      console.log(`   💧 Liquidity: ${this.liquidityFilter.formatLiquidity(liquidityAnalysis.liquidityUSD)}`);
      console.log(`   📊 Volume 24h: ${volumeData.success ? this.volumeAnalyzer.formatVolume(volumeData.volume24h) : 'N/A'}`);
      console.log(`   🔄 Swaps (15m): ${volumeData.swapCount15m || 'N/A'}`);
      console.log(`   ${liquidityAnalysis.tierInfo.displayName}`);

      // Check if meets any threshold
      if (!liquidityAnalysis.shouldAlertVIP && !liquidityAnalysis.shouldAlertPublic) {
        console.log(`   ⏭️  Below all tier thresholds`);
        this.stats.filtered++;
        return;
      }

      // Update tier statistics
      if (liquidityAnalysis.tier === 'early-gems') this.stats.earlyGems++;
      if (liquidityAnalysis.tier === 'high-liquidity') this.stats.highLiquidity++;
      if (liquidityAnalysis.tier === 'mega') this.stats.mega++;

      // Step 3: Fetch token information
      console.log('   🪙 Fetching token info...');
      const token0Info = await this.tokenService.getTokenInfo(event.args.token0);
      const token1Info = await this.tokenService.getTokenInfo(event.args.token1);

      console.log(`   Token0: ${token0Info.symbol} (${token0Info.name})`);
      console.log(`   Token1: ${token1Info.symbol} (${token1Info.name})`);

      // Step 4: Security checks
      console.log('   🔒 Running security checks...');
      const securityChecks = await this.securityChecks.performChecks(
        event.args.token0,
        pairAddress
      );

      const checksFormat = this.securityChecks.formatChecks(securityChecks);
      console.log(`   Security: ${checksFormat.shortFormat}`);

      // Step 5: Prepare pair data
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
        tier: liquidityAnalysis.tierInfo,
        volumeData,
        securityChecks: checksFormat,
      };

      // Step 6: Send to appropriate channels
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

      // Determine channel parameter
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
      
      // Add V2-specific stats
      const enhancedStats = {
        ...this.stats,
        version: 'V2',
        rpcStats: this.provider.getStats ? this.provider.getStats() : null,
      };
      
      await this.telegram.sendStatistics(enhancedStats, uptime);
      console.log('✅ Statistics sent\n');
    } catch (error) {
      console.error('❌ Failed to send periodic statistics:', error.message);
    }
  }

  printStatistics() {
    console.log('\n📊 MONITORING STATISTICS (V2):');
    console.log(`   Total pairs detected: ${this.stats.total}`);
    console.log(`   Filtered (below threshold): ${this.stats.filtered}`);
    console.log(`   🌟 Early Gems: ${this.stats.earlyGems}`);
    console.log(`   💎 High Liquidity: ${this.stats.highLiquidity}`);
    console.log(`   🚀 Mega Pairs: ${this.stats.mega}`);
    console.log(`   Sent to VIP: ${this.stats.vip}`);
    console.log(`   Sent to Public: ${this.stats.public}`);
    console.log(`   Processing errors: ${this.stats.errors}`);
    console.log(`   RPC failovers: ${this.stats.rpcFailovers}`);
    
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
