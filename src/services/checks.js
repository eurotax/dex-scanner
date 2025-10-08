import { ethers } from 'ethers';
import { ExplorerFactory } from '../explorers/explorerFactory.js';
import { withBackoff } from '../utils/backoff.js';

// Minimal ERC20 ABI
const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
];

// Minimal Pair ABI
const PAIR_ABI = [
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
];

export class ChecksService {
  constructor(provider) {
    this.provider = provider;
    this.explorer = ExplorerFactory.getDefaultExplorer();
  }

  async checkPair(pairAddress) {
    const pairContract = new ethers.Contract(pairAddress, PAIR_ABI, this.provider);
    
    try {
      const [token0Address, token1Address, reserves] = await withBackoff(
        async () => {
          return await Promise.all([
            pairContract.token0(),
            pairContract.token1(),
            pairContract.getReserves(),
          ]);
        },
        `checkPair(${pairAddress})`
      );

      const [token0Info, token1Info] = await Promise.all([
        this.getTokenInfo(token0Address),
        this.getTokenInfo(token1Address),
      ]);

      return {
        pair: pairAddress,
        token0: {
          address: token0Address,
          ...token0Info,
          reserve: reserves.reserve0.toString(),
        },
        token1: {
          address: token1Address,
          ...token1Info,
          reserve: reserves.reserve1.toString(),
        },
        lastUpdate: Number(reserves.blockTimestampLast),
      };
    } catch (error) {
      console.error(`Error checking pair ${pairAddress}:`, error.message);
      throw error;
    }
  }

  async getTokenInfo(tokenAddress) {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    
    const results = await Promise.allSettled([
      this.callWithTimeout(tokenContract.name(), 5000, 'Unknown'),
      this.callWithTimeout(tokenContract.symbol(), 5000, '???'),
      this.callWithTimeout(tokenContract.decimals(), 5000, 18),
      this.callWithTimeout(tokenContract.totalSupply(), 5000, 0n),
    ]);

    const [name, symbol, decimals, totalSupply] = results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        console.warn(`Failed to get token property ${index} for ${tokenAddress}:`, result.reason.message);
        return ['Unknown', '???', 18, 0n][index];
      }
    });

    return {
      name: String(name),
      symbol: String(symbol),
      decimals: Number(decimals),
      totalSupply: totalSupply.toString(),
    };
  }

  async callWithTimeout(promise, timeoutMs, fallbackValue) {
    try {
      return await Promise.race([
        promise,
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Timeout')), timeoutMs)
        )
      ]);
    } catch (error) {
      return fallbackValue;
    }
  }

  async isContractVerified(address) {
    try {
      const sourceCode = await withBackoff(
        () => this.explorer.getContractSourceCode(address),
        `isContractVerified(${address})`
      );
      return sourceCode.SourceCode !== '';
    } catch (error) {
      console.warn(`Could not check verification for ${address}:`, error.message);
      return false;
    }
  }

  async getContractCreationInfo(address) {
    try {
      const creationInfo = await withBackoff(
        () => this.explorer.getContractCreation(address),
        `getContractCreationInfo(${address})`
      );
      return creationInfo;
    } catch (error) {
      console.warn(`Could not get creation info for ${address}:`, error.message);
      return null;
    }
  }
}
