'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const NAV = [
  { href: '/', label: 'All' },
  { href: '/frontend/', label: 'Frontend' },
  { href: '/backend/', label: 'Backend' },
  { href: '/ai-llm/', label: 'AI/LLM' },
  { href: '/archived/', label: 'Archived' },
];

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  if (href === '/') return pathname === '/' || pathname === '';
  return pathname === href || pathname === href.replace(/\/$/, '');
}

export function NavLinks() {
  const pathname = usePathname();
  return (
    <nav className="flex flex-wrap gap-1">
      {NAV.map((n) => {
        const active = isActive(pathname, n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? 'page' : undefined}
            className={`rounded px-3 py-2 text-sm min-h-[36px] flex items-center md:px-2 md:py-1 md:min-h-0 ${
              active
                ? 'bg-[var(--color-surface)] text-[var(--color-fg)]'
                : 'text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)]'
            }`}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
