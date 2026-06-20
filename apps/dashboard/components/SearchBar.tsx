'use client';
import { useEffect, useRef, useState } from 'react';
import { IconSearch, IconX } from '@tabler/icons-react';
import { useStore } from '../lib/store';
import { Input } from './ui/input';

export function SearchBar() {
  const query = useStore((s) => s.query);
  const setQuery = useStore((s) => s.setQuery);
  const [local, setLocal] = useState(query);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync local input when the store query is cleared/changed externally
  // (e.g. by the "Clear all" / "Reset all" buttons).
  useEffect(() => {
    setLocal(query);
  }, [query]);

  useEffect(() => {
    if (local === query) return;
    const t = setTimeout(() => setQuery(local), 150);
    return () => clearTimeout(t);
  }, [local, query, setQuery]);

  // Press "/" anywhere to focus the search (unless already typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement;
      if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const clear = () => {
    setLocal('');
    setQuery('');
    inputRef.current?.focus();
  };

  return (
    <div className="relative">
      <IconSearch className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="search"
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        placeholder="Search title, package, CVE…"
        className="pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden"
      />
      {local ? (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <IconX className="size-4" />
        </button>
      ) : (
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 select-none rounded border border-border px-1.5 py-px font-mono text-[10px] text-muted-foreground sm:inline-block">
          /
        </kbd>
      )}
    </div>
  );
}
