export const locales = ['fr', 'en'] as const;
export type Locale = typeof locales[number];
export const defaultLocale: Locale = 'fr';

export function isLocale(input: string): input is Locale {
  return (locales as readonly string[]).includes(input);
}

