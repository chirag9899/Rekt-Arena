import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(value: number | undefined | null): string {
  // Handle invalid values
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) {
    return '$0.00';
  }
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

export function formatCompactNumber(value: number | undefined | null): string {
  // Handle invalid values
  if (value === null || value === undefined || isNaN(value) || !isFinite(value)) {
    return '0';
  }
  
  return new Intl.NumberFormat('en-US', {
    notation: 'compact',
    compactDisplay: 'short',
  }).format(value);
}

export function formatAddress(address: string): string {
  if (address.length <= 8) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatTimeRemaining(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function getHealthColor(health: number): string {
  if (health > 70) return 'bg-bull';
  if (health > 30) return 'bg-warning';
  return 'bg-bear';
}

export function getPriceChangeColor(change: number): string {
  return change >= 0 ? 'text-bull' : 'text-bear';
}

export function getPriceChangeIcon(change: number): string {
  return change >= 0 ? '▲' : '▼';
}
