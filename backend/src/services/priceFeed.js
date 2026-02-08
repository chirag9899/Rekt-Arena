import axios from 'axios';
import EventEmitter from 'events';
import config from '../config.js';
import logger from '../utils/logger.js';

/**
 * Price Feed Service
 * Fetches ETH price from CoinGecko and provides real-time updates
 */
class PriceFeedService extends EventEmitter {
  constructor() {
    super();
    this.currentPrice = 0; // No default price - must come from real API
    this.isRunning = false;
    this.consecutiveErrors = 0;
    this.maxRetryDelay = 60000; // Max 60 seconds between retries
    this.baseRetryDelay = 5000; // Start with 5 seconds
    this.timeoutId = null; // Track the current timeout for cleanup
  }

  /**
   * Start polling for price updates
   */
  start() {
    if (this.isRunning) return;
    
    logger.info('Starting price feed service');
    this.isRunning = true;
    
    // Initial fetch
    this.fetchPrice();
    
    // Set up polling with dynamic interval based on errors
    this.scheduleNextFetch();
  }
  
  scheduleNextFetch() {
    if (!this.isRunning) return;
    
    // Clear any existing timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
    }
    
    // Calculate delay: increase if we have errors, reset on success
    const delay = this.consecutiveErrors > 0
      ? Math.min(this.baseRetryDelay * Math.pow(2, this.consecutiveErrors - 1), this.maxRetryDelay)
      : config.priceFeed.pollInterval;
    
    this.timeoutId = setTimeout(() => {
      if (this.isRunning) {
      this.fetchPrice();
        this.scheduleNextFetch();
      }
    }, delay);
  }

  /**
   * Stop polling
   */
  stop() {
    if (!this.isRunning) return;
    
    logger.info('Stopping price feed service');
    this.isRunning = false;
    this.consecutiveErrors = 0;
    
    // Clear any pending timeout
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
  }

  /**
   * Fetch current asset price from CoinGecko
   * Asset is configured via config.priceFeed.assetId (default: ethereum)
   */
  async fetchPrice() {
    try {
      // Build URL properly - ensure it's the correct CoinGecko endpoint
      let baseUrl = config.priceFeed.url;
      
      // Remove trailing slash if present
      baseUrl = baseUrl.replace(/\/$/, '');
      
      // Construct full URL with query parameters
      const assetId = config.priceFeed.assetId || 'ethereum';
      const url = `${baseUrl}?ids=${encodeURIComponent(assetId)}&vs_currencies=usd`;
      
      // Debug: log the URL being called (only on first error or every 10th call)
      if (this.consecutiveErrors === 0 || this.consecutiveErrors % 10 === 1) {
        logger.info('Fetching asset price', { assetId, url, baseUrl: config.priceFeed.url });
      }
      
      const response = await axios.get(url, {
        timeout: 10000,
        headers: {
          'Accept': 'application/json',
        },
        validateStatus: () => true, // Don't throw on any status, we'll handle it
      });
      
      // Check for HTTP errors
      if (response.status !== 200) {
        const errorMsg = `HTTP ${response.status}: ${response.statusText || 'Unknown error'}`;
        logger.error('CoinGecko API error', { 
          url, 
          status: response.status, 
          statusText: response.statusText,
          data: response.data 
        });
        throw new Error(errorMsg);
      }
      
      // Check if response data exists
      if (!response.data) {
        throw new Error('Empty response from CoinGecko API');
      }

      const assetData = response.data && response.data[assetId];
      if (assetData && assetData.usd) {
        const priceUsd = assetData.usd;
        // Store price in USD (not 8 decimals) for consistency with state.mjs
        const newPrice = priceUsd;
        
        // Reset error count on successful fetch
        if (this.consecutiveErrors > 0) {
          logger.info('Price feed recovered', { consecutiveErrors: this.consecutiveErrors });
          this.consecutiveErrors = 0;
        }
        
        if (newPrice !== this.currentPrice) {
          const oldPrice = this.currentPrice;
          this.currentPrice = newPrice;
          
          logger.info('Asset price updated', { 
            oldPrice: oldPrice, 
            newPrice: newPrice 
          });
          
          this.emit('priceUpdate', {
            price: newPrice,
            priceUsd: priceUsd,
            timestamp: Date.now(),
          });
        }
      } else {
        throw new Error('Invalid response format from CoinGecko');
      }
    } catch (error) {
      this.consecutiveErrors++;
      
      // Log error details
      const errorDetails = {
        message: error.message,
        status: error.response?.status,
        statusText: error.response?.statusText,
        url: error.config?.url,
        consecutiveErrors: this.consecutiveErrors,
      };
      
      // Only log as error if we don't have a price yet, otherwise warn
      if (this.currentPrice === 0) {
        logger.error('Failed to fetch ETH price (no price available)', errorDetails);
      } else {
        // If we have a price, just warn - we'll keep using the last known price
        logger.warn('Failed to fetch ETH price (using last known price)', errorDetails);
      }
      
      // Don't update price on error - keep last known price
      // The scheduleNextFetch will handle retry with exponential backoff
    }
  }

  /**
   * Get current price
   */
  getCurrentPrice() {
    return this.currentPrice;
  }

  /**
   * Set price manually (for testing/admin)
   */
  setPrice(price) {
    const oldPrice = this.currentPrice;
    this.currentPrice = price;
    
    logger.info('ETH price manually set', { 
      oldPrice: oldPrice, 
      newPrice: price 
    });
    
    this.emit('priceUpdate', {
      price: price,
      priceUsd: price,
      timestamp: Date.now(),
    });
  }

  /**
   * Simulate price movement (for testing/demo only)
   * @param {number} percentChange - Percentage change (-10 to +10)
   */
  simulatePriceMovement(percentChange) {
    if (this.currentPrice === 0) {
      logger.warn('Cannot simulate price movement: no current price set');
      return;
    }
    const change = (this.currentPrice * percentChange) / 100;
    const newPrice = this.currentPrice + change;
    this.setPrice(newPrice);
  }
}

export default new PriceFeedService();
