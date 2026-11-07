import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertOctagon } from 'lucide-react';
import { createDesign } from '@vanvolt/engine';
import { useStore } from '../store/designStore';

interface State {
  error: Error | null;
}

/**
 * Catches rendering errors (e.g. from an unusual imported design) so one bad design can
 * never lock the user out of the app. Offers to reset the active design or switch designs.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('VanVolt render error', error, info.componentStack);
  }

  private resetDesign = () => {
    const { update } = useStore.getState();
    update((d) => {
      const fresh = createDesign({ name: `${d.name} (reset)` });
      Object.assign(d, { ...fresh, id: d.id, createdAt: d.createdAt });
    });
    this.setState({ error: null });
  };

  private openProjects = () => {
    const { order, activeId, setActive } = useStore.getState();
    const other = order.find((id) => id !== activeId);
    if (other) setActive(other);
    window.location.hash = '/projects';
    this.setState({ error: null });
  };

  override render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex min-h-full items-center justify-center p-6">
        <div className="card max-w-lg p-6" role="alert">
          <p className="flex items-center gap-2 text-base font-semibold">
            <AlertOctagon size={18} className="text-crit" /> This design could not be displayed
          </p>
          <p className="mt-2 text-sm text-ink2">
            Something in the current design is invalid, possibly from an imported file. Your other
            designs are safe.
          </p>
          <p className="mt-2 rounded bg-surface2 px-2 py-1 font-mono text-xs text-ink3">
            {this.state.error.message}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className="btn" onClick={this.openProjects}>
              Switch to another design
            </button>
            <button className="btn btn-primary" onClick={this.resetDesign}>
              Reset this design to defaults
            </button>
          </div>
        </div>
      </div>
    );
  }
}
