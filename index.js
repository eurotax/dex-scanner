import { config, validateConfig } from './src/config.js';
import { ProviderService } from './src/services/provider.js';
import { PairMonitorService } from './src/services/pairMonitor.js';

async function main() {
  try {
    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log('           🚀 DEX PAIR SCANNER v2.0');
    console.log('═══════════════════════════════════════════════════');
    console.log('');

    // Validate configuration
    console.log('⚙️  Validating configuration...');
    validateConfig();
    console.log('✅ Configuration validated');
    console.log('');

    // Initialize provider
    console.log('🔌 Connecting to blockchain...');
    const providerService = new ProviderService();
    const provider = await providerService.initialize();
    console.log('✅ Connected to blockchain');
    
    const network = await provider.provider.getNetwork();
    const blockNumber = await provider.provider.getBlockNumber();
    console.log(`   Network: ${network.name} (${network.chainId})`);
    console.log(`   Current block: ${blockNumber}`);
    console.log('');

    // Initialize and start pair monitor
    console.log('🔍 Initializing pair monitor...');
    const pairMonitor = new PairMonitorService(provider);
    await pairMonitor.initialize();
    console.log('✅ Pair monitor initialized');
    console.log('');

    console.log('🚀 Starting monitoring...');
    await pairMonitor.start();
    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log('  ✅ Monitoring active. Press Ctrl+C to stop.      ');
    console.log('═══════════════════════════════════════════════════');
    console.log('');

    // Handle graceful shutdown
    const shutdown = async (signal) => {
      console.log(`\n\n🛑 Received ${signal}, shutting down gracefully...`);
      
      // Stop pair monitor (this will send remaining queued messages)
      await pairMonitor.stop();
      
      // Disconnect provider
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
