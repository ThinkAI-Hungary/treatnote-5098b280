/**
 * Path Sanitizer for Supabase Storage
 * 
 * Normalizes Hungarian characters to ASCII equivalents and keeps spaces.
 * This ensures compatibility with Supabase Storage which may have issues with accented characters.
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
 * Normalizes Hungarian characters to their ASCII equivalents.
 * E.g., "Morfi szép nagy cége" -> "Morfi szep nagy cege"
 */
export function normalizeHungarianString(str: string): string {
  return str
    .split('')
    .map(char => HUNGARIAN_MAP[char] || char)
    .join('');
}

/**
 * Sanitizes a name for use in Supabase Storage paths.
 * - Converts Hungarian characters to ASCII (á → a, é → e, etc.)
 * - Keeps spaces as-is
 * - Removes only characters that are unsafe for paths (/, \, :, *, ?, ", <, >, |)
 * - Trims leading/trailing whitespace
 * - Collapses multiple spaces into one
 */
export function sanitizePathName(name: string): string {
  return normalizeHungarianString(name)
    .trim()
    .replace(/[\/\\:*?"<>|]/g, '') // Remove path-unsafe characters
    .replace(/\s+/g, ' '); // Collapse multiple spaces to single space
}

/**
 * Sanitizes a name for use in file paths or database storage.
 * Same as sanitizePathName - normalizes Hungarian characters and keeps spaces.
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

/**
 * @deprecated Use normalizeHungarianString instead
 */
export function normalizeHungarianChar(char: string): string {
  return HUNGARIAN_MAP[char] || char;
}
