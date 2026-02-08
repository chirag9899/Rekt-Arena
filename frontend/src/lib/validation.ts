/**
 * Input Validation Utilities
 * Provides validation functions for user inputs
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate Ethereum address
 */
export function validateAddress(address: string): ValidationResult {
  if (!address) {
    return { valid: false, error: 'Address is required' };
  }
  
  if (!/^0x[a-fA-F0-9]{40}$/.test(address)) {
    return { valid: false, error: 'Invalid Ethereum address format' };
  }
  
  return { valid: true };
}

/**
 * Validate bet amount
 */
export function validateBetAmount(
  amount: number,
  minBet: number = 10,
  maxBet: number = 10000,
  balance?: number
): ValidationResult {
  if (!amount || amount <= 0) {
    return { valid: false, error: 'Bet amount must be greater than 0' };
  }
  
  if (amount < minBet) {
    return { valid: false, error: `Minimum bet is ${minBet} USDC` };
  }
  
  if (amount > maxBet) {
    return { valid: false, error: `Maximum bet is ${maxBet} USDC` };
  }
  
  if (balance !== undefined && amount > balance) {
    return { valid: false, error: 'Insufficient balance' };
  }
  
  // Check for reasonable precision (2 decimal places)
  if (amount % 0.01 !== 0) {
    return { valid: false, error: 'Amount must have at most 2 decimal places' };
  }
  
  return { valid: true };
}

/**
 * Validate battle ID
 */
export function validateBattleId(battleId: string): ValidationResult {
  if (!battleId) {
    return { valid: false, error: 'Battle ID is required' };
  }
  
  // Battle ID should be a hex string (bytes32)
  if (!/^0x[a-fA-F0-9]{64}$/.test(battleId)) {
    return { valid: false, error: 'Invalid battle ID format' };
  }
  
  return { valid: true };
}

/**
 * Validate transaction hash
 */
export function validateTxHash(txHash: string): ValidationResult {
  if (!txHash) {
    return { valid: false, error: 'Transaction hash is required' };
  }
  
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return { valid: false, error: 'Invalid transaction hash format' };
  }
  
  return { valid: true };
}

/**
 * Sanitize string input (prevent XSS)
 */
export function sanitizeString(input: string): string {
  if (typeof input !== 'string') return '';
  
  // Remove potentially dangerous characters
  return input
    .replace(/[<>]/g, '') // Remove < and >
    .trim()
    .slice(0, 1000); // Limit length
}

/**
 * Validate numeric input
 */
export function validateNumber(
  value: number | string,
  min?: number,
  max?: number
): ValidationResult {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  
  if (isNaN(num)) {
    return { valid: false, error: 'Invalid number' };
  }
  
  if (min !== undefined && num < min) {
    return { valid: false, error: `Value must be at least ${min}` };
  }
  
  if (max !== undefined && num > max) {
    return { valid: false, error: `Value must be at most ${max}` };
  }
  
  return { valid: true };
}

/**
 * Validate email (if needed for future features)
 */
export function validateEmail(email: string): ValidationResult {
  if (!email) {
    return { valid: false, error: 'Email is required' };
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'Invalid email format' };
  }
  
  return { valid: true };
}
