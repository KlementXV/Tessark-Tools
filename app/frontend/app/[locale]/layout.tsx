import type { ReactNode } from 'react';
import { isLocale, type Locale } from '../../i18n/config';
import { Space_Grotesk } from 'next/font/google';
import { ClientProviders } from '../ClientProviders';
import '../globals.css';

const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-sans',
  display: 'swap',
});

export async function generateStaticParams() {
  return [{ locale: 'fr' }, { locale: 'en' }];
}

async function getMessages(locale: Locale) {
  const msgs = await import(`../../messages/${locale}.json`);
  return msgs.default;
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: { locale: string } }) {
  const l = isLocale(params.locale) ? (params.locale as Locale) : 'fr';
  const messages = await getMessages(l);
  return (
    <html lang={l} className={spaceGrotesk.variable} suppressHydrationWarning>
      <body className="min-h-screen bg-background text-foreground">
        <ClientProviders locale={l} messages={messages}>{children}</ClientProviders>
      </body>
    </html>
  );
}
