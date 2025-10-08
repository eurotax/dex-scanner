import TelegramBot from 'node-telegram-bot-api';
import { config } from '../config.js';

export class TelegramService {
  constructor(botToken = null, vipChatId = null, publicChatId = null) {
    this.botToken = botToken || config.telegram.botToken;
    this.vipChatId = vipChatId || config.telegram.vipChatId;
    this.publicChatId = publicChatId || config.telegram.publicChatId;
    this.legacyChatId = config.telegram.chatId;
    this.publicChannelInterval = config.telegram.publicChannelInterval;
    this.bot = null;
    
    // Queue for public channel (aggregated updates)
    this.publicQueue = [];
    this.publicChannelTimer = null;
    
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
        console.log(`   📱 Public channel: ${this.publicChatId} (aggregated every ${this.publicChannelInterval / 1000 / 60} minutes, >${config.liquidity.minPublic / 1000}k USD)`);
        this.startPublicChannelTimer();
      }
      
      if (this.legacyChatId && !this.vipChatId) {
        console.log(`   📱 Legacy channel: ${this.legacyChatId}`);
      }
    }
    return this.bot;
  }

  startPublicChannelTimer() {
    if (this.publicChannelTimer) {
      clearInterval(this.publicChannelTimer);
    }
    
    this.publicChannelTimer = setInterval(async () => {
      await this.sendAggregatedToPublic();
    }, this.publicChannelInterval);
    
    console.log(`   ⏰ Public channel timer started (every ${this.publicChannelInterval / 1000 / 60} minutes)`);
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

  async addToPublicQueue(pairData) {
    if (!this.publicChatId) {
      return;
    }
    
    this.publicQueue.push({
      ...pairData,
      timestamp: Date.now(),
    });
    
    console.log(`📋 Added to public queue (total: ${this.publicQueue.length})`);
  }

  async sendAggregatedToPublic() {
    if (!this.publicChatId || this.publicQueue.length === 0) {
      return;
    }
    
    console.log(`\n📤 Sending aggregated update to public channel (${this.publicQueue.length} pairs)`);
    
    try {
      const totalPairs = this.publicQueue.length;
      const intervalMinutes = this.publicChannelInterval / 1000 / 60;
      
      let message = `🔔 *High Liquidity Pairs Update*\n\n`;
      message += `📊 ${totalPairs} pair${totalPairs > 1 ? 's' : ''} with >$${config.liquidity.minPublic / 1000}k liquidity detected\n\n`;
      
      // Show first 10 pairs in detail
      const pairsToShow = Math.min(10, totalPairs);
      
      for (let i = 0; i < pairsToShow; i++) {
        const pair = this.publicQueue[i];
        message += `${i + 1}. ${pair.token0Symbol}/${pair.token1Symbol}\n`;
        message += `   💧 ${pair.liquidityFormatted}\n`;
        message += `   ${pair.securityShort} Security\n`;
        message += `   📍 \`${pair.pairAddress.substring(0, 10)}...${pair.pairAddress.slice(-6)}\`\n`;
        
        if (i < pairsToShow - 1) {
          message += '\n';
        }
      }
      
      // If there are more pairs, show count
      if (totalPairs > pairsToShow) {
        message += `\n\n...and ${totalPairs - pairsToShow} more pair${totalPairs - pairsToShow > 1 ? 's' : ''}`;
      }
      
      message += `\n\n💎 Want detailed instant alerts? Join VIP channel!`;
      
      await this.sendMessage(this.publicChatId, message);
      console.log(`✅ Sent aggregated update to public channel`);
      
      // Clear the queue after sending
      this.publicQueue = [];
      
    } catch (error) {
      console.error('❌ Failed to send aggregated update:', error.message);
      // Don't clear queue on error - will retry in next interval
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
    
    // VIP channel - detailed message
    if (channel === 'vip' || channel === 'both') {
      const vipMessage = `
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

🔗 Block: ${blockNumber || 'N/A'}
📝 TX: \`${transactionHash || 'N/A'}\`
      `.trim();

      const promises = [];
      
      if (this.vipChatId) {
        promises.push(
          this.sendToVipChannel(vipMessage).catch(err => 
            console.error('Failed to send to VIP:', err.message)
          )
        );
      }
      
      if (this.legacyChatId && !this.vipChatId) {
        promises.push(
          this.sendMessage(this.legacyChatId, vipMessage).catch(err => 
            console.error('Failed to send to legacy:', err.message)
          )
        );
      }
      
      await Promise.allSettled(promises);
    }
    
    // Public channel - add to queue
    if (channel === 'public' || channel === 'both') {
      if (this.publicChatId) {
        await this.addToPublicQueue({
          pairAddress,
          token0Symbol: token0.symbol || '???',
          token1Symbol: token1.symbol || '???',
          liquidityFormatted,
          securityShort: securityChecks.shortFormat,
          blockNumber,
          transactionHash,
        });
      }
    }
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

  async shutdown() {
    console.log('🛑 Shutting down Telegram service...');
    
    // Stop the public channel timer
    if (this.publicChannelTimer) {
      clearInterval(this.publicChannelTimer);
      this.publicChannelTimer = null;
      console.log('   ⏰ Public channel timer stopped');
    }
    
    // Send any remaining queued messages to public channel
    if (this.publicQueue.length > 0) {
      console.log(`   📤 Sending ${this.publicQueue.length} remaining messages to public channel...`);
      await this.sendAggregatedToPublic();
    }
    
    console.log('✅ Telegram service shutdown complete');
  }
}
