import { useEffect, useState } from 'react';
import { Download, Eye, FileText, Loader2 } from 'lucide-react';
import { Callout, Card, PageHeader, StatusPill, Toggle } from '../components/ui';
import { useAnalysis } from '../lib/useAnalysis';
import { useActiveDesign } from '../store/designStore';
import { fmt } from '../lib/format';
import type { ReportOptions } from '../report/pdf';

const OPTION_LABELS: Record<keyof ReportOptions, { label: string; description: string }> = {
  appliances: {
    label: 'Load schedule',
    description: 'Every enabled appliance with its daily energy',
  },
  cables: {
    label: 'Cables and protection',
    description: 'Conductor sizes, voltage drop, losses and fuses',
  },
  simulation: { label: 'Simulation', description: 'State-of-charge chart for the selected month' },
  assumptions: { label: 'Assumptions', description: 'Every engineering assumption used' },
  sources: { label: 'Sources', description: 'Datasheets and references, with verification status' },
};

export function ReportPage() {
  const design = useActiveDesign();
  const a = useAnalysis();
  const [opts, setOpts] = useState<ReportOptions>({
    appliances: true,
    cables: true,
    simulation: true,
    assumptions: true,
    sources: true,
  });
  const [busy, setBusy] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => void (previewUrl && URL.revokeObjectURL(previewUrl)), [previewUrl]);
  useEffect(() => setPreviewUrl(null), [design]);

  const build = async () => {
    const mod = await import('../report/pdf');
    return { doc: mod.buildReport(design, a, opts), name: mod.reportFileName(design) };
  };

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const { doc, name } = await build();
      doc.save(name);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the PDF.');
    } finally {
      setBusy(false);
    }
  };

  const preview = async () => {
    setBusy(true);
    setError(null);
    try {
      const { doc } = await build();
      const url = URL.createObjectURL(doc.output('blob'));
      setPreviewUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the PDF.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Engineering report"
        subtitle="A PDF of the whole design — inputs, results, checks, assumptions and sources — generated in your browser."
        actions={
          <>
            <button className="btn" onClick={preview} disabled={busy}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />} Preview
            </button>
            <button className="btn btn-primary" onClick={download} disabled={busy}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}{' '}
              Download PDF
            </button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Card title="Report contents">
          <div className="space-y-3">
            <p className="text-sm text-ink2">
              Always included: summary, design checks, battery, solar, charging and inverter.
            </p>
            {(Object.keys(OPTION_LABELS) as (keyof ReportOptions)[]).map((k) => (
              <Toggle
                key={k}
                checked={opts[k]}
                onChange={(v) => setOpts((o) => ({ ...o, [k]: v }))}
                label={OPTION_LABELS[k].label}
                description={OPTION_LABELS[k].description}
              />
            ))}
          </div>
        </Card>
        <Card
          className="xl:col-span-2"
          title={design.name}
          actions={<StatusPill status={a.status} />}
        >
          <dl className="num grid grid-cols-2 gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-ink3">Daily consumption</dt>
              <dd className="font-medium">{fmt(a.summary.dailyWh)} Wh</dd>
            </div>
            <div>
              <dt className="text-xs text-ink3">Usable battery</dt>
              <dd className="font-medium">{fmt(a.summary.usableWh)} Wh</dd>
            </div>
            <div>
              <dt className="text-xs text-ink3">Autonomy</dt>
              <dd className="font-medium">
                {Number.isFinite(a.summary.autonomyDays) ? fmt(a.summary.autonomyDays, 1) : '∞'}{' '}
                days
              </dd>
            </div>
            <div>
              <dt className="text-xs text-ink3">Solar</dt>
              <dd className="font-medium">{fmt(a.summary.installedSolarW)} W</dd>
            </div>
            <div>
              <dt className="text-xs text-ink3">Findings</dt>
              <dd className="font-medium">{a.findings.length}</dd>
            </div>
            <div>
              <dt className="text-xs text-ink3">Cable runs</dt>
              <dd className="font-medium">{a.cables.length}</dd>
            </div>
          </dl>
          {error && (
            <div className="mt-3">
              <Callout tone="warn">{error}</Callout>
            </div>
          )}
          <div className="mt-4">
            {previewUrl ? (
              <iframe
                title="PDF preview"
                src={previewUrl}
                className="h-[70vh] w-full rounded-lg border border-line bg-white"
              />
            ) : (
              <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-line text-sm text-ink3">
                <FileText size={28} />
                Press Preview to render the PDF here.
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
