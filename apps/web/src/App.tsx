import { lazy, Suspense, useEffect, type ComponentType } from 'react';
import { Shell } from './components/layout';
import { useRoute, type Route } from './lib/router';
import { useThemeEffect } from './lib/theme';
import { useStore } from './store/designStore';
import { OverviewPage } from './pages/Overview';
import { LoadsPage } from './pages/Loads';
import { BatteryPage } from './pages/Battery';
import { SolarPage } from './pages/Solar';
import { ChargingPage } from './pages/Charging';
import { InverterPage } from './pages/Inverter';
import { CablesPage } from './pages/Cables';
import { SimulationPage } from './pages/Simulation';
import { ComparePage } from './pages/Compare';
import { ProjectsPage } from './pages/Projects';
import { SourcesPage } from './pages/Sources';
import { ReportPage } from './pages/Report';

// The diagram pulls in React Flow; load it on demand.
const DiagramPage = lazy(() => import('./pages/Diagram').then((m) => ({ default: m.DiagramPage })));

const PAGES: Record<Route, ComponentType> = {
  overview: OverviewPage,
  loads: LoadsPage,
  battery: BatteryPage,
  solar: SolarPage,
  charging: ChargingPage,
  inverter: InverterPage,
  cables: CablesPage,
  simulation: SimulationPage,
  diagram: DiagramPage,
  compare: ComparePage,
  report: ReportPage,
  projects: ProjectsPage,
  sources: SourcesPage,
};

function useUndoShortcuts() {
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', on);
    return () => window.removeEventListener('keydown', on);
  }, [undo, redo]);
}

export function App() {
  useThemeEffect();
  useUndoShortcuts();
  const route = useRoute();
  const Page = PAGES[route];
  return (
    <Shell route={route}>
      <Suspense fallback={<p className="text-sm text-ink3">Loading…</p>}>
        <Page />
      </Suspense>
    </Shell>
  );
}
