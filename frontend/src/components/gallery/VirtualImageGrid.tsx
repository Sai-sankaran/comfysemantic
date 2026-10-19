import { useVirtualizer } from '@tanstack/react-virtual';
import { useCallback, useEffect, useRef, useState } from 'react';
import { thumbUrl } from '../../app/format';
import type { ImageRecord } from '../../types';
import { Badge } from '../ui';

type Props = {
  items: ImageRecord[];
  selectedId: string | null;
  onSelect: (rec: ImageRecord) => void;
  onOpen?: (rec: ImageRecord) => void;
  showMeta?: boolean;
};

export function VirtualImageGrid({
  items,
  selectedId,
  onSelect,
  onOpen,
  showMeta = true,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(6);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w < 280) setColumnCount(2);
      else if (w < 420) setColumnCount(3);
      else if (w < 580) setColumnCount(4);
      else if (w < 780) setColumnCount(5);
      else setColumnCount(6);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rowCount = Math.ceil(items.length / Math.max(1, columnCount));
  const rowHeight = 148;

  const rowVirtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => parentRef.current,
    estimateSize: useCallback(() => rowHeight, [rowHeight]),
    overscan: 6,
  });

  const virtualRows = rowVirtualizer.getVirtualItems();

  const handleKey = useCallback(
    (e: React.KeyboardEvent, rec: ImageRecord, index: number) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (onOpen) onOpen(rec);
        else onSelect(rec);
        return;
      }
      if (e.key === ' ' && !e.ctrlKey) {
        e.preventDefault();
        onSelect(rec);
        return;
      }
      const row = Math.floor(index / columnCount);
      const col = index % columnCount;
      let nr = row;
      let nc = col;
      if (e.key === 'ArrowRight') nc = col + 1;
      if (e.key === 'ArrowLeft') nc = col - 1;
      if (e.key === 'ArrowDown') nr = row + 1;
      if (e.key === 'ArrowUp') nr = row - 1;
      if (nc < 0) {
        nc = columnCount - 1;
        nr = row - 1;
      }
      if (nc >= columnCount) {
        nc = 0;
        nr = row + 1;
      }
      if (nr < 0 || nr >= rowCount) return;
      const idx = nr * columnCount + nc;
      const target = itemsRef.current[idx];
      if (!target) return;
      e.preventDefault();
      onSelect(target);
      // Focus row approx
      const vr = rowVirtualizer.getVirtualItems().find((v) => v.index === nr);
      if (!vr) rowVirtualizer.scrollToIndex(nr, { align: 'auto' });
    },
    [columnCount, onOpen, onSelect, rowCount, rowVirtualizer],
  );

  return (
    <div ref={parentRef} style={{ height: '100%', overflow: 'auto' }} role="list">
      <div
        style={{
          height: `${rowVirtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualRows.map((vr) => {
          const start = vr.index * columnCount;
          const end = Math.min(start + columnCount, items.length);
          return (
            <div
              key={vr.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${vr.size}px`,
                transform: `translateY(${vr.start}px)`,
                display: 'grid',
                gridTemplateColumns: `repeat(${columnCount}, 1fr)`,
                gap: 8,
                padding: '4px 4px 0',
              }}
            >
              {Array.from({ length: end - start }).map((_, i) => {
                const rec = items[start + i];
                const index = start + i;
                const url = thumbUrl(rec);
                const selected = selectedId === rec.id;
                return (
                  <div
                    key={rec.id}
                    role="listitem"
                    aria-selected={selected}
                    tabIndex={0}
                    className={selected ? 'cell selected' : 'cell'}
                    onClick={() => onSelect(rec)}
                    onDoubleClick={() => {
                      if (onOpen) onOpen(rec);
                      else onSelect(rec);
                    }}
                    onKeyDown={(e) => handleKey(e, rec, index)}
                  >
                    {url ? (
                      <img src={url} alt={rec.filename} loading="lazy" decoding="async" />
                    ) : (
                      <span className="noimg">no thumbnail</span>
                    )}
                    <span className="cell-name" title={rec.filename}>
                      {rec.filename}
                    </span>
                    {showMeta && (
                      <span className="cell-meta mono small">
                        {rec.match_mode}
                        {rec.score != null ? ` · ${rec.score.toFixed(3)}` : ''}
                      </span>
                    )}
                    {rec.matched_by && rec.matched_by.length > 0 && (
                      <span className="cell-meta">
                        {rec.matched_by.map((m) => (
                          <Badge key={m} tone="info">
                            {m}
                          </Badge>
                        ))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}