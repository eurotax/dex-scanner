import { config } from '../config.js';

export class BackoffRetry {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || config.backoff.maxRetries;
    this.initialDelay = options.initialDelay || config.backoff.initialDelay;
    this.maxDelay = options.maxDelay || config.backoff.maxDelay;
    this.factor = options.factor || 2;
  }

  async execute(fn, context = 'Operation') {
    let lastError;
    
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        
        if (attempt === this.maxRetries) {
          console.error(`${context} failed after ${this.maxRetries + 1} attempts:`, error.message);
          throw error;
        }
        
        const delay = Math.min(
          this.initialDelay * Math.pow(this.factor, attempt),
          this.maxDelay
        );
        
        console.warn(`${context} failed (attempt ${attempt + 1}/${this.maxRetries + 1}), retrying in ${delay}ms...`, error.message);
        await this.sleep(delay);
      }
    }
    
    throw lastError;
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export async function withBackoff(fn, context = 'Operation', options = {}) {
  const backoff = new BackoffRetry(options);
  return backoff.execute(fn, context);
}
