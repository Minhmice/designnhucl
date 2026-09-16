import Link from 'next/link';
import { ArrowRight, Bot, CheckCircle2, Globe, Sparkles } from 'lucide-react';

export default function OverviewPage() {
  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Total Evaluations</span>
            <Globe className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold mt-3 text-white">0</div>
          <p className="text-[11px] text-slate-500 mt-1">Across all recipes</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Active Agents</span>
            <Bot className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold mt-3 text-emerald-400">1 Online</div>
          <p className="text-[11px] text-slate-500 mt-1">Local Playwright worker</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Completed Runs</span>
            <CheckCircle2 className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold mt-3 text-blue-400">0</div>
          <p className="text-[11px] text-slate-500 mt-1">Deterministic QualityProfiles</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">Average Score</span>
            <Sparkles className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold mt-3 text-amber-400">--</div>
          <p className="text-[11px] text-slate-500 mt-1">Across assessed dimensions</p>
        </div>
      </div>

      {/* Quick Actions & Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-900/80 border border-slate-800 rounded-xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-100">Recent Evaluations</h2>
            <Link
              href="/evaluations"
              className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
            >
              View all <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="border border-slate-800/80 rounded-lg p-8 text-center bg-slate-950/40">
            <Globe className="w-8 h-8 text-slate-600 mx-auto mb-2" />
            <p className="text-xs text-slate-400">No evaluations registered yet.</p>
            <Link
              href="/submit"
              className="inline-flex items-center gap-2 mt-4 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-xs font-medium text-white rounded-lg transition-colors"
            >
              Evaluate a Website
            </Link>
          </div>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-sm font-semibold text-slate-100 mb-2">WebLens Operator Mode</h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Autonomous dual-policy quality evaluation engine. Evaluates UI clarity, UX structure, and conversion accessibility without human intervention.
            </p>
            <div className="mt-4 space-y-2 text-xs font-mono text-slate-400">
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span>Evaluator Engine:</span>
                <span className="text-slate-200">Playwright 1.63</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span>Security Preflight:</span>
                <span className="text-emerald-400">Enabled (SSRF Safe)</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-800">
                <span>Control Plane DB:</span>
                <span className="text-blue-400">PostgreSQL 18</span>
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-800">
            <Link
              href="/agents"
              className="w-full flex items-center justify-center gap-2 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 transition-colors"
            >
              Open Agent Observability <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
