import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../api';
import type { ImageDetail, ImageRecord } from '../../types';
import { Button, Dialog, Input, Select } from '../../components/ui';
import { VirtualImageGrid } from '../../components/gallery/VirtualImageGrid';
import { ImageViewerDialog } from '../../components/gallery/ImageViewerDialog';
import { Inspector } from './Inspector';
import { CatalogFilter } from '../../components/catalog/CatalogFilter';
import { useLibrary } from '../../app/providers';

export function LibraryScreen({ onGoToIndexing }: { onGoToIndexing: () => void }) {
  const { libraries, libraryId, refreshLibraries, selectLibrary, filters, facets, setFilters, clearFilters } =
    useLibrary();
  const [items, setItems] = useState<ImageRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState('mtime_desc');
  const [selected, setSelected] = useState<ImageRecord | null>(null);
  // Double-click target. Kept separate from `selected` so a single click never
  // interrupts browsing with a modal.
  const [viewer, setViewer] = useState<ImageRecord | null>(null);
  const [detail, setDetail] = useState<ImageDetail | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [filter, setFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const pageSize = 200;
  // Monotonic id for browse requests. Changing library/filters/page issues a
  // new request, but a slower earlier request can still resolve afterwards;
  // without this guard its stale page silently replaces the current one.
  const browseSeq = useRef(0);
  const navSeq = useRef(0);

  const activeFilterCount = useMemo(
    () =>
      filters.kinds.length + filters.checkpoints.length + filters.samplers.length + filters.loras.length,
    [filters],
  );

  const filtered = useMemo(
    () =>
      items.filter((it) => {
        if (!filter.trim()) return true;
        const q = filter.toLowerCase();
        return it.filename.toLowerCase().includes(q);
      }),
    [items, filter],
  );

  const load = async () => {
    const seq = ++browseSeq.current;
    try {
      const res = await api.browse({ libraryId, limit: pageSize, offset, sort, filters });
      // Drop responses that a newer browse() superseded. This is what keeps
      // rapid folder/library switches from showing another folder's images.
      if (seq !== browseSeq.current) return;
      setItems(res.items);
      setTotal(res.total);
    } catch (e) {
      if (seq !== browseSeq.current) return;
      setMsg(String(e));
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [libraryId, offset, sort, filters]);

  useEffect(() => {
    setOffset(0);
    setSelected(null);
  }, [libraryId, filters]);

  useEffect(() => {
    if (!selected) {
      setDetail(null);
      return;
    }
    api.getImageDetail(selected.id).then(setDetail).catch((e) => setMsg(String(e)));
  }, [selected]);

  // Move the full-size viewer one image along the gallery order, crossing page
  // boundaries. Within the loaded page this is instant; at an edge (or when the
  // viewer shows an image that is no longer in the loaded page) the neighbour
  // is computed by the backend against the same filter/sort sequence, so
  // keyboard navigation does not dead-end at the last row of a page.
  const navigateViewer = async (direction: 'prev' | 'next') => {
    const current = viewer;
    if (!current) return;
    const idx = filtered.findIndex((r) => r.id === current.id);
    if (idx >= 0) {
      const target = direction === 'prev' ? filtered[idx - 1] : filtered[idx + 1];
      if (target) {
        navSeq.current += 1;
        setViewer(target);
        setSelected(target);
        return;
      }
    }
    const seq = ++navSeq.current;
    try {
      const res = await api.getAdjacentImage({
        currentImageId: current.id,
        direction,
        libraryId,
        sort,
        filters,
      });
      if (seq !== navSeq.current) return;
      if (res.image) {
        setViewer(res.image);
        setSelected(res.image);
      }
    } catch (e) {
      if (seq === navSeq.current) setMsg(String(e));
    }
  };

  return (
    <main className="main split">
      <section className="pane gallery-pane">
        <div className="toolbar">
          <Select
            aria-label="Library scope"
            value={libraryId ?? ''}
            onChange={(e) => {
              setOffset(0);
              setSelected(null);
              selectLibrary(e.target.value);
            }}
          >
            <option value="">All libraries</option>
            {libraries.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.total_files})
              </option>
            ))}
          </Select>
          <Select
            aria-label="Sort order"
            value={sort}
            onChange={(e) => {
              setOffset(0);
              setSort(e.target.value);
            }}
          >
            <option value="mtime_desc">Newest first</option>
            <option value="mtime_asc">Oldest first</option>
            <option value="name">Filename</option>
            <option value="size_desc">Largest first</option>
          </Select>
          <Input
            placeholder="Filter filenames…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter filenames"
          />
          <Button variant="secondary" onClick={() => setShowFilters((v) => !v)}>
            Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
          </Button>
          <Button
            onClick={async () => {
              const dir = await api.openDirectory('Select image library folder');
              if (!dir) return;
              setAdding(true);
              try {
                await api.registerLibrary(dir);
                await refreshLibraries();
                setMsg(`Registered ${dir}.`);
              } catch (e) {
                setMsg(String(e));
              } finally {
                setAdding(false);
              }
            }}
            disabled={adding}
          >
            {adding ? 'Registering…' : 'Add library'}
          </Button>
          <Button onClick={() => setConfirmRemove(true)} disabled={adding || !libraryId}>
            Remove library
          </Button>
          <span className="spacer" />
          <span className="mono small">
            {filtered.length} of {total} shown
          </span>
          <Button disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - pageSize))}>
            Prev
          </Button>
          <Button
            disabled={offset + pageSize >= total}
            onClick={() => setOffset(offset + pageSize)}
          >
            Next
          </Button>
        </div>
        {msg && <p className="notice">{msg}</p>}
        {showFilters && (
          <div className="filter-panel">
            <CatalogFilter facets={facets} value={filters} onChange={setFilters} onClear={clearFilters} />
          </div>
        )}
        {filtered.length === 0 ? (
          <div className="empty">
            <p>No images match this view.</p>
            <Button onClick={onGoToIndexing}>Open Indexing Center</Button>
          </div>
        ) : (
          <div style={{ height: 'calc(100% - 56px)' }}>
            <VirtualImageGrid
              items={filtered}
              selectedId={selected?.id ?? null}
              onSelect={setSelected}
              onOpen={setViewer}
              showMeta
            />
          </div>
        )}
      </section>
      <aside className="pane inspector">
        <h2>Inspector</h2>
        {!selected ? (
          <p className="empty">Select an image to inspect its metadata.</p>
        ) : (
          <Inspector detail={detail} record={selected} />
        )}
      </aside>
      <ImageViewerDialog
        record={viewer}
        detail={detail}
        onClose={() => setViewer(null)}
        onPrevious={() => void navigateViewer('prev')}
        onNext={() => void navigateViewer('next')}
      />
      <Dialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title="Remove library"
        footer={
          <>
            <Button onClick={() => setConfirmRemove(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!libraryId) return;
                setConfirmRemove(false);
                setAdding(true);
                try {
                  await api.removeLibrary(libraryId);
                  await refreshLibraries();
                  setOffset(0);
                  setSelected(null);
                  setMsg('Library removed from the catalog. Source folder untouched.');
                } catch (e) {
                  setMsg(String(e));
                } finally {
                  setAdding(false);
                }
              }}
            >
              Remove
            </Button>
          </>
        }
      >
        <p>Remove the selected library from the catalog? Source folder is never deleted.</p>
      </Dialog>
    </main>
  );
}