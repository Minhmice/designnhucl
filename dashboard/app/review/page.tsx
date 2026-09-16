export default function ReviewPage() {
  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div>
        <h2 className="text-sm font-semibold text-slate-100">Human Review Verification Queue</h2>
        <p className="text-xs text-slate-400">Critic decisions flagged as REVIEW or requiring operator confirmation before PASS.</p>
      </div>
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-8 text-center text-xs text-slate-500">
        No pending human review items.
      </div>
    </div>
  );
}
