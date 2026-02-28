'use client';

import PullClientPage from '../../ui/PullClientPage';
import { AppShell } from '../../ui/AppShell';
import { useI18n } from '../../i18n/I18nProvider';

export default function LocalizedPull() {
  const { t } = useI18n();
  return (
    <AppShell heroTitle={t('pull.title')} heroSubtitle={t('pull.subtitle')} heroBadge="Skopeo">
      <PullClientPage />
    </AppShell>
  );
}
