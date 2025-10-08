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
  }

  initialize() {
    if (!this.contract) {
      this.contract = new ethers.Contract(
        this.factoryAddress,
        FACTORY_ABI,
        this.provider
      );
      console.log(`Factory contract initialized at ${this.factoryAddress}`);
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

  async listenForPairCreated(callback) {
    const contract = this.getContract();
    
    console.log('Listening for PairCreated events...');
    
    try {
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
    } catch (error) {
      console.warn('⚠️  Event listening not supported by RPC provider:', error.message);
      console.warn('   Falling back to polling-only mode');
      throw error; // Re-throw to let caller know event listening failed
    }
  }

  stopListening() {
    if (this.contract) {
      this.contract.removeAllListeners('PairCreated');
      console.log('Stopped listening for PairCreated events');
    }
  }
}
