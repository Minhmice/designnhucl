'use client';

import { Search, RefreshCw, Radio } from 'lucide-react';
import { usePathname } from 'next/navigation';

export function Topbar() {
  const pathname = usePathname();

  const getPageTitle = (path: string) => {
    if (path === '/') return 'Overview Console';
    if (path.startsWith('/submit')) return 'Submit Website For Evaluation';
    if (path.startsWith('/evaluations')) return 'Evaluated Websites Inventory';
    if (path.startsWith('/agents')) return 'Autonomous Agent Observability';
    if (path.startsWith('/logs')) return 'Super Detail Telemetry Stream';
    if (path.startsWith('/evidence')) return 'Evidence Artifacts & Reports';
    if (path.startsWith('/compare')) return 'Compare Evaluation Runs';
    if (path.startsWith('/review')) return 'Human Review Verification Queue';
    if (path.startsWith('/reconciliation')) return 'Crash Recovery & Reconciliation';
    if (path.startsWith('/benchmarks')) return 'Benchmark Calibration Suite';
    if (path.startsWith('/health')) return 'System Health & Security Posture';
    if (path.startsWith('/runs/')) return 'Evaluation Run Details';
    return 'Console';
  };

  return (
    <header className="h-16 bg-slate-900/90 backdrop-blur border-b border-slate-800 flex items-center justify-between px-6 shrink-0 z-10">
      <div className="flex items-center gap-3">
        <h1 className="font-semibold text-sm text-slate-100 tracking-tight">
          {getPageTitle(pathname)}
        </h1>
      </div>

      <div className="flex items-center gap-4">
        {/* Global search input */}
        <div className="relative w-64 md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Search domain, run ID, agent ID..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500/50"
          />
        </div>

        {/* Live indicator & refresh */}
        <div className="flex items-center gap-2 border-l border-slate-800 pl-4">
          <div className="flex items-center gap-1.5 text-xs text-emerald-400 font-mono bg-emerald-950/40 px-2.5 py-1 rounded border border-emerald-800/40">
            <Radio className="w-3 h-3 animate-pulse" />
            <span>LIVE</span>
          </div>
          <button
            onClick={() => window.location.reload()}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-800 transition-colors"
            title="Refresh View"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </header>
  );
}
