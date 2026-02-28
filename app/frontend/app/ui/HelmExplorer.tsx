'use client';

import { useCallback, useMemo, useState } from 'react';
import yaml from 'js-yaml';

type ChartVersion = {
  version?: string;
  appVersion?: string | number;
  urls?: string[];
  created?: string;
  description?: string;
};

type IndexYaml = {
  entries?: Record<string, ChartVersion[]>;
  packages?: Record<string, ChartVersion[]>;
  charts?: Record<string, ChartVersion[]>;
};

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

function sortVersions(versions: ChartVersion[]) {
  const parse = (v: string) => v.split('.').map(x => (isNaN(Number(x)) ? x : Number(x)));
  return [...versions].sort((a, b) => {
    const av = parse(String(a.version || '0.0.0'));
    const bv = parse(String(b.version || '0.0.0'));
    const len = Math.max(av.length, bv.length);
    for (let i = 0; i < len; i++) {
      const ai = (av[i] as any) ?? 0;
      const bi = (bv[i] as any) ?? 0;
      if (typeof ai === 'number' && typeof bi === 'number') {
        if (ai !== bi) return bi - ai;
      } else {
        const as = String(ai);
        const bs = String(bi);
        if (as !== bs) return as < bs ? 1 : -1;
      }
    }
    if (a.created && b.created) return new Date(b.created).getTime() - new Date(a.created).getTime();
    return 0;
  });
}

export default function HelmExplorer() {
  const [repoUrl, setRepoUrl] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [data, setData] = useState<IndexYaml | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const [manualBaseVisible, setManualBaseVisible] = useState(false);

  const loadFromUrl = useCallback(async () => {
    const base = normalizeBaseUrl(repoUrl.trim());
    if (!base) {
      setError('Veuillez saisir une URL de dépôt.');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/fetchIndex?url=${encodeURIComponent(base)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const parsed = yaml.load(text) as IndexYaml;
      setData(parsed ?? {});
      setBaseUrl(base);
      setManualBaseVisible(false);
    } catch (e: any) {
      setError(`Échec du chargement (CORS côté dépôt ?): ${e?.message || e}`);
    } finally {
      setLoading(false);
    }
  }, [repoUrl]);

  const loadFromFile = useCallback((file?: File) => {
    if (!file) return;
    setLoading(true);
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const text = String(reader.result || '');
        const parsed = yaml.load(text) as IndexYaml;
        setData(parsed ?? {});
        setBaseUrl('');
        setManualBaseVisible(true);
      } catch (e: any) {
        setError(`Impossible de parser index.yaml: ${e?.message || e}`);
      } finally {
        setLoading(false);
      }
    };
    reader.onerror = () => {
      setError('Lecture de fichier échouée');
      setLoading(false);
    };
    reader.readAsText(file);
  }, []);

  const entries = useMemo(() => {
    if (!data) return {} as Record<string, ChartVersion[]>;
    return (data.entries || (data as any).packages || (data as any).charts || {}) as Record<string, ChartVersion[]>;
  }, [data]);

  const names = useMemo(() => Object.keys(entries).sort((a, b) => a.localeCompare(b)), [entries]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    if (!f) return names;
    return names.filter(n => n.toLowerCase().includes(f));
  }, [names, filter]);

  return (
    <div>
      <section className="input-panel">
        <div className="url-loader">
          <label htmlFor="repoUrl">URL du dépôt (racine):</label>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              id="repoUrl"
              type="url"
              placeholder="https://exemple.com/charts"
              value={repoUrl}
              onChange={e => setRepoUrl(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadFromUrl()}
            />
            <button onClick={loadFromUrl} disabled={loading}>Charger</button>
          </div>
          <small className="hint">Nous cherchons un fichier <code>index.yaml</code> à la racine.</small>
        </div>

        <div className="or-sep">ou</div>

        <div className="file-loader">
          <label htmlFor="indexFile">Importer un <code>index.yaml</code> local:</label>
          <input id="indexFile" type="file" accept=".yaml,.yml,text/yaml" onChange={e => loadFromFile(e.target.files?.[0])} />
        </div>
      </section>

      <section className="controls" hidden={!(data || loading || error)}>
        <div className="base-url-control" hidden={!manualBaseVisible}>
          <label htmlFor="baseUrl">Base pour liens relatifs:</label>
          <input id="baseUrl" type="url" value={baseUrl} onChange={e => setBaseUrl(e.target.value)} />
        </div>
        <div className="filter-control">
          <input id="search" type="search" placeholder="Filtrer par nom de chart..." value={filter} onChange={e => setFilter(e.target.value)} />
        </div>
      </section>

      <section id="results" className="results">
        {loading && <div className="loading">Chargement...</div>}
        {error && <div className="error">{error}</div>}
        {!loading && !error && (!data || names.length === 0) && (
          <div className="placeholder">Aucun résultat pour le moment.</div>
        )}

        {!loading && !error && data && names.length > 0 && (
          <div className="charts-list">
            {filtered.map(name => {
              const versions = sortVersions(entries[name] || []);
              const latest = versions[0];
              const desc = latest?.description || '';
              return (
                <article key={name} className="chart-card">
                  <div className="chart-head">
                    <div className="chart-title">
                      <h2>{name}</h2>
                      <div className="chart-meta">
                        {latest?.version && (
                          <>Dernière version: <strong>{latest.version}</strong></>
                        )}
                        {latest?.appVersion && (
                          <> • App: {String(latest.appVersion)}</>
                        )}
                      </div>
                      {desc && <p className="chart-desc">{desc}</p>}
                    </div>
                    <div className="chart-actions">
                      {latest?.urls?.map((u, i) => {
                        const abs = resolveUrl(u, baseUrl);
                        return (
                          <a key={i} href={abs} className="btn" download title={abs}>
                            Télécharger (dernière)
                          </a>
                        );
                      })}
                    </div>
                  </div>
                  <details>
                    <summary>Toutes les versions ({versions.length})</summary>
                    <div className="versions">
                      {versions.map(v => {
                        const created = v.created ? new Date(v.created).toLocaleString() : '';
                        return (
                          <div key={`${name}-${v.version}-${v.created || ''}`} className="version-row">
                            <div className="v-meta">
                              <span className="v">{v.version}</span>
                              {created && <span className="date"> ({created})</span>}
                              {v.appVersion && <> • App: {String(v.appVersion)}</>}
                            </div>
                            <div className="v-links">
                              {v.urls?.map((u, i) => {
                                const abs = resolveUrl(u, baseUrl);
                                return (
                                  <a key={i} href={abs} className="link" download title={abs}>
                                    {i === 0 ? 'Télécharger' : `Mirror ${i + 1}`}
                                  </a>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

