/**
 * User Model - User statistics and preferences
 */

import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  address: {
    type: String,
    required: true,
    unique: true,
    index: true,
    lowercase: true,
  },
  // Statistics
  totalBets: {
    type: Number,
    default: 0,
  },
  totalWagered: {
    type: Number,
    default: 0,
  },
  totalWon: {
    type: Number,
    default: 0,
  },
  totalLost: {
    type: Number,
    default: 0,
  },
  winRate: {
    type: Number,
    default: 0,
  },
  // Preferences
  preferences: {
    defaultMarket: {
      type: String,
      default: 'ETH-PERP',
    },
    notifications: {
      type: Boolean,
      default: true,
    },
  },
  // Timestamps
  firstSeen: {
    type: Date,
    default: Date.now,
  },
  lastActive: {
    type: Date,
    default: Date.now,
  },
}, {
  timestamps: true,
});

// Indexes
UserSchema.index({ totalWagered: -1 }); // Leaderboard
UserSchema.index({ winRate: -1 }); // Top performers

export const User = mongoose.models.User || mongoose.model('User', UserSchema);
