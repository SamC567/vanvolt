import { useRef, useState } from 'react';
import { Copy, Download, FilePlus2, Pencil, Sparkles, Trash2, Upload } from 'lucide-react';
import { analyseDesign, EXAMPLE_DESIGNS, type Design } from '@vanvolt/engine';
import { Callout, Card, Modal, PageHeader, StatusPill } from '../components/ui';
import { useStore } from '../store/designStore';
import { fmt, fmtDate } from '../lib/format';
import { navigate } from '../lib/router';
import { DesignImportError } from '../store/migrate';

export function downloadJson(design: Design) {
  const blob = new Blob([JSON.stringify(design, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${
    design.name
      .replace(/[^\w\- ]+/g, '')
      .trim()
      .replace(/\s+/g, '-')
      .toLowerCase() || 'design'
  }.vanvolt.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function DesignCard({ d }: { d: Design }) {
  const activeId = useStore((s) => s.activeId);
  const setActive = useStore((s) => s.setActive);
  const duplicate = useStore((s) => s.duplicate);
  const remove = useStore((s) => s.remove);
  const rename = useStore((s) => s.rename);
  const compareIds = useStore((s) => s.compareIds);
  const toggleCompare = useStore((s) => s.toggleCompare);
  const [confirm, setConfirm] = useState(false);
  const a = analyseDesign(d);
  const active = d.id === activeId;
  return (
    <div className={`card flex flex-col p-4 ${active ? 'ring-2 ring-accent/50' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold">{d.name}</h3>
          <p className="text-xs text-ink3">Updated {fmtDate(d.updatedAt)}</p>
        </div>
        <StatusPill status={a.status} />
      </div>
      {d.description && <p className="mt-2 line-clamp-3 text-xs text-ink2">{d.description}</p>}
      <dl className="num mt-3 grid grid-cols-3 gap-2 text-xs">
        <div>
          <dt className="text-ink3">System</dt>
          <dd className="font-medium">{d.systemVoltage} V</dd>
        </div>
        <div>
          <dt className="text-ink3">Daily use</dt>
          <dd className="font-medium">{fmt(a.summary.dailyWh)} Wh</dd>
        </div>
        <div>
          <dt className="text-ink3">Usable</dt>
          <dd className="font-medium">{fmt(a.summary.usableWh)} Wh</dd>
        </div>
        <div>
          <dt className="text-ink3">Solar</dt>
          <dd className="font-medium">{fmt(a.summary.installedSolarW)} W</dd>
        </div>
        <div>
          <dt className="text-ink3">Autonomy</dt>
          <dd className="font-medium">
            {Number.isFinite(a.summary.autonomyDays) ? fmt(a.summary.autonomyDays, 1) : '∞'} d
          </dd>
        </div>
        <div>
          <dt className="text-ink3">Inverter</dt>
          <dd className="font-medium">{fmt(a.summary.inverterW)} W</dd>
        </div>
      </dl>
      <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-3">
        <button
          className={`btn ${active ? '' : 'btn-primary'} text-xs`}
          onClick={() => {
            setActive(d.id);
            navigate('overview');
          }}
        >
          {active ? 'Open (active)' : 'Open'}
        </button>
        <button
          className="btn text-xs"
          onClick={() => {
            const name = window.prompt('Rename design', d.name);
            if (name && name.trim()) rename(d.id, name.trim());
          }}
          aria-label={`Rename ${d.name}`}
        >
          <Pencil size={13} />
        </button>
        <button
          className="btn text-xs"
          onClick={() => duplicate(d.id)}
          aria-label={`Duplicate ${d.name}`}
          title="Duplicate"
        >
          <Copy size={13} />
        </button>
        <button
          className="btn text-xs"
          onClick={() => downloadJson(d)}
          aria-label={`Export ${d.name}`}
          title="Export JSON"
        >
          <Download size={13} />
        </button>
        <label className="btn cursor-pointer text-xs" title="Include in comparison">
          <input
            type="checkbox"
            checked={compareIds.includes(d.id)}
            onChange={() => toggleCompare(d.id)}
            className="accent-[var(--accent)]"
          />
          Compare
        </label>
        <button
          className="btn ml-auto text-xs text-crit"
          onClick={() => setConfirm(true)}
          aria-label={`Delete ${d.name}`}
          title="Delete"
        >
          <Trash2 size={13} />
        </button>
      </div>
      <Modal open={confirm} onClose={() => setConfirm(false)} title="Delete design?">
        <p className="text-sm">
          “{d.name}” will be removed from this browser. Export it first if you may need it again.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn" onClick={() => setConfirm(false)}>
            Cancel
          </button>
          <button
            className="btn bg-crit text-white hover:brightness-110"
            onClick={() => {
              remove(d.id);
              setConfirm(false);
            }}
          >
            Delete
          </button>
        </div>
      </Modal>
    </div>
  );
}

export function ProjectsPage() {
  const order = useStore((s) => s.order);
  const designs = useStore((s) => s.designs);
  const newDesign = useStore((s) => s.newDesign);
  const importDesign = useStore((s) => s.importDesign);
  const loadExample = useStore((s) => s.loadExample);
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    try {
      const json = JSON.parse(await f.text());
      importDesign(json);
      navigate('overview');
    } catch (e) {
      setError(
        e instanceof DesignImportError
          ? e.message
          : 'Could not read that file — is it a VanVolt .json export?',
      );
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  return (
    <>
      <PageHeader
        title="Projects"
        subtitle="Designs are saved automatically in this browser. Export them as JSON to back up or share."
        actions={
          <>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              <Upload size={15} /> Import JSON
            </button>
            <button
              className="btn btn-primary"
              onClick={() => {
                newDesign();
                navigate('overview');
              }}
            >
              <FilePlus2 size={15} /> New design
            </button>
          </>
        }
      />
      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
        aria-label="Import design file"
      />
      {error && (
        <div className="mb-4">
          <Callout tone="warn">{error}</Callout>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {order.map((id) => designs[id] && <DesignCard key={id} d={designs[id]!} />)}
      </div>

      <Card
        className="mt-6"
        title="Example designs"
        subtitle="Load a worked example as a new project"
      >
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {EXAMPLE_DESIGNS.map((e) => {
            const d = e.build();
            return (
              <li key={e.id} className="flex flex-col gap-2 rounded-lg border border-line p-3">
                <p className="flex items-center gap-2 text-sm font-medium">
                  <Sparkles size={14} className="text-accent" /> {d.name}
                </p>
                <p className="text-xs text-ink2">{d.description}</p>
                <button
                  className="btn mt-auto self-start text-xs"
                  onClick={() => {
                    loadExample(e.id);
                    navigate('overview');
                  }}
                >
                  Load example
                </button>
              </li>
            );
          })}
        </ul>
      </Card>
    </>
  );
}
