'use client';

import { useMemo, useState, useCallback } from 'react';
import yaml from 'js-yaml';
import { Search, Download, Package, AlertCircle, Loader2, ArrowRight, Filter, SortAsc, SortDesc, Copy, Check } from 'lucide-react';

import { useI18n } from '../i18n/I18nProvider';
import { useToast } from '@/components/ui/toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Alert } from '@/components/ui/alert';

type ChartVersion = {
  version?: string;
  appVersion?: string | number;
  description?: string;
  urls?: string[];
  created?: string;
};

type IndexYaml = {
  entries?: Record<string, ChartVersion[]>;
  packages?: Record<string, ChartVersion[]>;
  charts?: Record<string, ChartVersion[]>;
};

type SortOption = 'name' | 'date' | 'versions';

function normalizeBaseUrl(u: string) {
  if (!u) return '';
  try {
    const url = new URL(u);
    return url.toString().replace(/\/$/, '');
  } catch {
    return u.replace(/\/$/, '');
  }
}

function resolveUrl(resourceUrl: string, base?: string) {
  if (!resourceUrl) return '';
  try {
    return new URL(resourceUrl, base || (typeof window !== 'undefined' ? window.location.href : undefined)).toString();
  } catch {
    return resourceUrl;
  }
}

export default function HelmChartBrowser() {
  const { t } = useI18n();
  const { addToast } = useToast();
  const [repoUrl, setRepoUrl] = useState('https://charts.bitnami.com/bitnami');
  const [indexData, setIndexData] = useState<IndexYaml | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const base = useMemo(() => normalizeBaseUrl(repoUrl || ''), [repoUrl]);

  const fetchCharts = async () => {
    if (!repoUrl.trim()) {
      setError(t('home.errorInvalidUrl'));
      return;
    }

    setLoading(true);
    setError('');
    setIndexData(null);
    setSearchInput('');
    setSearchQuery('');

    try {
      const res = await fetch(`/api/fetchIndex?url=${encodeURIComponent(repoUrl.trim())}`, {
        cache: 'no-store',
      });
      if (!res.ok) throw new Error('fetch failed');
      const text = await res.text();
      const parsed = yaml.load(text) as IndexYaml;
      setIndexData(parsed ?? {});
    } catch (err) {
      console.error(err);
      setError(t('home.errorFetch'));
    } finally {
      setLoading(false);
    }
  };

  const entries: Record<string, ChartVersion[]> = useMemo(() => {
    if (!indexData) return {};
    return (indexData.entries || (indexData as any).packages || (indexData as any).charts || {}) as Record<string, ChartVersion[]>;
  }, [indexData]);
  const totalCharts = useMemo(() => Object.keys(entries).length, [entries]);

  const filteredAndSortedCharts = useMemo(() => {
    let result = Object.entries(entries);

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(([name, versions]) => {
        if (name.toLowerCase().includes(query)) return true;
        return versions.some(v => 
          v.description?.toLowerCase().includes(query) ||
          v.version?.toLowerCase().includes(query) ||
          String(v.appVersion).toLowerCase().includes(query)
        );
      });
    }

    result.sort((a, b) => {
      const [nameA, versionsA] = a;
      const [nameB, versionsB] = b;
      let cmp = 0;

      switch (sortBy) {
        case 'name':
          cmp = nameA.localeCompare(nameB);
          break;
        case 'date':
          const dateA = versionsA[0]?.created ? new Date(versionsA[0].created).getTime() : 0;
          const dateB = versionsB[0]?.created ? new Date(versionsB[0].created).getTime() : 0;
          cmp = dateA - dateB;
          break;
        case 'versions':
          cmp = versionsA.length - versionsB.length;
          break;
      }

      return sortDir === 'asc' ? cmp : -cmp;
    });

    return result;
  }, [entries, searchQuery, sortBy, sortDir]);

  const charts = useMemo(() => filteredAndSortedCharts.map(([name]) => name), [filteredAndSortedCharts]);
  const visibleCharts = showAll ? charts : charts.slice(0, 50);

  const extractRepoName = (url: string) => {
    const parts = url.replace(/\/$/, '').split('/');
    return parts[parts.length - 1] || 'Repository';
  };

  const downloadChart = (chartName: string, v: ChartVersion) => {
    let url = '';
    if (v.urls && v.urls.length) {
      url = resolveUrl(v.urls[0], base);
    } else if (chartName && v.version) {
      url = `${base}/${chartName}-${v.version}.tgz`;
    }
    if (url) window.open(url, '_blank');
  };

  const toggleExpanded = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const copyUrl = useCallback((url: string) => {
    navigator.clipboard.writeText(url);
    setCopiedUrl(url);
    addToast(t('common.copied'), 'success');
    setTimeout(() => setCopiedUrl(null), 2000);
  }, [addToast, t]);

  return (
    <div className="space-y-6">
      <Card className="animate-fade-up">
        <CardContent className="pt-6">
          <div className="space-y-3">
            <div className="space-y-2">
              <Input
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchCharts()}
                placeholder={t('home.placeholder')}
              />
              <p className="text-xs text-muted-foreground">{t('home.hint')}</p>
            </div>

            <Button onClick={fetchCharts} disabled={loading} className="w-full" size="lg">
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t('home.loading')}
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  {t('home.search')}
                </>
              )}
            </Button>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <div className="font-medium">{error}</div>
              </Alert>
            )}
          </div>
        </CardContent>
      </Card>

      {loading && (
        <Card className="border-dashed animate-fade-up" style={{ animationDelay: '80ms' }}>
          <CardContent className="flex min-h-[340px] flex-col items-center justify-center gap-3 py-12 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">{t('home.loading')}</p>
            <div className="flex flex-col gap-2 w-full max-w-md mt-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-16 rounded-md animate-shimmer" />
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {!loading && totalCharts > 0 && (
        <div className="space-y-6 animate-fade-up" style={{ animationDelay: '60ms' }}>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b pb-4">
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold tracking-tight">
                {t('charts.count', { n: charts.length })}
              </h2>
              <p className="flex items-center gap-2 text-sm text-muted-foreground">
                <Package className="h-4 w-4" />
                {extractRepoName(base)}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={t('charts.search')}
                  value={searchInput}
                  onChange={(e) => {
                    const value = e.target.value;
                    setSearchInput(value);
                    setSearchQuery(value.toLowerCase().trim());
                  }}
                  className="pl-9 w-48"
                />
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSortBy(prev => prev === 'name' ? 'date' : prev === 'date' ? 'versions' : 'name');
                }}
                className="gap-1"
              >
                <Filter className="h-3 w-3" />
                {t(`charts.sort.${sortBy}`)}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')}
              >
                {sortDir === 'asc' ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
              </Button>

              {charts.length > 50 && (
                <Button variant="outline" size="sm" onClick={() => setShowAll((v) => !v)}>
                  {showAll ? t('charts.less') : t('charts.showAll', { n: charts.length })}
                </Button>
              )}
            </div>
          </div>

          {charts.length === 0 ? (
            <Card className="border-dashed animate-fade-up">
              <CardContent className="py-10 text-center">
                <p className="text-sm text-muted-foreground">{t('charts.noResults')}</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {visibleCharts.map((name, idx) => {
                const versions = (entries[name] || []).slice().sort((a, b) => {
                  const av = String(a.version || '0');
                  const bv = String(b.version || '0');
                  return av === bv ? 0 : av < bv ? 1 : -1;
                });
                const latest = versions[0];
                const isOpen = expanded.has(name);
                const visibleVersions = isOpen ? versions : versions.slice(0, 3);

                return (
                  <Card
                    key={name}
                    className="flex flex-col animate-fade-up"
                    style={{ animationDelay: `${idx * 25}ms` }}
                  >
                    <CardHeader>
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 space-y-1">
                          <CardTitle className="text-lg">{name}</CardTitle>
                          <CardDescription>
                            {t('charts.latest')} {latest?.version || '—'}
                          </CardDescription>
                        </div>
                        <Badge variant="secondary" className="shrink-0">
                          {versions.length}
                        </Badge>
                      </div>
                      {latest?.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{latest.description}</p>
                      )}
                    </CardHeader>
                    <CardContent className="flex-1 space-y-2">
                      {visibleVersions.map((v, idx) => (
                        <div
                          key={`${name}-${idx}-${v.version}`}
                          className="group flex items-center justify-between gap-3 rounded-md border bg-card p-3 transition-colors hover:bg-accent/50"
                        >
                          <div className="flex flex-col gap-0.5 min-w-0 flex-1">
                            <span className="text-sm font-medium">v{v.version}</span>
                            {v.appVersion && (
                              <span className="text-xs text-muted-foreground">
                                App: {String(v.appVersion)}
                              </span>
                            )}
                            {v.created && (
                              <span className="text-xs text-muted-foreground">
                                {new Date(v.created).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                          <div className="flex shrink-0 gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                const url = v.urls?.[0] ? resolveUrl(v.urls[0], base) : `${base}/${name}-${v.version}.tgz`;
                                copyUrl(url);
                              }}
                              title={t('common.copy')}
                            >
                              {copiedUrl ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => downloadChart(name, v)}
                              title={t('download')}
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}

                      {versions.length > 3 && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full"
                          onClick={() => toggleExpanded(name)}
                          aria-expanded={isOpen}
                          aria-controls={`versions-${name}`}
                        >
                          <ArrowRight className={cn('mr-2 h-4 w-4 transition-transform', isOpen && 'rotate-90')} />
                          {isOpen ? t('charts.less') : t('charts.more', { n: versions.length - 3 })}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {!loading && totalCharts === 0 && !error && (
        <Card className="border-dashed">
          <CardContent className="flex min-h-[340px] flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
              <Package className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="mb-2 text-lg font-semibold">{t('empty.prompt')}</h3>
            <p className="text-sm text-muted-foreground">{t('empty.example')}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
