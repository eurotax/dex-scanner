import { ethers } from 'ethers';
import { config } from '../config.js';

/**
 * Multi-RPC Provider Service with Failover Support
 * 
 * Features:
 * - Multiple RPC endpoints (primary, secondary, tertiary)
 * - Automatic health checks
 * - Auto-failover on provider failure
 * - Connection pooling
 * - Performance monitoring
 * 
 * Sprint 1 - ~350 lines of code
 */
export class MultiRPCProviderService {
  constructor(rpcUrls = null) {
    // RPC endpoints in priority order
    this.rpcUrls = rpcUrls || [
      config.rpc?.primaryUrl || config.rpcUrl,
      config.rpc?.secondaryUrl,
      config.rpc?.tertiaryUrl,
    ].filter(Boolean); // Remove null/undefined entries

    this.providers = [];
    this.currentProviderIndex = 0;
    this.network = null;
    this.ethers = ethers;
    
    // Health check configuration
    this.healthCheckInterval = config.rpc?.healthCheckInterval || 60000; // 1 minute
    this.healthCheckTimer = null;
    this.maxResponseTime = config.rpc?.maxResponseTime || 5000; // 5 seconds
    
    // Statistics
    this.stats = {
      requests: 0,
      failures: 0,
      failovers: 0,
      providerStats: [],
    };
  }

  async initialize() {
    if (this.providers.length > 0) {
      return this;
    }

    console.log('🌐 Initializing Multi-RPC Provider Service...');
    console.log(`   Total endpoints: ${this.rpcUrls.length}`);

    // Initialize all providers
    for (let i = 0; i < this.rpcUrls.length; i++) {
      try {
        const url = this.rpcUrls[i];
        console.log(`   [${i}] Connecting to: ${url}`);
        
        const provider = new ethers.JsonRpcProvider(url);
        
        // Test connection with timeout
        const network = await Promise.race([
          provider.getNetwork(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Connection timeout')), 10000)
          ),
        ]);

        this.providers.push({
          provider,
          url,
          network,
          healthy: true,
          lastCheck: Date.now(),
          responseTime: 0,
          failures: 0,
        });

        console.log(`   ✅ [${i}] Connected to ${network.name} (chainId: ${network.chainId})`);

        // Set network from first successful connection
        if (!this.network) {
          this.network = network;
          
          if (Number(network.chainId) !== config.chainId) {
            console.warn(`   ⚠️  WARNING: Connected chain ID (${network.chainId}) doesn't match configured CHAIN_ID (${config.chainId})`);
          }
        }

      } catch (error) {
        console.error(`   ❌ [${i}] Failed to connect: ${error.message}`);
        // Add as unhealthy provider
        this.providers.push({
          provider: null,
          url: this.rpcUrls[i],
          network: null,
          healthy: false,
          lastCheck: Date.now(),
          responseTime: -1,
          failures: 1,
        });
      }
    }

    if (this.providers.filter(p => p.healthy).length === 0) {
      throw new Error('All RPC providers failed to initialize');
    }

    // Find first healthy provider
    this.currentProviderIndex = this.providers.findIndex(p => p.healthy);
    console.log(`   🎯 Primary provider: [${this.currentProviderIndex}]`);

    // Start health checks
    this.startHealthChecks();

    console.log('✅ Multi-RPC Provider Service initialized');
    return this;
  }

  /**
   * Get current active provider
   */
  getProvider() {
    const current = this.providers[this.currentProviderIndex];
    if (!current || !current.healthy) {
      this.failover();
    }
    return this.providers[this.currentProviderIndex]?.provider;
  }

  /**
   * Get network information
   */
  getNetwork() {
    return this.network;
  }

  /**
   * Execute request with automatic failover
   */
  async executeWithFailover(fn, context = 'RPC call') {
    this.stats.requests++;
    let lastError;
    const maxAttempts = this.providers.length;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const providerData = this.providers[this.currentProviderIndex];
      
      if (!providerData.healthy) {
        this.failover();
        continue;
      }

      try {
        const startTime = Date.now();
        const result = await Promise.race([
          fn(providerData.provider),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout')), this.maxResponseTime)
          ),
        ]);
        
        // Update response time
        providerData.responseTime = Date.now() - startTime;
        providerData.lastCheck = Date.now();
        
        return result;

      } catch (error) {
        lastError = error;
        providerData.failures++;
        this.stats.failures++;

        console.warn(`   ⚠️  Provider [${this.currentProviderIndex}] failed (${context}):`, error.message);

        // Mark as unhealthy if too many failures
        if (providerData.failures > 3) {
          providerData.healthy = false;
          console.error(`   ❌ Provider [${this.currentProviderIndex}] marked as unhealthy`);
        }

        // Try next provider
        if (attempt < maxAttempts - 1) {
          this.failover();
        }
      }
    }

    throw new Error(`All RPC providers failed: ${lastError?.message}`);
  }

  /**
   * Failover to next healthy provider
   */
  failover() {
    const oldIndex = this.currentProviderIndex;
    const startIndex = this.currentProviderIndex;

    // Find next healthy provider
    do {
      this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.length;
      
      if (this.providers[this.currentProviderIndex]?.healthy) {
        this.stats.failovers++;
        console.log(`   🔄 Failover: [${oldIndex}] → [${this.currentProviderIndex}]`);
        return;
      }

      // Prevent infinite loop
      if (this.currentProviderIndex === startIndex) {
        break;
      }
    } while (true);

    console.error('   ❌ No healthy providers available!');
  }

  /**
   * Start periodic health checks
   */
  startHealthChecks() {
    if (this.healthCheckTimer) {
      return;
    }

    console.log(`   🏥 Health checks enabled (every ${this.healthCheckInterval / 1000}s)`);

    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks();
    }, this.healthCheckInterval);
  }

  /**
   * Perform health checks on all providers
   */
  async performHealthChecks() {
    console.log('   🏥 Performing health checks...');

    for (let i = 0; i < this.providers.length; i++) {
      const providerData = this.providers[i];

      if (!providerData.provider) {
        // Try to reconnect dead provider
        try {
          const provider = new ethers.JsonRpcProvider(providerData.url);
          await provider.getBlockNumber(); // Quick test
          
          providerData.provider = provider;
          providerData.healthy = true;
          providerData.failures = 0;
          console.log(`   ✅ Provider [${i}] reconnected`);
        } catch (error) {
          // Still dead
          providerData.healthy = false;
        }
        continue;
      }

      try {
        const startTime = Date.now();
        await Promise.race([
          providerData.provider.getBlockNumber(),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Health check timeout')), 5000)
          ),
        ]);

        const responseTime = Date.now() - startTime;
        providerData.responseTime = responseTime;
        providerData.lastCheck = Date.now();

        if (!providerData.healthy && providerData.failures > 0) {
          // Recovered!
          providerData.healthy = true;
          providerData.failures = 0;
          console.log(`   ✅ Provider [${i}] recovered (${responseTime}ms)`);
        }

      } catch (error) {
        providerData.failures++;
        
        if (providerData.healthy && providerData.failures > 2) {
          providerData.healthy = false;
          console.warn(`   ⚠️  Provider [${i}] failed health check, marked unhealthy`);
        }
      }
    }

    // Switch to better provider if current is slow
    const current = this.providers[this.currentProviderIndex];
    if (current.healthy && current.responseTime > 3000) {
      // Find faster provider
      const fasterIndex = this.providers.findIndex(
        (p, i) => p.healthy && p.responseTime < current.responseTime && i !== this.currentProviderIndex
      );
      
      if (fasterIndex !== -1) {
        console.log(`   ⚡ Switching to faster provider [${fasterIndex}] (${this.providers[fasterIndex].responseTime}ms vs ${current.responseTime}ms)`);
        this.currentProviderIndex = fasterIndex;
      }
    }
  }

  /**
   * Wrapper methods for common RPC calls with automatic failover
   */
  async getBlockNumber() {
    return this.executeWithFailover(
      provider => provider.getBlockNumber(),
      'getBlockNumber'
    );
  }

  async getBlock(blockNumber) {
    return this.executeWithFailover(
      provider => provider.getBlock(blockNumber),
      'getBlock'
    );
  }

  async getTransaction(hash) {
    return this.executeWithFailover(
      provider => provider.getTransaction(hash),
      'getTransaction'
    );
  }

  async getTransactionReceipt(hash) {
    return this.executeWithFailover(
      provider => provider.getTransactionReceipt(hash),
      'getTransactionReceipt'
    );
  }

  async getLogs(filter) {
    return this.executeWithFailover(
      provider => provider.getLogs(filter),
      'getLogs'
    );
  }

  async call(transaction) {
    return this.executeWithFailover(
      provider => provider.call(transaction),
      'call'
    );
  }

  /**
   * Check if service is healthy
   */
  async isHealthy() {
    const healthyCount = this.providers.filter(p => p.healthy).length;
    return healthyCount > 0;
  }

  /**
   * Get service statistics
   */
  getStats() {
    return {
      ...this.stats,
      providers: this.providers.map((p, i) => ({
        index: i,
        url: p.url,
        healthy: p.healthy,
        responseTime: p.responseTime,
        failures: p.failures,
        lastCheck: p.lastCheck,
        isCurrent: i === this.currentProviderIndex,
      })),
      healthyProviders: this.providers.filter(p => p.healthy).length,
      totalProviders: this.providers.length,
    };
  }

  /**
   * Disconnect and cleanup
   */
  async disconnect() {
    console.log('   🔌 Disconnecting Multi-RPC Provider Service...');

    // Stop health checks
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    // Disconnect all providers
    for (const providerData of this.providers) {
      if (providerData.provider) {
        try {
          await providerData.provider.destroy();
        } catch (error) {
          // Ignore disconnect errors
        }
      }
    }

    this.providers = [];
    this.network = null;
    console.log('   ✅ Multi-RPC Provider Service disconnected');
  }
}
