'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

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

export function NavLinks({
  orientation = 'horizontal',
  onNavigate,
}: {
  orientation?: 'horizontal' | 'vertical';
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const vertical = orientation === 'vertical';
  return (
    <nav className={cn(vertical ? 'flex flex-col gap-1' : 'flex flex-wrap gap-0.5')}>
      {NAV.map((n) => {
        const active = isActive(pathname, n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center rounded-md text-sm font-medium transition-colors',
              vertical ? 'px-3 py-2.5 min-h-[44px]' : 'px-3 py-1.5 min-h-[32px]',
              active
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
            )}
          >
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
