export default function ArchivedPage() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-12 text-sm text-[var(--color-muted)]">
      <h1 className="mb-3 text-lg font-semibold text-[var(--color-fg)]">Archived</h1>
      <p>
        Archived vulnerabilities (older than 90 days) live in compressed monthly files under{' '}
        <code className="rounded bg-[var(--color-surface)] px-1.5 py-0.5 text-[var(--color-fg)]">
          data/archive/YYYY-MM.json.gz
        </code>
        . Archive browsing UI is not yet implemented in v1.
      </p>
    </div>
  );
}
