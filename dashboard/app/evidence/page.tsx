export default function EvidencePage() {
  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div>
        <h2 className="text-sm font-semibold text-slate-100">Evidence Artifacts & Reports</h2>
        <p className="text-xs text-slate-400">View static HTML reports, markdown summaries, and raw run JSON files.</p>
      </div>
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-8 text-center text-xs text-slate-500">
        Select an evaluation from the inventory to explore its full evidence bundle.
      </div>
    </div>
  );
}
