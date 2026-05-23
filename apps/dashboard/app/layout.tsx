import './globals.css';
import Link from 'next/link';
import { LastUpdated } from '@/components/LastUpdated';
import { SourceHealth } from '@/components/SourceHealth';
import { AlertLog } from '@/components/AlertLog';
import { FiltersTrigger } from '@/components/FiltersTrigger';
import { NavLinks } from '@/components/NavLinks';
import { loadAlertedFile, loadLastRun, loadSourceHealth } from '@/lib/data';

export const metadata = {
  title: 'security-scraper',
  description: 'Self-hosted security vulnerability tracker',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const lastRun = loadLastRun();
  const sources = loadSourceHealth();
  const alerted = loadAlertedFile();

  return (
    <html lang="en">
      <body>
        <header className="sticky top-0 z-30 border-b border-zinc-800 bg-[var(--color-bg)]/95 backdrop-blur px-4 py-3">
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/"
              className="font-semibold tracking-tight text-[var(--color-fg)] hover:text-[var(--color-accent)]"
            >
              security-scraper
            </Link>
            <NavLinks />
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
