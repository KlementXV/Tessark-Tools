'use client';

import HelmChartBrowser from '../ui/HelmChartBrowser';
import { AppShell } from '../ui/AppShell';
import { useI18n } from '../i18n/I18nProvider';

export default function Page() {
  const { t } = useI18n();
  return (
    <AppShell heroTitle={t('home.title')} heroSubtitle={t('home.subtitle')} heroBadge="Helm">
      <HelmChartBrowser />
    </AppShell>
  );
}
