'use client';

import type { ReactNode } from 'react';
import { I18nProvider } from './i18n/I18nProvider';
import { ToastProvider } from '@/components/ui/toast';
import type { Locale } from '../i18n/config';

export function ClientProviders({ locale, messages, children }: { locale: Locale; messages: Record<string, any>; children: ReactNode }) {
  return (
    <I18nProvider locale={locale} messages={messages}>
      <ToastProvider>
        {children}
      </ToastProvider>
    </I18nProvider>
  );
}
