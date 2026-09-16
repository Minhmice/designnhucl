export default function ReconciliationPage() {
  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div>
        <h2 className="text-sm font-semibold text-slate-100">Crash Recovery & Reconciliation</h2>
        <p className="text-xs text-slate-400">Reconcile unknown or crashed evaluation runs against immutable artifact stores.</p>
      </div>
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-8 text-center text-xs text-slate-500">
        All evaluation requests are clean. No reconciliation needed.
      </div>
    </div>
  );
}
