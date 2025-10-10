import { config, validateConfig } from './src/config.js';
import { PairMonitorV2Service } from './src/services/pairMonitorV2.js';

/**
 * DEX Pair Scanner v2.0.0 - Main Entry Point
 * 
 * Sprint 1 Features:
 * - Multi-RPC Provider with automatic failover
 * - Redis-based price caching (with in-memory fallback)
 * - Volume analysis via PancakeSwap Subgraph
 * - 3-Tier alert system (Early Gems, High Liquidity, Mega Pairs)
 * - Enhanced monitoring and statistics
 * 
 * Environment Variables Required:
 * - CHAIN_ID (default: 56 for BSC)
 * - RPC_URL (primary RPC endpoint)
 * - ETHERSCAN_API_KEY
 * - TELEGRAM_BOT_TOKEN
 * - TELEGRAM_CHAT_ID_VIP (recommended)
 * - TELEGRAM_CHAT_ID_PUBLIC (optional)
 * 
 * Optional Sprint 1 Variables:
 * - RPC_SECONDARY_URL (for failover)
 * - RPC_TERTIARY_URL (for additional redundancy)
 * - REDIS_URL (for enhanced caching)
 * - MIN_LIQUIDITY_EARLY, MIN_VOLUME_EARLY, etc. (tier thresholds)
 */

async function main() {
  let monitor = null;

  try {
    // ========================================
    // STARTUP BANNER
    // ========================================
    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log('           🚀 DEX PAIR SCANNER v2.0');
    console.log('═══════════════════════════════════════════════════');
    console.log('');

    // ========================================
    // CONFIGURATION VALIDATION
    // ========================================
    console.log('⚙️  Validating configuration...');
    validateConfig();
    console.log('✅ Configuration validated');
    console.log('');

    // ========================================
    // INITIALIZE PAIR MONITOR V2
    // ========================================
    console.log('🔍 Initializing pair monitor V2...');
    console.log('   Using Sprint 1 features:');
    console.log('   • Multi-RPC failover');
    console.log('   • Redis cache (if configured)');
    console.log('   • Volume analysis');
    console.log('   • 3-Tier filtering system');
    console.log('');

    monitor = new PairMonitorV2Service();
    await monitor.initialize();

    console.log('✅ Pair monitor V2 initialized');
    console.log('');

    // ========================================
    // START MONITORING
    // ========================================
    console.log('🚀 Starting monitoring...');
    await monitor.start();

    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log('  ✅ Monitoring active. Press Ctrl+C to stop.      ');
    console.log('═══════════════════════════════════════════════════');
    console.log('');

    // ========================================
    // GRACEFUL SHUTDOWN HANDLERS
    // ========================================
    const shutdown = async (signal) => {
      console.log(`\n\n🛑 Received ${signal}, shutting down gracefully...`);
      
      try {
        if (monitor) {
          console.log('   Stopping pair monitor...');
          await monitor.stop();
          console.log('   ✅ Pair monitor stopped');
        }
      } catch (error) {
        console.error('   ❌ Error during shutdown:', error.message);
      }
      
      console.log('✅ Shutdown complete');
      process.exit(0);
    };

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => shutdown('SIGINT'));
    
    // Handle SIGTERM (process termination)
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // ========================================
    // UNCAUGHT ERROR HANDLERS
    // ========================================
    process.on('uncaughtException', async (error) => {
      console.error('\n💥 Uncaught Exception:', error.message);
      console.error(error.stack);
      
      try {
        if (monitor) {
          await monitor.stop();
        }
      } catch (shutdownError) {
        console.error('Error during emergency shutdown:', shutdownError.message);
      }
      
      process.exit(1);
    });

    process.on('unhandledRejection', async (reason, promise) => {
      console.error('\n💥 Unhandled Rejection at:', promise);
      console.error('Reason:', reason);
      
      try {
        if (monitor) {
          await monitor.stop();
        }
      } catch (shutdownError) {
        console.error('Error during emergency shutdown:', shutdownError.message);
      }
      
      process.exit(1);
    });

  } catch (error) {
    // ========================================
    // FATAL ERROR HANDLING
    // ========================================
    console.error('\n❌ Fatal error during startup:', error.message);
    console.error(error.stack);
    
    // Provide helpful error messages
    if (error.message.includes('TELEGRAM_BOT_TOKEN')) {
      console.error('\n💡 TIP: Make sure TELEGRAM_BOT_TOKEN is set in your .env file');
      console.error('   Get your token from @BotFather on Telegram');
    }
    
    if (error.message.includes('ETHERSCAN_API_KEY')) {
      console.error('\n💡 TIP: Make sure ETHERSCAN_API_KEY is set in your .env file');
      console.error('   Get your key from https://bscscan.com/apis (for BSC)');
    }
    
    if (error.message.includes('factory contract')) {
      console.error('\n💡 TIP: Check your CHAIN_ID and FACTORY_ADDRESS configuration');
      console.error('   For BSC (CHAIN_ID=56): 0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73');
    }
    
    if (error.message.includes('RPC') || error.message.includes('provider')) {
      console.error('\n💡 TIP: Check your RPC_URL configuration');
      console.error('   For BSC, try: https://bsc-dataseed1.binance.org');
    }

    // Try to cleanup if monitor was initialized
    try {
      if (monitor) {
        await monitor.stop();
      }
    } catch (cleanupError) {
      // Ignore cleanup errors during fatal error handling
    }

    console.error('\n❌ Application terminated due to fatal error');
    process.exit(1);
  }
}

// ========================================
// START APPLICATION
// ========================================
console.log('🔄 Starting DEX Pair Scanner v2.0.0...\n');

main().catch(error => {
  console.error('❌ Unhandled error in main():', error);
  process.exit(1);
});
