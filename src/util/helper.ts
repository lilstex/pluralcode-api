import * as crypto from 'crypto';

/**
 * Generate a secure random token (e.g. for password reset links).
 */
export function generateSecureToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate a random 6-digit OTP string.
 */
export function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Calculate an expiration date by adding minutes to now.
 */
export function otpExpiresAt(minutes = 15): Date {
  return new Date(Date.now() + minutes * 60 * 1000);
}

/**
 * Check if a date has passed (i.e., is expired).
 */
export function isExpired(date: Date): boolean {
  return new Date() > date;
}
