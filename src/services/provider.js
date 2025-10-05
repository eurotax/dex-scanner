import { ethers } from 'ethers';
import { config } from '../config.js';

export class ProviderService {
  constructor(rpcUrl = null) {
    this.rpcUrl = rpcUrl || config.rpcUrl;
    this.provider = null;
  }

  async connect() {
    if (this.provider) {
      return this.provider;
    }

    try {
      this.provider = new ethers.JsonRpcProvider(this.rpcUrl);
      
      // Test the connection
      const network = await this.provider.getNetwork();
      console.log(`Connected to network: ${network.name} (chainId: ${network.chainId})`);
      
      return this.provider;
    } catch (error) {
      console.error('Failed to connect to RPC provider:', error.message);
      throw error;
    }
  }

  getProvider() {
    if (!this.provider) {
      throw new Error('Provider not initialized. Call connect() first.');
    }
    return this.provider;
  }

  async getBlockNumber() {
    const provider = this.getProvider();
    return await provider.getBlockNumber();
  }

  async getBlock(blockNumber) {
    const provider = this.getProvider();
    return await provider.getBlock(blockNumber);
  }

  async disconnect() {
    if (this.provider) {
      await this.provider.destroy();
      this.provider = null;
      console.log('Disconnected from RPC provider');
    }
  }
}
