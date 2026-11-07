import { beforeEach, describe, expect, it } from 'vitest';
import { EXAMPLE_DESIGNS } from '@vanvolt/engine';
import { useStore } from './designStore';

describe('design store', () => {
  beforeEach(() => {
    localStorage.clear();
    useStore.setState({ history: {}, compareIds: [] });
  });

  it('starts with the example designs', () => {
    const s = useStore.getState();
    expect(s.order.length).toBeGreaterThanOrEqual(EXAMPLE_DESIGNS.length);
    expect(s.active()).toBeDefined();
  });

  it('updates the active design and supports undo/redo', () => {
    const { update, undo, redo } = useStore.getState();
    const before = useStore.getState().active().battery.parallel;
    update((d) => void (d.battery.parallel = before + 1));
    expect(useStore.getState().active().battery.parallel).toBe(before + 1);
    undo();
    expect(useStore.getState().active().battery.parallel).toBe(before);
    redo();
    expect(useStore.getState().active().battery.parallel).toBe(before + 1);
  });

  it('creates, duplicates and removes designs', () => {
    const s = useStore.getState();
    const id = s.newDesign('Test van');
    expect(useStore.getState().activeId).toBe(id);
    const copy = useStore.getState().duplicate(id);
    expect(useStore.getState().designs[copy]!.name).toBe('Test van (copy)');
    useStore.getState().remove(copy);
    expect(useStore.getState().designs[copy]).toBeUndefined();
  });

  it('imports a design under a new id when the id already exists', () => {
    const existing = useStore.getState().active();
    const id = useStore.getState().importDesign(JSON.parse(JSON.stringify(existing)));
    expect(id).not.toBe(existing.id);
    expect(useStore.getState().designs[id]!.name).toMatch(/imported/);
  });

  it('persists to localStorage', () => {
    useStore.getState().rename(useStore.getState().activeId, 'Persisted name');
    const raw = JSON.parse(localStorage.getItem('vanvolt-store') ?? '{}');
    expect(JSON.stringify(raw.state.designs)).toContain('Persisted name');
  });

  it('limits comparison to four designs', () => {
    for (let i = 0; i < 6; i++) useStore.getState().newDesign(`D${i}`);
    for (const id of useStore.getState().order) useStore.getState().toggleCompare(id);
    expect(useStore.getState().compareIds.length).toBe(4);
  });

  it('skips saved designs that would crash the app and keeps the rest', async () => {
    const good = useStore.getState().active();
    const bad = {
      ...JSON.parse(JSON.stringify(good)),
      id: 'bad-design',
      appliances: [{ powerW: 1 }],
      battery: 'oops',
    };
    localStorage.setItem(
      'vanvolt-store',
      JSON.stringify({
        state: {
          designs: { [good.id]: good, 'bad-design': bad, __proto__: good },
          order: ['bad-design', good.id, '__proto__'],
          activeId: 'bad-design',
          theme: 'system',
          compareIds: [],
        },
        version: 1,
      }),
    );
    await useStore.persist.rehydrate();
    const s = useStore.getState();
    expect(s.order).toEqual([good.id]);
    expect(s.activeId).toBe(good.id);
    expect(Object.getPrototypeOf(s.designs)).toBeNull();
  });

  it('rejects imports the engine cannot analyse', () => {
    expect(() =>
      useStore
        .getState()
        .importDesign({ appliances: [], battery: {}, solar: {}, schemaVersion: 2 }),
    ).toThrow();
  });
});
