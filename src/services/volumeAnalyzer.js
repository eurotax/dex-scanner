import axios from 'axios';
import { config } from '../config.js';

/**
 * Volume Analyzer Service
 * 
 * Features:
 * - PancakeSwap Subgraph integration for accurate volume data
 * - DexScreener API fallback
 * - Swap count analysis (15-minute window)
 * - 24h volume tracking
 * - Activity pattern detection
 * 
 * Sprint 1 - ~320 lines of code
 */
export class VolumeAnalyzerService {
  constructor() {
    // Subgraph URLs by chain
    this.subgraphUrls = {
      1: 'https://api.thegraph.com/subgraphs/name/uniswap/uniswap-v2',
      56: 'https://api.thegraph.com/subgraphs/name/pancakeswap/pairs',
      137: 'https://api.thegraph.com/subgraphs/name/sameepsi/quickswap06',
      42161: 'https://api.thegraph.com/subgraphs/name/sushiswap/exchange-arbitrum',
    };

    this.subgraphUrl = this.subgraphUrls[config.chainId] || this.subgraphUrls[56];
    
    // Rate limiting
    this.lastSubgraphCall = 0;
    this.subgraphRateLimit = 2000; // 2 seconds between calls
    
    this.lastDexScreenerCall = 0;
    this.dexScreenerRateLimit = 2000; // 2 seconds between calls
  }

  /**
   * Analyze pair volume and activity
   */
  async analyzePair(pairAddress) {
    console.log(`   📊 Analyzing volume for ${pairAddress}...`);

    try {
      // Try Subgraph first (more accurate)
      const subgraphData = await this.fetchFromSubgraph(pairAddress);
      if (subgraphData.success) {
        console.log(`   ✅ Volume from Subgraph: $${subgraphData.volume24h.toLocaleString()}`);
        return subgraphData;
      }
    } catch (error) {
      console.warn(`   ⚠️  Subgraph failed:`, error.message);
    }

    try {
      // Fallback to DexScreener
      const dexScreenerData = await this.fetchFromDexScreener(pairAddress);
      if (dexScreenerData.success) {
        console.log(`   ✅ Volume from DexScreener: $${dexScreenerData.volume24h.toLocaleString()}`);
        return dexScreenerData;
      }
    } catch (error) {
      console.warn(`   ⚠️  DexScreener failed:`, error.message);
    }

    // Return failure if both sources failed
    return {
      success: false,
      reason: 'no_volume_data',
      message: 'Could not fetch volume data from any source',
      volume24h: 0,
      swapCount15m: 0,
      swapCount1h: 0,
    };
  }

  /**
   * Fetch volume data from Subgraph
   */
  async fetchFromSubgraph(pairAddress) {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastCall = now - this.lastSubgraphCall;
    if (timeSinceLastCall < this.subgraphRateLimit) {
      await new Promise(resolve => 
        setTimeout(resolve, this.subgraphRateLimit - timeSinceLastCall)
      );
    }

    const query = `
      {
        pair(id: "${pairAddress.toLowerCase()}") {
          id
          token0 {
            id
            symbol
          }
          token1 {
            id
            symbol
          }
          volumeUSD
          txCount
          createdAtTimestamp
        }
        
        swaps(
          where: {
            pair: "${pairAddress.toLowerCase()}"
            timestamp_gte: ${Math.floor(Date.now() / 1000) - 900}
          }
          orderBy: timestamp
          orderDirection: desc
          first: 100
        ) {
          id
          timestamp
          amountUSD
        }
      }
    `;

    const response = await axios.post(
      this.subgraphUrl,
      { query },
      {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    this.lastSubgraphCall = Date.now();

    if (response.data.errors) {
      throw new Error(`Subgraph query error: ${JSON.stringify(response.data.errors)}`);
    }

    const { pair, swaps } = response.data.data;

    if (!pair) {
      throw new Error('Pair not found in subgraph');
    }

    // Calculate metrics
    const volume24h = parseFloat(pair.volumeUSD || 0);
    const totalTxCount = parseInt(pair.txCount || 0);
    
    // Count swaps in last 15 minutes
    const fifteenMinutesAgo = Math.floor(Date.now() / 1000) - 900;
    const swapCount15m = swaps.filter(s => parseInt(s.timestamp) >= fifteenMinutesAgo).length;
    
    // Count swaps in last 1 hour
    const oneHourAgo = Math.floor(Date.now() / 1000) - 3600;
    const swapCount1h = swaps.filter(s => parseInt(s.timestamp) >= oneHourAgo).length;

    // Calculate average swap size
    const recentSwapVolume = swaps.reduce((sum, s) => sum + parseFloat(s.amountUSD || 0), 0);
    const avgSwapSize = swaps.length > 0 ? recentSwapVolume / swaps.length : 0;

    return {
      success: true,
      volume24h,
      swapCount15m,
      swapCount1h,
      totalTxCount,
      avgSwapSize,
      createdAt: parseInt(pair.createdAtTimestamp || 0),
      source: 'subgraph',
    };
  }

  /**
   * Fetch volume data from DexScreener API
   */
  async fetchFromDexScreener(pairAddress) {
    // Rate limiting
    const now = Date.now();
    const timeSinceLastCall = now - this.lastDexScreenerCall;
    if (timeSinceLastCall < this.dexScreenerRateLimit) {
      await new Promise(resolve => 
        setTimeout(resolve, this.dexScreenerRateLimit - timeSinceLastCall)
      );
    }

    const chainName = this.getChainName(config.chainId);
    const response = await axios.get(
      `https://api.dexscreener.com/latest/dex/pairs/${chainName}/${pairAddress}`,
      {
        timeout: 5000,
        headers: {
          'Accept': 'application/json',
        },
      }
    );

    this.lastDexScreenerCall = Date.now();

    if (!response.data || !response.data.pair) {
      throw new Error('Pair not found on DexScreener');
    }

    const pairData = response.data.pair;

    // Extract volume data
    const volume24h = parseFloat(pairData.volume?.h24 || 0);
    const txns24h = pairData.txns?.h24 || {};
    const totalTxCount = (txns24h.buys || 0) + (txns24h.sells || 0);

    // Estimate swap counts (DexScreener doesn't provide exact 15m data)
    // Use 1h data and scale down for 15m estimate
    const txns1h = pairData.txns?.h1 || {};
    const swapCount1h = (txns1h.buys || 0) + (txns1h.sells || 0);
    const swapCount15m = Math.floor(swapCount1h * 0.25); // Rough estimate

    // Calculate average swap size
    const avgSwapSize = totalTxCount > 0 ? volume24h / totalTxCount : 0;

    return {
      success: true,
      volume24h,
      swapCount15m,
      swapCount1h,
      totalTxCount,
      avgSwapSize,
      priceChange24h: parseFloat(pairData.priceChange?.h24 || 0),
      source: 'dexscreener',
    };
  }

  /**
   * Check if pair meets volume requirements
   */
  checkVolumeRequirements(volumeData, tier) {
    const requirements = this.getRequirements(tier);

    const checks = {
      volume24h: volumeData.volume24h >= requirements.minVolume24h,
      swapCount15m: volumeData.swapCount15m >= requirements.minSwaps15m,
    };

    const passed = Object.values(checks).every(check => check);

    return {
      passed,
      checks,
      volumeData,
      requirements,
    };
  }

  /**
   * Get volume requirements by tier
   */
  getRequirements(tier) {
    const tiers = {
      'early-gems': {
        minVolume24h: config.volume?.earlyGemsMin24h || 5000, // $5k
        minSwaps15m: config.volume?.earlyGemsMinSwaps || 10,
      },
      'high-liquidity': {
        minVolume24h: config.volume?.highLiqMin24h || 20000, // $20k
        minSwaps15m: config.volume?.highLiqMinSwaps || 15,
      },
      'mega': {
        minVolume24h: config.volume?.megaMin24h || 50000, // $50k
        minSwaps15m: config.volume?.megaMinSwaps || 20,
      },
    };

    return tiers[tier] || tiers['high-liquidity'];
  }

  /**
   * Get chain name for DexScreener API
   */
  getChainName(chainId) {
    const names = {
      1: 'ethereum',
      56: 'bsc',
      137: 'polygon',
      42161: 'arbitrum',
    };
    return names[chainId] || 'bsc';
  }

  /**
   * Format volume for display
   */
  formatVolume(volume) {
    if (volume >= 1000000) {
      return `$${(volume / 1000000).toFixed(2)}M`;
    } else if (volume >= 1000) {
      return `$${(volume / 1000).toFixed(1)}k`;
    } else {
      return `$${volume.toFixed(0)}`;
    }
  }

  /**
   * Get activity level based on swap count
   */
  getActivityLevel(swapCount15m) {
    if (swapCount15m >= 50) return '🔥 Very High';
    if (swapCount15m >= 20) return '⚡ High';
    if (swapCount15m >= 10) return '✅ Medium';
    if (swapCount15m >= 5) return '📊 Low';
    return '😴 Very Low';
  }
}
