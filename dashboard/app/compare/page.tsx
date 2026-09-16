export default function ComparePage() {
  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div>
        <h2 className="text-sm font-semibold text-slate-100">Compare Evaluation Runs</h2>
        <p className="text-xs text-slate-400">Baseline vs current run comparison for regression analysis and finding verification.</p>
      </div>
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-8 text-center text-xs text-slate-500">
        Select two compatible runs to inspect fixed, added, or regressed design findings.
      </div>
    </div>
  );
}
