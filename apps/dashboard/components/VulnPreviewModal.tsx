'use client';

import { useEffect, useState } from 'react';
import { useVulnParam } from '@/lib/useVulnParam';
import { useVulnDetail } from '@/lib/useVulnDetail';
import { VulnDetailContent } from '@/components/VulnDetailContent';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';

// ---------------------------------------------------------------------------
// Responsive breakpoint hook
// ---------------------------------------------------------------------------

function useIsDesktop(): boolean | null {
  const [mounted, setMounted] = useState(false);
  const [isDesktop, setIsDesktop] = useState(true); // default true to avoid SSR mismatch

  useEffect(() => {
    setMounted(true);
    const mql = window.matchMedia('(min-width: 768px)');
    setIsDesktop(mql.matches);
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);

  // Until mounted, return null so the modal renders nothing for the first
  // client frame — avoids a Dialog→Drawer flash when a mobile user lands
  // directly on a shared ?v= link.
  return mounted ? isDesktop : null;
}

// ---------------------------------------------------------------------------
// Skeleton placeholder
// ---------------------------------------------------------------------------

function LoadingSkeleton() {
  return (
    <div className="space-y-4 px-6 py-8">
      <Skeleton className="h-6 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Body content (shared between Dialog and Drawer)
// ---------------------------------------------------------------------------

function ModalBody({ id }: { id: string }) {
  const { vuln, loading, error } = useVulnDetail(id);

  if (loading) return <LoadingSkeleton />;
  if (error) {
    return (
      <div className="flex items-center justify-center px-6 py-12 text-sm text-muted-foreground">
        Couldn&apos;t load this vulnerability.
      </div>
    );
  }
  if (vuln) return <VulnDetailContent vuln={vuln} />;
  return null;
}

// ---------------------------------------------------------------------------
// Main modal component — mounted once in layout
// ---------------------------------------------------------------------------

export function VulnPreviewModal() {
  const { id, close } = useVulnParam();
  const open = id !== null;
  const isDesktop = useIsDesktop();

  // Derive an accessible title from the id
  const title = id ?? '';

  // First client frame (pre-mount): breakpoint unknown — render nothing.
  // Safe because the modal is closed at hydration (id is null until the URL
  // is read in an effect), so this produces no visible change.
  if (isDesktop === null) return null;

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
        <DialogContent
          className="sm:max-w-3xl max-h-[85vh] overflow-y-auto overflow-x-hidden p-0"
          showCloseButton
        >
          <DialogHeader className="sr-only">
            <DialogTitle>{title}</DialogTitle>
          </DialogHeader>
          {id && <ModalBody id={id} />}
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DrawerContent className="max-h-[85vh]">
        <DrawerHeader className="sr-only">
          <DrawerTitle>{title}</DrawerTitle>
        </DrawerHeader>
        <div className="overflow-y-auto overflow-x-hidden flex-1">
          {id && <ModalBody id={id} />}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
