import { useState, type ReactNode } from 'react';
import clsx from 'clsx';
import {
  Activity,
  BatteryCharging,
  BookOpen,
  Cable,
  Car,
  Columns3,
  FileText,
  FolderOpen,
  LayoutDashboard,
  Menu,
  Monitor,
  Moon,
  Plug,
  Redo2,
  Sun,
  SunMedium,
  Undo2,
  Waves,
  Workflow,
  X,
  Zap,
} from 'lucide-react';
import { navigate, type Route } from '../lib/router';
import { useStore, type ThemePref } from '../store/designStore';
import { useAnalysis } from '../lib/useAnalysis';
import { StatusPill } from './ui';

export const NAV: { route: Route; label: string; icon: typeof Plug; group: string }[] = [
  { route: 'overview', label: 'Overview', icon: LayoutDashboard, group: 'Design' },
  { route: 'loads', label: 'Loads', icon: Plug, group: 'Design' },
  { route: 'battery', label: 'Battery', icon: BatteryCharging, group: 'Design' },
  { route: 'solar', label: 'Solar', icon: SunMedium, group: 'Design' },
  { route: 'charging', label: 'Charging', icon: Car, group: 'Design' },
  { route: 'inverter', label: 'Inverter', icon: Waves, group: 'Design' },
  { route: 'cables', label: 'Cables & fuses', icon: Cable, group: 'Design' },
  { route: 'simulation', label: 'Simulation', icon: Activity, group: 'Analyse' },
  { route: 'diagram', label: 'System diagram', icon: Workflow, group: 'Analyse' },
  { route: 'compare', label: 'Compare designs', icon: Columns3, group: 'Analyse' },
  { route: 'report', label: 'PDF report', icon: FileText, group: 'Analyse' },
  { route: 'projects', label: 'Projects', icon: FolderOpen, group: 'Manage' },
  { route: 'sources', label: 'Data & sources', icon: BookOpen, group: 'Manage' },
];

function Brand() {
  return (
    <a href="#/overview" className="flex items-center gap-2 px-2 py-1" aria-label="VanVolt home">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-[#3987e5] to-[#1baf7a] text-white shadow-card">
        <Zap size={18} fill="currentColor" />
      </span>
      <span className="text-[15px] font-semibold tracking-tight">VanVolt</span>
    </a>
  );
}

function NavList({ route, onNavigate }: { route: Route; onNavigate?: () => void }) {
  const groups = [...new Set(NAV.map((n) => n.group))];
  return (
    <nav className="flex flex-col gap-4" aria-label="Main">
      {groups.map((g) => (
        <div key={g}>
          <p className="mb-1 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink3">
            {g}
          </p>
          <ul className="flex flex-col gap-0.5">
            {NAV.filter((n) => n.group === g).map((n) => {
              const Icon = n.icon;
              const active = n.route === route;
              return (
                <li key={n.route}>
                  <a
                    href={`#/${n.route}`}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={clsx(
                      'flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm transition',
                      active
                        ? 'bg-accent-soft font-medium text-accent'
                        : 'text-ink2 hover:bg-surface2 hover:text-ink',
                    )}
                  >
                    <Icon size={16} />
                    {n.label}
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function ThemeSwitch() {
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const next: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };
  const Icon = theme === 'light' ? Sun : theme === 'dark' ? Moon : Monitor;
  return (
    <button
      className="btn btn-ghost px-2"
      onClick={() => setTheme(next[theme])}
      title={`Theme: ${theme} (click to change)`}
      aria-label={`Theme: ${theme}. Switch to ${next[theme]}`}
    >
      <Icon size={16} />
    </button>
  );
}

function ProjectSwitcher() {
  const order = useStore((s) => s.order);
  const designs = useStore((s) => s.designs);
  const activeId = useStore((s) => s.activeId);
  const setActive = useStore((s) => s.setActive);
  return (
    <select
      aria-label="Active design"
      className="input max-w-[46vw] truncate py-1 font-medium sm:max-w-xs"
      value={activeId}
      onChange={(e) => setActive(e.target.value)}
    >
      {order.map((id) => (
        <option key={id} value={id}>
          {designs[id]?.name}
        </option>
      ))}
    </select>
  );
}

function UndoRedo() {
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => (s.history[s.activeId]?.past.length ?? 0) > 0);
  const canRedo = useStore((s) => (s.history[s.activeId]?.future.length ?? 0) > 0);
  return (
    <div className="hidden items-center sm:flex">
      <button
        className="btn btn-ghost px-2"
        onClick={undo}
        disabled={!canUndo}
        aria-label="Undo"
        title="Undo (Ctrl+Z)"
      >
        <Undo2 size={16} />
      </button>
      <button
        className="btn btn-ghost px-2"
        onClick={redo}
        disabled={!canRedo}
        aria-label="Redo"
        title="Redo (Ctrl+Shift+Z)"
      >
        <Redo2 size={16} />
      </button>
    </div>
  );
}

export function Shell({ route, children }: { route: Route; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const analysis = useAnalysis();
  return (
    <div className="flex min-h-full">
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r border-line bg-surface px-3 py-4 lg:flex">
        <Brand />
        <NavList route={route} />
        <p className="mt-auto px-3 text-[11px] leading-snug text-ink3">
          Planning tool only — not a substitute for professional installation and inspection.
        </p>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setOpen(false)}>
          <aside
            className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col gap-6 overflow-y-auto bg-surface px-3 py-4 shadow-pop"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <Brand />
              <button
                className="btn btn-ghost px-2"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
              >
                <X size={18} />
              </button>
            </div>
            <NavList route={route} onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-surface/85 px-3 py-2 backdrop-blur sm:px-5">
          <button
            className="btn btn-ghost px-2 lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu size={18} />
          </button>
          <ProjectSwitcher />
          <button
            className="hidden sm:inline-flex"
            onClick={() => navigate('overview')}
            aria-label="Design status"
          >
            <StatusPill status={analysis.status} />
          </button>
          <div className="ml-auto flex items-center gap-1">
            <UndoRedo />
            <ThemeSwitch />
            <a href="#/report" className="btn btn-primary ml-1 hidden sm:inline-flex">
              <FileText size={15} /> Export PDF
            </a>
          </div>
        </header>
        <main className="mx-auto w-full max-w-[1400px] flex-1 px-4 py-5 sm:px-6 sm:py-6">
          {children}
        </main>
      </div>
    </div>
  );
}
