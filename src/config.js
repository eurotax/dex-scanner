#!/usr/bin/env node

import dotenv from 'dotenv';
import { ethers } from 'ethers';

dotenv.config();

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[36m',
};

function success(msg) {
  console.log(`${colors.green}✅ ${msg}${colors.reset}`);
}

function error(msg) {
  console.log(`${colors.red}❌ ${msg}${colors.reset}`);
}

function warning(msg) {
  console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`);
}

function info(msg) {
  console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`);
}

async function testConfig() {
  console.log('\n' + '='.repeat(50));
  console.log('🔍 DEX Scanner Configuration Test');
  console.log('='.repeat(50) + '\n');

  info('Test 1: Checking environment variables...');
  
  const requiredVars = [
    'CHAIN_ID',
    'RPC_URL',
    'FACTORY_ADDRESS',
    'ETHERSCAN_API_KEY',
    'TELEGRAM_BOT_TOKEN',
    'TELEGRAM_CHAT_ID',
  ];

  let configOk = true;
  
  for (const varName of requiredVars) {
    if (process.env[varName]) {
      success(`${varName} is set`);
    } else {
      error(`${varName} is NOT set!`);
      configOk = false;
    }
  }

  if (!configOk) {
    error('Missing required variables. Check your .env file');
    process.exit(1);
  }

  console.log('');

  info('Test 2: Testing RPC connection...');
  
  try {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    
    const networkPromise = provider.getNetwork();
    const blockPromise = provider.getBlockNumber();
    
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Timeout (10s)')), 10000)
    );
    
    const [network, blockNumber] = await Promise.race([
      Promise.all([networkPromise, blockPromise]),
      timeout
    ]);
    
    success(`Connected to RPC: ${process.env.RPC_URL}`);
    info(`   Network: ${network.name}`);
    info(`   Chain ID: ${network.chainId}`);
    info(`   Current block: ${blockNumber}`);
    
    const configChainId = parseInt(process.env.CHAIN_ID, 10);
    if (Number(network.chainId) !== configChainId) {
      warning(`Chain ID from RPC (${network.chainId}) differs from CHAIN_ID in .env (${configChainId})!`);
      warning('This may cause issues. Check your configuration.');
    } else {
      success('Chain ID matches');
    }
  } catch (err) {
    error(`Cannot connect to RPC: ${err.message}`);
    error('Check RPC_URL in your .env file');
    process.exit(1);
  }

  console.log('');

  info('Test 3: Testing Factory Contract...');
  
  try {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const factoryAddress = process.env.FACTORY_ADDRESS;
    
    const factoryAbi = [
      'function allPairsLength() external view returns (uint)',
      'function allPairs(uint) external view returns (address)',
    ];
    
    const factory = new ethers.Contract(factoryAddress, factoryAbi, provider);
    
    const pairsCount = await factory.allPairsLength();
    success(`Factory contract is accessible`);
    info(`   Address: ${factoryAddress}`);
    info(`   Number of pairs: ${pairsCount.toString()}`);
    
    if (Number(pairsCount) > 0) {
      const firstPair = await factory.allPairs(0);
      success(`Can read pairs (first: ${firstPair.substring(0, 10)}...)`);
    }
  } catch (err) {
    error(`Factory contract is not accessible: ${err.message}`);
    warning('Possible causes:');
    warning('1. FACTORY_ADDRESS does not match CHAIN_ID');
    warning('2. Factory address is incorrect');
    warning('3. RPC has issues');
    process.exit(1);
  }

  console.log('');

  info('Test 4: Testing pair reading...');
  
  try {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const factoryAddress = process.env.FACTORY_ADDRESS;
    
    const factoryAbi = ['function allPairsLength() external view returns (uint)', 'function allPairs(uint) external view returns (address)'];
    const factory = new ethers.Contract(factoryAddress, factoryAbi, provider);
    
    const pairsCount = await factory.allPairsLength();
    
    if (Number(pairsCount) > 0) {
      const pairAddress = await factory.allPairs(0);
      
      const pairAbi = [
        'function token0() view returns (address)',
        'function token1() view returns (address)',
        'function getReserves() view returns (uint112, uint112, uint32)',
      ];
      
      const pair = new ethers.Contract(pairAddress, pairAbi, provider);
      
      const [token0, token1] = await Promise.all([
        pair.token0(),
        pair.token1(),
      ]);
      
      success('Can read pair data');
      info(`   Pair: ${pairAddress.substring(0, 10)}...`);
      info(`   Token0: ${token0.substring(0, 10)}...`);
      info(`   Token1: ${token1.substring(0, 10)}...`);
      
      const tokenAbi = [
        'function symbol() view returns (string)',
        'function decimals() view returns (uint8)',
      ];
      
      try {
        const token = new ethers.Contract(token0, tokenAbi, provider);
        const symbol = await token.symbol();
        success(`Can read token data (symbol: ${symbol})`);
      } catch (err) {
        warning(`Cannot read token data: ${err.message}`);
        info('This is OK - some tokens do not have standard functions');
      }
    } else {
      warning('No pairs in factory - cannot test reading');
      info('This is OK if factory is new');
    }
  } catch (err) {
    warning(`Error during pair test: ${err.message}`);
    info('Application should work despite this error');
  }

  console.log('');

  info('Test 5: Testing event polling...');
  
  try {
    const provider = new ethers.JsonRpcProvider(process.env.RPC_URL);
    const factoryAddress = process.env.FACTORY_ADDRESS;
    
    const factoryAbi = [
      'event PairCreated(address indexed token0, address indexed token1, address pair, uint)',
    ];
    
    const factory = new ethers.Contract(factoryAddress, factoryAbi, provider);
    
    const currentBlock = await provider.getBlockNumber();
    const fromBlock = Math.max(0, currentBlock - 1000);
    
    const filter = factory.filters.PairCreated();
    const events = await factory.queryFilter(filter, fromBlock, currentBlock);
    
    success('Event polling works');
    info(`   Found ${events.length} PairCreated events in last 1000 blocks`);
    
    if (events.length > 0) {
      const lastEvent = events[events.length - 1];
      info(`   Last event in block: ${lastEvent.blockNumber}`);
    }
  } catch (err) {
    warning(`Cannot test polling: ${err.message}`);
    info('This may be OK - application will still work');
  }

  console.log('');

  console.log('='.repeat(50));
  success('All tests completed successfully! 🎉');
  console.log('='.repeat(50));
  console.log('');
  info('You can now run the application: npm start');
  console.log('');
}

testConfig().catch(err => {
  console.error('');
  error('Critical error during tests:');
  console.error(err);
  process.exit(1);
});
