/**
 * Price History Model - Long-term price data for analytics
 */

import mongoose from 'mongoose';

const PriceHistorySchema = new mongoose.Schema({
  asset: {
    type: String,
    required: true,
    default: 'ETH-PERP',
    index: true,
  },
  price: {
    type: Number,
    required: true,
  },
  timestamp: {
    type: Date,
    required: true,
    default: Date.now,
    index: true,
  },
  source: {
    type: String,
    default: 'coingecko',
  },
}, {
  timestamps: true,
});

// Indexes for time-series queries
PriceHistorySchema.index({ asset: 1, timestamp: -1 });
PriceHistorySchema.index({ timestamp: -1 });

// TTL index - auto-delete records older than 30 days
PriceHistorySchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });

export const PriceHistory = mongoose.models.PriceHistory || mongoose.model('PriceHistory', PriceHistorySchema);
