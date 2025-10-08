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
    this.eventPollingInterval = null;
    this.indexPollingInterval = null;
  }

  async initialize() {
    this.factoryService = new FactoryService(this.provider);
    await this.factoryService.initialize();
    
    this.checksService = new ChecksService(this.provider);
    
    this.telegramService = new TelegramService();
    this.telegramService.initialize();
    
    console.log('✅ Pair monitor initialized');
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

    let useWebSocket = false;
    try {
      await this.factoryService.listenForPairCreated(async (eventData) => {
        await this.handleNewPair(eventData);
      });
      useWebSocket = true;
      console.log('✅ Using WebSocket event listener');
    } catch (error) {
      console.log('⚠️ WebSocket not available, using polling mode');
    }

    if (!useWebSocket) {
      this.eventPollingInterval = await this.factoryService.pollForNewPairs(
        async (eventData) => {
          await this.handleNewPair(eventData);
        },
        config.monitoring.eventPollInterval
      );
    }

    this.startIndexPolling();
  }

  async handleNewPair(eventData) {
    const { pair, token0, token1, pairIndex, blockNumber, transactionHash } = eventData;
    
    const pairKey = pair.toLowerCase();
    
    if (this.processedPairs.has(pairKey)) {
      return;
    }
    
    this.processedPairs.add(pairKey);
    
    console.log(`\n🆕 New pair detected: ${pair}`);
    console.log(`   Token0: ${token0}`);
    console.log(`   Token1: ${token1}`);
    console.log(`   Index: ${pairIndex}`);
    console.log(`   Block: ${blockNumber}`);
    console.log(`   TX: ${transactionHash}`);

    try {
      const pairInfo = await this.checksService.checkPair(pair);
      
      await this.telegramService.sendPairAlert({
        ...pairInfo,
        blockNumber,
        transactionHash,
      });
      
      console.log(`✅ Notification sent for pair ${pair}`);
    } catch (error) {
      console.error(`❌ Error processing pair ${pair}:`, error.message);
      
      try {
        await this.telegramService.sendMessage(
          `🆕 *New Pair Detected*\n\n` +
          `Pair: \`${pair}\`\n` +
          `Token0: \`${token0}\`\n` +
          `Token1: \`${token1}\`\n` +
          `Block: ${blockNumber}\n` +
          `TX: \`${transactionHash}\`\n\n` +
          `⚠️ Could not fetch detailed info: ${error.message}`
        );
      } catch (telegramError) {
        console.error('Failed to send error notification:', telegramError.message);
      }
    }
  }

  async startIndexPolling() {
    const pollInterval = config.monitoring.pollInterval;
    
    console.log(`Starting index polling every ${pollInterval}ms`);
    
    let lastCheckedIndex = await this.factoryService.getAllPairsLength();
    console.log(`Initial pair count: ${lastCheckedIndex}`);
    
    this.indexPollingInterval = setInterval(async () => {
      if (!this.isRunning) {
        return;
      }
      
      try {
        const currentLength = await this.factoryService.getAllPairsLength();
        
        if (currentLength > lastCheckedIndex) {
          console.log(`\nNew pairs detected via index! Total: ${currentLength} (was: ${lastCheckedIndex})`);
          
          for (let i = lastCheckedIndex; i < currentLength; i++) {
            try {
              const pairAddress = await this.factoryService.getPairAtIndex(i);
              
              if (!this.processedPairs.has(pairAddress.toLowerCase())) {
                await this.handleNewPair({
                  pair: pairAddress,
                  token0: 'Unknown',
                  token1: 'Unknown',
                  pairIndex: i,
                  blockNumber: null,
                  transactionHash: null,
                });
              }
            } catch (error) {
              console.error(`Error checking pair at index ${i}:`, error.message);
            }
          }
          
          lastCheckedIndex = currentLength;
        }
      } catch (error) {
        console.error('Error during index polling:', error.message);
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
      this.factoryService.stopListening(this.eventPollingInterval);
    }
    
    if (this.indexPollingInterval) {
      clearInterval(this.indexPollingInterval);
      this.indexPollingInterval = null;
    }

    try {
      await this.telegramService.sendStatus('🛑 DEX Scanner stopped');
    } catch (error) {
      console.error('Failed to send shutdown message:', error.message);
    }

    console.log('Pair monitor stopped');
  }
}
