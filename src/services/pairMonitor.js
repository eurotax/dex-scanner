import { FactoryService } from './factory.js';
import { ChecksService } from './checks.js';
import { TelegramService } from './telegram.js';
import { config } from '../config.js';

export class PairMonitorService {
  constructor(provider) {
    this.provider = provider;
    this.factoryService = null;
    this.checksService = null;
    this.telegramService = null;
    this.isRunning = false;
    this.processedPairs = new Set();
  }

  initialize() {
    this.factoryService = new FactoryService(this.provider);
    this.factoryService.initialize();
    
    this.checksService = new ChecksService(this.provider);
    
    this.telegramService = new TelegramService();
    this.telegramService.initialize();
    
    console.log('Pair monitor initialized');
  }

  async start() {
    if (this.isRunning) {
      console.log('Pair monitor is already running');
      return;
    }

    this.isRunning = true;
    console.log('Starting pair monitor...');

    try {
      await this.telegramService.sendStatus('🚀 DEX Scanner started and monitoring for new pairs');
    } catch (error) {
      console.error('Failed to send startup message:', error.message);
    }

    // Listen for new pair creation events
    this.factoryService.listenForPairCreated(async (eventData) => {
      await this.handleNewPair(eventData);
    });

    // Also poll for new pairs periodically
    this.startPolling();
  }

  async handleNewPair(eventData) {
    const { pair, token0, token1, pairIndex, blockNumber, transactionHash } = eventData;
    
    // Skip if already processed
    if (this.processedPairs.has(pair.toLowerCase())) {
      return;
    }
    
    this.processedPairs.add(pair.toLowerCase());
    
    console.log(`\n🆕 New pair detected: ${pair}`);
    console.log(`   Token0: ${token0}`);
    console.log(`   Token1: ${token1}`);
    console.log(`   Index: ${pairIndex}`);
    console.log(`   Block: ${blockNumber}`);
    console.log(`   TX: ${transactionHash}`);

    try {
      // Get detailed pair information
      const pairInfo = await this.checksService.checkPair(pair);
      
      // Send notification
      await this.telegramService.sendPairAlert({
        ...pairInfo,
        blockNumber,
        transactionHash,
      });
      
      console.log(`✅ Notification sent for pair ${pair}`);
    } catch (error) {
      console.error(`❌ Error processing pair ${pair}:`, error.message);
      try {
        await this.telegramService.sendError(error);
      } catch (telegramError) {
        console.error('Failed to send error notification:', telegramError.message);
      }
    }
  }

  async startPolling() {
    const pollInterval = config.monitoring.pollInterval;
    
    console.log(`Starting polling every ${pollInterval}ms`);
    
    let lastCheckedIndex = await this.factoryService.getAllPairsLength();
    console.log(`Initial pair count: ${lastCheckedIndex}`);
    
    setInterval(async () => {
      if (!this.isRunning) {
        return;
      }
      
      try {
        const currentLength = await this.factoryService.getAllPairsLength();
        
        if (currentLength > lastCheckedIndex) {
          console.log(`\nNew pairs detected! Total: ${currentLength} (was: ${lastCheckedIndex})`);
          
          // Check each new pair
          for (let i = lastCheckedIndex; i < currentLength; i++) {
            const pairAddress = await this.factoryService.getPairAtIndex(i);
            
            if (!this.processedPairs.has(pairAddress.toLowerCase())) {
              await this.handleNewPair({
                pair: pairAddress,
                token0: 'N/A',
                token1: 'N/A',
                pairIndex: i,
                blockNumber: null,
                transactionHash: null,
              });
            }
          }
          
          lastCheckedIndex = currentLength;
        }
      } catch (error) {
        console.error('Error during polling:', error.message);
      }
    }, pollInterval);
  }

  async stop() {
    if (!this.isRunning) {
      console.log('Pair monitor is not running');
      return;
    }

    this.isRunning = false;
    
    if (this.factoryService) {
      this.factoryService.stopListening();
    }

    try {
      await this.telegramService.sendStatus('🛑 DEX Scanner stopped');
    } catch (error) {
      console.error('Failed to send shutdown message:', error.message);
    }

    console.log('Pair monitor stopped');
  }
}
