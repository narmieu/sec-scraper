import './globals.css';
import Link from 'next/link';
import { LastUpdated } from '@/components/LastUpdated';
import { SourceHealth } from '@/components/SourceHealth';
import { AlertLog } from '@/components/AlertLog';
import { FiltersTrigger } from '@/components/FiltersTrigger';
import { NavLinks } from '@/components/NavLinks';
import { MobileNav } from '@/components/MobileNav';
import { TooltipProvider } from '@/components/ui/tooltip';
import { VulnPreviewModal } from '@/components/VulnPreviewModal';
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
        <TooltipProvider>
          <header className="sticky top-0 z-30 border-b border-border bg-background/95 backdrop-blur-sm px-4 h-12 flex items-center">
            <div className="flex w-full items-center gap-3">
              <MobileNav />
              <Link
                href="/"
                className="text-sm font-semibold tracking-tight text-foreground hover:text-primary transition-colors shrink-0"
              >
                security-scraper
              </Link>
              <div className="hidden md:flex md:items-center md:gap-3">
                <Separator />
                <NavLinks />
              </div>
              <FiltersTrigger />
              <div className="ml-auto flex items-center gap-2">
                <span className="hidden sm:inline-flex">
                  <LastUpdated lastRun={lastRun} />
                </span>
                <AlertLog alerted={alerted} />
              </div>
            </div>
          </header>
          <main className="min-h-[60vh]">{children}</main>
          <SourceHealth sources={sources} />
          <VulnPreviewModal />
        </TooltipProvider>
      </body>
    </html>
  );
}

function Separator() {
  return <span className="h-4 w-px bg-border shrink-0" aria-hidden />;
}
