import { config } from '../config.js';

// Known tokens on BSC with their addresses
export const KNOWN_TOKENS = {
  // Wrapped BNB
  '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c': {
    symbol: 'WBNB',
    decimals: 18,
    priceSource: 'coingecko',
    coingeckoId: 'binancecoin',
  },
  
  // Stablecoins (always $1)
  '0x55d398326f99059fF775485246999027B3197955': {
    symbol: 'USDT',
    decimals: 18,
    priceUSD: 1.0,
  },
  '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56': {
    symbol: 'BUSD',
    decimals: 18,
    priceUSD: 1.0,
  },
  '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d': {
    symbol: 'USDC',
    decimals: 18,
    priceUSD: 1.0,
  },
};

export class PriceCacheService {
  constructor() {
    this.cache = {
      WBNB: 600, // Fallback price
    };
    this.updateInterval = null;
    this.isUpdating = false;
  }

  initialize() {
    console.log('💰 Initializing price cache service...');
    
    // Initial update
    this.updatePrices();
    
    // Update every 5 minutes
    this.updateInterval = setInterval(() => {
      this.updatePrices();
    }, config.priceCache?.updateInterval || 300000);
    
    console.log('✅ Price cache service initialized');
  }

  async updatePrices() {
    if (this.isUpdating) {
      console.log('⏳ Price update already in progress, skipping...');
      return;
    }

    this.isUpdating = true;

    try {
      // Get BNB price from CoinGecko (Free API)
      const response = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=binancecoin&vs_currencies=usd',
        {
          headers: {
            'Accept': 'application/json',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.binancecoin && data.binancecoin.usd) {
        this.cache.WBNB = data.binancecoin.usd;
        console.log(`💰 Updated BNB price: $${this.cache.WBNB.toFixed(2)}`);
      } else {
        throw new Error('Invalid response from CoinGecko');
      }
      
    } catch (error) {
      console.warn(`⚠️ Failed to update BNB price: ${error.message}`);
      console.log(`   Using cached price: $${this.cache.WBNB.toFixed(2)}`);
    } finally {
      this.isUpdating = false;
    }
  }

  getTokenPriceUSD(tokenAddress) {
    // Normalize address to lowercase
    const normalizedAddress = tokenAddress.toLowerCase();
    
    // Check if it's a known token
    const knownToken = KNOWN_TOKENS[normalizedAddress];
    
    if (!knownToken) {
      return null; // Unknown token
    }

    // If it has a fixed price (stablecoins)
    if (knownToken.priceUSD) {
      return knownToken.priceUSD;
    }

    // If it needs to be fetched from cache (WBNB)
    if (knownToken.priceSource === 'coingecko') {
      return this.cache[knownToken.symbol] || 600; // Fallback to 600
    }

    return null;
  }

  isKnownToken(tokenAddress) {
    const normalizedAddress = tokenAddress.toLowerCase();
    return !!KNOWN_TOKENS[normalizedAddress];
  }

  getKnownTokenInfo(tokenAddress) {
    const normalizedAddress = tokenAddress.toLowerCase();
    return KNOWN_TOKENS[normalizedAddress] || null;
  }

  getCachedPrice(symbol) {
    return this.cache[symbol] || null;
  }

  shutdown() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
      console.log('🛑 Price cache service stopped');
    }
  }
}
