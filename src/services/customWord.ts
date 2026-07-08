/**
 * Custom word sharing service
 * Encodes/decodes custom words for shareable puzzle links
 * Uses base64 encoding with URL-safe modifications
 */

import { Buffer } from 'buffer'

const WORD_REGEX = /^[A-Z]{5}$/
/** Salt prefix to validate encoded words */
const SALT = 'WDLX'

/**
 * Converts string to base64 (browser or Node.js compatible)
 */
const toBase64 = (value: string): string => {
  if (typeof globalThis !== 'undefined' && typeof globalThis.btoa === 'function') {
    return globalThis.btoa(value)
  }
  return Buffer.from(value, 'utf-8').toString('base64')
}

/**
 * Converts base64 string back to original (browser or Node.js compatible)
 */
const fromBase64 = (value: string): string => {
  if (typeof globalThis !== 'undefined' && typeof globalThis.atob === 'function') {
    return globalThis.atob(value)
  }
  return Buffer.from(value, 'base64').toString('utf-8')
}

/**
 * Converts base64 to URL-safe format (replaces +/ with -_ and removes padding)
 */
const toUrlSafeBase64 = (value: string) =>
  value.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')

/**
 * Converts URL-safe base64 back to standard base64 (restores +/ and padding)
 */
const fromUrlSafeBase64 = (value: string) => {
  let normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = normalized.length % 4
  if (padding) {
    normalized += '='.repeat(4 - padding)
  }
  return normalized
}

/**
 * Normalizes user input to uppercase letters only, max 5 characters
 *
 * @param input - Raw user input
 * @returns Normalized word (uppercase, letters only, max 5 chars)
 */
export const normalizeWordInput = (input: string) =>
  input
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
    .slice(0, 5)

/**
 * Encodes a 5-letter word into a shareable hash
 *
 * @param word - The word to encode
 * @returns URL-safe base64 hash
 * @throws Error if word is not exactly 5 letters
 */
export const encodeCustomWord = (word: string): string => {
  const normalized = normalizeWordInput(word)
  if (!WORD_REGEX.test(normalized)) {
    throw new Error('Word must be exactly 5 letters')
  }
  const payload = `${SALT}:${normalized}`
  return toUrlSafeBase64(toBase64(payload))
}

/**
 * Decodes a hash back to the original word
 *
 * @param hash - The encoded hash
 * @returns Decoded word or null if invalid
 */
export const decodeCustomWord = (hash?: string | null): string | null => {
  if (!hash || typeof hash !== 'string') {
    return null
  }

  try {
    const decoded = fromBase64(fromUrlSafeBase64(hash))
    const [, word] = decoded.split(':')
    // Validate salt prefix and word format
    if (word && decoded.startsWith(`${SALT}:`) && WORD_REGEX.test(word)) {
      return word
    }
  } catch {
    return null
  }

  return null
}
