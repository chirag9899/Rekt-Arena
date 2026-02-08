/**
 * Simple Rate Limiter Middleware
 * Prevents abuse by limiting requests per IP address
 */

class RateLimiter {
  constructor() {
    // Store: { ip: { count: number, resetTime: number } }
    this.store = new Map();
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000); // Clean up every minute
  }

  cleanup() {
    const now = Date.now();
    for (const [ip, data] of this.store.entries()) {
      if (now > data.resetTime) {
        this.store.delete(ip);
      }
    }
  }

  middleware(options = {}) {
    const {
      windowMs = 60 * 1000, // 1 minute
      max = 100, // max requests per window
      message = 'Too many requests, please try again later',
      skipSuccessfulRequests = false,
      skipFailedRequests = false,
    } = options;

    return (req, res, next) => {
      const ip = req.ip || req.connection.remoteAddress || 'unknown';
      const now = Date.now();
      
      let record = this.store.get(ip);
      
      // Reset if window expired
      if (!record || now > record.resetTime) {
        record = {
          count: 0,
          resetTime: now + windowMs,
        };
        this.store.set(ip, record);
      }
      
      // Increment count
      record.count++;
      
      // Check if limit exceeded
      if (record.count > max) {
        const retryAfter = Math.ceil((record.resetTime - now) / 1000);
        return res.status(429).json({
          error: message,
          retryAfter,
          limit: max,
          windowMs,
        });
      }
      
      // Store updated record
      this.store.set(ip, record);
      
      // Add rate limit headers
      res.setHeader('X-RateLimit-Limit', max);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, max - record.count));
      res.setHeader('X-RateLimit-Reset', new Date(record.resetTime).toISOString());
      
      // Track response status for skip options
      const originalSend = res.send;
      const rateLimiterInstance = this; // Capture the RateLimiter instance
      res.send = function(body) {
        const statusCode = res.statusCode;
        
        if (skipSuccessfulRequests && statusCode >= 200 && statusCode < 300) {
          // Don't count successful requests
          const record = rateLimiterInstance.store.get(ip);
          if (record) {
            record.count = Math.max(0, record.count - 1);
          }
        }
        
        if (skipFailedRequests && statusCode >= 400) {
          // Don't count failed requests
          const record = rateLimiterInstance.store.get(ip);
          if (record) {
            record.count = Math.max(0, record.count - 1);
          }
        }
        
        return originalSend.call(this, body);
      };
      
      next();
    };
  }

  // Strict rate limiter for sensitive endpoints (betting, etc.)
  strict() {
    return this.middleware({
      windowMs: 60 * 1000, // 1 minute
      max: 20, // 20 requests per minute
      message: 'Too many requests. Please slow down.',
    });
  }

  // Standard rate limiter for general API endpoints
  standard() {
    return this.middleware({
      windowMs: 60 * 1000, // 1 minute
      max: 100, // 100 requests per minute
      message: 'Too many requests, please try again later',
    });
  }

  // Lenient rate limiter for read-only endpoints
  lenient() {
    return this.middleware({
      windowMs: 60 * 1000, // 1 minute
      max: 200, // 200 requests per minute
      message: 'Too many requests, please try again later',
    });
  }
}

export const rateLimiter = new RateLimiter();
export default rateLimiter;
