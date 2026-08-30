import { useCallback, useEffect, useRef } from 'react';
import { fetchEvents, resolveStartLedger } from '../services/eventService';
import { useAppStore } from '../store/useAppStore';
import { EVENT_POLL_MS, IS_CONFIGURED } from '../config';
import { createLogger } from '../utils/logger';

const log = createLogger('events');

/** Bound on empty pages followed per poll while catching up to the tip. */
const MAX_CATCHUP_PAGES = 6;

/**
 * Live activity feed, polled from Soroban RPC.
 *
 * RPC offers no subscription, so this polls. The first request uses a start
 * ledger clamped to the retention window; every later request continues from
 * the returned cursor. The two are mutually exclusive in the RPC API, which is
 * why they are separate calls.
 */
export function useContractEvents(enabled = true) {
  const events = useAppStore((state) => state.events);
  const live = useAppStore((state) => state.eventsLive);
  const error = useAppStore((state) => state.eventsError);
  const addEvents = useAppStore((state) => state.addEvents);
  const setLive = useAppStore((state) => state.setEventsLive);
  const setError = useAppStore((state) => state.setEventsError);

  const cursor = useRef<string | null>(null);
  const polling = useRef(false);

  const poll = useCallback(async () => {
    // Overlapping polls would double-fetch and waste requests.
    if (polling.current) return;
    polling.current = true;

    try {
      let page =
        cursor.current === null
          ? await fetchEvents({ startLedger: await resolveStartLedger() })
          : await fetchEvents({ cursor: cursor.current });

      // The response cursor is exclusive: the next poll resumes strictly after
      // the last event returned.
      if (page.cursor) cursor.current = page.cursor;

      // Newest first, since the feed reads top-down.
      addEvents([...page.events].reverse());

      /*
       * Catch-up paging.
       *
       * RPC scans forward across a bounded number of ledgers per request, so a
       * page can return empty while still advancing its cursor past unscanned
       * ledgers. Without this the feed sits blank on first load and fills only
       * one poll interval at a time. Bounded so a quiet contract cannot spin.
       */
      for (let i = 0; i < MAX_CATCHUP_PAGES && page.events.length === 0 && page.cursor; i += 1) {
        const next = await fetchEvents({ cursor: page.cursor });
        if (next.cursor === page.cursor) break; // no forward progress
        page = next;
        if (page.cursor) cursor.current = page.cursor;
        addEvents([...page.events].reverse());
      }

      setLive(true);
      setError(null);
    } catch (caught) {
      log.warn('event poll failed', caught);
      setLive(false);
      setError(
        caught instanceof Error ? caught.message : 'Unable to connect to Stellar network.',
      );
      // Drop a cursor RPC has aged out so the next poll re-establishes a valid
      // start ledger instead of failing permanently.
      cursor.current = null;
    } finally {
      polling.current = false;
    }
  }, [addEvents, setLive, setError]);

  useEffect(() => {
    if (!enabled || !IS_CONFIGURED) return;

    void poll();
    const interval = window.setInterval(() => void poll(), EVENT_POLL_MS);
    return () => window.clearInterval(interval);
  }, [enabled, poll]);

  return { events, live, error, refresh: poll };
}
