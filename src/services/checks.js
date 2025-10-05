import { ethers } from 'ethers';
import { ExplorerFactory } from '../explorers/explorerFactory.js';

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
      const [token0Address, token1Address, reserves] = await Promise.all([
        pairContract.token0(),
        pairContract.token1(),
        pairContract.getReserves(),
      ]);

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
        lastUpdate: reserves.blockTimestampLast,
      };
    } catch (error) {
      console.error(`Error checking pair ${pairAddress}:`, error.message);
      throw error;
    }
  }

  async getTokenInfo(tokenAddress) {
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);
    
    try {
      const [name, symbol, decimals, totalSupply] = await Promise.all([
        tokenContract.name().catch(() => 'Unknown'),
        tokenContract.symbol().catch(() => '???'),
        tokenContract.decimals().catch(() => 18),
        tokenContract.totalSupply().catch(() => 0n),
      ]);

      return {
        name,
        symbol,
        decimals,
        totalSupply: totalSupply.toString(),
      };
    } catch (error) {
      console.error(`Error getting token info for ${tokenAddress}:`, error.message);
      return {
        name: 'Unknown',
        symbol: '???',
        decimals: 18,
        totalSupply: '0',
      };
    }
  }

  async isContractVerified(address) {
    try {
      const sourceCode = await this.explorer.getContractSourceCode(address);
      return sourceCode.SourceCode !== '';
    } catch (error) {
      console.warn(`Could not check verification for ${address}:`, error.message);
      return false;
    }
  }

  async getContractCreationInfo(address) {
    try {
      const creationInfo = await this.explorer.getContractCreation(address);
      return creationInfo;
    } catch (error) {
      console.warn(`Could not get creation info for ${address}:`, error.message);
      return null;
    }
  }
}
