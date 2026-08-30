import { create } from 'zustand';
import type { ActivityEvent, AppError, Pool } from '../types';

/**
 * Application state, kept separate from the service layer.
 *
 * Services own network access and return plain data; this store owns what the
 * UI is currently showing. Keeping them apart is what lets tests drive the UI
 * by seeding state directly, without stubbing the network.
 */

interface AppState {
  /* Wallet */
  address: string | null;
  walletConnecting: boolean;
  walletError: string | null;

  /* Pools */
  pools: Pool[];
  poolsLoading: boolean;
  poolsError: AppError | null;

  /* Activity */
  events: ActivityEvent[];
  eventsLive: boolean;
  eventsError: string | null;

  /* Transactions in flight */
  pendingAction: string | null;
  actionError: AppError | null;
  lastTxHash: string | null;

  setAddress: (address: string | null) => void;
  setWalletConnecting: (connecting: boolean) => void;
  setWalletError: (error: string | null) => void;

  setPools: (pools: Pool[]) => void;
  setPoolsLoading: (loading: boolean) => void;
  setPoolsError: (error: AppError | null) => void;

  addEvents: (events: ActivityEvent[]) => void;
  setEventsLive: (live: boolean) => void;
  setEventsError: (error: string | null) => void;

  setPendingAction: (action: string | null) => void;
  setActionError: (error: AppError | null) => void;
  setLastTxHash: (hash: string | null) => void;
  clearActionState: () => void;
}

/** Cap on retained events so a long session cannot grow without bound. */
const MAX_EVENTS = 100;

export const useAppStore = create<AppState>((set) => ({
  address: null,
  walletConnecting: false,
  walletError: null,

  pools: [],
  poolsLoading: false,
  poolsError: null,

  events: [],
  eventsLive: false,
  eventsError: null,

  pendingAction: null,
  actionError: null,
  lastTxHash: null,

  setAddress: (address) => set({ address }),
  setWalletConnecting: (walletConnecting) => set({ walletConnecting }),
  setWalletError: (walletError) => set({ walletError }),

  setPools: (pools) => set({ pools }),
  setPoolsLoading: (poolsLoading) => set({ poolsLoading }),
  setPoolsError: (poolsError) => set({ poolsError }),

  addEvents: (incoming) =>
    set((state) => {
      // RPC pages can overlap on retry, so de-duplicate by event id.
      const known = new Set(state.events.map((event) => event.id));
      const fresh = incoming.filter((event) => !known.has(event.id));
      if (fresh.length === 0) return state;
      return { events: [...fresh, ...state.events].slice(0, MAX_EVENTS) };
    }),
  setEventsLive: (eventsLive) => set({ eventsLive }),
  setEventsError: (eventsError) => set({ eventsError }),

  setPendingAction: (pendingAction) => set({ pendingAction }),
  setActionError: (actionError) => set({ actionError }),
  setLastTxHash: (lastTxHash) => set({ lastTxHash }),
  clearActionState: () =>
    set({ pendingAction: null, actionError: null, lastTxHash: null }),
}));

/** Test helper: returns the store to its initial state between cases. */
export function resetAppStore() {
  useAppStore.setState({
    address: null,
    walletConnecting: false,
    walletError: null,
    pools: [],
    poolsLoading: false,
    poolsError: null,
    events: [],
    eventsLive: false,
    eventsError: null,
    pendingAction: null,
    actionError: null,
    lastTxHash: null,
  });
}
