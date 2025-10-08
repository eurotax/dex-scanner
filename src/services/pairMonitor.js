import { config } from '../config.js';
import { TelegramService } from './telegram.js';
import { TokenService } from './token.js';

export class PairMonitorService {
  constructor(provider) {
    this.provider = provider;
    this.telegram = new TelegramService();
    this.tokenService = new TokenService(provider);
    this.processedPairs = new Set();
    this.isMonitoring = false;
    this.pollInterval = null;
  }

  async initialize() {
    console.log('Initializing pair monitor service...');
    
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
    console.log('▶️  Starting pair monitoring...');
    
    await this.monitorPairs();
  }

  async stop() {
    console.log('⏸️  Stopping pair monitoring...');
    this.isMonitoring = false;
    
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
    
    // Shutdown telegram service (sends remaining queued messages)
    await this.telegram.shutdown();
    
    console.log('✅ Pair monitoring stopped');
  }

  async monitorPairs() {
    const factoryAddress = config.factory.address;
    const pollInterval = config.monitoring.eventPollInterval;

    console.log(`🔍 Monitoring factory: ${factoryAddress}`);
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
        await this.telegram.sendError(error);
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

    console.log(`\n🆕 New pair detected!`);
    console.log(`   Address: ${pairAddress}`);
    console.log(`   Block: ${event.blockNumber}`);
    console.log(`   TX: ${event.transactionHash}`);

    try {
      // Fetch token information
      const token0Info = await this.tokenService.getTokenInfo(event.args.token0);
      const token1Info = await this.tokenService.getTokenInfo(event.args.token1);

      // Get pair reserves
      const pairAbi = [
        'function getReserves() external view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)'
      ];

      const pair = new this.provider.ethers.Contract(
        pairAddress,
        pairAbi,
        this.provider.provider
      );

      const reserves = await pair.getReserves();

      console.log(`   Token0: ${token0Info.symbol} (${token0Info.name})`);
      console.log(`   Token1: ${token1Info.symbol} (${token1Info.name})`);
      console.log(`   Reserve0: ${reserves.reserve0.toString()}`);
      console.log(`   Reserve1: ${reserves.reserve1.toString()}`);

      // Send Telegram notification
      await this.telegram.sendPairCreated({
        pairAddress,
        token0: {
          address: event.args.token0,
          symbol: token0Info.symbol,
          name: token0Info.name,
          decimals: token0Info.decimals,
          reserve: reserves.reserve0.toString(),
        },
        token1: {
          address: event.args.token1,
          symbol: token1Info.symbol,
          name: token1Info.name,
          decimals: token1Info.decimals,
          reserve: reserves.reserve1.toString(),
        },
        blockNumber: event.blockNumber,
        transactionHash: event.transactionHash,
      });

      console.log(`✅ Pair processed successfully\n`);

    } catch (error) {
      console.error(`❌ Error processing pair ${pairAddress}:`, error.message);
      await this.telegram.sendError(error);
    }
  }
}
