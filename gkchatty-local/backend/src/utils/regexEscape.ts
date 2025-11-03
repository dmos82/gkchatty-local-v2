/**
 * Escapes special regex characters in a string to prevent regex injection attacks
 * This function ensures that user input is treated as literal text in MongoDB $regex operations
 *
 * @param string - The user input string to escape
 * @returns The escaped string safe for use in regex patterns
 */
export function escapeRegExp(string: string): string {
  // Escape all special regex characters: . * + ? ^ $ { } ( ) | [ ] \
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Alternative name for consistency with common naming conventions
 */
export const escapeRegex = escapeRegExp;
