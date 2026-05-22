import './globals.css';
import Link from 'next/link';
import { LastUpdated } from '../components/LastUpdated';
import { SourceHealth } from '../components/SourceHealth';
import { AlertLog } from '../components/AlertLog';
import { FiltersTrigger } from '../components/FiltersTrigger';
import { loadAlertedFile, loadLastRun, loadSourceHealth } from '../lib/data';

export const metadata = {
  title: 'security-scraper',
  description: 'Self-hosted security vulnerability tracker',
};

const NAV = [
  { href: '/', label: 'All' },
  { href: '/frontend/', label: 'Frontend' },
  { href: '/backend/', label: 'Backend' },
  { href: '/ai-llm/', label: 'AI/LLM' },
  { href: '/archived/', label: 'Archived' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const lastRun = loadLastRun();
  const sources = loadSourceHealth();
  const alerted = loadAlertedFile();

  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-30 border-b border-zinc-800 bg-[var(--color-bg)] px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link href="/" className="font-semibold text-[var(--color-fg)]">
              security-scraper
            </Link>
            <nav className="flex flex-wrap gap-1">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded px-3 py-2 text-sm min-h-[36px] flex items-center text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)] md:px-2 md:py-1 md:min-h-0"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <FiltersTrigger />
            <div className="ml-auto">
              <LastUpdated lastRun={lastRun} />
            </div>
          </div>
        </header>
        <main className="min-h-[60vh]">{children}</main>
        <AlertLog alerted={alerted} />
        <SourceHealth sources={sources} />
      </body>
    </html>
  );
}
