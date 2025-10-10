#!/usr/bin/env node

/**
 * Security Checks Test
 * 
 * Verifies that the security checks service correctly identifies verified contracts.
 * Tests the improved isCodeVerified method.
 */

import { SecurityChecksService } from './src/services/securityChecks.js';

console.log('🧪 Testing Security Checks Service...\n');

// Mock provider
const mockProvider = {
  getNetwork: () => ({ chainId: 56 })
};

// Mock explorer with different scenarios
class MockExplorer {
  constructor(scenario) {
    this.scenario = scenario;
  }

  async getContractSourceCode(address) {
    switch (this.scenario) {
      case 'verified':
        return {
          SourceCode: 'contract Token { ... }',
          ABI: '[{"inputs":[],"name":"name","outputs":[{"internalType":"string","name":"","type":"string"}],"stateMutability":"view","type":"function"}]',
          ContractName: 'Token',
        };
      
      case 'not-verified':
        return {
          SourceCode: '',
          ABI: 'Contract source code not verified',
          ContractName: '',
        };
      
      case 'source-only':
        // Edge case: has source but invalid ABI
        return {
          SourceCode: 'contract Token { ... }',
          ABI: 'Contract source code not verified',
          ContractName: '',
        };
      
      case 'abi-only':
        // Edge case: has ABI but no source
        return {
          SourceCode: '',
          ABI: '[{"inputs":[]}]',
          ContractName: 'Token',
        };
      
      default:
        throw new Error('Unknown scenario');
    }
  }
}

async function runTests() {
  let passed = 0;
  let failed = 0;

  // Test 1: Verified contract
  console.log('1️⃣ Testing verified contract...');
  try {
    const service = new SecurityChecksService(mockProvider);
    service.explorer = new MockExplorer('verified');
    
    const isVerified = await service.isCodeVerified('0x123');
    
    if (isVerified === true) {
      console.log('   ✅ Correctly identified verified contract');
      passed++;
    } else {
      console.log('   ❌ Failed to identify verified contract');
      failed++;
    }
  } catch (error) {
    console.log('   ❌ Error:', error.message);
    failed++;
  }

  // Test 2: Not verified contract
  console.log('\n2️⃣ Testing not verified contract...');
  try {
    const service = new SecurityChecksService(mockProvider);
    service.explorer = new MockExplorer('not-verified');
    
    const isVerified = await service.isCodeVerified('0x456');
    
    if (isVerified === false) {
      console.log('   ✅ Correctly identified non-verified contract');
      passed++;
    } else {
      console.log('   ❌ Failed to identify non-verified contract');
      failed++;
    }
  } catch (error) {
    console.log('   ❌ Error:', error.message);
    failed++;
  }

  // Test 3: Source code without valid ABI (edge case)
  console.log('\n3️⃣ Testing contract with source but no valid ABI...');
  try {
    const service = new SecurityChecksService(mockProvider);
    service.explorer = new MockExplorer('source-only');
    
    const isVerified = await service.isCodeVerified('0x789');
    
    if (isVerified === false) {
      console.log('   ✅ Correctly rejected contract without valid ABI');
      passed++;
    } else {
      console.log('   ❌ Should have rejected contract without valid ABI');
      failed++;
    }
  } catch (error) {
    console.log('   ❌ Error:', error.message);
    failed++;
  }

  // Test 4: ABI without source code (edge case)
  console.log('\n4️⃣ Testing contract with ABI but no source code...');
  try {
    const service = new SecurityChecksService(mockProvider);
    service.explorer = new MockExplorer('abi-only');
    
    const isVerified = await service.isCodeVerified('0xabc');
    
    if (isVerified === false) {
      console.log('   ✅ Correctly rejected contract without source code');
      passed++;
    } else {
      console.log('   ❌ Should have rejected contract without source code');
      failed++;
    }
  } catch (error) {
    console.log('   ❌ Error:', error.message);
    failed++;
  }

  // Summary
  console.log('\n' + '═'.repeat(50));
  console.log('📊 Test Results:');
  console.log(`   ✅ Passed: ${passed}`);
  console.log(`   ❌ Failed: ${failed}`);
  console.log(`   📈 Total: ${passed + failed}`);
  
  if (failed === 0) {
    console.log('\n🎉 All tests passed!');
    console.log('\n✨ Code verification improvements working correctly:');
    console.log('   • Checks both SourceCode and ABI fields');
    console.log('   • Rejects contracts with invalid ABI messages');
    console.log('   • Handles edge cases properly');
    process.exit(0);
  } else {
    console.log('\n❌ Some tests failed!');
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('\n❌ Test suite failed:', error.message);
  console.error(error.stack);
  process.exit(1);
});
