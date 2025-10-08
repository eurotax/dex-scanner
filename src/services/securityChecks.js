import { ethers } from 'ethers';
import { ExplorerFactory } from '../explorers/explorerFactory.js';

// Known LP locker addresses on BSC
const LP_LOCKERS = [
  '0x407993575c91ce7643a4d4ccacc9a98c36ee1bbe', // PinkLock
  '0xc765bddb93b0d1c1a88282ba0fa6b2d00e3e0c83', // PinkLock v2
  '0x71B5759d73262FBb223956913ecF4ecC51057641', // Team Finance
  '0xe2fe530c047f2d85298b07d9333c05737f1435fb', // Team Finance v2
  '0x3f4D6bf08CB7A003488Ef082102C2e6418a4551e', // Unicrypt
  '0xeaEd594B5926A7D5FBBC61985390BaAf936a6b8d', // Unicrypt v2
];

const OWNABLE_ABI = [
  'function owner() view returns (address)',
  'function getOwner() view returns (address)',
];

export class SecurityChecksService {
  constructor(provider) {
    this.provider = provider;
    this.explorer = ExplorerFactory.getDefaultExplorer();
  }

  async performChecks(tokenAddress, pairAddress) {
    const results = {
      verified: false,
      renounced: false,
      lpLocked: false,
      score: 0,
      warnings: [],
    };

    try {
      // Check 1: Code verified on scanner
      results.verified = await this.isCodeVerified(tokenAddress);
      if (results.verified) {
        results.score += 1;
      } else {
        results.warnings.push('Code not verified');
      }

      // Check 2: Owner renounced
      results.renounced = await this.isOwnerRenounced(tokenAddress);
      if (results.renounced) {
        results.score += 1;
      } else {
        results.warnings.push('Owner not renounced');
      }

      // Check 3: LP locked
      results.lpLocked = await this.isLPLocked(pairAddress);
      if (results.lpLocked) {
        results.score += 1;
      } else {
        results.warnings.push('LP not locked');
      }

    } catch (error) {
      console.error('Error performing security checks:', error.message);
      results.warnings.push('Error during checks');
    }

    return results;
  }

  async isCodeVerified(tokenAddress) {
    try {
      const sourceCode = await this.explorer.getContractSourceCode(tokenAddress);
      return sourceCode.SourceCode && sourceCode.SourceCode !== '';
    } catch (error) {
      console.warn(`Could not check verification for ${tokenAddress}:`, error.message);
      return false;
    }
  }

  async isOwnerRenounced(tokenAddress) {
    try {
      const contract = new ethers.Contract(tokenAddress, OWNABLE_ABI, this.provider);
      
      let ownerAddress;
      
      // Try owner() first
      try {
        ownerAddress = await contract.owner();
      } catch {
        // Try getOwner() if owner() fails
        try {
          ownerAddress = await contract.getOwner();
        } catch {
          // Contract might not be Ownable
          console.warn(`Contract ${tokenAddress} is not Ownable`);
          return false;
        }
      }

      // Check if owner is zero address (renounced)
      const zeroAddress = '0x0000000000000000000000000000000000000000';
      return ownerAddress.toLowerCase() === zeroAddress.toLowerCase();

    } catch (error) {
      console.warn(`Could not check owner for ${tokenAddress}:`, error.message);
      return false;
    }
  }

  async isLPLocked(pairAddress) {
    try {
      // Get LP token balance for known locker addresses
      const lpTokenABI = ['function balanceOf(address) view returns (uint256)'];
      const lpContract = new ethers.Contract(pairAddress, lpTokenABI, this.provider);

      for (const lockerAddress of LP_LOCKERS) {
        try {
          const balance = await lpContract.balanceOf(lockerAddress);
          
          if (balance > 0n) {
            console.log(`✅ LP locked at ${lockerAddress}`);
            return true;
          }
        } catch (error) {
          // Continue checking other lockers
          continue;
        }
      }

      // No LP tokens found in known lockers
      return false;

    } catch (error) {
      console.warn(`Could not check LP lock for ${pairAddress}:`, error.message);
      return false;
    }
  }

  formatChecks(checks) {
    const icons = {
      verified: checks.verified ? '✅' : '❌',
      renounced: checks.renounced ? '✅' : '❌',
      lpLocked: checks.lpLocked ? '✅' : '❌',
    };

    return {
      shortFormat: `${icons.verified}${icons.renounced}${icons.lpLocked}`,
      longFormat: [
        `${icons.verified} Code ${checks.verified ? 'verified' : 'not verified'}`,
        `${icons.renounced} Owner ${checks.renounced ? 'renounced' : 'not renounced'}`,
        `${icons.lpLocked} LP ${checks.lpLocked ? 'locked' : 'not locked'}`,
      ].join('\n'),
      score: checks.score,
      warnings: checks.warnings,
    };
  }
}
