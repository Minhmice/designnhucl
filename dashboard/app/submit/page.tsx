'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, CheckCircle2, ExternalLink, Loader2, Play } from 'lucide-react';

type JobState = 'queued' | 'running' | 'completed' | 'failed';

type Job = {
  id: string;
  url: string;
  recipeId: 'lead-fast' | 'critic-standard';
  state: JobState;
  runId: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function SubmitPage() {
  const [url, setUrl] = useState('');
  const [recipeId, setRecipeId] = useState<Job['recipeId']>('lead-fast');
  const [job, setJob] = useState<Job | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
  }, []);

  async function pollJob(jobId: string): Promise<void> {
    try {
      const response = await fetch(`/api/jobs/${jobId}`, { cache: 'no-store' });
      const payload = (await response.json()) as { data?: Job; error?: string };
      if (!response.ok || !payload.data) throw new Error(payload.error ?? 'Could not read job status.');

      setJob(payload.data);
      if (payload.data.state === 'queued' || payload.data.state === 'running') {
        pollTimer.current = setTimeout(() => void pollJob(jobId), 1500);
      }
    } catch (pollError) {
      setError(pollError instanceof Error ? pollError.message : 'Could not read job status.');
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setJob(null);

    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') throw new Error();
    } catch {
      setError('Enter valid HTTP(S) URL.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await fetch('/api/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: parsedUrl.toString(), recipeId }),
      });
      const payload = (await response.json()) as { jobId?: string; error?: string };
      if (!response.ok || !payload.jobId) throw new Error(payload.error ?? 'Could not queue evaluation.');

      await pollJob(payload.jobId);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Could not queue evaluation.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-8 shadow-sm">
        <div className="flex items-start gap-3 mb-6">
          <div className="p-2 rounded-lg bg-blue-600/15 text-blue-400">
            <Play className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-100">Submit Website for Evaluation</h2>
            <p className="text-xs text-slate-400 mt-1">
              Queue an autonomous agent run. This page tracks queued, running, completed, and failed states.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="target-url" className="block text-xs font-medium text-slate-300 mb-1.5">Target Website URL</label>
            <input
              id="target-url"
              type="url"
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              required
              disabled={submitting}
              placeholder="https://example.com"
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-blue-500 disabled:opacity-60"
            />
          </div>

          <div>
            <label htmlFor="recipe" className="block text-xs font-medium text-slate-300 mb-1.5">Recipe Mode</label>
            <select
              id="recipe"
              value={recipeId}
              onChange={(event) => setRecipeId(event.target.value as Job['recipeId'])}
              disabled={submitting}
              className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-blue-500 disabled:opacity-60"
            >
              <option value="lead-fast">lead-fast (Fast single-page scan)</option>
              <option value="critic-standard">critic-standard (Deep multi-page audit)</option>
            </select>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-400 font-medium text-xs text-white rounded-lg transition-colors"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {submitting ? 'Dispatching...' : 'Dispatch Agent Run'}
          </button>
        </form>

        {error && (
          <div role="alert" className="mt-4 flex items-start gap-2 rounded-lg border border-red-900/60 bg-red-950/30 p-3 text-xs text-red-300">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {job && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
          <div className="flex items-center gap-2">
            {job.state === 'completed' ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
            <h3 className="text-xs font-semibold text-slate-200">Evaluation Job</h3>
            <span className="ml-auto px-2 py-0.5 rounded border border-slate-700 bg-slate-800 text-[10px] uppercase font-mono text-slate-300">{job.state}</span>
          </div>
          <div className="mt-4 space-y-2 text-xs font-mono text-slate-400">
            <div>job: <span className="text-slate-200">{job.id}</span></div>
            <div>target: <span className="text-slate-200 break-all">{job.url}</span></div>
            {job.runId && <div>run: <span className="text-slate-200">{job.runId}</span></div>}
            {job.error && <div className="text-red-300">error: {job.error}</div>}
          </div>
          {job.runId && (
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href={`/agents?runId=${job.runId}`} className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-950/30 px-3 py-1.5 rounded-lg border border-blue-900/50">
                Agent Monitor <ExternalLink className="w-3 h-3" />
              </Link>
              <Link href={`/logs?runId=${job.runId}`} className="inline-flex items-center gap-1.5 text-xs text-blue-400 hover:text-blue-300 bg-blue-950/30 px-3 py-1.5 rounded-lg border border-blue-900/50">
                Live Logs <ExternalLink className="w-3 h-3" />
              </Link>
              {job.state === 'completed' && (
                <>
                  <Link href={`/runs/${job.runId}`} className="inline-flex items-center gap-1.5 text-xs text-emerald-400 hover:text-emerald-300 bg-emerald-950/30 px-3 py-1.5 rounded-lg border border-emerald-900/50">
                    Run Detail <ExternalLink className="w-3 h-3" />
                  </Link>
                  <a href={`/api/runs/${job.runId}/report.html`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-700">
                    HTML Report <ExternalLink className="w-3 h-3" />
                  </a>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
