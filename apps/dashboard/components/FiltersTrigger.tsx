'use client';
import { IconFilter } from '@tabler/icons-react';
import { Button } from '@/components/ui/button';
import { useStore } from '../lib/store';

export function FiltersTrigger() {
  const setOpen = useStore((s) => s.setFiltersOpen);
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => setOpen(true)}
      className="lg:hidden gap-1.5"
    >
      <IconFilter className="size-4" />
      Filters
    </Button>
  );
}
