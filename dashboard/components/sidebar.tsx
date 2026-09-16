'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  PlusCircle,
  Globe,
  Bot,
  Terminal,
  FileText,
  GitCompare,
  CheckSquare,
  RefreshCw,
  Activity,
  Layers,
} from 'lucide-react';
import { cn } from '../lib/utils';

const navItems = [
  { href: '/', label: 'Overview', icon: LayoutDashboard },
  { href: '/submit', label: 'Submit Website', icon: PlusCircle },
  { href: '/evaluations', label: 'Evaluated Websites', icon: Globe },
  { href: '/agents', label: 'Agent Monitor', icon: Bot },
  { href: '/logs', label: 'Logs & Telemetry', icon: Terminal },
  { href: '/evidence', label: 'Evidence & Reports', icon: FileText },
  { href: '/compare', label: 'Compare Runs', icon: GitCompare },
  { href: '/review', label: 'Review Queue', icon: CheckSquare },
  { href: '/reconciliation', label: 'Reconciliation', icon: RefreshCw },
  { href: '/benchmarks', label: 'Benchmarks', icon: Layers },
  { href: '/health', label: 'System Health', icon: Activity },
];

export function Sidebar() {
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  return (
    <aside className="w-[248px] bg-slate-900 border-r border-slate-800 flex flex-col shrink-0 h-full">
      <div className="h-16 flex items-center px-5 border-b border-slate-800 gap-3">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">
          W
        </div>
        <div className="flex flex-col">
          <span className="font-bold tracking-tight text-sm text-slate-100">WebLens</span>
          <span className="text-[10px] text-slate-500 font-mono">Control Plane</span>
        </div>
        <span className="ml-auto text-[10px] uppercase font-bold bg-blue-950/80 text-blue-400 border border-blue-800/80 px-1.5 py-0.5 rounded">
          Ops
        </span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = mounted && (pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href)));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-colors',
                isActive
                  ? 'bg-blue-600/15 text-blue-400 font-semibold border border-blue-500/20'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              )}
            >
              <Icon className={cn('w-4 h-4 shrink-0', isActive ? 'text-blue-400' : 'text-slate-400')} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-slate-800/80 bg-slate-950/40">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-[11px] font-mono text-slate-400">Worker Node: Online</span>
        </div>
        <div className="text-[10px] text-slate-500 font-mono mt-1">Branch: codex/weblens-mvp</div>
      </div>
    </aside>
  );
}
