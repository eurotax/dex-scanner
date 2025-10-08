import { ethers } from 'ethers';
import { config } from '../config.js';

export class ProviderService {
  constructor(rpcUrl = null) {
    this.rpcUrl = rpcUrl || config.rpcUrl;
    this.provider = null;
    this.network = null;
  }

  async connect() {
    if (this.provider) {
      return this.provider;
    }

    try {
      console.log(`Connecting to RPC: ${this.rpcUrl}`);
      this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
      
      const network = await Promise.race([
        this.provider.getNetwork(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Connection timeout')), 10000)
        )
      ]);
      
      this.network = network;
      console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);
      
      if (Number(network.chainId) !== config.chainId) {
        console.warn(`⚠️ WARNING: Connected chain ID (${network.chainId}) doesn't match configured CHAIN_ID (${config.chainId})`);
        console.warn('This may cause issues. Please check your RPC_URL and CHAIN_ID settings.');
      }
      
      return this.provider;
    } catch (error) {
      console.error('Failed to connect to RPC provider:', error.message);
      console.error('Please check your RPC_URL configuration');
      throw error;
    }
  }

  getProvider() {
    if (!this.provider) {
      throw new Error('Provider not initialized. Call connect() first.');
    }
    return this.provider;
  }

  getNetwork() {
    return this.network;
  }

  async getBlockNumber() {
    const provider = this.getProvider();
    try {
      return await provider.getBlockNumber();
    } catch (error) {
      console.error('Failed to get block number:', error.message);
      throw error;
    }
  }

  async getBlock(blockNumber) {
    const provider = this.getProvider();
    try {
      return await provider.getBlock(blockNumber);
    } catch (error) {
      console.error(`Failed to get block ${blockNumber}:`, error.message);
      throw error;
    }
  }

  async isHealthy() {
    try {
      await this.getBlockNumber();
      return true;
    } catch (error) {
      return false;
    }
  }

  async disconnect() {
    if (this.provider) {
      await this.provider.destroy();
      this.provider = null;
      this.network = null;
      console.log('Disconnected from RPC provider');
    }
  }
}
