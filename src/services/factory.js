import { ethers } from 'ethers';
import { config } from '../config.js';

// Minimal Uniswap V2 Factory ABI
const FACTORY_ABI = [
  'event PairCreated(address indexed token0, address indexed token1, address pair, uint)',
  'function allPairs(uint) external view returns (address)',
  'function allPairsLength() external view returns (uint)',
  'function getPair(address tokenA, address tokenB) external view returns (address)',
];

export class FactoryService {
  constructor(provider, factoryAddress = null) {
    this.provider = provider;
    this.factoryAddress = factoryAddress || config.factory.address;
    this.contract = null;
    this.lastProcessedBlock = null;
    this.usePollingOnly = false;
  }

  async initialize() {
    if (!this.contract) {
      this.contract = new ethers.Contract(
        this.factoryAddress,
        FACTORY_ABI,
        this.provider
      );
      console.log(`Factory contract initialized at ${this.factoryAddress}`);
      
      try {
        await this.contract.allPairsLength();
        console.log('✅ Factory contract is accessible');
      } catch (error) {
        console.error('❌ Factory contract validation failed:', error.message);
        throw new Error(`Cannot access factory contract at ${this.factoryAddress}. Please check FACTORY_ADDRESS and CHAIN_ID configuration.`);
      }
      
      this.lastProcessedBlock = await this.provider.getBlockNumber();
      console.log(`Starting from block: ${this.lastProcessedBlock}`);
    }
    return this.contract;
  }

  getContract() {
    if (!this.contract) {
      throw new Error('Factory contract not initialized. Call initialize() first.');
    }
    return this.contract;
  }

  async getAllPairsLength() {
    const contract = this.getContract();
    const length = await contract.allPairsLength();
    return Number(length);
  }

  async getPairAtIndex(index) {
    const contract = this.getContract();
    return await contract.allPairs(index);
  }

  async getPairAddress(tokenA, tokenB) {
    const contract = this.getContract();
    return await contract.getPair(tokenA, tokenB);
  }

  async pollForNewPairs(callback, pollInterval = 30000) {
    console.log(`Starting event polling every ${pollInterval}ms (from block ${this.lastProcessedBlock})`);
    
    const poll = async () => {
      try {
        const currentBlock = await this.provider.getBlockNumber();
        
        if (currentBlock > this.lastProcessedBlock) {
          const contract = this.getContract();
          
          const filter = contract.filters.PairCreated();
          const events = await contract.queryFilter(
            filter,
            this.lastProcessedBlock + 1,
            currentBlock
          );
          
          if (events.length > 0) {
            console.log(`Found ${events.length} new PairCreated events`);
            
            for (const event of events) {
              const [token0, token1, pair, pairIndex] = event.args;
              
              callback({
                token0,
                token1,
                pair,
                pairIndex: Number(pairIndex),
                blockNumber: event.blockNumber,
                transactionHash: event.transactionHash,
              });
            }
          }
          
          this.lastProcessedBlock = currentBlock;
        }
      } catch (error) {
        console.error('Error polling for events:', error.message);
      }
    };
    
    await poll();
    
    const intervalId = setInterval(poll, pollInterval);
    
    return intervalId;
  }

  async listenForPairCreated(callback) {
    const contract = this.getContract();
    
    try {
      console.log('Attempting to listen for PairCreated events via WebSocket...');
      
      contract.on('PairCreated', (token0, token1, pair, pairIndex, event) => {
        callback({
          token0,
          token1,
          pair,
          pairIndex: Number(pairIndex),
          blockNumber: event.log.blockNumber,
          transactionHash: event.log.transactionHash,
        });
      });
      
      console.log('✅ WebSocket event listener established');
      this.usePollingOnly = false;
    } catch (error) {
      console.warn('⚠️ WebSocket listener failed:', error.message);
      console.log('Falling back to polling mode');
      this.usePollingOnly = true;
      throw error;
    }
  }

  stopListening(intervalId = null) {
    if (this.contract) {
      this.contract.removeAllListeners('PairCreated');
      console.log('Stopped listening for PairCreated events');
    }
    
    if (intervalId) {
      clearInterval(intervalId);
      console.log('Stopped polling interval');
    }
  }
}
