import { beforeEach, describe, expect, it } from 'vitest';
import { resetAppStore, useAppStore } from './useAppStore';
import { makeEvent, makePool, ALICE } from '../test/factories';
import { appError } from '../types';

describe('useAppStore', () => {
  beforeEach(() => resetAppStore());

  it('starts empty', () => {
    const state = useAppStore.getState();
    expect(state.address).toBeNull();
    expect(state.pools).toEqual([]);
    expect(state.events).toEqual([]);
  });

  it('tracks wallet state', () => {
    useAppStore.getState().setAddress(ALICE);
    expect(useAppStore.getState().address).toBe(ALICE);

    useAppStore.getState().setWalletConnecting(true);
    expect(useAppStore.getState().walletConnecting).toBe(true);
  });

  it('tracks pool state and errors', () => {
    useAppStore.getState().setPools([makePool()]);
    expect(useAppStore.getState().pools).toHaveLength(1);

    useAppStore.getState().setPoolsError(appError('network'));
    expect(useAppStore.getState().poolsError?.message).toBe(
      'Unable to connect to Stellar network.',
    );
  });

  it('prepends new events so the newest reads first', () => {
    const { addEvents } = useAppStore.getState();
    addEvents([makeEvent({ id: '1' })]);
    addEvents([makeEvent({ id: '2' })]);

    expect(useAppStore.getState().events.map((event) => event.id)).toEqual(['2', '1']);
  });

  it('ignores events it has already seen', () => {
    const { addEvents } = useAppStore.getState();
    // Callers pass each batch newest-first; the store prepends batches and does
    // not re-sort, so ordering within a batch is the caller's responsibility.
    addEvents([makeEvent({ id: '2' }), makeEvent({ id: '1' })]);
    // RPC pages can overlap on retry; the duplicate must be dropped.
    addEvents([makeEvent({ id: '3' }), makeEvent({ id: '2' })]);

    expect(useAppStore.getState().events.map((event) => event.id)).toEqual([
      '3',
      '2',
      '1',
    ]);
  });

  it('caps retained events so a long session cannot grow unbounded', () => {
    const { addEvents } = useAppStore.getState();
    addEvents(Array.from({ length: 150 }, (_, index) => makeEvent({ id: String(index) })));

    expect(useAppStore.getState().events).toHaveLength(100);
  });

  it('clears transient action state', () => {
    const store = useAppStore.getState();
    store.setPendingAction('Processing Contribution...');
    store.setActionError(appError('transaction-failed'));
    store.setLastTxHash('abc');

    useAppStore.getState().clearActionState();

    const state = useAppStore.getState();
    expect(state.pendingAction).toBeNull();
    expect(state.actionError).toBeNull();
    expect(state.lastTxHash).toBeNull();
  });
});
