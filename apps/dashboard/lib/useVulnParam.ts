'use client';
import { useCallback, useSyncExternalStore } from 'react';

function currentV(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('v');
}

// Shared subscription so every useVulnParam() consumer — each list row *and*
// the single modal mounted in the layout — reads the same URL-derived value and
// re-renders together. history.pushState/replaceState do NOT emit a popstate
// event, so openVuln/close notify subscribers explicitly via emit().
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  window.addEventListener('popstate', onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener('popstate', onChange);
  };
}

export function useVulnParam() {
  // getSnapshot returns a stable primitive (string | null), safe for
  // useSyncExternalStore; server snapshot is null so the modal renders closed.
  const id = useSyncExternalStore(subscribe, currentV, () => null);

  const openVuln = useCallback((vid: string) => {
    const u = new URL(window.location.href);
    u.searchParams.set('v', vid);
    window.history.pushState({}, '', u);
    emit();
  }, []);

  const close = useCallback(() => {
    const u = new URL(window.location.href);
    if (u.searchParams.get('v') === null) {
      emit();
      return;
    }
    window.history.back(); // restores the list URL; popstate fires → subscribers re-read
    setTimeout(() => {
      if (currentV() !== null) {
        const u2 = new URL(window.location.href);
        u2.searchParams.delete('v');
        window.history.replaceState({}, '', u2);
        emit();
      }
    }, 0);
  }, []);

  return { id, openVuln, close };
}
