import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  applyNodeChanges,
  Background,
  Controls,
  EdgeLabelRenderer,
  getSmoothStepPath,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import clsx from 'clsx';
import {
  BatteryCharging,
  Car,
  Cpu,
  LayoutGrid,
  Pause,
  Play,
  Plug,
  PlugZap,
  SunMedium,
  Waves,
  X,
  Zap,
} from 'lucide-react';
import {
  AC_CHARGERS,
  BATTERY_MODULES,
  DCDC_CHARGERS,
  deepClone,
  INVERTER_MODELS,
  MPPT_CONTROLLERS,
  MONTHS,
  SOLAR_PANELS,
  type CableRole,
  type Design,
  type SystemAnalysis,
} from '@vanvolt/engine';
import {
  Card,
  KeyValue,
  NumberField,
  PageHeader,
  SelectField,
  SourceLink,
  Toggle,
} from '../components/ui';
import { useAnalysis } from '../lib/useAnalysis';
import { useActiveDesign, useStore } from '../store/designStore';
import { fmt } from '../lib/format';
import { navigate, type Route } from '../lib/router';

type NodeKind =
  | 'solar'
  | 'mppt'
  | 'vehicle'
  | 'dcdc'
  | 'shore'
  | 'charger'
  | 'battery'
  | 'busbar'
  | 'inverter'
  | 'acloads'
  | 'dcloads';

interface VVNodeData extends Record<string, unknown> {
  kind: NodeKind;
  title: string;
  subtitle: string;
  metric: string;
  enabled: boolean;
  accent: string;
}

const ICONS: Record<NodeKind, typeof Zap> = {
  solar: SunMedium,
  mppt: Cpu,
  vehicle: Car,
  dcdc: Cpu,
  shore: PlugZap,
  charger: Cpu,
  battery: BatteryCharging,
  busbar: Zap,
  inverter: Waves,
  acloads: Plug,
  dcloads: Plug,
};

const DEFAULT_POS: Record<NodeKind, { x: number; y: number }> = {
  solar: { x: 0, y: 0 },
  mppt: { x: 280, y: 0 },
  vehicle: { x: 0, y: 190 },
  dcdc: { x: 280, y: 190 },
  shore: { x: 0, y: 380 },
  charger: { x: 280, y: 380 },
  busbar: { x: 560, y: 190 },
  battery: { x: 560, y: 400 },
  acloads: { x: 840, y: -60 },
  inverter: { x: 840, y: 110 },
  dcloads: { x: 840, y: 330 },
};

const NODE_ROUTE: Record<NodeKind, Route> = {
  solar: 'solar',
  mppt: 'solar',
  vehicle: 'charging',
  dcdc: 'charging',
  shore: 'charging',
  charger: 'charging',
  battery: 'battery',
  busbar: 'cables',
  inverter: 'inverter',
  acloads: 'loads',
  dcloads: 'loads',
};

function VVNode({ data, selected }: NodeProps<Node<VVNodeData>>) {
  const Icon = ICONS[data.kind];
  const handle = 'h-2 w-2 !border-0 !bg-[var(--text-3)]';
  return (
    <div
      className={clsx(
        'w-[190px] rounded-xl border bg-surface shadow-card transition',
        selected ? 'border-accent ring-2 ring-accent/30' : 'border-line',
        !data.enabled && 'opacity-45',
      )}
    >
      <div className="h-1 rounded-t-xl" style={{ background: data.accent }} />
      <div className="flex items-start gap-2 p-2.5">
        <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-surface2 text-ink2">
          <Icon size={15} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-ink">{data.title}</p>
          <p className="truncate text-[11px] text-ink3">{data.subtitle}</p>
          <p className="num mt-0.5 text-[11px] font-medium text-ink2">
            {data.enabled ? data.metric : 'Off'}
          </p>
        </div>
      </div>
      {(['Left', 'Right', 'Top', 'Bottom'] as const).map((side) => (
        <span key={side}>
          <Handle
            id={`${side[0]!.toLowerCase()}-t`}
            type="target"
            position={Position[side]}
            className={handle}
          />
          <Handle
            id={`${side[0]!.toLowerCase()}-s`}
            type="source"
            position={Position[side]}
            className={handle}
          />
        </span>
      ))}
    </div>
  );
}

interface FlowEdgeCore {
  watts: number;
  reverse: boolean;
  color: string;
  label: string;
  active: boolean;
}

type FlowEdgeData = FlowEdgeCore & { maxW: number } & Record<string, unknown>;

function FlowEdge(props: EdgeProps<Edge<FlowEdgeData>>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data } = props;
  const [path, lx, ly] = getSmoothStepPath({
    sourceX,
    sourceY,
    targetX,
    targetY,
    sourcePosition,
    targetPosition,
    borderRadius: 14,
  });
  const w = data?.watts ?? 0;
  const flowing = (data?.active ?? false) && w > 1;
  const width = 1.5 + 6 * Math.min(1, w / Math.max(1, data?.maxW ?? 1));
  return (
    <>
      <path
        d={path}
        fill="none"
        stroke="var(--border)"
        strokeWidth={width + 2}
        strokeLinecap="round"
      />
      <path
        d={path}
        fill="none"
        stroke={data?.active ? data.color : 'var(--surface-3)'}
        strokeWidth={width}
        strokeLinecap="round"
        className={flowing ? (data?.reverse ? 'vv-flow-reverse' : 'vv-flow') : undefined}
      />
      {data?.active && data.label && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute whitespace-pre-line rounded-md border border-line bg-surface px-1.5 py-0.5 text-center text-[10px] font-medium leading-tight text-ink2 shadow-card"
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)` }}
          >
            <span className="num">{data.label}</span>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const nodeTypes = { vv: VVNode };
const edgeTypes = { flow: FlowEdge };

function buildGraph(design: Design, a: SystemAnalysis, hour: number) {
  const step = a.simulation.steps[Math.min(hour, a.simulation.steps.length - 1)];
  const solarOn = design.solar.enabled && a.solar.installedW > 0;
  const altOn = design.charging.alternator.enabled;
  const shoreOn = design.charging.shore.enabled;
  const viaInv = design.charging.shore.useInverterCharger;
  const invOn = design.inverter.enabled && a.inverter.hasAcLoads;
  const v = a.bankVoltage;
  const cable = (role: CableRole) => a.cables.find((c) => c.role === role);
  const solarAvail = step?.solarW ?? 0;
  // Delivered solar = available minus what the full battery could not accept (curtailed).
  const sw = Math.max(0, solarAvail - (step?.curtailedWh ?? 0));
  const aw = step?.alternatorW ?? 0;
  const shw = step?.shoreW ?? 0;
  const acw = step?.acLoadW ?? 0;
  const dcw = step?.dcLoadW ?? 0;
  const bw = step?.batteryW ?? 0;
  const eff = design.inverter.averageEfficiencyPct / 100;
  const dcLoads = design.appliances.filter((x) => x.enabled && x.supply === 'dc');
  const acLoads = design.appliances.filter((x) => x.enabled && x.supply === 'ac');

  const node = (
    id: NodeKind,
    title: string,
    subtitle: string,
    metric: string,
    enabled: boolean,
    accent: string,
  ): Node<VVNodeData> => ({
    id,
    type: 'vv',
    position: design.diagram.positions[id] ?? DEFAULT_POS[id],
    data: { kind: id, title, subtitle, metric, enabled, accent },
  });

  const nodes: Node<VVNodeData>[] = [
    node(
      'solar',
      'Solar array',
      `${design.solar.quantity} × ${design.solar.panel.powerW} W`,
      `${fmt(sw)} W used${solarAvail - sw > 1 ? ` of ${fmt(solarAvail)} W` : ''}`,
      solarOn,
      'var(--series-2)',
    ),
    node(
      'mppt',
      design.solar.controllerType === 'mppt' ? 'MPPT controller' : 'PWM controller',
      design.solar.controller?.model ?? design.solar.controllerType.toUpperCase(),
      `${fmt(v > 0 ? sw / v : 0, 1)} A out`,
      solarOn,
      'var(--series-2)',
    ),
    node(
      'vehicle',
      'Vehicle alternator',
      'Starter battery',
      step && aw > 0 ? 'Driving' : 'Parked',
      altOn,
      'var(--series-1)',
    ),
    node(
      'dcdc',
      design.charging.alternator.method === 'dcdc' ? 'DC-DC charger' : 'Relay (VSR)',
      design.charging.alternator.method === 'dcdc'
        ? design.charging.alternator.dcdc.model
        : `${design.charging.alternator.vsrCurrentA} A est.`,
      `${fmt(aw)} W now`,
      altOn,
      'var(--series-1)',
    ),
    node(
      'shore',
      'Shore power',
      '230 V AC hook-up',
      shw > 0 ? 'Connected' : 'Not connected',
      shoreOn,
      'var(--series-3)',
    ),
    node(
      'charger',
      'Shore charger',
      viaInv ? 'Via inverter/charger' : design.charging.shore.charger.model,
      `${fmt(shw)} W now`,
      shoreOn && !viaInv,
      'var(--series-3)',
    ),
    node(
      'busbar',
      'Main fuse & busbar',
      `${cable('battery-main')?.fuse.ratingA ?? '—'} A main fuse`,
      `${fmt(Math.abs(bw))} W ${bw >= 0 ? 'in' : 'out'}`,
      true,
      'var(--text-3)',
    ),
    node(
      'battery',
      'Battery bank',
      `${fmt(a.battery.bank.nominalVoltage, 1)} V · ${fmt(a.battery.bank.capacityAh)} Ah`,
      `SoC ${fmt(step?.socPct ?? 0)}%`,
      true,
      'var(--accent)',
    ),
    node(
      'inverter',
      'Inverter',
      design.inverter.model.model,
      `${fmt(acw * eff)} W AC`,
      invOn,
      'var(--series-7)',
    ),
    node(
      'dcloads',
      'DC loads',
      `${dcLoads.length} appliance(s)`,
      `${fmt(dcw)} W now`,
      dcLoads.length > 0,
      'var(--text-3)',
    ),
    node(
      'acloads',
      '230 V AC loads',
      `${acLoads.length} appliance(s)`,
      `${fmt(acw * eff)} W now`,
      acLoads.length > 0 && invOn,
      'var(--series-7)',
    ),
  ];

  const maxW = Math.max(
    200,
    a.consumption.battery.peakW,
    a.solar.installedW,
    ...a.charging.sources.map((s) => s.currentA * v),
  );
  const label = (w: number, volts: number, role?: CableRole) => {
    const c = role ? cable(role) : undefined;
    const amps = volts > 0 ? w / volts : 0;
    return `${fmt(w)} W\n${fmt(amps, amps < 10 ? 1 : 0)} A${c?.selectedCsaMm2 ? ` · ${c.selectedCsaMm2} mm²` : ''}`;
  };
  const pvV = a.solar.strings.arrayVmpV ?? v;
  const edge = (
    id: string,
    source: NodeKind,
    target: NodeKind,
    sh: string,
    th: string,
    d: FlowEdgeCore,
  ): Edge<FlowEdgeData> => ({
    id,
    source,
    target,
    sourceHandle: sh,
    targetHandle: th,
    type: 'flow',
    data: { ...d, maxW },
  });

  const edges: Edge<FlowEdgeData>[] = [
    edge('e-solar', 'solar', 'mppt', 'r-s', 'l-t', {
      watts: sw,
      reverse: false,
      color: 'var(--series-2)',
      label: label(sw, pvV, 'pv-mppt'),
      active: solarOn,
    }),
    edge('e-mppt', 'mppt', 'busbar', 'r-s', 'l-t', {
      watts: sw,
      reverse: false,
      color: 'var(--series-2)',
      label: label(sw, v, 'mppt-battery'),
      active: solarOn,
    }),
    edge('e-veh', 'vehicle', 'dcdc', 'r-s', 'l-t', {
      watts: aw,
      reverse: false,
      color: 'var(--series-1)',
      label: label(aw, 12, 'dcdc-input'),
      active: altOn,
    }),
    edge('e-dcdc', 'dcdc', 'busbar', 'r-s', 'l-t', {
      watts: aw,
      reverse: false,
      color: 'var(--series-1)',
      label: label(aw, v, design.charging.alternator.method === 'dcdc' ? 'dcdc-output' : undefined),
      active: altOn,
    }),
    viaInv
      ? edge('e-shore', 'shore', 'inverter', 'r-s', 'l-t', {
          watts: shw,
          reverse: false,
          color: 'var(--series-3)',
          label: shw > 0 ? `${fmt(shw)} W\ncharging` : '230 V AC',
          active: shoreOn,
        })
      : edge('e-shore', 'shore', 'charger', 'r-s', 'l-t', {
          watts: shw,
          reverse: false,
          color: 'var(--series-3)',
          label: '230 V AC',
          active: shoreOn,
        }),
    edge('e-charger', 'charger', 'busbar', 'r-s', 'b-t', {
      watts: viaInv ? 0 : shw,
      reverse: false,
      color: 'var(--series-3)',
      label: label(shw, v, 'charger-battery'),
      active: shoreOn && !viaInv,
    }),
    edge('e-batt', 'battery', 'busbar', 't-s', 'b-t', {
      watts: Math.abs(bw),
      reverse: bw > 0,
      color: 'var(--accent)',
      label: `${bw >= 0 ? 'Charging' : 'Discharging'}\n${label(Math.abs(bw), v, 'battery-main')}`,
      active: true,
    }),
    edge('e-inv', 'busbar', 'inverter', 'r-s', 'l-t', {
      watts: acw,
      reverse: false,
      color: 'var(--series-7)',
      label: label(acw, v, 'battery-inverter'),
      active: invOn,
    }),
    edge('e-ac', 'inverter', 'acloads', 't-s', 'b-t', {
      watts: acw * eff,
      reverse: false,
      color: 'var(--series-7)',
      label: `${fmt(acw * eff)} W\n230 V AC`,
      active: invOn && acLoads.length > 0,
    }),
    edge('e-dc', 'busbar', 'dcloads', 'r-s', 'l-t', {
      watts: dcw,
      reverse: false,
      color: 'var(--text-2)',
      label: label(dcw, v, 'dc-distribution'),
      active: dcLoads.length > 0,
    }),
  ];
  return { nodes, edges, step };
}

function NodePanel({ kind, onClose }: { kind: NodeKind; onClose: () => void }) {
  const design = useActiveDesign();
  const a = useAnalysis();
  const update = useStore((s) => s.update);
  const sel = (
    title: string,
    body: React.ReactNode,
    source?: Parameters<typeof SourceLink>[0]['source'],
  ) => (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">{title}</h3>
        <button className="btn btn-ghost px-1.5" onClick={onClose} aria-label="Close panel">
          <X size={15} />
        </button>
      </div>
      {body}
      {source && <SourceLink source={source} />}
      <button className="btn w-full text-xs" onClick={() => navigate(NODE_ROUTE[kind])}>
        Open full {NODE_ROUTE[kind]} settings
      </button>
    </div>
  );

  switch (kind) {
    case 'solar':
      return sel(
        'Solar array',
        <>
          <Toggle
            checked={design.solar.enabled}
            onChange={(v) => update((d) => void (d.solar.enabled = v))}
            label="Enabled"
          />
          <SelectField
            label="Panel"
            value={design.solar.panel.id}
            options={SOLAR_PANELS.map((p) => ({
              value: p.id,
              label: `${p.manufacturer} ${p.model}`,
            }))}
            onChange={(id) =>
              update(
                (d) => void (d.solar.panel = deepClone(SOLAR_PANELS.find((p) => p.id === id)!)),
              )
            }
          />
          <NumberField
            label="Number of panels"
            min={0}
            max={20}
            value={design.solar.quantity}
            onChange={(v) => update((d) => void (d.solar.quantity = Math.round(v)))}
          />
          <KeyValue
            items={[
              { label: 'Installed', value: `${fmt(a.solar.installedW)} W` },
              {
                label: 'Summer / winter',
                value: `${fmt(a.solar.summerWhPerDay)} / ${fmt(a.solar.winterWhPerDay)} Wh/day`,
              },
            ]}
          />
        </>,
        design.solar.panel.source,
      );
    case 'mppt':
      return sel(
        'Charge controller',
        <SelectField
          label="MPPT model"
          value={design.solar.controller?.id ?? ''}
          options={[
            { value: '', label: 'None' },
            ...MPPT_CONTROLLERS.map((m) => ({ value: m.id, label: m.model })),
          ]}
          onChange={(id) =>
            update((d) => {
              const m = MPPT_CONTROLLERS.find((x) => x.id === id);
              if (m) {
                d.solar.controller = deepClone(m);
                d.solar.controllerType = 'mppt';
              } else delete d.solar.controller;
            })
          }
        />,
        design.solar.controller?.source,
      );
    case 'vehicle':
    case 'dcdc':
      return sel(
        'Alternator charging',
        <>
          <Toggle
            checked={design.charging.alternator.enabled}
            onChange={(v) => update((d) => void (d.charging.alternator.enabled = v))}
            label="Enabled"
          />
          <SelectField
            label="DC-DC charger"
            value={design.charging.alternator.dcdc.id}
            options={DCDC_CHARGERS.map((c) => ({
              value: c.id,
              label: `${c.manufacturer} ${c.model}`,
            }))}
            onChange={(id) =>
              update(
                (d) =>
                  void (d.charging.alternator.dcdc = deepClone(
                    DCDC_CHARGERS.find((c) => c.id === id)!,
                  )),
              )
            }
          />
          <NumberField
            label="Driving hours per day"
            min={0}
            max={24}
            step={0.25}
            value={design.charging.alternator.drivingHoursPerDay}
            onChange={(v) => update((d) => void (d.charging.alternator.drivingHoursPerDay = v))}
          />
        </>,
        design.charging.alternator.dcdc.source,
      );
    case 'shore':
    case 'charger':
      return sel(
        'Shore power',
        <>
          <Toggle
            checked={design.charging.shore.enabled}
            onChange={(v) => update((d) => void (d.charging.shore.enabled = v))}
            label="Enabled"
          />
          <SelectField
            label="Charger"
            value={design.charging.shore.charger.id}
            options={AC_CHARGERS.map((c) => ({
              value: c.id,
              label: `${c.manufacturer} ${c.model}`,
            }))}
            onChange={(id) =>
              update(
                (d) =>
                  void (d.charging.shore.charger = deepClone(
                    AC_CHARGERS.find((c) => c.id === id)!,
                  )),
              )
            }
          />
          <NumberField
            label="Hook-up hours per day"
            min={0}
            max={24}
            value={design.charging.shore.hoursPerDay}
            onChange={(v) => update((d) => void (d.charging.shore.hoursPerDay = v))}
          />
        </>,
        design.charging.shore.charger.source,
      );
    case 'battery':
      return sel(
        'Battery bank',
        <>
          <SelectField
            label="Module"
            value={design.battery.module.id}
            options={BATTERY_MODULES.map((m) => ({
              value: m.id,
              label: `${m.manufacturer} ${m.model}`,
            }))}
            onChange={(id) =>
              update(
                (d) =>
                  void (d.battery.module = deepClone(BATTERY_MODULES.find((m) => m.id === id)!)),
              )
            }
          />
          <NumberField
            label="In parallel"
            min={1}
            max={16}
            value={design.battery.parallel}
            onChange={(v) => update((d) => void (d.battery.parallel = Math.round(v)))}
          />
          <KeyValue
            items={[
              { label: 'Usable', value: `${fmt(a.battery.usableWh)} Wh` },
              { label: 'Autonomy', value: `${fmt(a.battery.autonomyDays, 1)} days` },
            ]}
          />
        </>,
        design.battery.module.source,
      );
    case 'inverter':
      return sel(
        'Inverter',
        <>
          <Toggle
            checked={design.inverter.enabled}
            onChange={(v) => update((d) => void (d.inverter.enabled = v))}
            label="Enabled"
          />
          <SelectField
            label="Model"
            value={design.inverter.model.id}
            options={INVERTER_MODELS.map((m) => ({
              value: m.id,
              label: m.model,
              group: `${m.inputVoltage} V`,
            }))}
            onChange={(id) =>
              update((d) => {
                const m = INVERTER_MODELS.find((x) => x.id === id)!;
                d.inverter.model = deepClone(m);
                d.inverter.averageEfficiencyPct = m.maxEfficiencyPct - 5;
              })
            }
          />
          <KeyValue
            items={[
              { label: 'Required', value: `${fmt(a.inverter.requiredContinuousW)} W` },
              { label: 'Peak demand', value: `${fmt(a.inverter.acPeakW)} W` },
            ]}
          />
        </>,
        design.inverter.model.source,
      );
    case 'busbar':
      return sel(
        'Main fuse & busbar',
        <KeyValue
          items={a.cables
            .filter((c) => ['battery-main', 'battery-inverter', 'dc-distribution'].includes(c.role))
            .map((c) => ({
              label: c.name,
              value: `${c.selectedCsaMm2 ?? '—'} mm² · ${c.fuse.ratingA ?? '—'} A`,
            }))}
        />,
      );
    case 'acloads':
    case 'dcloads': {
      const supply = kind === 'acloads' ? 'ac' : 'dc';
      return sel(
        kind === 'acloads' ? '230 V AC loads' : 'DC loads',
        <ul className="space-y-2">
          {design.appliances
            .filter((x) => x.supply === supply)
            .map((ap) => (
              <li key={ap.id}>
                <Toggle
                  checked={ap.enabled}
                  onChange={(v) =>
                    update((d) => void (d.appliances.find((y) => y.id === ap.id)!.enabled = v))
                  }
                  label={ap.name}
                  description={`${fmt(ap.powerW * ap.quantity)} W`}
                />
              </li>
            ))}
        </ul>,
      );
    }
  }
}

export function DiagramPage() {
  const design = useActiveDesign();
  const a = useAnalysis();
  const setPos = useStore((s) => s.setDiagramPosition);
  const update = useStore((s) => s.update);
  const total = a.simulation.steps.length;
  const [hour, setHour] = useState(12);
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<NodeKind | null>(null);
  const graph = useMemo(
    () => buildGraph(design, a, Math.min(hour, total - 1)),
    [design, a, hour, total],
  );
  const [nodes, setNodes] = useState<Node<VVNodeData>[]>(graph.nodes);

  useEffect(() => {
    setNodes((prev) =>
      graph.nodes.map((n) => {
        const p = prev.find((x) => x.id === n.id);
        return p
          ? { ...n, position: p.dragging ? p.position : n.position, selected: p.selected }
          : n;
      }),
    );
  }, [graph.nodes]);

  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => setHour((h) => (h + 1) % Math.max(1, total)), 450);
    return () => clearInterval(t);
  }, [playing, total]);

  const onNodesChange = useCallback(
    (changes: NodeChange<Node<VVNodeData>>[]) => setNodes((ns) => applyNodeChanges(changes, ns)),
    [],
  );
  const step = graph.step;
  const day = Math.floor(hour / 24) + 1;

  return (
    <>
      <PageHeader
        title="System diagram"
        subtitle="Drag components to arrange them. Click a component to change it. Line thickness and animation show power flow at the selected hour of the simulation."
        actions={
          <button
            className="btn"
            onClick={() => update((d) => void (d.diagram.positions = {}))}
            title="Reset layout"
          >
            <LayoutGrid size={15} /> Reset layout
          </button>
        }
      />

      <Card className="mb-4" bodyClassName="py-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <button
            className="btn btn-primary w-24 shrink-0"
            onClick={() => setPlaying(!playing)}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? <Pause size={15} /> : <Play size={15} />} {playing ? 'Pause' : 'Play'}
          </button>
          <div className="flex-1">
            <input
              type="range"
              className="w-full"
              min={0}
              max={Math.max(0, total - 1)}
              value={Math.min(hour, total - 1)}
              onChange={(e) => setHour(Number(e.target.value))}
              aria-label="Simulation hour"
            />
          </div>
          <div className="num shrink-0 text-sm">
            <b>
              Day {day}, {String(hour % 24).padStart(2, '0')}:00
            </b>{' '}
            <span className="text-ink3">
              · {MONTHS[design.simulation.month - 1]} · SoC {fmt(step?.socPct ?? 0)}%
            </span>
          </div>
        </div>
      </Card>

      <div
        className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink2"
        aria-label="Legend"
      >
        {[
          ['Solar', 'var(--series-2)'],
          ['Alternator', 'var(--series-1)'],
          ['Shore power', 'var(--series-3)'],
          ['Battery', 'var(--accent)'],
          ['Inverter / 230 V', 'var(--series-7)'],
          ['DC loads', 'var(--text-2)'],
        ].map(([l, c]) => (
          <span key={l} className="flex items-center gap-1.5">
            <span className="h-1 w-5 rounded" style={{ background: c }} />
            {l}
          </span>
        ))}
        <span className="text-ink3">Labels: power · current · cable size</span>
      </div>
      <div className="card relative h-[640px] overflow-hidden">
        <ReactFlow
          nodes={nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onNodeDragStop={(_, n) => setPos(n.id, n.position)}
          onNodeClick={(_, n) => setSelected(n.id as NodeKind)}
          onPaneClick={() => setSelected(null)}
          fitView
          fitViewOptions={{ padding: 0.08 }}
          minZoom={0.3}
          maxZoom={1.8}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="var(--border)" gap={20} />
          <Controls showInteractive={false} />
        </ReactFlow>
        {selected ? (
          <div className="absolute inset-x-2 bottom-2 z-10 max-h-[70%] overflow-y-auto rounded-xl border border-line bg-surface p-4 shadow-pop sm:inset-x-auto sm:bottom-auto sm:right-3 sm:top-3 sm:w-80">
            <NodePanel kind={selected} onClose={() => setSelected(null)} />
          </div>
        ) : (
          <p className="pointer-events-none absolute right-3 top-3 rounded-md border border-line bg-surface/90 px-2 py-1 text-xs text-ink2">
            Click a component to edit it
          </p>
        )}
      </div>
    </>
  );
}
