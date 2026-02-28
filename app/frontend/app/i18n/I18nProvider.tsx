'use client';

import React, { createContext, useContext, PropsWithChildren } from 'react';
import type { Locale } from '../../i18n/config';

type Messages = Record<string, any>;

type Ctx = {
  locale: Locale;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<Ctx | null>(null);

function getByPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, k) => (acc ? acc[k] : undefined), obj);
}

export function I18nProvider({ locale, messages, children }: PropsWithChildren<{ locale: Locale; messages: Messages }>) {
  const t = (key: string, vars?: Record<string, string | number>) => {
    let value: any = getByPath(messages, key);
    if (value == null) return key;
    if (typeof value !== 'string') return String(value);
    
    if (vars) {
      const count = vars.n as number;
      if (count !== undefined && value.includes('|')) {
        const [singular, plural] = value.split('|');
        value = count === 1 ? singular : plural;
      }
      
      for (const [k, v] of Object.entries(vars)) {
        value = value.replaceAll(`{${k}}`, String(v));
      }
    }
    return value;
  };
  return <I18nContext.Provider value={{ locale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within I18nProvider');
  return ctx;
}

