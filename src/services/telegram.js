import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config.js';

export class TelegramService {
  constructor(botToken = null, chatId = null) {
    this.botToken = botToken || config.telegram.botToken;
    this.chatId = chatId || config.telegram.chatId;
    this.bot = null;
  }

  initialize() {
    if (!this.bot) {
      this.bot = new TelegramBot(this.botToken, { polling: false });
      console.log('Telegram bot initialized');
    }
    return this.bot;
  }

  async sendMessage(message, options = {}) {
    if (!this.bot) {
      throw new Error('Telegram bot not initialized. Call initialize() first.');
    }

    try {
      const result = await this.bot.sendMessage(
        this.chatId,
        message,
        {
          parse_mode: 'Markdown',
          disable_web_page_preview: true,
          ...options,
        }
      );
      return result;
    } catch (error) {
      console.error('Failed to send Telegram message:', error.message);
      throw error;
    }
  }

  async sendPairAlert(pairData) {
    const { pair, token0, token1, blockNumber, transactionHash } = pairData;
    
    const message = `
🆕 *New Pair Created*

📍 Pair: \`${pair}\`

🪙 Token 0: ${token0.symbol || '???'}
   Address: \`${token0.address}\`
   Reserve: ${this.formatAmount(token0.reserve, token0.decimals)}

🪙 Token 1: ${token1.symbol || '???'}
   Address: \`${token1.address}\`
   Reserve: ${this.formatAmount(token1.reserve, token1.decimals)}

🔗 Block: ${blockNumber || 'N/A'}
📝 TX: \`${transactionHash || 'N/A'}\`
    `.trim();

    return await this.sendMessage(message);
  }

  formatAmount(amount, decimals = 18) {
    try {
      const value = BigInt(amount);
      const divisor = BigInt(10 ** Number(decimals));
      const integerPart = value / divisor;
      const fractionalPart = value % divisor;
      
      if (fractionalPart === 0n) {
        return integerPart.toString();
      }
      
      const fractionalStr = fractionalPart.toString().padStart(Number(decimals), '0');
      const trimmedFractional = fractionalStr.replace(/0+$/, '').substring(0, 6);
      
      if (trimmedFractional === '') {
        return integerPart.toString();
      }
      
      return `${integerPart}.${trimmedFractional}`;
    } catch (error) {
      return amount.toString();
    }
  }

  async sendError(error) {
    const message = `
⚠️ *Error Occurred*

${error.message || error.toString()}
    `.trim();

    return await this.sendMessage(message);
  }

  async sendStatus(status) {
    const message = `
ℹ️ *Status Update*

${status}
    `.trim();

    return await this.sendMessage(message);
  }
}
