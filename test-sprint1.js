#!/usr/bin/env node

/**
 * Sprint 1 Services Test
 * 
 * Verifies that all new services can be imported and initialized.
 * This is a basic smoke test to ensure the implementation is working.
 */

import { config } from './src/config.js';

console.log('🧪 Testing Sprint 1 Services...\n');

// Test 1: Import all services
console.log('1️⃣ Testing imports...');
try {
  const { MultiRPCProviderService } = await import('./src/services/multiRPCProvider.js');
  const { PriceCacheV2Service } = await import('./src/services/priceCacheV2.js');
  const { VolumeAnalyzerService } = await import('./src/services/volumeAnalyzer.js');
  const { LiquidityFilterV2Service } = await import('./src/services/liquidityFilterV2.js');
  const { PairMonitorV2Service } = await import('./src/services/pairMonitorV2.js');
  console.log('   ✅ All services imported successfully\n');
  
  // Test 2: Verify config has Sprint 1 options
  console.log('2️⃣ Testing config...');
  if (!config.rpc) {
    throw new Error('config.rpc not found');
  }
  if (!config.redis) {
    throw new Error('config.redis not found');
  }
  if (!config.volume) {
    throw new Error('config.volume not found');
  }
  if (!config.liquidity.earlyGemsMin) {
    throw new Error('config.liquidity.earlyGemsMin not found');
  }
  console.log('   ✅ Config has all Sprint 1 options\n');
  
  // Test 3: Instantiate services (without initialization)
  console.log('3️⃣ Testing service instantiation...');
  
  const multiRPC = new MultiRPCProviderService();
  console.log('   ✅ MultiRPCProviderService instantiated');
  
  const priceCache = new PriceCacheV2Service();
  console.log('   ✅ PriceCacheV2Service instantiated');
  
  const volumeAnalyzer = new VolumeAnalyzerService();
  console.log('   ✅ VolumeAnalyzerService instantiated');
  
  const pairMonitor = new PairMonitorV2Service();
  console.log('   ✅ PairMonitorV2Service instantiated');
  
  console.log('\n✅ All tests passed!');
  console.log('\n📋 Sprint 1 Services Summary:');
  console.log('   • MultiRPCProviderService - Multi-RPC failover');
  console.log('   • PriceCacheV2Service - Redis cache with multi-provider');
  console.log('   • VolumeAnalyzerService - Subgraph + DexScreener');
  console.log('   • LiquidityFilterV2Service - 3-tier filtering');
  console.log('   • PairMonitorV2Service - Enhanced monitoring');
  
  console.log('\n🎯 Configuration:');
  console.log(`   • Redis URL: ${config.redis.url || 'Not configured (using in-memory)'}`);
  console.log(`   • RPC URLs: ${config.rpc.primaryUrl ? 'Configured' : 'Using default'}`);
  console.log(`   • Early Gems min liquidity: $${config.liquidity.earlyGemsMin.toLocaleString()}`);
  console.log(`   • Mega Pairs min liquidity: $${config.liquidity.megaMin.toLocaleString()}`);
  
  console.log('\n🚀 Ready for deployment!');
  console.log('📖 See MIGRATION_SPRINT1.md for usage instructions');
  
  process.exit(0);
  
} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
