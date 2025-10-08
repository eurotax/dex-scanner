import { ethers } from 'ethers';

// Minimal ERC20 ABI
const ERC20_ABI = [
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
];

export class TokenService {
  constructor(providerService) {
    this.providerService = providerService;
  }

  async getTokenInfo(tokenAddress) {
    const provider = this.providerService.provider;
    const tokenContract = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    
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
        console.warn(`Failed to get token property ${index} for ${tokenAddress}:`, result.reason?.message || 'Unknown error');
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
}
