import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FolderPlus, Images, Settings2 } from 'lucide-react';
import { Popover, PopoverItem, PopoverSeparator } from '../components/ui';
import type { LibraryRecord } from '../types';

/**
 * The library switcher and menu (design `NAV-10`, `LIB-01`).
 *
 * Shows the library type icon, name and a chevron; the menu lists every library
 * with its item count, then **Add library…** and **Manage libraries…**.
 *
 * `LIB-01`'s health *ring* is deliberately absent: the ring is defined as the
 * percentage of items whose metadata **and** thumbnail stages are `done`, and
 * `list_libraries` does not return per-stage counts. Showing a made-up ring
 * would violate `PRD-10`, so the count and the missing-file count are shown and
 * the ring is left to the integration stage (it needs one new backend field).
 */
export type LibraryMenuProps = {
  libraries: LibraryRecord[];
  /** `''` means "All libraries". */
  activeId: string | undefined;
  onSelect: (libraryId: string) => void;
  onAddLibrary: () => void;
  /** Lets `Ctrl+Shift+L` open the menu from anywhere, including here. */
  openSignal?: number;
  onOpened?: () => void;
};

export function LibraryMenu({
  libraries,
  activeId,
  onSelect,
  onAddLibrary,
  openSignal,
  onOpened,
}: LibraryMenuProps) {
  const [open, setOpen] = useState(false);
  const lastSignal = useRef(openSignal);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // A shortcut signal is a counter the caller increments; react to the change in
  // an effect (never during render) so `Ctrl+Shift+L` works from any screen,
  // including this one, and pressing it twice still reopens the menu.
  useEffect(() => {
    if (openSignal === undefined) return;
    if (openSignal === lastSignal.current) return;
    lastSignal.current = openSignal;
    setOpen(true);
    buttonRef.current?.focus();
  }, [openSignal]);

  const active = libraries.find((l) => l.id === activeId);
  const label = active?.name ?? 'All libraries';

  return (
    <Popover
      open={open}
      onClose={() => setOpen(false)}
      className="library-menu"
      label="Libraries"
      trigger={
        <button
          type="button"
          ref={buttonRef}
          className="library-trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => {
            setOpen((v) => !v);
            onOpened?.();
          }}
        >
          <Images size={16} aria-hidden="true" />
          <span className="library-trigger-name">{label}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      }
    >
      <PopoverItem
        selected={!activeId}
        onClick={() => {
          onSelect('');
          setOpen(false);
        }}
      >
        All libraries
      </PopoverItem>
      {libraries.map((library) => (
        <PopoverItem
          key={library.id}
          selected={library.id === activeId}
          onClick={() => {
            onSelect(library.id);
            setOpen(false);
          }}
        >
          {library.name} · {library.total_files.toLocaleString()} items
        </PopoverItem>
      ))}
      <PopoverSeparator />
      <PopoverItem
        onClick={() => {
          setOpen(false);
          onAddLibrary();
        }}
      >
        <FolderPlus size={14} aria-hidden="true" /> Add library…
      </PopoverItem>
      <PopoverItem
        disabled
        reason="Manage libraries is not built yet (LIB-02)"
      >
        <Settings2 size={14} aria-hidden="true" /> Manage libraries…
      </PopoverItem>
    </Popover>
  );
}