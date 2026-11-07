/**
 * Application state: saved designs (persisted to localStorage), active design,
 * theme, comparison selection and an in-memory undo/redo history.
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import {
  createDesign,
  deepClone,
  duplicateDesign,
  EXAMPLE_DESIGNS,
  uid,
  type Design,
} from '@vanvolt/engine';
import { migrateDesign } from './migrate';

export type ThemePref = 'light' | 'dark' | 'system';

const HISTORY_LIMIT = 50;

interface History {
  past: Design[];
  future: Design[];
}

export interface StoreState {
  designs: Record<string, Design>;
  order: string[];
  activeId: string;
  theme: ThemePref;
  compareIds: string[];
  history: Record<string, History>;

  active: () => Design;
  update: (recipe: (draft: Design) => void) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  setActive: (id: string) => void;
  newDesign: (name?: string) => string;
  duplicate: (id: string) => string;
  remove: (id: string) => void;
  rename: (id: string, name: string) => void;
  importDesign: (raw: unknown) => string;
  loadExample: (exampleId: string) => string;
  setTheme: (t: ThemePref) => void;
  toggleCompare: (id: string) => void;
  setCompare: (ids: string[]) => void;
  setDiagramPosition: (nodeId: string, pos: { x: number; y: number }) => void;
}

function initial(): Pick<StoreState, 'designs' | 'order' | 'activeId'> {
  const examples = EXAMPLE_DESIGNS.map((e) => e.build());
  const designs: Record<string, Design> = {};
  for (const d of examples) designs[d.id] = d;
  return { designs, order: examples.map((d) => d.id), activeId: examples[0]!.id };
}

export const useStore = create<StoreState>()(
  persist(
    (set, get) => ({
      ...initial(),
      theme: 'system',
      compareIds: [],
      history: {},

      active: () => {
        const s = get();
        return s.designs[s.activeId] ?? s.designs[s.order[0]!]!;
      },

      update: (recipe) => {
        const s = get();
        const current = s.active();
        const draft = deepClone(current);
        recipe(draft);
        draft.updatedAt = new Date().toISOString();
        const h = s.history[current.id] ?? { past: [], future: [] };
        set({
          designs: { ...s.designs, [current.id]: draft },
          history: {
            ...s.history,
            [current.id]: { past: [...h.past, current].slice(-HISTORY_LIMIT), future: [] },
          },
        });
      },

      undo: () => {
        const s = get();
        const current = s.active();
        const h = s.history[current.id];
        if (!h || h.past.length === 0) return;
        const prev = h.past[h.past.length - 1]!;
        set({
          designs: { ...s.designs, [current.id]: prev },
          history: {
            ...s.history,
            [current.id]: { past: h.past.slice(0, -1), future: [current, ...h.future] },
          },
        });
      },

      redo: () => {
        const s = get();
        const current = s.active();
        const h = s.history[current.id];
        if (!h || h.future.length === 0) return;
        const next = h.future[0]!;
        set({
          designs: { ...s.designs, [current.id]: next },
          history: {
            ...s.history,
            [current.id]: { past: [...h.past, current], future: h.future.slice(1) },
          },
        });
      },

      canUndo: () => (get().history[get().activeId]?.past.length ?? 0) > 0,
      canRedo: () => (get().history[get().activeId]?.future.length ?? 0) > 0,

      setActive: (id) => {
        if (get().designs[id]) set({ activeId: id });
      },

      newDesign: (name) => {
        const d = createDesign({ name: name ?? 'New campervan design' });
        set((s) => ({
          designs: { ...s.designs, [d.id]: d },
          order: [...s.order, d.id],
          activeId: d.id,
        }));
        return d.id;
      },

      duplicate: (id) => {
        const src = get().designs[id];
        if (!src) return get().activeId;
        const d = duplicateDesign(src);
        set((s) => ({
          designs: { ...s.designs, [d.id]: d },
          order: [...s.order, d.id],
          activeId: d.id,
        }));
        return d.id;
      },

      remove: (id) => {
        const s = get();
        const designs = { ...s.designs };
        delete designs[id];
        let order = s.order.filter((x) => x !== id);
        if (order.length === 0) {
          const d = createDesign();
          designs[d.id] = d;
          order = [d.id];
        }
        const history = { ...s.history };
        delete history[id];
        set({
          designs,
          order,
          history,
          activeId: s.activeId === id ? order[0]! : s.activeId,
          compareIds: s.compareIds.filter((x) => x !== id),
        });
      },

      rename: (id, name) => {
        const d = get().designs[id];
        if (!d) return;
        set((s) => ({
          designs: { ...s.designs, [id]: { ...d, name, updatedAt: new Date().toISOString() } },
        }));
      },

      importDesign: (raw) => {
        const d = migrateDesign(raw);
        const existing = get().designs[d.id];
        const design = existing ? { ...d, id: uid('design'), name: `${d.name} (imported)` } : d;
        set((s) => ({
          designs: { ...s.designs, [design.id]: design },
          order: [...s.order, design.id],
          activeId: design.id,
        }));
        return design.id;
      },

      loadExample: (exampleId) => {
        const ex = EXAMPLE_DESIGNS.find((e) => e.id === exampleId);
        if (!ex) return get().activeId;
        const built = ex.build();
        const d = get().designs[built.id]
          ? { ...built, id: uid('design'), name: `${built.name} (copy)` }
          : built;
        set((s) => ({
          designs: { ...s.designs, [d.id]: d },
          order: [...s.order, d.id],
          activeId: d.id,
        }));
        return d.id;
      },

      setTheme: (theme) => set({ theme }),

      toggleCompare: (id) =>
        set((s) => ({
          compareIds: s.compareIds.includes(id)
            ? s.compareIds.filter((x) => x !== id)
            : [...s.compareIds, id].slice(-4),
        })),
      setCompare: (ids) => set({ compareIds: ids.slice(0, 4) }),

      setDiagramPosition: (nodeId, pos) => {
        const s = get();
        const d = s.active();
        set({
          designs: {
            ...s.designs,
            [d.id]: {
              ...d,
              diagram: {
                positions: {
                  ...d.diagram.positions,
                  [nodeId]: { x: Math.round(pos.x), y: Math.round(pos.y) },
                },
              },
            },
          },
        });
      },
    }),
    {
      name: 'vanvolt-store',
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        designs: s.designs,
        order: s.order,
        activeId: s.activeId,
        theme: s.theme,
        compareIds: s.compareIds,
      }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<StoreState>;
        if (!p.designs || !p.order || p.order.length === 0) return current;
        const designs: Record<string, Design> = {};
        for (const id of p.order) {
          try {
            const d = p.designs[id];
            if (d) designs[id] = migrateDesign(d);
          } catch {
            /* skip corrupt entries */
          }
        }
        const order = p.order.filter((id) => designs[id]);
        if (order.length === 0) return current;
        return {
          ...current,
          designs,
          order,
          activeId: p.activeId && designs[p.activeId] ? p.activeId : order[0]!,
          theme: p.theme ?? current.theme,
          compareIds: (p.compareIds ?? []).filter((id) => designs[id]),
        };
      },
    },
  ),
);

export const useActiveDesign = () =>
  useStore((s) => s.designs[s.activeId] ?? s.designs[s.order[0]!]!);
