import TelegramBot from 'node-telegram-bot-api';
import { config, getExplorerBaseUrl, getDexBaseUrl } from '../config.js';

export class TelegramService {
  constructor(botToken = null, vipChatId = null, publicChatId = null) {
    this.botToken = botToken || config.telegram.botToken;
    this.vipChatId = vipChatId || config.telegram.vipChatId;
    this.publicChatId = publicChatId || config.telegram.publicChatId;
    this.legacyChatId = config.telegram.chatId;
    this.bot = null;
    
    // Normalize public chat ID (add @ if it's a username without @ or -)
    if (this.publicChatId && typeof this.publicChatId === 'string') {
      if (!this.publicChatId.startsWith('@') && !this.publicChatId.startsWith('-')) {
        this.publicChatId = `@${this.publicChatId}`;
      }
    }
  }

  initialize() {
    if (!this.bot) {
      this.bot = new TelegramBot(this.botToken, { polling: false });
      console.log('✅ Telegram bot initialized');
      
      if (this.vipChatId) {
        console.log(`   📱 VIP channel: ${this.vipChatId} (instant alerts, >${config.liquidity.minVIP / 1000}k USD)`);
      }
      
      if (this.publicChatId) {
        console.log(`   📱 Public channel: ${this.publicChatId} (instant alerts, >${config.liquidity.minPublic / 1000}k USD)`);
      }
      
      if (this.legacyChatId && !this.vipChatId) {
        console.log(`   📱 Legacy channel: ${this.legacyChatId}`);
      }
    }
    return this.bot;
  }

  async sendMessage(chatId, message, options = {}) {
    if (!this.bot) {
      throw new Error('Telegram bot not initialized. Call initialize() first.');
    }

    try {
      const result = await this.bot.sendMessage(chatId, message, {
        parse_mode: 'Markdown',
        disable_web_page_preview: true,
        ...options,
      });
      return result;
    } catch (error) {
      console.error(`❌ Failed to send Telegram message to ${chatId}:`, error.message);
      throw error;
    }
  }

  async sendToVipChannel(message, options = {}) {
    if (!this.vipChatId) {
      return null;
    }
    
    try {
      return await this.sendMessage(this.vipChatId, message, options);
    } catch (error) {
      console.error('❌ Failed to send to VIP channel:', error.message);
      throw error;
    }
  }

  async sendToPublicChannel(message, options = {}) {
    if (!this.publicChatId) {
      return null;
    }
    
    try {
      return await this.sendMessage(this.publicChatId, message, options);
    } catch (error) {
      console.error('❌ Failed to send to Public channel:', error.message);
      throw error;
    }
  }

  async sendStartupMessage() {
    const startupMsg = `🚀 *DEX Scanner Started*\n\n✅ Monitoring for new pairs\n💧 Liquidity filters active\n⏰ Started at: ${new Date().toLocaleString()}`;
    
    const promises = [];
    
    // Send to VIP channel
    if (this.vipChatId) {
      promises.push(
        this.sendToVipChannel(startupMsg).catch(err => 
          console.error('Failed to send startup to VIP:', err.message)
        )
      );
    }
    
    // Send to Public channel
    if (this.publicChatId) {
      promises.push(
        this.sendToPublicChannel(startupMsg).catch(err => 
          console.error('Failed to send startup to Public:', err.message)
        )
      );
    }
    
    // Send to legacy channel if no VIP configured
    if (this.legacyChatId && !this.vipChatId) {
      promises.push(
        this.sendMessage(this.legacyChatId, startupMsg).catch(err => 
          console.error('Failed to send startup to legacy:', err.message)
        )
      );
    }
    
    await Promise.allSettled(promises);
  }

  async sendPairCreated(pairData, channel = 'both') {
    const { 
      pairAddress, 
      token0, 
      token1, 
      blockNumber, 
      transactionHash,
      liquidityUSD,
      liquidityFormatted,
      securityChecks,
    } = pairData;
    
    // Get explorer and DEX URLs
    const explorerBase = getExplorerBaseUrl(config.chainId);
    const dexBase = getDexBaseUrl(config.chainId);
    
    // Build links section if enabled
    let linksSection = '';
    if (config.features.includeLinks) {
      linksSection = `\n🔗 *Quick Links:*
   [View Pair](${explorerBase}/address/${pairAddress})
   [Token0](${explorerBase}/token/${token0.address})
   [Token1](${explorerBase}/token/${token1.address})
   [Transaction](${explorerBase}/tx/${transactionHash})
   [Trade on DEX](${dexBase}/#/swap?outputCurrency=${token0.address})
`;
    }
    
    // Create message
    const message = `
🆕 *New High Liquidity Pair*

📍 Pair: \`${pairAddress}\`

🪙 *Token 0:* ${token0.symbol || '???'}
   ${token0.name || 'Unknown'}
   \`${token0.address}\`

🪙 *Token 1:* ${token1.symbol || '???'}
   ${token1.name || 'Unknown'}
   \`${token1.address}\`

💧 *Liquidity:* ${liquidityFormatted}

🔒 *Security Checks:*
${securityChecks.longFormat}
${linksSection}
🔗 Block: ${blockNumber || 'N/A'}
📝 TX: \`${transactionHash || 'N/A'}\`
    `.trim();

    const promises = [];
    
    // Send to VIP channel
    if (channel === 'vip' || channel === 'both') {
      if (this.vipChatId) {
        promises.push(
          this.sendToVipChannel(message).catch(err => 
            console.error('Failed to send to VIP:', err.message)
          )
        );
      }
      
      if (this.legacyChatId && !this.vipChatId) {
        promises.push(
          this.sendMessage(this.legacyChatId, message).catch(err => 
            console.error('Failed to send to legacy:', err.message)
          )
        );
      }
    }
    
    // Send to Public channel (instant, no queue!)
    if (channel === 'public' || channel === 'both') {
      if (this.publicChatId) {
        promises.push(
          this.sendToPublicChannel(message).catch(err => 
            console.error('Failed to send to Public:', err.message)
          )
        );
      }
    }
    
    await Promise.allSettled(promises);
  }

  async sendError(error) {
    const message = `
⚠️ *Error Occurred*

${error.message || error.toString()}
    `.trim();

    const promises = [];
    
    // Send errors to VIP channel
    if (this.vipChatId) {
      promises.push(
        this.sendToVipChannel(message).catch(err => 
          console.error('Failed to send error to VIP:', err.message)
        )
      );
    }
    
    // Send to legacy channel if no VIP configured
    if (this.legacyChatId && !this.vipChatId) {
      promises.push(
        this.sendMessage(this.legacyChatId, message).catch(err => 
          console.error('Failed to send error to legacy:', err.message)
        )
      );
    }
    
    await Promise.allSettled(promises);
  }

  async sendStatistics(stats, uptime) {
    if (!config.features.sendStats) {
      return;
    }

    const uptimeHours = Math.floor(uptime / 3600000);
    const uptimeMinutes = Math.floor((uptime % 3600000) / 60000);
    const uptimeStr = uptimeHours > 0 
      ? `${uptimeHours}h ${uptimeMinutes}m`
      : `${uptimeMinutes}m`;

    const filterRate = stats.total > 0
      ? ((stats.filtered / stats.total) * 100).toFixed(1)
      : '0.0';

    const message = `
📊 *Periodic Statistics Report*

⏱️ *Uptime:* ${uptimeStr}

🔍 *Pair Detection:*
   Total pairs detected: ${stats.total}
   Filtered (low liquidity): ${stats.filtered}
   Filter rate: ${filterRate}%

📱 *Alerts Sent:*
   VIP channel (>${config.liquidity.minVIP / 1000}k): ${stats.vip}
   Public channel (>${config.liquidity.minPublic / 1000}k): ${stats.public}
   Total alerts: ${stats.vip + stats.public}

❌ *Errors:*
   Processing errors: ${stats.errors || 0}

✅ Bot is running smoothly
    `.trim();

    const promises = [];
    
    // Send to VIP channel
    if (this.vipChatId) {
      promises.push(
        this.sendToVipChannel(message).catch(err => 
          console.error('Failed to send stats to VIP:', err.message)
        )
      );
    }
    
    // Send to Public channel
    if (this.publicChatId) {
      promises.push(
        this.sendToPublicChannel(message).catch(err => 
          console.error('Failed to send stats to Public:', err.message)
        )
      );
    }
    
    // Send to legacy channel if no VIP configured
    if (this.legacyChatId && !this.vipChatId) {
      promises.push(
        this.sendMessage(this.legacyChatId, message).catch(err => 
          console.error('Failed to send stats to legacy:', err.message)
        )
      );
    }
    
    await Promise.allSettled(promises);
  }

  async shutdown() {
    console.log('🛑 Shutting down Telegram service...');
    console.log('✅ Telegram service shutdown complete');
  }
}
