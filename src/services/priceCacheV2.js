import Redis from 'ioredis';
import axios from 'axios';
import { config } from '../config.js';

/**
 * Price Cache V2 Service with Redis Support
 * 
 * Features:
 * - Redis cache with 60s TTL
 * - Multi-provider fallback (CoinGecko → DexScreener → Binance)
 * - Graceful degradation if Redis unavailable
 * - In-memory fallback cache
 * - Rate limiting protection
 * 
 * Sprint 1 - ~400 lines of code
 */
export class PriceCacheV2Service {
  constructor() {
    this.redis = null;
    this.redisAvailable = false;
    this.memoryCache = new Map(); // Fallback cache
    this.updateInterval = null;
    this.isUpdating = false;
    
    // Cache TTL
    this.cacheTTL = config.priceCache?.ttl || 60; // 60 seconds
    
    // Rate limiting
    this.lastApiCall = {
      coingecko: 0,
      dexscreener: 0,
      binance: 0,
    };
    this.apiRateLimit = {
      coingecko: 10000, // 10 seconds between calls
      dexscreener: 2000, // 2 seconds between calls
      binance: 1000, // 1 second between calls
    };
    
    // Known token addresses (BSC)
    this.knownTokens = {
      '0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c': {
        symbol: 'WBNB',
        decimals: 18,
        coingeckoId: 'binancecoin',
      },
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
  }

  async initialize() {
    console.log('💰 Initializing Price Cache V2 Service...');

    // Try to connect to Redis
    if (config.redis?.url) {
      try {
        console.log(`   🔄 Connecting to Redis: ${config.redis.url}`);
        this.redis = new Redis(config.redis.url, {
          maxRetriesPerRequest: 3,
          retryStrategy(times) {
            if (times > 3) {
              return null; // Stop retrying
            }
            return Math.min(times * 200, 1000);
          },
          lazyConnect: true,
        });

        await this.redis.connect();
        
        // Test Redis connection
        await this.redis.ping();
        this.redisAvailable = true;
        console.log('   ✅ Redis connected successfully');

      } catch (error) {
        console.warn('   ⚠️  Redis connection failed:', error.message);
        console.warn('   📝 Falling back to in-memory cache');
        this.redisAvailable = false;
        this.redis = null;
      }
    } else {
      console.log('   📝 Redis not configured, using in-memory cache');
      this.redisAvailable = false;
    }

    // Initial price update
    await this.updatePrices();

    // Start periodic updates
    const updateInterval = config.priceCache?.updateInterval || 300000; // 5 minutes
    this.updateInterval = setInterval(() => {
      this.updatePrices();
    }, updateInterval);

    console.log(`   ⏱️  Update interval: ${updateInterval / 1000}s`);
    console.log('✅ Price Cache V2 Service initialized');
  }

  /**
   * Update prices from external APIs
   */
  async updatePrices() {
    if (this.isUpdating) {
      console.log('   ⏳ Price update already in progress, skipping...');
      return;
    }

    this.isUpdating = true;
    console.log('💰 Updating prices...');

    try {
      // Update BNB price
      const bnbPrice = await this.fetchBNBPrice();
      if (bnbPrice) {
        await this.setPrice('WBNB', bnbPrice);
        console.log(`   ✅ BNB price updated: $${bnbPrice.toFixed(2)}`);
      }

      // Update other major tokens if needed
      // Could add ETH, BTC, etc. here

    } catch (error) {
      console.error('   ❌ Price update failed:', error.message);
    } finally {
      this.isUpdating = false;
    }
  }

  /**
   * Fetch BNB price with multi-provider fallback
   */
  async fetchBNBPrice() {
    // Try CoinGecko first
    try {
      const price = await this.fetchFromCoinGecko('binancecoin');
      if (price) return price;
    } catch (error) {
      console.warn('   ⚠️  CoinGecko failed:', error.message);
    }

    // Try DexScreener
    try {
      const price = await this.fetchFromDexScreener('0xbb4CdB9CBd36B01bD1cBaEBF2De08d9173bc095c');
      if (price) return price;
    } catch (error) {
      console.warn('   ⚠️  DexScreener failed:', error.message);
    }

    // Try Binance
    try {
      const price = await this.fetchFromBinance('BNBUSDT');
      if (price) return price;
    } catch (error) {
      console.warn('   ⚠️  Binance failed:', error.message);
    }

    // Return cached value or fallback
    const cached = await this.getPrice('WBNB');
    return cached || 600; // Fallback to $600
  }

  /**
   * Fetch price from CoinGecko
   */
  async fetchFromCoinGecko(coinId) {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastCall = now - this.lastApiCall.coingecko;
    if (timeSinceLastCall < this.apiRateLimit.coingecko) {
      throw new Error('Rate limit');
    }

    const response = await axios.get(
      `https://api.coingecko.com/api/v3/simple/price`,
      {
        params: {
          ids: coinId,
          vs_currencies: 'usd',
        },
        timeout: 5000,
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    this.lastApiCall.coingecko = Date.now();

    if (response.data && response.data[coinId] && response.data[coinId].usd) {
      return response.data[coinId].usd;
    }

    throw new Error('Invalid response from CoinGecko');
  }

  /**
   * Fetch price from DexScreener
   */
  async fetchFromDexScreener(tokenAddress) {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastCall = now - this.lastApiCall.dexscreener;
    if (timeSinceLastCall < this.apiRateLimit.dexscreener) {
      throw new Error('Rate limit');
    }

    const chainId = config.chainId === 56 ? 'bsc' : 'ethereum';
    const response = await axios.get(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenAddress}`,
      {
        timeout: 5000,
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    this.lastApiCall.dexscreener = Date.now();

    if (response.data && response.data.pairs && response.data.pairs.length > 0) {
      // Get the most liquid pair
      const pairs = response.data.pairs.sort((a, b) => 
        parseFloat(b.liquidity?.usd || 0) - parseFloat(a.liquidity?.usd || 0)
      );
      
      const mainPair = pairs[0];
      if (mainPair.priceUsd) {
        return parseFloat(mainPair.priceUsd);
      }
    }

    throw new Error('No price data from DexScreener');
  }

  /**
   * Fetch price from Binance
   */
  async fetchFromBinance(symbol) {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastCall = now - this.lastApiCall.binance;
    if (timeSinceLastCall < this.apiRateLimit.binance) {
      throw new Error('Rate limit');
    }

    const response = await axios.get(
      `https://api.binance.com/api/v3/ticker/price`,
      {
        params: { symbol },
        timeout: 5000,
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    this.lastApiCall.binance = Date.now();

    if (response.data && response.data.price) {
      return parseFloat(response.data.price);
    }

    throw new Error('Invalid response from Binance');
  }

  /**
   * Get price from cache (Redis or memory)
   */
  async getPrice(symbol) {
    try {
      if (this.redisAvailable) {
        const cached = await this.redis.get(`price:${symbol}`);
        if (cached) {
          return parseFloat(cached);
        }
      } else {
        // Use memory cache
        const cached = this.memoryCache.get(symbol);
        if (cached && Date.now() - cached.timestamp < this.cacheTTL * 1000) {
          return cached.price;
        }
      }
    } catch (error) {
      console.warn(`   ⚠️  Cache read error for ${symbol}:`, error.message);
    }

    return null;
  }

  /**
   * Set price in cache (Redis or memory)
   */
  async setPrice(symbol, price) {
    try {
      if (this.redisAvailable) {
        await this.redis.setex(`price:${symbol}`, this.cacheTTL, price.toString());
      } else {
        // Use memory cache
        this.memoryCache.set(symbol, {
          price,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.warn(`   ⚠️  Cache write error for ${symbol}:`, error.message);
      // Fallback to memory
      this.memoryCache.set(symbol, {
        price,
        timestamp: Date.now(),
      });
    }
  }

  /**
   * Get token price in USD
   */
  async getTokenPriceUSD(tokenAddress) {
    // Normalize address
    const normalizedAddress = tokenAddress.toLowerCase();

    // Check if it's a known token
    const knownToken = this.knownTokens[normalizedAddress];
    if (!knownToken) {
      return null; // Unknown token
    }

    // If it has a fixed price (stablecoins)
    if (knownToken.priceUSD) {
      return knownToken.priceUSD;
    }

    // Get from cache
    return await this.getPrice(knownToken.symbol);
  }

  /**
   * Check if token is known
   */
  isKnownToken(tokenAddress) {
    const normalizedAddress = tokenAddress.toLowerCase();
    return !!this.knownTokens[normalizedAddress];
  }

  /**
   * Get known token info
   */
  getKnownTokenInfo(tokenAddress) {
    const normalizedAddress = tokenAddress.toLowerCase();
    return this.knownTokens[normalizedAddress] || null;
  }

  /**
   * Get cached price (backward compatibility)
   */
  async getCachedPrice(symbol) {
    return await this.getPrice(symbol);
  }

  /**
   * Cleanup memory cache (remove expired entries)
   */
  cleanupMemoryCache() {
    const now = Date.now();
    const ttlMs = this.cacheTTL * 1000;

    for (const [key, value] of this.memoryCache.entries()) {
      if (now - value.timestamp > ttlMs) {
        this.memoryCache.delete(key);
      }
    }
  }

  /**
   * Shutdown service
   */
  async shutdown() {
    console.log('   🛑 Shutting down Price Cache V2 Service...');

    // Stop update interval
    if (this.updateInterval) {
      clearInterval(this.updateInterval);
      this.updateInterval = null;
    }

    // Disconnect Redis
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch (error) {
        // Ignore errors
      }
      this.redis = null;
    }

    // Clear memory cache
    this.memoryCache.clear();

    console.log('   ✅ Price Cache V2 Service stopped');
  }
}
