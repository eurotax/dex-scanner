import { config } from '../config.js';
import { withBackoff } from '../utils/backoff.js';

export class EtherscanFamilyExplorer {
  constructor(options = {}) {
    this.apiKey = options.apiKey || config.etherscan.apiKey;
    this.apiUrl = options.apiUrl || config.etherscan.apiUrl;
    this.chainId = options.chainId || config.chainId;
  }

  async getContractABI(address) {
    const params = new URLSearchParams({
      chainid: this.chainId.toString(),
      module: 'contract',
      action: 'getabi',
      address: address,
      apikey: this.apiKey,
    });

    return withBackoff(
      async () => {
        const response = await fetch(`${this.apiUrl}?${params}`);
        const data = await response.json();

        if (data.status === '0') {
          throw new Error(data.result || 'Failed to fetch contract ABI');
        }

        return JSON.parse(data.result);
      },
      `Etherscan getContractABI(${address})`
    );
  }

  async getContractSourceCode(address) {
    const params = new URLSearchParams({
      chainid: this.chainId.toString(),
      module: 'contract',
      action: 'getsourcecode',
      address: address,
      apikey: this.apiKey,
    });

    return withBackoff(
      async () => {
        const response = await fetch(`${this.apiUrl}?${params}`);
        const data = await response.json();

        if (data.status === '0') {
          throw new Error(data.result || 'Failed to fetch contract source code');
        }

        return data.result[0];
      },
      `Etherscan getContractSourceCode(${address})`
    );
  }

  async getContractCreation(addresses) {
    const addressList = Array.isArray(addresses) ? addresses.join(',') : addresses;
    const params = new URLSearchParams({
      chainid: this.chainId.toString(),
      module: 'contract',
      action: 'getcontractcreation',
      contractaddresses: addressList,
      apikey: this.apiKey,
    });

    return withBackoff(
      async () => {
        const response = await fetch(`${this.apiUrl}?${params}`);
        const data = await response.json();

        if (data.status === '0') {
          throw new Error(data.result || 'Failed to fetch contract creation');
        }

        return data.result;
      },
      `Etherscan getContractCreation(${addressList})`
    );
  }

  async getTransactionReceipt(txHash) {
    const params = new URLSearchParams({
      chainid: this.chainId.toString(),
      module: 'proxy',
      action: 'eth_getTransactionReceipt',
      txhash: txHash,
      apikey: this.apiKey,
    });

    return withBackoff(
      async () => {
        const response = await fetch(`${this.apiUrl}?${params}`);
        const data = await response.json();

        if (data.error) {
          throw new Error(data.error.message || 'Failed to fetch transaction receipt');
        }

        return data.result;
      },
      `Etherscan getTransactionReceipt(${txHash})`
    );
  }
}
