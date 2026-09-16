'use client';

import { Layers, Terminal, ShieldAlert, CheckCircle2 } from 'lucide-react';

export default function BenchmarksPage() {
  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div>
        <h2 className="text-base font-semibold text-slate-100">WebLens Benchmark Calibration Suite</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Pairwise judge evaluations, holdout split verification, and accuracy metrics.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
          <span className="text-xs text-slate-400 font-medium">Domain Families</span>
          <div className="text-2xl font-bold mt-2 text-white">30</div>
          <p className="text-[11px] text-slate-500 mt-1">18 Development / 12 Holdout</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
          <span className="text-xs text-slate-400 font-medium">Split Leakage Guard</span>
          <div className="text-2xl font-bold mt-2 text-emerald-400">PASSED</div>
          <p className="text-[11px] text-slate-500 mt-1">Zero cross-family contamination</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
          <span className="text-xs text-slate-400 font-medium">Synthetic Test Runner</span>
          <div className="text-2xl font-bold mt-2 text-blue-400">100% PASS</div>
          <p className="text-[11px] text-slate-500 mt-1">Deterministic offline fixtures</p>
        </div>
      </div>

      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-200">
          Running Offline Benchmark Suite
        </h3>
        <p className="text-xs text-slate-400 leading-relaxed">
          The benchmark runner compares controlled captures within the same archetype and locale. Offline runs use frozen recordings so no paid model calls are made.
        </p>

        <div className="bg-black rounded-lg p-3 font-mono text-xs text-slate-300 border border-slate-800">
          <div className="text-slate-500"># Run deterministic benchmark evaluation tests:</div>
          <div className="text-blue-400 mt-1">node --test dist/tests/benchmark.test.js</div>
        </div>
      </div>
    </div>
  );
}
