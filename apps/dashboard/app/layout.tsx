import './globals.css';
import Link from 'next/link';
import { LastUpdated } from '../components/LastUpdated';
import { SourceHealth } from '../components/SourceHealth';
import { AlertLog } from '../components/AlertLog';
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
        <header className="border-b border-zinc-800 px-4 py-3">
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/" className="font-semibold text-[var(--color-fg)]">
              security-scraper
            </Link>
            <nav className="flex gap-2">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded px-2 py-1 text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-fg)]"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
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
