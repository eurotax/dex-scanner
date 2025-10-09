import dotenv from 'dotenv';

dotenv.config();

// Default factory addresses for different chains
const DEFAULT_FACTORIES = {
  1: '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',    // Ethereum Mainnet - Uniswap V2
  56: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',   // BSC - PancakeSwap V2
  137: '0x5757371414417b8C6CAad45bAeF941aBc7d3Ab32',  // Polygon - QuickSwap
  42161: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4', // Arbitrum - SushiSwap
};

const chainId = parseInt(process.env.CHAIN_ID || '1', 10);

export const config = {
  chainId,
  rpcUrl: process.env.RPC_URL || getDefaultRpcUrl(chainId),
  
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
    apiUrl: process.env.ETHERSCAN_API_URL || getDefaultExplorerUrl(chainId),
  },
  
  factory: {
    address: process.env.FACTORY_ADDRESS || DEFAULT_FACTORIES[chainId] || DEFAULT_FACTORIES[1],
  },
  
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    
    // VIP channel - instant alerts for pairs >10k liquidity
    vipChatId: process.env.TELEGRAM_CHAT_ID_VIP,
    
    // Public channel - instant alerts for pairs >35k liquidity
    publicChatId: process.env.TELEGRAM_CHAT_ID_PUBLIC,
    
    // Legacy fallback for backward compatibility
    chatId: process.env.TELEGRAM_CHAT_ID || process.env.TELEGRAM_CHAT_ID_VIP,
  },
  
  liquidity: {
    // Minimum liquidity thresholds in USD
    minVIP: parseInt(process.env.MIN_LIQUIDITY_VIP || '10000', 10),      // $10k for VIP
    minPublic: parseInt(process.env.MIN_LIQUIDITY_PUBLIC || '35000', 10), // $35k for Public
  },
  
  priceCache: {
    // Update interval for price cache (default: 5 minutes)
    updateInterval: parseInt(process.env.PRICE_UPDATE_INTERVAL || '300000', 10),
  },
  
  monitoring: {
    pollInterval: parseInt(process.env.POLL_INTERVAL || '60000', 10),
    eventPollInterval: parseInt(process.env.EVENT_POLL_INTERVAL || '30000', 10),
  },
  
  backoff: {
    maxRetries: parseInt(process.env.BACKOFF_MAX_RETRIES || '5', 10),
    initialDelay: parseInt(process.env.BACKOFF_INITIAL_DELAY || '1000', 10),
    maxDelay: parseInt(process.env.BACKOFF_MAX_DELAY || '60000', 10),
  },
};

function getDefaultRpcUrl(chainId) {
  const rpcUrls = {
    1: 'https://eth.llamarpc.com',
    56: 'https://bsc-dataseed1.binance.org',
    137: 'https://polygon-rpc.com',
    42161: 'https://arb1.arbitrum.io/rpc',
  };
  return rpcUrls[chainId] || rpcUrls[1];
}

function getDefaultExplorerUrl(chainId) {
  // Using V2 API endpoints (Multichain API) to avoid deprecation
  // V1 API will be deprecated on August 15, 2025
  const explorerUrls = {
    1: 'https://api.etherscan.io/v2/api',      // Ethereum V2 API
    56: 'https://api.bscscan.com/v2/api',      // BSC V2 API
    137: 'https://api.polygonscan.com/v2/api', // Polygon V2 API
    42161: 'https://api.arbiscan.io/v2/api',   // Arbitrum V2 API
  };
  return explorerUrls[chainId] || explorerUrls[1];
}

export function validateConfig() {
  const errors = [];
  const warnings = [];
  
  if (!config.etherscan.apiKey) {
    errors.push('ETHERSCAN_API_KEY is required');
  }
  
  if (!config.telegram.botToken) {
    errors.push('TELEGRAM_BOT_TOKEN is required');
  }
  
  // Check if at least one Telegram channel is configured
  if (!config.telegram.vipChatId && !config.telegram.publicChatId && !config.telegram.chatId) {
    errors.push('At least one Telegram channel is required (TELEGRAM_CHAT_ID_VIP or TELEGRAM_CHAT_ID_PUBLIC or TELEGRAM_CHAT_ID)');
  }
  
  if (config.chainId !== 1 && !process.env.FACTORY_ADDRESS) {
    warnings.push(`Using default factory address for chain ${config.chainId}. Please verify this is correct.`);
  }
  
  if (!process.env.RPC_URL) {
    warnings.push(`Using default RPC URL for chain ${config.chainId}: ${config.rpcUrl}`);
  }
  
  console.log('\n📋 Configuration Summary:');
  console.log(`   Chain ID: ${config.chainId}`);
  console.log(`   RPC URL: ${config.rpcUrl}`);
  console.log(`   Factory Address: ${config.factory.address}`);
  console.log(`   Explorer API: ${config.etherscan.apiUrl} (V2 - future-proof)`);
  console.log(`   Poll Interval: ${config.monitoring.pollInterval}ms`);
  console.log(`   Event Poll Interval: ${config.monitoring.eventPollInterval}ms`);
  
  // Show liquidity thresholds
  console.log('\n💧 Liquidity Filters (Instant Alerts):');
  console.log(`   VIP channel: >$${config.liquidity.minVIP.toLocaleString()} USD`);
  console.log(`   Public channel: >$${config.liquidity.minPublic.toLocaleString()} USD`);
  
  // Show Telegram channels configuration
  console.log('\n📱 Telegram Channels:');
  if (config.telegram.vipChatId) {
    console.log(`   ✅ VIP Channel: ${config.telegram.vipChatId} (instant alerts)`);
  }
  if (config.telegram.publicChatId) {
    console.log(`   ✅ Public Channel: ${config.telegram.publicChatId} (instant alerts)`);
  }
  if (config.telegram.chatId && !config.telegram.vipChatId) {
    console.log(`   ✅ Legacy Channel: ${config.telegram.chatId}`);
  }
  
  if (warnings.length > 0) {
    console.log('\n⚠️ Warnings:');
    warnings.forEach(warning => console.log(`   - ${warning}`));
  }
  
  if (errors.length > 0) {
    console.log('\n❌ Configuration Errors:');
    errors.forEach(error => console.log(`   - ${error}`));
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
  
  console.log('');
}
