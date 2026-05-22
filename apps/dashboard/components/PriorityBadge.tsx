export function PriorityBadge({ priority }: { priority: number }) {
  const tier =
    priority >= 80 ? 'bg-red-500/25 text-red-300 border-red-500/40'
    : priority >= 60 ? 'bg-orange-500/25 text-orange-300 border-orange-500/40'
    : priority >= 40 ? 'bg-yellow-500/25 text-yellow-300 border-yellow-500/40'
    : 'bg-zinc-700/40 text-zinc-300 border-zinc-600/40';
  return (
    <span
      className={`inline-flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold tabular-nums ${tier}`}
      title={`Priority ${priority}`}
    >
      {priority}
    </span>
  );
}
