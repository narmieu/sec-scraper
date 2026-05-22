'use client';
import { useEffect, useState } from 'react';
import { useStore } from '../lib/store';

export function SearchBar() {
  const query = useStore((s) => s.query);
  const setQuery = useStore((s) => s.setQuery);
  const [local, setLocal] = useState(query);

  useEffect(() => {
    const t = setTimeout(() => setQuery(local), 150);
    return () => clearTimeout(t);
  }, [local, setQuery]);

  return (
    <input
      type="search"
      value={local}
      onChange={(e) => setLocal(e.target.value)}
      placeholder="Search title, package, CVE…"
      className="w-full rounded border border-zinc-700 bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-fg)] placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] focus:outline-none"
    />
  );
}
