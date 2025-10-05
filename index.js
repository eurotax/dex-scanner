import { config, validateConfig } from './src/config.js';
import { ProviderService } from './src/services/provider.js';
import { PairMonitorService } from './src/services/pairMonitor.js';

async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('           DEX Scanner Background Worker          ');
  console.log('═══════════════════════════════════════════════════');
  console.log('');

  try {
    // Validate configuration
    console.log('📋 Validating configuration...');
    validateConfig();
    console.log('✅ Configuration validated');
    console.log('');

    // Initialize provider
    console.log('🔌 Connecting to blockchain...');
    const providerService = new ProviderService();
    const provider = await providerService.connect();
    
    const blockNumber = await providerService.getBlockNumber();
    console.log(`✅ Connected! Current block: ${blockNumber}`);
    console.log('');

    // Initialize and start pair monitor
    console.log('🔍 Initializing pair monitor...');
    const pairMonitor = new PairMonitorService(provider);
    pairMonitor.initialize();
    console.log('✅ Pair monitor initialized');
    console.log('');

    console.log('🚀 Starting monitoring...');
    await pairMonitor.start();
    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log('  Monitoring active. Press Ctrl+C to stop.        ');
    console.log('═══════════════════════════════════════════════════');
    console.log('');

    // Handle graceful shutdown
    const shutdown = async (signal) => {
      console.log(`\n\n🛑 Received ${signal}, shutting down gracefully...`);
      
      await pairMonitor.stop();
      await providerService.disconnect();
      
      console.log('✅ Shutdown complete');
      process.exit(0);
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Start the application
main();
