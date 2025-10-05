import { EtherscanFamilyExplorer } from './etherscanFamily.js';
import { config } from '../config.js';

export class ExplorerFactory {
  static createExplorer(type = 'etherscan', options = {}) {
    switch (type.toLowerCase()) {
      case 'etherscan':
        return new EtherscanFamilyExplorer({
          apiKey: options.apiKey || config.etherscan.apiKey,
          apiUrl: options.apiUrl || config.etherscan.apiUrl,
          chainId: options.chainId || config.chainId,
        });
      
      default:
        throw new Error(`Unknown explorer type: ${type}`);
    }
  }

  static getDefaultExplorer() {
    return ExplorerFactory.createExplorer('etherscan');
  }
}
