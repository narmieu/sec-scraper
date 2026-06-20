'use client';
import { useState } from 'react';
import { IconMenu2 } from '@tabler/icons-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { NavLinks } from './NavLinks';

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="md:hidden -ml-1 text-muted-foreground hover:text-foreground"
          aria-label="Open navigation menu"
        >
          <IconMenu2 className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-72 gap-0 p-0">
        <SheetHeader className="border-b border-border">
          <SheetTitle className="text-sm font-semibold tracking-tight">
            security-scraper
          </SheetTitle>
        </SheetHeader>
        <div className="p-2">
          <NavLinks orientation="vertical" onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
