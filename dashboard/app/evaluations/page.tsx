'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Search, ExternalLink, ArrowUpDown } from 'lucide-react';
import type { EvaluatedWebsiteItem } from '../../lib/types';
import { ScoreDistributionChart, VerdictBreakdownChart } from '../../components/charts';

export default function EvaluationsPage() {
  const [evaluations, setEvaluations] = useState<EvaluatedWebsiteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [recipeFilter, setRecipeFilter] = useState('all');

  useEffect(() => {
    fetch('/api/evaluations')
      .then((res) => res.json())
      .then((res) => {
        setEvaluations(res.data || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = evaluations.filter((item) => {
    const matchesSearch =
      item.url.toLowerCase().includes(search.toLowerCase()) ||
      item.runId.toLowerCase().includes(search.toLowerCase());
    const matchesRecipe = recipeFilter === 'all' || item.recipeId === recipeFilter;
    return matchesSearch && matchesRecipe;
  });

  // Chart data calculations
  const scoreBuckets = [
    { range: '0-49', count: filtered.filter((i) => i.score !== null && i.score < 50).length },
    { range: '50-69', count: filtered.filter((i) => i.score !== null && i.score >= 50 && i.score < 70).length },
    { range: '70-84', count: filtered.filter((i) => i.score !== null && i.score >= 70 && i.score < 85).length },
    { range: '85-100', count: filtered.filter((i) => i.score !== null && i.score >= 85).length },
  ];

  const verdictCounts: Record<string, number> = {};
  filtered.forEach((i) => {
    const v = i.verdict || 'NONE';
    verdictCounts[v] = (verdictCounts[v] || 0) + 1;
  });
  const verdictData = Object.entries(verdictCounts).map(([name, value]) => ({ name, value }));

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <div>
        <h2 className="text-base font-semibold text-slate-100">Evaluated Websites Inventory</h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Browse, filter, and inspect completed deterministic quality evaluations.
        </p>
      </div>

      {/* Analytics Panels */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
          <h3 className="text-xs font-semibold text-slate-300 mb-3">Score Distribution</h3>
          <ScoreDistributionChart data={scoreBuckets} />
        </div>
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5">
          <h3 className="text-xs font-semibold text-slate-300 mb-3">Verdict Breakdown</h3>
          <VerdictBreakdownChart data={verdictData.length > 0 ? verdictData : [{ name: 'No data', value: 1 }]} />
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by domain or run ID..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <select
            value={recipeFilter}
            onChange={(e) => setRecipeFilter(e.target.value)}
            className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none"
          >
            <option value="all">All Recipes</option>
            <option value="lead-fast">lead-fast</option>
            <option value="critic-standard">critic-standard</option>
          </select>
        </div>
      </div>

      {/* Evaluations Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="bg-slate-800/60 text-slate-400 font-medium uppercase text-[10px] border-b border-slate-800">
            <tr>
              <th className="py-3 px-4">Target Website</th>
              <th className="py-3 px-4">Run ID</th>
              <th className="py-3 px-4">Recipe</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Verdict</th>
              <th className="py-3 px-4">Score</th>
              <th className="py-3 px-4">Findings</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-slate-300">
            {loading ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500">
                  Loading evaluations...
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-8 text-center text-slate-500">
                  No evaluations match your search filter.
                </td>
              </tr>
            ) : (
              filtered.map((row) => (
                <tr key={row.runId} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 px-4 font-medium text-slate-200 truncate max-w-xs">
                    {row.url}
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-400">
                    <Link href={`/runs/${row.runId}`} className="hover:text-blue-400 underline decoration-slate-700">
                      {row.runId.slice(0, 8)}...
                    </Link>
                  </td>
                  <td className="py-3 px-4 font-mono text-[11px] text-slate-400">{row.recipeId}</td>
                  <td className="py-3 px-4">
                    <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
                      {row.executionStatus}
                    </span>
                  </td>
                  <td className="py-3 px-4">
                    {row.verdict ? (
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-950/60 text-emerald-400 border border-emerald-800/60">
                        {row.verdict}
                      </span>
                    ) : (
                      <span className="text-slate-500">--</span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-semibold text-slate-200">
                    {row.score !== null ? row.score : '--'}
                  </td>
                  <td className="py-3 px-4 text-slate-400">{row.findingsCount}</td>
                  <td className="py-3 px-4 text-right space-x-2">
                    <a
                      href={row.reportUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-blue-400 hover:text-blue-300"
                    >
                      Report <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
