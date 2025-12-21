/**
 * Path Sanitizer for Supabase Storage
 * 
 * Supabase Storage supports UTF-8 characters including Hungarian letters and spaces.
 * We only need to remove characters that are truly unsafe for paths/URLs.
 */

/**
 * Sanitizes a name for use in Supabase Storage paths.
 * - Keeps Hungarian characters (á, é, ő, ű, etc.)
 * - Keeps spaces as-is
 * - Removes only characters that are unsafe for paths (/, \, :, *, ?, ", <, >, |)
 * - Trims leading/trailing whitespace
 * - Collapses multiple spaces into one
 */
export function sanitizePathName(name: string): string {
  return name
    .trim()
    .replace(/[\/\\:*?"<>|]/g, '') // Remove path-unsafe characters
    .replace(/\s+/g, ' '); // Collapse multiple spaces to single space
}

/**
 * Sanitizes a name for use in file paths or database storage.
 * Same as sanitizePathName - keeps Hungarian characters and spaces.
 */
export function sanitizeNameForStorage(name: string): string {
  return sanitizePathName(name);
}

/**
 * Sanitizes a filename specifically for file uploads.
 * Preserves the file extension properly.
 */
export function sanitizeFileName(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.');
  
  if (lastDotIndex === -1) {
    // No extension
    return sanitizePathName(fileName);
  }
  
  const name = fileName.substring(0, lastDotIndex);
  const extension = fileName.substring(lastDotIndex + 1).toLowerCase();
  
  return `${sanitizePathName(name)}.${extension}`;
}

// Legacy exports for backward compatibility
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
 * @deprecated Use sanitizePathName instead - Hungarian characters are now preserved
 */
export function normalizeHungarianChar(char: string): string {
  return HUNGARIAN_MAP[char] || char;
}

/**
 * @deprecated Use sanitizePathName instead - Hungarian characters are now preserved
 */
export function normalizeHungarianString(str: string): string {
  return str
    .split('')
    .map(char => HUNGARIAN_MAP[char] || char)
    .join('');
}
