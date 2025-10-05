import dotenv from 'dotenv';

dotenv.config();

export const config = {
  chainId: parseInt(process.env.CHAIN_ID || '1', 10),
  rpcUrl: process.env.RPC_URL || 'https://eth.llamarpc.com',
  
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
    apiUrl: process.env.ETHERSCAN_API_URL || 'https://api.etherscan.io/v2/api',
  },
  
  factory: {
    address: process.env.FACTORY_ADDRESS || '0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f',
  },
  
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
  },
  
  monitoring: {
    pollInterval: parseInt(process.env.POLL_INTERVAL || '60000', 10),
  },
  
  backoff: {
    maxRetries: parseInt(process.env.BACKOFF_MAX_RETRIES || '5', 10),
    initialDelay: parseInt(process.env.BACKOFF_INITIAL_DELAY || '1000', 10),
    maxDelay: parseInt(process.env.BACKOFF_MAX_DELAY || '60000', 10),
  },
};

export function validateConfig() {
  const errors = [];
  
  if (!config.etherscan.apiKey) {
    errors.push('ETHERSCAN_API_KEY is required');
  }
  
  if (!config.telegram.botToken) {
    errors.push('TELEGRAM_BOT_TOKEN is required');
  }
  
  if (!config.telegram.chatId) {
    errors.push('TELEGRAM_CHAT_ID is required');
  }
  
  if (errors.length > 0) {
    throw new Error(`Configuration validation failed:\n${errors.join('\n')}`);
  }
}
