/**
 * Hungarian Character Normalizer
 * 
 * Normalizes Hungarian diacritical characters to ASCII equivalents.
 * Follows three rules:
 * 1. Strip Acute Accents (´): á→a, é→e, í→i, ó→o, ú→u
 * 2. Strip Umlauts (¨): ö→o, ü→u
 * 3. Strip Double Acutes (˝): ő→o, ű→u
 */

const HUNGARIAN_MAP: Record<string, string> = {
  // Lowercase
  'á': 'a',
  'é': 'e',
  'í': 'i',
  'ó': 'o',
  'ö': 'o',
  'ő': 'o',
  'ú': 'u',
  'ü': 'u',
  'ű': 'u',
  // Uppercase
  'Á': 'A',
  'É': 'E',
  'Í': 'I',
  'Ó': 'O',
  'Ö': 'O',
  'Ő': 'O',
  'Ú': 'U',
  'Ü': 'U',
  'Ű': 'U',
};

/**
 * Normalizes a single character using the Hungarian mapping
 */
export function normalizeHungarianChar(char: string): string {
  return HUNGARIAN_MAP[char] || char;
}

/**
 * Normalizes a string by replacing Hungarian diacritical characters with ASCII equivalents
 */
export function normalizeHungarianString(str: string): string {
  return str
    .split('')
    .map(char => HUNGARIAN_MAP[char] || char)
    .join('');
}

/**
 * Sanitizes a name for use in file paths or database storage.
 * - Normalizes Hungarian characters
 * - Removes any remaining diacritics via NFD normalization
 * - Keeps only alphanumeric, spaces, hyphens, underscores, and dots
 * - Replaces spaces with underscores
 */
export function sanitizeNameForStorage(name: string): string {
  return normalizeHungarianString(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove any remaining diacritics
    .replace(/[^a-zA-Z0-9\s\-_.]/g, '') // Keep alphanumeric, spaces, hyphens, underscores, dots
    .trim()
    .replace(/\s+/g, '_'); // Replace spaces with underscores
}

/**
 * Sanitizes a filename specifically for file uploads.
 * Similar to sanitizeNameForStorage but preserves the file extension properly.
 */
export function sanitizeFileName(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.');
  
  if (lastDotIndex === -1) {
    // No extension
    return sanitizeNameForStorage(fileName);
  }
  
  const name = fileName.substring(0, lastDotIndex);
  const extension = fileName.substring(lastDotIndex + 1).toLowerCase();
  
  return `${sanitizeNameForStorage(name)}.${extension}`;
}

/**
 * Sanitizes a folder/company/telephely name for path usage.
 * Uses hyphens instead of underscores for cleaner paths.
 */
export function sanitizePathName(name: string): string {
  return normalizeHungarianString(name)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s\-_]/g, '')
    .replace(/\s+/g, '-')
    .trim();
}
