'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Bot, RefreshCw, AlertTriangle, ShieldCheck, Clock } from 'lucide-react';
import type { AgentRunItem } from '../../lib/types';
import { formatDate } from '../../lib/utils';

function AgentsContent() {
  const searchParams = useSearchParams();
  const highlightRunId = searchParams.get('runId');
  const [agents, setAgents] = useState<AgentRunItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  const fetchAgents = () => {
    fetch('/api/agents')
      .then((res) => res.json())
      .then((res) => {
        if (res.unavailable) {
          setUnavailable(true);
          setAgents([]);
        } else {
          setUnavailable(false);
          setAgents(res.data || []);
        }
        setLoading(false);
      })
      .catch(() => {
        setUnavailable(true);
        setAgents([]);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchAgents();
    const interval = setInterval(fetchAgents, 3000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-100">Autonomous Agent Observability</h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Monitor worker leasing, state machine progression, step heartbeats, and recover stale agents.
          </p>
        </div>
        <button
          onClick={fetchAgents}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 rounded-lg border border-slate-700 transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Agents Grid */}
      {unavailable ? (
        <div className="py-16 text-center border border-red-900/40 bg-red-950/20 rounded-xl">
          <AlertTriangle className="w-6 h-6 text-red-500 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-slate-200">Control Plane Unavailable</h3>
          <p className="text-xs text-slate-500 mt-1">Database connection could not be established.</p>
        </div>
      ) : agents.length === 0 && !loading ? (
        <div className="py-16 text-center border border-slate-800 rounded-xl bg-slate-900/50">
          <p className="text-xs text-slate-500">No active or queued agent runs found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {agents.map((agent) => (
            <div
              key={agent.id}
              className={`bg-slate-900/80 border rounded-xl p-5 flex flex-col justify-between transition-colors ${
                highlightRunId === agent.id ? 'border-blue-500 ring-1 ring-blue-500/50 bg-blue-950/20' : 'border-slate-800'
              }`}
            >
              <div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span className="text-xs font-semibold text-slate-200 truncate" title={agent.id}>{agent.id}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-800 text-slate-300 border border-slate-700">
                    {agent.state}
                  </span>
                </div>

                <div className="mt-4 space-y-2 text-xs text-slate-400 font-mono">
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span>Lease Owner:</span>
                    <span className="text-slate-300">{agent.leaseOwner || 'None'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span>Completed Steps:</span>
                    <span className="text-slate-300">{agent.stepCount}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span>Latest Step:</span>
                    <span className="text-slate-300">{agent.latestStepState || 'idle'}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-800/60">
                    <span>Heartbeat / Updated:</span>
                    <span className="text-slate-400 text-[11px]">{formatDate(agent.updatedAt)}</span>
                  </div>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-slate-800/60 flex items-center justify-between">
                <div className="flex gap-2">
                  <Link href={`/logs?runId=${agent.id}`} className="text-[10px] text-blue-400 hover:text-blue-300 uppercase font-mono tracking-wider">
                    Logs
                  </Link>
                  <Link href={`/runs/${agent.id}`} className="text-[10px] text-blue-400 hover:text-blue-300 uppercase font-mono tracking-wider">
                    Detail
                  </Link>
                </div>
                <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Safe
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AgentsPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading Agent Monitor...</div>}>
      <AgentsContent />
    </Suspense>
  );
}
