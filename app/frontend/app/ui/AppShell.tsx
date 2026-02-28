'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { useState, useEffect } from 'react';
import { Package, Languages, Github, Download, Menu, X, Settings2, Check } from 'lucide-react';

import { useI18n } from '../i18n/I18nProvider';
import { cn } from '@/lib/utils';
import { buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type AppShellProps = {
  children: ReactNode;
  heroTitle: string;
  heroSubtitle?: string;
  heroBadge?: string;
};

type ThemePreset = {
  id: 'obsidian' | 'ocean' | 'emerald' | 'amber' | 'rose';
  primary: string;
  primaryForeground: string;
};

const THEME_STORAGE_KEY = 'tessark_theme_preset';
const DEFAULT_THEME_ID: ThemePreset['id'] = 'obsidian';
const THEME_PRESETS: ThemePreset[] = [
  { id: 'obsidian', primary: '240 5.9% 10%', primaryForeground: '0 0% 98%' },
  { id: 'ocean', primary: '199 89% 48%', primaryForeground: '0 0% 98%' },
  { id: 'emerald', primary: '160 84% 39%', primaryForeground: '0 0% 98%' },
  { id: 'amber', primary: '38 92% 50%', primaryForeground: '240 10% 3.9%' },
  { id: 'rose', primary: '346 77% 49%', primaryForeground: '0 0% 98%' },
];

function applyThemePreset(id: ThemePreset['id']) {
  if (typeof window === 'undefined') return;
  const root = document.documentElement;
  const preset = THEME_PRESETS.find((item) => item.id === id) || THEME_PRESETS[0];
  root.style.setProperty('--primary', preset.primary);
  root.style.setProperty('--primary-foreground', preset.primaryForeground);
  root.style.setProperty('--ring', preset.primary);
}

export function AppShell({ children, heroTitle, heroSubtitle, heroBadge }: AppShellProps) {
  const { t, locale } = useI18n();
  const pathname = usePathname();
  const [scrollProgress, setScrollProgress] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [themePreset, setThemePreset] = useState<ThemePreset['id']>(DEFAULT_THEME_ID);

  const isPull = pathname?.includes('/pull') ?? false;
  const isCharts = !isPull;

  useEffect(() => {
    const handleScroll = () => {
      const totalHeight = document.documentElement.scrollHeight - window.innerHeight;
      const progress = totalHeight > 0 ? (window.scrollY / totalHeight) * 100 : 0;
      setScrollProgress(progress);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY) as ThemePreset['id'] | null;
    const valid = saved && THEME_PRESETS.some((preset) => preset.id === saved) ? saved : DEFAULT_THEME_ID;
    setThemePreset(valid);
    applyThemePreset(valid);
  }, []);

  useEffect(() => {
    if (settingsOpen) document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, [settingsOpen]);

  const buildLocalePath = (target: string) => {
    if (!pathname) return `/${target}/`;
    const parts = pathname.split('/');
    if (parts.length > 1) parts[1] = target;
    return parts.join('/') || `/${target}/`;
  };

  const targetLocale = locale === 'fr' ? 'en' : 'fr';

  const LocaleSwitch = ({ className = '', variant = 'ghost', size = 'sm', fullWidth = false }: {
    className?: string;
    variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
    size?: 'sm' | 'md' | 'lg' | 'icon';
    fullWidth?: boolean;
  }) => (
    <Link
      href={buildLocalePath(targetLocale)}
      className={cn(
        buttonVariants({ variant, size }),
        'gap-2',
        fullWidth ? 'w-full justify-center' : '',
        className,
      )}
      aria-label={t('nav.lang.switch')}
    >
      <Languages className="h-4 w-4" />
      <span className="text-xs font-medium sm:text-sm">{t('nav.lang.switch')}</span>
    </Link>
  );

  const SettingsButton = ({ className = '', variant = 'ghost', size = 'sm', fullWidth = false }: {
    className?: string;
    variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'link';
    size?: 'sm' | 'md' | 'lg' | 'icon';
    fullWidth?: boolean;
  }) => (
    <Button
      type="button"
      variant={variant}
      size={size}
      onClick={() => setSettingsOpen(true)}
      className={cn(
        'gap-2',
        fullWidth ? 'w-full justify-center' : '',
        className,
      )}
      aria-label={t('settings.open')}
    >
      <Settings2 className="h-4 w-4" />
      <span className="text-xs font-medium sm:text-sm">{t('settings.open')}</span>
    </Button>
  );

  const onThemeSelect = (id: ThemePreset['id']) => {
    setThemePreset(id);
    applyThemePreset(id);
    localStorage.setItem(THEME_STORAGE_KEY, id);
  };

  const navItems = [
    { href: `/${locale}/`, label: t('nav.charts'), icon: Package, active: isCharts },
    { href: `/${locale}/pull`, label: t('nav.pull'), icon: Download, active: isPull },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <div
        className="fixed left-0 top-0 z-50 h-1 bg-primary transition-all duration-150"
        style={{ width: `${scrollProgress}%` }}
      />

      <header className="sticky top-0 z-40 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5" aria-hidden />
            <span className="font-bold">{t('nav.brand')}</span>
          </div>

          <button
            className="md:hidden p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>

          <nav className="hidden md:flex items-center gap-1 sm:gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  buttonVariants({ variant: item.active ? 'secondary' : 'ghost', size: 'sm' }),
                  'px-2 sm:px-3',
                )}
                aria-current={item.active ? 'page' : undefined}
              >
                <item.icon className="mr-2 h-4 w-4" />
                {item.label}
              </Link>
            ))}

            <div className="h-6 w-px bg-border mx-1" aria-hidden />
            <SettingsButton variant="ghost" size="sm" />

            <a
              href="https://github.com/KlementXV"
              className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'px-2 sm:px-3')}
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
            >
              <Github className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">GitHub</span>
            </a>
          </nav>
        </div>
      </header>

      {mobileMenuOpen && (
        <div className="md:hidden border-b bg-background">
          <nav className="container flex flex-col py-4 gap-2">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  buttonVariants({ variant: item.active ? 'secondary' : 'ghost' }),
                  'justify-start',
                )}
              >
                <item.icon className="mr-2 h-4 w-4" />
                {item.label}
              </Link>
            ))}
            <SettingsButton className="pt-1" variant="outline" fullWidth />
          </nav>
        </div>
      )}

      {settingsOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
          onClick={() => setSettingsOpen(false)}
        >
          <Card className="w-full max-w-md animate-fade-up" onClick={(e) => e.stopPropagation()}>
            <CardHeader>
              <CardTitle>{t('settings.title')}</CardTitle>
              <CardDescription>{t('settings.subtitle')}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground/80">{t('settings.language')}</p>
                <LocaleSwitch variant="outline" fullWidth />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground/80">{t('settings.colors')}</p>
                <div className="grid grid-cols-2 gap-2">
                  {THEME_PRESETS.map((preset) => {
                    const selected = themePreset === preset.id;
                    return (
                      <Button
                        key={preset.id}
                        type="button"
                        variant={selected ? 'secondary' : 'outline'}
                        className="justify-between"
                        onClick={() => onThemeSelect(preset.id)}
                      >
                        <span className="flex items-center gap-2">
                          <span
                            className="h-3 w-3 rounded-full border"
                            style={{ backgroundColor: `hsl(${preset.primary})` }}
                            aria-hidden
                          />
                          <span>{t(`settings.palette.${preset.id}`)}</span>
                        </span>
                        {selected && <Check className="h-4 w-4" />}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => onThemeSelect(DEFAULT_THEME_ID)}>
                  {t('settings.reset')}
                </Button>
                <Button className="flex-1" onClick={() => setSettingsOpen(false)}>
                  {t('common.close')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <main className="flex-1 container py-8">
        <div className="flex flex-col gap-2 pb-6 animate-fade-up">
          {heroBadge && (
            <div className="animate-floaty inline-flex">
              <Badge>{heroBadge}</Badge>
            </div>
          )}
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{heroTitle}</h1>
          {heroSubtitle && <p className="text-lg text-muted-foreground">{heroSubtitle}</p>}
        </div>

        <div className="space-y-6 animate-fade-up" style={{ animationDelay: '60ms' }}>{children}</div>
      </main>

      <footer className="border-t py-6 md:py-0">
        <div className="container flex flex-col items-center justify-between gap-4 md:h-14 md:flex-row">
          <p className="text-sm text-muted-foreground">
            {t('footer.copyright', { year: new Date().getFullYear() })}
          </p>
          <p className="text-sm text-muted-foreground">
            {t('footer.made')} <span className="text-destructive">♥</span> {t('footer.by')}{' '}
            <a
              className="font-medium underline underline-offset-4 hover:text-foreground"
              href="https://github.com/KlementXV"
              target="_blank"
              rel="noreferrer"
            >
              KlementXV
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
