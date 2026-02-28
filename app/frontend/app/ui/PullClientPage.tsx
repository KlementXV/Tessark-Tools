'use client';

import { useState, useEffect, useMemo } from 'react';
import { Download, Lock, ChevronDown, ChevronUp, Loader2, AlertCircle, X } from 'lucide-react';

import { useI18n } from '../i18n/I18nProvider';
import { useToast } from '@/components/ui/toast';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert } from '@/components/ui/alert';
import { Fieldset } from '@/components/ui/fieldset';
import { Badge } from '@/components/ui/badge';

const IMAGE_RE = /^[A-Za-z0-9./:@_\-]+$/;

export default function PullClientPage() {
  const { t } = useI18n();
  const { addToast } = useToast();
  const [refs, setRefs] = useState('');
  const [format, setFormat] = useState<'docker-archive' | 'oci-archive'>('docker-archive');
  const [error, setError] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showAuth, setShowAuth] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingDownload, setPendingDownload] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamMessage, setStreamMessage] = useState<string | null>(null);
  const [progressTargetPct, setProgressTargetPct] = useState<number | null>(null);
  const [progressDisplayPct, setProgressDisplayPct] = useState(0);
  const [buttonStatus, setButtonStatus] = useState('');
  const [leavingButtonStatus, setLeavingButtonStatus] = useState<string | null>(null);
  const [statusAnimStep, setStatusAnimStep] = useState(0);

  const rawImageList = refs
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  const imageList = useMemo(() => Array.from(new Set(rawImageList)), [rawImageList]);
  const duplicateCount = rawImageList.length - imageList.length;

  const validationErrors = imageList.map(ref => {
    if (!ref) return null;
    return IMAGE_RE.test(ref) ? null : ref;
  }).filter(Boolean);

  const hasValidationError = validationErrors.length > 0;
  const liveStatus = streaming
    ? (streamMessage || 'Streaming...')
    : progress ? `${progress.current}/${progress.total}` : t('home.loading');

  useEffect(() => {
    if (progressTargetPct === null) return;

    let rafId = 0;
    const tick = () => {
      setProgressDisplayPct((prev) => {
        const delta = progressTargetPct - prev;
        if (Math.abs(delta) < 0.15) return progressTargetPct;
        return prev + delta * 0.14;
      });
      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [progressTargetPct]);

  useEffect(() => {
    if (!(loading || streaming)) {
      setButtonStatus('');
      setLeavingButtonStatus(null);
      return;
    }
    if (!buttonStatus) {
      setButtonStatus(liveStatus);
      return;
    }
    if (liveStatus === buttonStatus) return;

    setLeavingButtonStatus(buttonStatus);
    setButtonStatus(liveStatus);
    setStatusAnimStep((v) => v + 1);

    const timeoutId = window.setTimeout(() => {
      setLeavingButtonStatus(null);
    }, 260);

    return () => window.clearTimeout(timeoutId);
  }, [loading, streaming, liveStatus, buttonStatus]);

  const handleClear = () => {
    setRefs('');
    setError('');
  };

  const handleSubmit = async () => {
    if (imageList.length === 0) {
      setError(t('pull.errors.required'));
      return;
    }

    if (hasValidationError) {
      setError(t('pull.errors.invalid'));
      return;
    }

    setStreamMessage(null);
    setPendingDownload(true);
    setShowConfirm(true);
  };

  const executeStreamingDownload = async () => {
    if (imageList.length === 0) {
      setError(t('pull.errors.required'));
      return;
    }

    const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));
    const setImageStageProgress = (current: number, total: number, stage: number) => {
      const clampedStage = Math.max(0, Math.min(1, stage));
      setProgressTargetPct((((current - 1) + clampedStage) / total) * 100);
    };

    const downloadArchive = async (id: string, filename?: string) => {
      const res = await fetch(`/api/pull/file/${id}`);
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(errText || res.statusText || 'download failed');
      }

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename || `image-${id}.tar`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    };

    const streamOneImage = async (imageRef: string, current: number, total: number) => {
      const stepPrefix = `[${current}/${total}]`;
      let stageProgress = 0;
      let copiedBlobCount = 0;
      const bumpStage = (nextStage: number) => {
        stageProgress = Math.max(stageProgress, nextStage);
        setImageStageProgress(current, total, stageProgress);
      };

      setShowConfirm(false);
      bumpStage(0.03);
      const response = await fetch('/api/pull/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ref: imageRef,
          format,
          username: username.trim() || undefined,
          password: password.trim() || undefined,
        }),
      });

      if (!response.ok || !response.body) {
        const errText = await response.text().catch(() => '');
        throw new Error(`${imageRef}: ${errText || response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let streamError: string | null = null;
      let readyId = '';
      let readyFilename = '';

      const processChunk = (chunk: string) => {
        buffer += chunk;
        const parts = buffer.split(/\r?\n\r?\n/);
        buffer = parts.pop() || '';

        for (const part of parts) {
          if (!part.includes('data:') && !part.includes('event:')) continue;

          const lines = part.split(/\r?\n/);
          let event = 'message';
          let data = '';

          for (const l of lines) {
            if (l.startsWith('event:')) event = l.replace('event:', '').trim();
            if (l.startsWith('data:')) data += `${l.replace('data:', '').trim()}\n`;
          }

          data = data.trim();

          if (event === 'start') {
            bumpStage(0.08);
            setStreamMessage(`${stepPrefix} Demarrage...`);
          }
          if (event === 'progress') {
            if (/Getting image source signatures/i.test(data)) {
              bumpStage(0.16);
            } else if (/Copying blob/i.test(data)) {
              copiedBlobCount += 1;
              bumpStage(Math.min(0.78, 0.24 + copiedBlobCount * 0.1));
            } else if (/Copying config/i.test(data)) {
              bumpStage(0.84);
            } else if (/Writing manifest/i.test(data)) {
              bumpStage(0.92);
            } else if (/Storing signatures/i.test(data)) {
              bumpStage(0.97);
            } else {
              bumpStage(Math.min(0.9, stageProgress + 0.03));
            }
            setStreamMessage(`${stepPrefix} ${data}`);
          }
          if (event === 'auth') {
            bumpStage(0.12);
            setStreamMessage(`${stepPrefix} auth: ${data}`);
          }
          if (event === 'ready') {
            try {
              const parsed = JSON.parse(data) as { id?: string; filename?: string };
              if (!parsed.id) {
                streamError = 'Invalid ready payload';
                continue;
              }
              readyId = parsed.id;
              readyFilename = parsed.filename || '';
              bumpStage(0.985);
              setStreamMessage(`${stepPrefix} Finalisation de l'archive...`);
            } catch {
              streamError = 'Invalid ready payload';
            }
          }
          if (event === 'error') {
            streamError = data || 'Erreur backend';
          }
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (value) processChunk(decoder.decode(value, { stream: true }));
        if (streamError) {
          try {
            await reader.cancel();
          } catch {}
          break;
        }
        if (done) break;
      }

      if (streamError) {
        throw new Error(`${imageRef}: ${streamError}`);
      }
      if (!readyId) {
        throw new Error(`${imageRef}: archive not ready`);
      }

      await wait(450);
      setStreamMessage(`${stepPrefix} Lancement du telechargement...`);
      await downloadArchive(readyId, readyFilename || undefined);
      bumpStage(1);
      setStreamMessage(`${stepPrefix} Termine`);
    };

    setError('');
    setLoading(false);
    setStreaming(true);
    setProgressDisplayPct(0);
    setProgressTargetPct(0);
    setProgress({ current: 0, total: imageList.length });
    setStreamMessage('starting...');

    let successCount = 0;

    try {
      for (let i = 0; i < imageList.length; i++) {
        const imageRef = imageList[i];
        setProgress({ current: i + 1, total: imageList.length });
        await streamOneImage(imageRef, i + 1, imageList.length);
        successCount += 1;

        if (i < imageList.length - 1) {
          await wait(300);
        }
      }

      if (imageList.length === 1) {
        addToast(t('pull.success'), 'success');
      } else {
        addToast(t('pull.successMultiple', { n: successCount }), 'success');
      }
    } catch (err) {
      setError(t('pull.errors.server', {
        message: err instanceof Error ? err.message : 'Unknown',
      }));
    } finally {
      setStreaming(false);
      setProgress(null);
      setProgressTargetPct(null);
      setPendingDownload(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="animate-fade-up">
        <CardContent className="pt-6">
          <div className="space-y-6">
              <div className="space-y-3">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="imageRef">{t('pull.imageRef')}</Label>
                    {refs && (
                    <Button type="button" variant="ghost" size="sm" onClick={handleClear} className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground">
                      <X className="mr-1 h-3 w-3" />
                      {t('common.clear')}
                    </Button>
                  )}
                </div>
                <Textarea
                  id="imageRef"
                  value={refs}
                  onChange={(e) => {
                    setRefs(e.target.value);
                    setError('');
                  }}
                  placeholder="registry/repository:tag"
                  className={`min-h-[120px] font-mono text-sm resize-none ${hasValidationError ? 'border-destructive ring-1 ring-destructive' : ''}`}
                  rows={5}
                />
                <div className="flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {t('pull.helper')}
                    {duplicateCount > 0 ? ` ${t('pull.duplicatesIgnored', { n: duplicateCount })}` : ''}
                  </p>
                  {imageList.length > 0 && (
                    <Badge variant={hasValidationError ? 'destructive' : 'secondary'}>
                      {imageList.length} image{imageList.length > 1 ? 's' : ''}
                    </Badge>
                  )}
                </div>
              </div>

              {progress && (
                <div className="space-y-2 rounded-md border border-border bg-muted/50 p-3 animate-progress-panel-in">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      {t('pull.progress', { current: progress.current, total: progress.total })}
                    </span>
                    <span className="font-medium">{Math.round(progressDisplayPct)}%</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full bg-primary transition-[width] duration-200 ease-out"
                      style={{ width: `${Math.max(0, Math.min(100, progressDisplayPct))}%` }}
                    />
                  </div>
                </div>
              )}

              <Button type="button" onClick={handleSubmit} disabled={loading || streaming} className="w-full" size="lg">
                {(loading || streaming) ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    <span className="relative inline-flex h-5 min-w-[14ch] max-w-[34ch] items-center justify-center overflow-hidden align-middle">
                      {leavingButtonStatus && (
                        <span
                          key={`status-out-${statusAnimStep}`}
                          className="absolute inset-0 truncate text-center animate-status-text-out"
                        >
                          {leavingButtonStatus}
                        </span>
                      )}
                      <span
                        key={`status-in-${statusAnimStep}-${buttonStatus || liveStatus}`}
                        className={`truncate text-center ${leavingButtonStatus ? 'animate-status-text-in' : ''}`}
                      >
                        {buttonStatus || liveStatus}
                      </span>
                    </span>
                  </>
                ) : (
                  <>
                    <Download className="mr-2 h-4 w-4" />
                    {t('download')}
                  </>
                )}
              </Button>

            </div>

            <div className="space-y-2">
              <Label htmlFor="format">{t('pull.format')}</Label>
              <Select
                id="format"
                value={format}
                onChange={(e) => setFormat(e.target.value as any)}
              >
                <option value="docker-archive">{t('pull.formatDocker')}</option>
                <option value="oci-archive">{t('pull.formatOci')}</option>
              </Select>
            </div>

            <div className="space-y-3 border-t pt-5">
              <Button
                type="button"
                variant="ghost"
                className="flex items-center gap-2 px-0 text-sm font-medium"
                onClick={() => setShowAuth((v) => !v)}
                aria-expanded={showAuth}
              >
                <Lock className="h-4 w-4" />
                {t('pull.auth.toggle')}
                {showAuth ? <ChevronUp className="ml-auto h-4 w-4" /> : <ChevronDown className="ml-auto h-4 w-4" />}
              </Button>

              {showAuth && (
                <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
                  <div className="space-y-1">
                    <h4 className="text-sm font-medium">{t('pull.auth.title')}</h4>
                    <p className="text-xs text-muted-foreground">{t('pull.auth.note')}</p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="username">{t('pull.auth.username')}</Label>
                      <Input
                        id="username"
                        value={username}
                        onChange={(e) => setUsername(e.target.value)}
                        placeholder="username"
                        autoComplete="username"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">{t('pull.auth.password')}</Label>
                      <Input
                        id="password"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="••••••••"
                        autoComplete="current-password"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <div>{error}</div>
              </Alert>
            )}

          </div>
        </CardContent>
      </Card>

      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm animate-fade-up">
          <Card className="w-full max-w-md mx-4 animate-fade-up" style={{ animationDelay: '40ms' }}>
            <CardHeader>
              <CardTitle>{t('common.confirm')}</CardTitle>
              <CardDescription>
                {t('pull.confirmMultiple', { n: imageList.length })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-h-48 overflow-y-auto space-y-2">
                {imageList.map((ref, idx) => (
                  <div key={idx} className="rounded bg-muted px-3 py-2 text-sm font-mono">
                    {ref}
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowConfirm(false)} className="flex-1">
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={executeStreamingDownload}
                  className="flex-1"
                >
                  <Download className="mr-2 h-4 w-4" />
                  {t('download')}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
