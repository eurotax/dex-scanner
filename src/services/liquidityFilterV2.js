import { ethers } from 'ethers';
import { config } from '../config.js';

/**
 * Liquidity Filter V2 Service - 3-Tier Alert System
 * 
 * Tiers:
 * 1. EARLY GEMS (VIP only)
 *    - Min $1k liquidity
 *    - Min $5k 24h volume
 *    - Min 10 swaps (15min)
 *    - Min 50 holders
 * 
 * 2. HIGH LIQUIDITY (VIP + Public)
 *    - Min $10k liquidity (VIP)
 *    - Min $35k liquidity (Public)
 *    - Min $20k 24h volume
 * 
 * 3. MEGA PAIRS (All channels)
 *    - Min $50k liquidity
 *    - Highest priority
 * 
 * Sprint 1 - ~280 lines of code
 */

const PAIR_ABI = [
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
];

const ERC20_ABI = [
  'function balanceOf(address) view returns (uint256)',
  'function totalSupply() view returns (uint256)',
];

export class LiquidityFilterV2Service {
  constructor(provider, priceCacheService, volumeAnalyzerService) {
    this.provider = provider;
    this.priceCache = priceCacheService;
    this.volumeAnalyzer = volumeAnalyzerService;
    
    // Tier thresholds
    this.tiers = {
      earlyGems: {
        minLiquidity: config.liquidity?.earlyGemsMin || 1000, // $1k
        minVolume24h: config.volume?.earlyGemsMin24h || 5000, // $5k
        minSwaps15m: config.volume?.earlyGemsMinSwaps || 10,
        minHolders: config.liquidity?.earlyGemsMinHolders || 50,
        vipOnly: true,
      },
      highLiquidity: {
        minLiquidityVIP: config.liquidity?.minVIP || 10000, // $10k
        minLiquidityPublic: config.liquidity?.minPublic || 35000, // $35k
        minVolume24h: config.volume?.highLiqMin24h || 20000, // $20k
        minSwaps15m: config.volume?.highLiqMinSwaps || 15,
      },
      mega: {
        minLiquidity: config.liquidity?.megaMin || 50000, // $50k
        minVolume24h: config.volume?.megaMin24h || 50000, // $50k
        priority: 'highest',
      },
    };
  }

  /**
   * Analyze pair and determine tier
   */
  async analyzePair(pairAddress, volumeData = null) {
    try {
      const pairContract = new ethers.Contract(pairAddress, PAIR_ABI, this.provider);
      
      // Get token addresses and reserves
      const [token0Address, token1Address, reserves] = await Promise.all([
        pairContract.token0(),
        pairContract.token1(),
        pairContract.getReserves(),
      ]);

      // Check if at least one token is known
      const token0Known = this.priceCache.isKnownToken(token0Address);
      const token1Known = this.priceCache.isKnownToken(token1Address);

      if (!token0Known && !token1Known) {
        return {
          success: false,
          reason: 'no_known_token',
          message: 'Neither token is a known base token',
        };
      }

      // Calculate liquidity
      const liquidityResult = await this.calculateLiquidityUSD(
        token0Address,
        token1Address,
        reserves.reserve0,
        reserves.reserve1
      );

      if (!liquidityResult.success) {
        return liquidityResult;
      }

      // Get volume data if not provided
      if (!volumeData && this.volumeAnalyzer) {
        volumeData = await this.volumeAnalyzer.analyzePair(pairAddress);
      }

      // Determine tier
      const tier = this.determineTier(liquidityResult.liquidityUSD, volumeData);

      return {
        success: true,
        token0Address,
        token1Address,
        reserves: {
          reserve0: reserves.reserve0.toString(),
          reserve1: reserves.reserve1.toString(),
        },
        liquidityUSD: liquidityResult.liquidityUSD,
        knownToken: liquidityResult.knownToken,
        tier: tier.name,
        tierInfo: tier,
        volumeData,
        shouldAlertVIP: tier.alertVIP,
        shouldAlertPublic: tier.alertPublic,
      };

    } catch (error) {
      console.error(`   ❌ Error analyzing pair ${pairAddress}:`, error.message);
      return {
        success: false,
        reason: 'error',
        message: error.message,
      };
    }
  }

  /**
   * Calculate liquidity in USD
   */
  async calculateLiquidityUSD(token0Address, token1Address, reserve0, reserve1) {
    // Get token info
    const token0Info = this.priceCache.getKnownTokenInfo(token0Address);
    const token1Info = this.priceCache.getKnownTokenInfo(token1Address);

    let liquidityUSD = 0;
    let knownToken = null;

    // Calculate from token0 if known
    if (token0Info) {
      const price = await this.priceCache.getTokenPriceUSD(token0Address);
      if (price) {
        const reserve0Number = Number(ethers.formatUnits(reserve0, token0Info.decimals));
        liquidityUSD += reserve0Number * price;
        knownToken = token0Info.symbol;
      }
    }

    // Calculate from token1 if known
    if (token1Info) {
      const price = await this.priceCache.getTokenPriceUSD(token1Address);
      if (price) {
        const reserve1Number = Number(ethers.formatUnits(reserve1, token1Info.decimals));
        liquidityUSD += reserve1Number * price;
        knownToken = knownToken ? `${knownToken}/${token1Info.symbol}` : token1Info.symbol;
      }
    }

    // If both tokens are known, we have total liquidity
    // If only one is known, multiply by 2 for total estimate
    if (token0Info && token1Info) {
      // Both known - total liquidity calculated
    } else {
      // Only one known - multiply by 2
      liquidityUSD *= 2;
    }

    if (liquidityUSD === 0) {
      return {
        success: false,
        reason: 'no_price_data',
        message: 'Could not determine liquidity',
      };
    }

    return {
      success: true,
      liquidityUSD,
      knownToken,
    };
  }

  /**
   * Determine tier based on liquidity and volume
   */
  determineTier(liquidityUSD, volumeData) {
    // MEGA TIER - Highest priority
    if (liquidityUSD >= this.tiers.mega.minLiquidity) {
      const volumeCheck = volumeData?.volume24h >= this.tiers.mega.minVolume24h;
      
      return {
        name: 'mega',
        displayName: '🚀 MEGA PAIR',
        alertVIP: true,
        alertPublic: true,
        priority: 'highest',
        checks: {
          liquidity: true,
          volume: volumeCheck,
        },
      };
    }

    // HIGH LIQUIDITY TIER
    if (liquidityUSD >= this.tiers.highLiquidity.minLiquidityVIP) {
      const meetsPublicThreshold = liquidityUSD >= this.tiers.highLiquidity.minLiquidityPublic;
      const volumeCheck = volumeData?.volume24h >= this.tiers.highLiquidity.minVolume24h;
      
      return {
        name: 'high-liquidity',
        displayName: '💎 HIGH LIQUIDITY',
        alertVIP: true,
        alertPublic: meetsPublicThreshold,
        priority: 'high',
        checks: {
          liquidity: true,
          liquidityPublic: meetsPublicThreshold,
          volume: volumeCheck,
        },
      };
    }

    // EARLY GEMS TIER - VIP only
    if (liquidityUSD >= this.tiers.earlyGems.minLiquidity) {
      const volumeCheck = volumeData?.volume24h >= this.tiers.earlyGems.minVolume24h;
      const swapsCheck = volumeData?.swapCount15m >= this.tiers.earlyGems.minSwaps15m;
      
      // Early gems require both volume AND swap activity
      const meetsRequirements = volumeCheck && swapsCheck;
      
      return {
        name: 'early-gems',
        displayName: '🌟 EARLY GEM',
        alertVIP: meetsRequirements,
        alertPublic: false,
        priority: 'medium',
        checks: {
          liquidity: true,
          volume: volumeCheck,
          swaps: swapsCheck,
        },
      };
    }

    // Below all thresholds
    return {
      name: 'below-threshold',
      displayName: '⏭️ Below Threshold',
      alertVIP: false,
      alertPublic: false,
      priority: 'none',
      checks: {
        liquidity: false,
      },
    };
  }

  /**
   * Get holder count for a token (optional check)
   */
  async getHolderCount(tokenAddress) {
    try {
      // This would require an API call to a service like Etherscan
      // For now, return null (optional feature)
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Format liquidity for display
   */
  formatLiquidity(liquidityUSD) {
    if (liquidityUSD >= 1000000) {
      return `$${(liquidityUSD / 1000000).toFixed(2)}M`;
    } else if (liquidityUSD >= 1000) {
      return `$${(liquidityUSD / 1000).toFixed(1)}k`;
    } else {
      return `$${liquidityUSD.toFixed(0)}`;
    }
  }

  /**
   * Get tier emoji
   */
  getTierEmoji(tierName) {
    const emojis = {
      'mega': '🚀',
      'high-liquidity': '💎',
      'early-gems': '🌟',
      'below-threshold': '⏭️',
    };
    return emojis[tierName] || '❓';
  }

  /**
   * Get tier color for Telegram messages
   */
  getTierPriority(tierName) {
    const priorities = {
      'mega': 1,
      'high-liquidity': 2,
      'early-gems': 3,
      'below-threshold': 999,
    };
    return priorities[tierName] || 999;
  }
}
