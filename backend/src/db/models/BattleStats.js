/**
 * Battle Statistics Model - Aggregated battle analytics
 */

import mongoose from 'mongoose';

const BattleStatsSchema = new mongoose.Schema({
  battleId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  // Betting stats
  totalBets: {
    type: Number,
    default: 0,
  },
  totalBetsBull: {
    type: Number,
    default: 0,
  },
  totalBetsBear: {
    type: Number,
    default: 0,
  },
  totalWagered: {
    type: Number,
    default: 0,
  },
  // Viewer stats
  peakViewers: {
    type: Number,
    default: 0,
  },
  // Price stats
  entryPrice: Number,
  finalPrice: Number,
  priceChange: Number,
  // Duration
  duration: Number, // milliseconds
  // Winner
  winner: {
    type: String,
    enum: ['bull', 'bear', 'tie'],
  },
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
  },
  settledAt: Date,
}, {
  timestamps: true,
});

// Indexes
BattleStatsSchema.index({ createdAt: -1 });
BattleStatsSchema.index({ totalWagered: -1 });

export const BattleStats = mongoose.models.BattleStats || mongoose.model('BattleStats', BattleStatsSchema);
