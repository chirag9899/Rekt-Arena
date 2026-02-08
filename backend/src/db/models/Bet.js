/**
 * Bet Model - User betting history
 */

import mongoose from 'mongoose';

const BetSchema = new mongoose.Schema({
  battleId: {
    type: String,
    required: true,
    index: true,
  },
  battleAddress: {
    type: String,
    required: true,
  },
  bettor: {
    type: String,
    required: true,
    index: true,
  },
  side: {
    type: String,
    enum: ['bull', 'bear'],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  // Transaction data
  txHash: {
    type: String,
    index: true,
  },
  blockNumber: Number,
  // Settlement data (filled when battle ends)
  settled: {
    type: Boolean,
    default: false,
    index: true,
  },
  won: Boolean,
  payout: Number,
  settledAt: Date,
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
}, {
  timestamps: true,
});

// Indexes
BetSchema.index({ bettor: 1, createdAt: -1 });
BetSchema.index({ battleId: 1, createdAt: -1 });
BetSchema.index({ settled: 1, battleId: 1 });

export const Bet = mongoose.models.Bet || mongoose.model('Bet', BetSchema);
