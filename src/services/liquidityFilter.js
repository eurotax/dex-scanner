import { ethers } from 'ethers';
import { config } from '../config.js';

const PAIR_ABI = [
  'function token0() view returns (address)',
  'function token1() view returns (address)',
  'function getReserves() view returns (uint112 reserve0, uint112 reserve1, uint32 blockTimestampLast)',
];

export class LiquidityFilterService {
  constructor(provider, priceCacheService) {
    this.provider = provider;
    this.priceCache = priceCacheService;
  }

  async analyzePair(pairAddress) {
    try {
      const pairContract = new ethers.Contract(pairAddress, PAIR_ABI, this.provider);
      
      // Get token addresses and reserves
      const [token0Address, token1Address, reserves] = await Promise.all([
        pairContract.token0(),
        pairContract.token1(),
        pairContract.getReserves(),
      ]);

      // Check if at least one token is known (WBNB/USDT/BUSD)
      const token0Known = this.priceCache.isKnownToken(token0Address);
      const token1Known = this.priceCache.isKnownToken(token1Address);

      if (!token0Known && !token1Known) {
        return {
          success: false,
          reason: 'no_known_token',
          message: 'Neither token is WBNB/USDT/BUSD/USDC',
        };
      }

      // Calculate liquidity
      const liquidityResult = this.calculateLiquidityUSD(
        token0Address,
        token1Address,
        reserves.reserve0,
        reserves.reserve1
      );

      if (!liquidityResult.success) {
        return liquidityResult;
      }

      // Determine if should alert based on channel
      const shouldAlertVIP = liquidityResult.liquidityUSD >= config.liquidity.minVIP;
      const shouldAlertPublic = liquidityResult.liquidityUSD >= config.liquidity.minPublic;

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
        shouldAlertVIP,
        shouldAlertPublic,
      };

    } catch (error) {
      console.error(`Error analyzing pair ${pairAddress}:`, error.message);
      return {
        success: false,
        reason: 'error',
        message: error.message,
      };
    }
  }

  calculateLiquidityUSD(token0Address, token1Address, reserve0, reserve1) {
    // Get token info
    const token0Info = this.priceCache.getKnownTokenInfo(token0Address);
    const token1Info = this.priceCache.getKnownTokenInfo(token1Address);

    let liquidityUSD = 0;
    let knownToken = null;

    // Calculate from token0 if known
    if (token0Info) {
      const price = this.priceCache.getTokenPriceUSD(token0Address);
      if (price) {
        const reserve0Number = Number(ethers.formatUnits(reserve0, token0Info.decimals));
        liquidityUSD += reserve0Number * price;
        knownToken = token0Info.symbol;
      }
    }

    // Calculate from token1 if known
    if (token1Info) {
      const price = this.priceCache.getTokenPriceUSD(token1Address);
      if (price) {
        const reserve1Number = Number(ethers.formatUnits(reserve1, token1Info.decimals));
        liquidityUSD += reserve1Number * price;
        knownToken = knownToken ? `${knownToken}/${token1Info.symbol}` : token1Info.symbol;
      }
    }

    // If both tokens are known, we calculated total liquidity
    // If only one is known, we need to double it (assuming balanced pool)
    if (token0Info && token1Info) {
      // Both known - we have total liquidity already
    } else {
      // Only one known - multiply by 2 for total liquidity estimate
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

  formatLiquidity(liquidityUSD) {
    if (liquidityUSD >= 1000000) {
      return `$${(liquidityUSD / 1000000).toFixed(2)}M`;
    } else if (liquidityUSD >= 1000) {
      return `$${(liquidityUSD / 1000).toFixed(1)}k`;
    } else {
      return `$${liquidityUSD.toFixed(0)}`;
    }
  }
}
