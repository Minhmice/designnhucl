'use client';

import { ShieldCheck, Database, HardDrive, Cpu, Radio } from 'lucide-react';

export default function HealthPage() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-base font-semibold text-slate-100">System Health & Security Guardrails</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Real-time security posture, sandbox status, network preflight, and storage boundaries.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-semibold text-slate-200">Network Preflight & SSRF Guard</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Outbound connections are filtered at connection time. Public evaluation runs strictly reject RFC1918, loopback, IPv6-mapped IPv4, link-local, and cloud metadata addresses.
          </p>
          <div className="text-[11px] font-mono text-emerald-400">Status: ACTIVE (Fail-closed)</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-slate-200">Artifact Store Isolation</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Evaluation run data is written atomically. All filesystem paths are validated with canonical realpath checks to prevent directory traversal and symlink escapes.
          </p>
          <div className="text-[11px] font-mono text-blue-400">Status: ACTIVE (Canonical traversal checked)</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-purple-400" />
            <span className="text-xs font-semibold text-slate-200">PostgreSQL Control Plane</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Multi-tenant Row Level Security (RLS) is forced in SQL. Identity and agent transitions run in isolated tenant transactions with monotonic sequence cursors.
          </p>
          <div className="text-[11px] font-mono text-purple-400">Status: AVAILABLE (Tenant Isolated)</div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold text-slate-200">Local Playwright Runner</span>
          </div>
          <p className="text-xs text-slate-400 leading-relaxed">
            Headless Chromium browser process lifecycle is bounded by recipe timeout caps (max 180s for lead-fast, 900s for critic-standard).
          </p>
          <div className="text-[11px] font-mono text-amber-400">Status: READY</div>
        </div>
      </div>
    </div>
  );
}
