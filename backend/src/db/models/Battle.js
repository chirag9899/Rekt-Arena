/**
 * Battle Model - Cached battle data from blockchain
 * 
 * Note: Blockchain is source of truth, this is for analytics and faster queries
 */

import mongoose from 'mongoose';

const BattleSchema = new mongoose.Schema({
  battleId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  battleAddress: {
    type: String,
    required: true,
    index: true,
  },
  creator: {
    type: String,
    required: true,
    index: true,
  },
  status: {
    type: String,
    enum: ['WAITING', 'LIVE', 'ACTIVE', 'SETTLED', 'CANCELLED'],
    default: 'WAITING',
    index: true,
  },
  tier: {
    type: String,
    enum: ['PRIMARY', 'SECONDARY'],
    default: 'SECONDARY',
  },
  asset: {
    type: String,
    default: 'ETH-PERP',
  },
  // Agent data
  agentA: {
    wallet: String,
    collateral: Number,
    leverage: Number,
    entryPrice: Number,
    alive: Boolean,
  },
  agentB: {
    wallet: String,
    collateral: Number,
    leverage: Number,
    entryPrice: Number,
    alive: Boolean,
  },
  // Battle config
  entryPrice: Number,
  startTime: Date,
  endTime: Date,
  entryFee: Number,
  eliminationThreshold: Number,
  totalPool: Number,
  winner: String,
  // Final health values (before liquidation)
  finalBullHealth: Number,
  finalBearHealth: Number,
  // Escalation state
  escalationLevel: {
    type: Number,
    default: 0,
  },
  escalationStartTime: Date,
  nextEscalationTime: Date,
  currentLeverage: {
    type: Number,
    default: 5,
  },
  // Transaction hashes
  creationTxHash: {
    type: String,
    index: true,
  },
  settlementTxHash: {
    type: String,
    index: true,
  },
  creationBlockNumber: Number,
  settlementBlockNumber: Number,
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  settledAt: Date,
}, {
  timestamps: true,
});

// Indexes for common queries
BattleSchema.index({ status: 1, createdAt: -1 });
BattleSchema.index({ tier: 1, status: 1 });
BattleSchema.index({ creator: 1, createdAt: -1 });
BattleSchema.index({ 'agentA.wallet': 1 });
BattleSchema.index({ 'agentB.wallet': 1 });

export const Battle = mongoose.models.Battle || mongoose.model('Battle', BattleSchema);
