'use client';

import { Suspense, useEffect, useState } from 'react';
import { Terminal, RefreshCw, Filter, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { DomainEventItem } from '../../lib/types';
import { formatDate } from '../../lib/utils';

function LogsContent() {
  const searchParams = useSearchParams();
  const runId = searchParams.get('runId');
  const [logs, setLogs] = useState<DomainEventItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [connectionState, setConnectionState] = useState<'connecting' | 'connected' | 'unavailable' | 'error'>('connecting');

  const fetchLogs = () => {
    setLoading(true);
    const url = new URL('/api/logs', window.location.href);
    if (runId) url.searchParams.set('runId', runId);
    
    fetch(url.toString())
      .then((res) => res.json())
      .then((res) => {
        if (res.unavailable) {
          setConnectionState('unavailable');
          setLogs([]);
        } else {
          setConnectionState('connected');
          setLogs(res.data || []);
        }
        setLoading(false);
      })
      .catch(() => {
        setConnectionState('error');
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchLogs();
    const interval = setInterval(fetchLogs, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Super Detail Telemetry Stream</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Append-only domain event log, monotonic sequences, and audit activity feed.
          </p>
        </div>
        <button
          onClick={fetchLogs}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 rounded-lg border border-slate-700 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Feed</span>
        </button>
      </div>

      <div className="bg-black border border-slate-800/80 rounded-xl p-4 font-mono text-xs text-slate-300 h-[650px] overflow-y-auto space-y-2">
        <div className={`pb-2 border-b border-slate-900 ${connectionState === 'connected' ? 'text-emerald-500' : connectionState === 'unavailable' || connectionState === 'error' ? 'text-red-500' : 'text-slate-500'}`}>
          {connectionState === 'connected' && `[system] WebLens Telemetry Connected. Listening for chronological domain events${runId ? ` for run ${runId}` : ''}...`}
          {connectionState === 'connecting' && `[system] Connecting to Telemetry Stream...`}
          {(connectionState === 'unavailable' || connectionState === 'error') && `[system] Telemetry Stream Unavailable.`}
        </div>

        {(connectionState === 'unavailable' || connectionState === 'error') ? (
          <div className="py-12 text-center text-red-400">
            <AlertTriangle className="w-6 h-6 mx-auto mb-2 opacity-80" />
            Control plane is unavailable. Cannot stream logs.
          </div>
        ) : logs.length === 0 ? (
          <div className="py-12 text-center text-slate-600">
            No events recorded in the current session. Run an evaluation to see live event projection.
          </div>
        ) : (
          logs.map((evt) => (
            <div key={evt.id} className="p-2 rounded bg-slate-950/60 border border-slate-900 flex flex-col gap-1">
              <div className="flex items-center justify-between text-slate-400 text-[11px]">
                <span className="text-blue-400 font-semibold">{evt.eventType}</span>
                <span>seq: {evt.sequence} • {formatDate(evt.occurredAt)}</span>
              </div>
              <div className="text-[11px] text-slate-500 flex items-center justify-between">
                <span>aggregate: {evt.aggregateType} • id: {evt.aggregateId}</span>
                {evt.aggregateType === 'AgentRun' && (
                  <Link href={`/runs/${evt.aggregateId}`} className="text-blue-400 hover:text-blue-300 uppercase tracking-wider text-[9px] border border-blue-900/50 bg-blue-950/30 px-1.5 py-0.5 rounded">
                    Run Detail
                  </Link>
                )}
              </div>
              {evt.payload ? (
                <pre className="mt-1 p-1.5 bg-slate-900/60 rounded text-[10px] text-slate-300 overflow-x-auto">
                  {JSON.stringify(evt.payload, null, 2)}
                </pre>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

export default function LogsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading Telemetry...</div>}>
      <LogsContent />
    </Suspense>
  );
}
