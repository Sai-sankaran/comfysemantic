import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { api } from '../../api';
import type { DialogueUnit } from '../../types';
import { useLibrary } from '../../app/providers';
import { fileUrl } from '../../app/format';
import { Badge, Button, Dialog, EmptyState, Input, Select } from '../../components/ui';
import {
  chooseEditorPlacement,
  regionRect,
  type PageRect,
} from './editorPlacement';
import './workbench.css';

/**
 * OCR Workbench
 * =============
 * The previous Dialogue Review screen asked a person to transcribe dialogue
 * from a list. It never showed the page, so the only way to know which balloon
 * "region #2" was was to open the image elsewhere and count. That is the
 * defect this screen exists to remove: the page, the region and the text are
 * now on screen together.
 *
 * What this screen will not do
 * ----------------------------
 * It will not claim a correction is stored until the backend confirms it, and it
 * will not render a colour for a region whose ink could not be measured. Both
 * of those are properties of the v12 contract, verified by
 * `tests/unit/test_ocr_workbench_contract.py` and
 * `tests/unit/test_ocr_workbench_preservation.py`.
 *
 * Two honest limits, stated rather than hidden:
 *
 *  - Grouping controls ("Accept"/"Split"/"Merge") are not exposed here. They
 *    still work through `rpc_dialogue_set_group`, but what "Accept" persists is
 *    not established, so the workbench does not put a button next to a promise
 *    it cannot keep. Grouping remains on the old screen's RPC.
 *  - Character assignment and story notes are deliberately absent. They need a
 *    searchable-field integration that does not exist yet; shipping them read-
 *    only would be worse than not shipping them.
 */

const PAGE = 200;

/**
 * Zoom bounds and step.
 *
 * The step is multiplicative rather than additive: "+0.25" is a different
 * physical amount at 10% and at 800%, and a reviewer zooming into lettering
 * needs each click to feel the same.
 */
const ZOOM_STEP = 1.25;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 8;

/**
 * Editor size used before it has been measured, and as the CSS minimum.
 *
 * 220px is the narrowest box that is comfortable to type a multi-line
 * correction into; the CSS `min-width` keeps it there for longer text, and the
 * measured size replaces this on the first frame.
 */
const NOMINAL_EDITOR_W = 220;
const NOMINAL_EDITOR_H = 96;

/**
 * Largest fraction of the drawn page the editor may occupy on either axis.
 *
 * Below this the editor necessarily overlaps whatever is beside it, which is
 * what turns "edit this balloon" into "cover the page".
 */
const EDITOR_MAX_PAGE_FRACTION = 0.7;

/**
 * Budget for the inspector's region crop.
 *
 * Approximate because the inspector is fluid; the crop box is capped at 100%
 * of its column so a wrong estimate shrinks rather than overflows.
 */
const CROP_BOX_W = 300;
const CROP_BOX_H = 190;

/** Queue filters. Only what the backend can actually answer. */
type QueueFilter = 'unreviewed' | 'all';

interface Toast {
  kind: 'ok' | 'bad';
  text: string;
}

export function DialogueReview() {
  const { libraryId, appSettings, updateAppSetting } = useLibrary();
  const [scope, setScope] = useState<'all' | 'image' | 'panel'>('all');
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('unreviewed');
  const [units, setUnits] = useState<DialogueUnit[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  /** Page currently open on the canvas. */
  const [imageKey, setImageKey] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  /** Draft text per region id. Present only while a region is being edited. */
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /** Region whose overlay is showing the in-place editor. */
  const [editingId, setEditingId] = useState<string | null>(null);

  /**
   * A navigation that was refused because the current region has unsaved text.
   *
   * Rather than threading the guard through every caller, a refused navigation
   * is *recorded* here and replayed once the reviewer chooses Save, Discard or
   * Stay. It is null when the guard is up for another reason - Escape on a dirty
   * draft raises the same question but has no navigation waiting behind it.
   */
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null);

  /**
   * Whether the Save / Discard / Stay bar is showing.
   *
   * Tracked separately from `pendingNav` because "leave this draft alone" is a
   * question in its own right: pressing Escape with unsaved text must ask, not
   * throw the work away. There is no navigation attached to that case, so a
   * truthy `pendingNav` could not express it.
   */
  const [guardOpen, setGuardOpen] = useState(false);

  /**
   * Overlay visibility.
   *
   * A quick control for a durable preference, not a private toggle: it reads
   * the canonical value and writes back to the same store Settings uses, so the
   * two cannot drift. `null` means the settings have not loaded yet, and the
   * documented default is used until they do.
   */
  const showOverlays = appSettings?.ocr_overlays_visible ?? true;
  const setShowOverlays = useCallback(
    (next: boolean) => void updateAppSetting('ocr_overlays_visible', next),
    [updateAppSetting],
  );
  const [zoom, setZoom] = useState<number | 'fit'>('fit');

  /**
   * Canvas offset from centre, in screen pixels.
   *
   * The page is centred by layout and panned by translating it from there, so a
   * pan of (0, 0) always means "fitted and centred" and the Fit control is just
   * a reset. Keeping this separate from the page's own size means the two never
   * fight: resizing the stage re-fits, it does not silently discard a pan.
   */
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const [restoreOpen, setRestoreOpen] = useState(false);
  const [queueOpen, setQueueOpen] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(true);

  const stageRef = useRef<HTMLDivElement>(null);

  /** Drag state for pan-to-move; held in a ref so moves do not re-render. */
  const dragRef = useRef<{ pointerId: number; x: number; y: number; panX: number; panY: number } | null>(
    null,
  );

  /**
   * Whether a drag is in progress, for the cursor.
   *
   * State rather than a read of `dragRef` during render: a ref is not
   * observable, so reading it while rendering would show the wrong cursor on
   * exactly the frame the drag starts. Only two renders are involved - the
   * press and the release.
   */
  const [panning, setPanning] = useState(false);

  const flash = useCallback((t: Toast) => {
    setToast(t);
    window.setTimeout(() => setToast((c) => (c === t ? null : c)), 3200);
  }, []);

  const load = useCallback(async () => {
    if (!libraryId) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await api.dialogueList({
        libraryId,
        scope: scope === 'all' ? undefined : scope,
        reviewed: queueFilter === 'unreviewed' ? false : undefined,
        limit: PAGE,
      });
      setUnits(res.units);
      setTotal(res.total);
      // A filter change can remove the page that was open; falling back to the
      // first available page is less confusing than an empty canvas.
      setImageKey((current) => {
        if (current && res.units.some((u) => pageKey(u) === current)) return current;
        return res.units.length ? pageKey(res.units[0]) : null;
      });
    } catch (e) {
      setErr(String(e));
    } finally {
      setLoading(false);
    }
  }, [libraryId, scope, queueFilter]);

  useEffect(() => {
    // Load on mount and whenever the scope or queue filter changes. This is a
    // genuine external-system synchronisation - the catalog is not derivable
    // from anything already in props - and matches the same pattern in the
    // library, inspector and viewer screens.
    // oxlint-disable-next-line react/set-state-in-effect
    void load();
  }, [load]);

  // ------------------------------------------------------------- derived ---

  /** Pages, in queue order, with a one-line reason for each. */
  const pages = useMemo(() => {
    const map = new Map<string, DialogueUnit[]>();
    for (const u of units) {
      const k = pageKey(u);
      const list = map.get(k);
      if (list) list.push(u);
      else map.set(k, [u]);
    }
    return [...map.entries()].map(([key, regions]) => ({
      key,
      regions: [...regions].sort((a, b) => a.unit_index - b.unit_index),
    }));
  }, [units]);

  const regions = useMemo(
    () => pages.find((p) => p.key === imageKey)?.regions ?? [],
    [pages, imageKey],
  );

  const selected = useMemo(
    () => regions.find((r) => r.id === selectedId) ?? null,
    [regions, selectedId],
  );

  /** A region is dirty only when its draft differs from the stored value. */
  const dirty = useMemo(() => {
    if (selected == null || draft == null) return false;
    return draft !== (selected.text ?? '');
  }, [selected, draft]);

  const selectedIndex = selected ? regions.findIndex((r) => r.id === selected.id) : -1;

  /**
   * The page currently drawn, and the scale that fits it in the stage.
   *
   * Measured once, here, and passed down. The zoom controls need the fitted
   * scale to convert a pointer position into page coordinates, and the canvas
   * needs the same number to size the page box; two independent measurements of
   * one element would be two chances to disagree by a frame.
   */
  const current = regions[0] ?? null;
  const naturalW = current?.parent_width ?? 0;
  const naturalH = current?.parent_height ?? 0;
  const fit = useFitScale(stageRef, naturalW, naturalH);
  const currentPage = useMemo(
    () => ({ naturalW, naturalH, fit }),
    [naturalW, naturalH, fit],
  );

  /**
   * Effective scale: screen pixels per page pixel.
   *
   * `fit` is 0 until the stage has been measured, and the canvas falls back to
   * a CSS aspect ratio for that first frame, so the percentage shown to the user
   * is clamped to something meaningful rather than reading "0%".
   */
  const effectiveFactor = zoom === 'fit' ? (fit > 0 ? fit : 1) : zoom;

  /** Panning belongs to a page; a new page starts from the centre. */
  useEffect(() => {
    // Genuine synchronisation with an external change: the page shown is not
    // derivable from state, it arrives from a click or the arrow keys, and a
    // carried-over pan would drop the reviewer into the middle of a page they
    // have not seen.
    // oxlint-disable-next-line react/set-state-in-effect
    setPan({ x: 0, y: 0 });
  }, [imageKey]);

  /**
   * Change zoom, optionally keeping the page point under `anchor` still.
   *
   * With an anchor (a wheel zoom, or a zoom button pressed while the pointer is
   * over the canvas) the page pixel under the pointer is preserved, which is what
   * makes repeated zooming feel like moving the page rather than the page
   * sliding out from under the cursor. Without one the view recentres, which is
   * the predictable behaviour for a toolbar button and the only sensible one
   * when the pointer is somewhere else entirely.
   */
  const applyZoom = useCallback(
    (next: number | 'fit', anchor?: { x: number; y: number }) => {
      const recentre = () => {
        setZoom(next);
        setPan({ x: 0, y: 0 });
      };
      const stage = stageRef.current;
      if (!stage || anchor === undefined || currentPage.naturalW <= 0) {
        recentre();
        return;
      }
      const rect = stage.getBoundingClientRect();
      const before = zoom === 'fit' ? currentPage.fit : zoom;
      const after = next === 'fit' ? currentPage.fit : next;
      if (!(before > 0) || !(after > 0)) {
        recentre();
        return;
      }
      // Page-space coordinate currently under the pointer.
      const mx = anchor.x - rect.left;
      const my = anchor.y - rect.top;
      const centredX = (rect.width - currentPage.naturalW * before) / 2;
      const centredY = (rect.height - currentPage.naturalH * before) / 2;
      const ux = (mx - centredX - pan.x) / before;
      const uy = (my - centredY - pan.y) / before;
      // Keep that same page point under the same screen point at the new scale.
      const nextCentredX = (rect.width - currentPage.naturalW * after) / 2;
      const nextCentredY = (rect.height - currentPage.naturalH * after) / 2;
      setZoom(next);
      setPan({
        x: mx - nextCentredX - ux * after,
        y: my - nextCentredY - uy * after,
      });
    },
    [zoom, pan, currentPage],
  );

  /** Zoom in/out by a fixed step, centred on the pointer when it is given. */
  const stepZoom = useCallback(
    (direction: 1 | -1, anchor?: { x: number; y: number }) => {
      // Stepping away from "fit" starts at actual size, which is the scale a
      // reviewer means by "bigger", and avoids a first click that barely moves.
      const base = zoom === 'fit' ? 1 : zoom;
      const next = direction === 1 ? base * ZOOM_STEP : base / ZOOM_STEP;
      applyZoom(Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, next)), anchor);
    },
    [zoom, applyZoom],
  );

  /**
   * Drag the page with the pointer.
   *
   * A drag only starts on empty canvas. Pressing on an overlay or the editor is
   * a click on that region, not an attempt to pan - conflating the two is how a
   * canvas ends up selecting things the reviewer was trying to drag past.
   */
  const onStagePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.wb-region, .wb-region-editor')) return;
    dragRef.current = {
      pointerId: e.pointerId,
      x: e.clientX,
      y: e.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    // Capture keeps the drag alive when the pointer leaves the stage. It is
    // optional in older engines and absent in jsdom, so it is feature-detected
    // rather than assumed.
    e.currentTarget.setPointerCapture?.(e.pointerId);
    setPanning(true);
  }, [pan.x, pan.y]);

  const onStagePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    setPan({ x: d.panX + (e.clientX - d.x), y: d.panY + (e.clientY - d.y) });
  }, []);

  const endStageDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    setPanning(false);
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  }, []);

  /**
   * Wheel over the canvas: pan, or zoom around the pointer with Ctrl.
   *
   * Plain wheel pans because the page is larger than the stage far more often
   * than it is smaller, and a page that scrolls away under a reviewer mid-
   * sentence is worse than one that does not respond. Ctrl+wheel is the
   * convention every image tool uses for zoom.
   */
  const onStageWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        stepZoom(e.deltaY < 0 ? 1 : -1, { x: e.clientX, y: e.clientY });
        return;
      }
      const stage = stageRef.current;
      if (!stage) return;
      // Only take over the wheel when the page genuinely extends past the stage;
      // otherwise let the event through so the page itself can still scroll.
      const rect = stage.getBoundingClientRect();
      const overflows =
        naturalW * effectiveFactor > rect.width ||
        naturalH * effectiveFactor > rect.height;
      if (!overflows) return;
      e.preventDefault();
      setPan((p) => ({ x: p.x - e.deltaX, y: p.y - e.deltaY }));
    },
    [stepZoom, naturalW, naturalH, effectiveFactor],
  );

  // -------------------------------------------------------------- actions ---

  const selectRegion = useCallback(
    (id: string) => {
      // Switching away from a dirty draft is a navigation like any other, so it
      // goes through the same guard.
      if (dirty) {
        setPendingNav(() => () => {
          setSelectedId(id);
          setDraft(null);
          setEditingId(null);
        });
        setGuardOpen(true);
        return;
      }
      setSelectedId(id);
      setDraft(null);
      setEditingId(null);
    },
    [dirty],
  );

  /**
   * Ask about the pending draft without navigating anywhere.
   *
   * Escape means "I am done with this balloon", which is exactly when losing the
   * text would hurt most. On a clean draft it just leaves edit mode; on a dirty
   * one it raises the same Save / Discard / Stay question a navigation would.
   */
  const requestLeaveEdit = useCallback(() => {
    if (dirty) {
      setPendingNav(null);
      setGuardOpen(true);
      return;
    }
    setDraft(null);
    setEditingId(null);
  }, [dirty]);

  const step = useCallback(
    (delta: number) => {
      if (!regions.length) return;
      // With nothing selected, "next" means the first region and "previous"
      // means the last - the conventional reading. Treating "no selection" as
      // index 0 instead made the first press of ArrowRight jump to region 2,
      // silently skipping the first balloon in reading order.
      const next =
        selectedIndex < 0
          ? delta > 0
            ? 0
            : regions.length - 1
          : (selectedIndex + delta + regions.length) % regions.length;
      selectRegion(regions[next].id);
    },
    [regions, selectedIndex, selectRegion],
  );

  const stepPage = useCallback(
    (delta: number) => {
      if (!pages.length) return;
      const base = Math.max(0, pages.findIndex((p) => p.key === imageKey));
      const next = (base + delta + pages.length) % pages.length;
      const go = () => {
        setImageKey(pages[next].key);
        setSelectedId(null);
        setDraft(null);
        setEditingId(null);
      };
      // Same guard as region navigation: a page change must not silently
      // discard a correction in progress.
      if (dirty) {
        setPendingNav(go);
        setGuardOpen(true);
        return;
      }
      go();
    },
    [pages, imageKey, dirty],
  );

  const discardAndGo = useCallback(() => {
    setGuardOpen(false);
    const go = pendingNav;
    setPendingNav(null);
    go?.();
  }, [pendingNav]);

  const stayPut = useCallback(() => {
    setGuardOpen(false);
    setPendingNav(null);
  }, []);

  /** Open the in-place editor on the canvas for a region. */
  const beginEdit = useCallback((id: string) => {
    setSelectedId(id);
    setDraft(null);
    setEditingId(id);
  }, []);

  /**
   * Clicking an overlay selects it *and* opens its editor on the canvas.
   *
   * This is the addendum's central interaction: the user works on the text
   * where it appears, rather than selecting a row and then editing an unrelated
   * form elsewhere. Keyboard region/step navigation deliberately does NOT open
   * the editor - that is navigation, not an edit.
   */
  const activateRegion = useCallback(
    (id: string) => {
      if (dirty && id !== selectedId) {
        setPendingNav(() => () => {
          setSelectedId(id);
          setDraft(null);
          setEditingId(id);
        });
        setGuardOpen(true);
        return;
      }
      beginEdit(id);
    },
    [dirty, selectedId, beginEdit],
  );

  const saveText = useCallback(async () => {
    if (!libraryId || !selected || draft == null || !dirty) return;
    setSaving(true);
    try {
      await api.dialogueSetText({
        libraryId,
        unitId: selected.id,
        text: draft,
      });
      // Re-read rather than patching locally: the saved row now has a
      // `machine_text` the client has never seen, and the effective ink is
      // derived server-side.
      await load();
      setDraft(null);
      setEditingId(null);
      setGuardOpen(false);
      flash({ kind: 'ok', text: 'Correction saved. It is kept across reprocessing.' });
      // Only now, with the text safely stored, is the held navigation safe to
      // perform. Doing this before the await would navigate away from an edit
      // that had not been committed.
      const go = pendingNav;
      setPendingNav(null);
      go?.();
    } catch (e) {
      // The draft stays exactly as typed so the reviewer can retry, and neither
      // the held navigation nor the guard is released - the reviewer's unsaved
      // text is still the thing on screen.
      setGuardOpen(true);
      flash({ kind: 'bad', text: String(e) });
    } finally {
      setSaving(false);
    }
  }, [libraryId, selected, draft, dirty, load, flash, pendingNav]);

  const act = useCallback(
    async (fn: () => Promise<unknown>, okText: string) => {
      try {
        await fn();
        await load();
        flash({ kind: 'ok', text: okText });
      } catch (e) {
        flash({ kind: 'bad', text: String(e) });
      }
    },
    [load, flash],
  );

  // ------------------------------------------------------------- keyboard ---

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // Never steal keys from a field the user is typing in.
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) {
        // Ctrl+Enter commits from inside the editor, which is where the
        // reviewer's hands are. Every other key is left alone so normal typing -
        // including Enter for a new line - is never intercepted.
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          if (dirty && !saving) void saveText();
          return;
        }
        if (e.key === 'Escape') {
          // Escape leaves edit mode, but it must never be the thing that throws
          // away unsaved text. On a clean draft it simply closes; on a dirty one
          // it raises Save / Discard / Stay, exactly as navigating away would.
          // Pressing it again with the guard up is how a reviewer backs out of
          // the guard without choosing.
          e.preventDefault();
          if (guardOpen) {
            setGuardOpen(false);
            setPendingNav(null);
          } else {
            requestLeaveEdit();
          }
        }
        return;
      }
      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          step(1);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          step(-1);
          break;
        case 'Escape':
          e.preventDefault();
          requestLeaveEdit();
          break;
        case 'r':
        case 'R':
          if (!libraryId || !selected) return;
          e.preventDefault();
          void act(
            () =>
              api.dialogueSetReviewed({
                libraryId,
                unitId: selected.id,
                reviewed: !selected.reviewed,
              }),
            selected.reviewed ? 'Marked as not reviewed.' : 'Marked as reviewed.',
          );
          break;
        case 'h':
        case 'H':
          e.preventDefault();
          setShowOverlays(!showOverlays);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, dirty, libraryId, selected, act, saveText, saving, showOverlays,
      setShowOverlays, guardOpen, requestLeaveEdit]);

  // Warn before a window close throws away an unsaved correction.
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  // --------------------------------------------------------------- render ---

  if (!libraryId) {
    return (
      <main className="main">
        <EmptyState title="Select a library first." />
      </main>
    );
  }

  return (
    <main className="main" style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div className="wb-toolbar">
        <label className="inline">
          Scope:
          <Select
            value={scope}
            onChange={(e) => {
              setScope(e.target.value as 'all' | 'image' | 'panel');
              setSelectedId(null);
              setDraft(null);
            }}
          >
            <option value="all">Pages and panels</option>
            <option value="image">Pages only</option>
            <option value="panel">Panels only</option>
          </Select>
        </label>

        <label className="inline">
          Queue:
          <Select
            value={queueFilter}
            onChange={(e) => setQueueFilter(e.target.value as QueueFilter)}
          >
            <option value="unreviewed">Needs review</option>
            <option value="all">Everything</option>
          </Select>
        </label>

        <Button variant="secondary" onClick={() => setQueueOpen((v) => !v)}>
          {queueOpen ? 'Hide queue' : 'Queue'}
        </Button>

        <Button
          variant="secondary"
          onClick={() => setInspectorOpen((v) => !v)}
          aria-pressed={inspectorOpen}
        >
          {inspectorOpen ? 'Hide details' : 'Show details'}
        </Button>

        <span className="wb-toolbar-spacer" />

        <Button
          variant="secondary"
          onClick={() => applyZoom('fit')}
          disabled={zoom === 'fit' && pan.x === 0 && pan.y === 0}
        >
          Fit
        </Button>
        <Button
          variant="secondary"
          onClick={() => applyZoom(1)}
          disabled={zoom === 1 && pan.x === 0 && pan.y === 0}
          title="Actual size"
        >
          100%
        </Button>
        <Button
          variant="secondary"
          onClick={() => stepZoom(-1)}
          disabled={effectiveFactor <= MIN_ZOOM + 1e-6}
          aria-label="Zoom out"
        >
          −
        </Button>
        {/*
          The level is shown as a number rather than a word because "fit" and
          "37%" answer different questions: one says the page has been chosen
          automatically, the other says how big the lettering actually is.
        */}
        <span className="wb-zoom-level" role="status" aria-label="Zoom level">
          {Math.round(effectiveFactor * 100)}%
        </span>
        <Button
          variant="secondary"
          onClick={() => stepZoom(1)}
          disabled={effectiveFactor >= MAX_ZOOM - 1e-6}
          aria-label="Zoom in"
        >
          +
        </Button>
        <Button
          variant="secondary"
          onClick={() => setShowOverlays(!showOverlays)}
          aria-pressed={showOverlays}
        >
          Overlays {showOverlays ? 'on' : 'off'}
        </Button>
        <Button variant="secondary" onClick={() => void load()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </div>

      {/* Banners reserve a stable space so the stage never shrinks unexpectedly. */}
      <div className="wb-banners" aria-live="polite">
        {err && <p className="notice bad">{err}</p>}
        {toast && (
          <p className={`notice wb-notice ${toast.kind === 'bad' ? 'bad' : ''}`} role="status">
            {toast.text}
          </p>
        )}
      </div>

      {!current ? (
        <EmptyState
          title={
            queueFilter === 'unreviewed'
              ? 'Nothing left to review'
              : 'No dialogue regions recorded'
          }
          body={
            queueFilter === 'unreviewed'
              ? 'Every region in this scope has been marked reviewed. Switch the queue to “Everything” to see them.'
              : 'Run indexing with a comic or comic+panels preset and the Dialogue regions stage first.'
          }
        />
      ) : (
        <div
          className="wb"
          data-queue-open={queueOpen}
          data-inspector-open={inspectorOpen}
        >
          {/* ------------------------------------------------------- queue -- */}
          <aside className="wb-queue" aria-label="Review queue">
            <div className="wb-queue-head">
              <strong className="wb-insp-title">Queue</strong>
              <span className="hint">
                {total} region{total === 1 ? '' : 's'} in {pages.length} page
                {pages.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="wb-queue-list">
              {pages.map((p) => {
                const done = p.regions.every((r) => r.reviewed);
                const low = p.regions.some((r) => r.ocr_status === 'error');
                const unread = p.regions.some((r) => r.text_source === 'none');
                return (
                  <button
                    key={p.key}
                    type="button"
                    className="wb-queue-item"
                    aria-current={p.key === imageKey}
                    onClick={() => {
                      setImageKey(p.key);
                      setSelectedId(null);
                      setDraft(null);
                    }}
                  >
                    <span className="wb-queue-name">{p.regions[0].parent_filename ?? p.key}</span>
                    <span className="wb-queue-reason">
                      {p.regions.length} region{p.regions.length === 1 ? '' : 's'}
                      {low ? ' · OCR failed' : unread ? ' · not read' : ''}
                      {done && <span className="wb-queue-done"> · reviewed</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* ----------------------------------------------------- canvas -- */}
          <section className="wb-canvas" aria-label="Page">
            <div className="wb-toolbar">
              <span className="wb-insp-title">
                {current.parent_filename ?? 'Page'}
              </span>
              <span className="hint">
                {selectedIndex >= 0
                  ? `Region ${selectedIndex + 1} of ${regions.length}`
                  : `${regions.length} region${regions.length === 1 ? '' : 's'} — select one`}
              </span>
              <span className="wb-toolbar-spacer" />
              <Button variant="secondary" onClick={() => step(-1)} disabled={!regions.length}>
                ◀ Region
              </Button>
              <Button variant="secondary" onClick={() => step(1)} disabled={!regions.length}>
                Region ▶
              </Button>
              <Button variant="secondary" onClick={() => stepPage(-1)}>
                ◀ Page
              </Button>
              <Button variant="secondary" onClick={() => stepPage(1)}>
                Page ▶
              </Button>
            </div>

            <div
              className="wb-stage"
              ref={stageRef}
              data-panning={panning || undefined}
              onPointerDown={onStagePointerDown}
              onPointerMove={onStagePointerMove}
              onPointerUp={endStageDrag}
              onPointerCancel={endStageDrag}
              onWheel={onStageWheel}
            >
              <PageCanvas
                unit={current}
                regions={regions}
                selectedId={selectedId}
                showOverlays={showOverlays}
                zoom={zoom}
                fit={fit}
                pan={pan}
                editingId={editingId}
                draft={draft}
                dirty={dirty}
                saving={saving}
                onSelect={activateRegion}
                onDraft={(v) => setDraft(v)}
                onCommit={() => void saveText()}
                onCancelEdit={() => {
                  // Cancel is an explicit, labelled choice to throw the draft
                  // away, so it is not routed through the guard. Escape is
                  // reflexive and does ask; a button the reviewer deliberately
                  // pressed should not make them confirm a second time.
                  setDraft(null);
                  setEditingId(null);
                  setGuardOpen(false);
                  setPendingNav(null);
                }}
              />
            </div>

            {/* Save / Discard / Stay. Shown instead of navigating away. */}
            {guardOpen && (
              <div className="wb-guard" role="alertdialog"
                   aria-label="Unsaved changes">
                <span>
                  Unsaved changes in region {selectedIndex + 1}
                  {editingId ? '' : ' on this page'}. Save them, or discard them?
                </span>
                <span className="wb-toolbar-spacer" />
                <Button onClick={() => void saveText()} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
                <Button variant="secondary" onClick={discardAndGo}>
                  Discard
                </Button>
                <Button variant="secondary" onClick={stayPut}>
                  Stay
                </Button>
              </div>
            )}

            <div className="wb-page-footer">
              <span>
                {current.parent_width && current.parent_height
                  ? `${current.parent_width}×${current.parent_height} px`
                  : 'Page size unknown'}
              </span>
              <span>·</span>
              <span>
                Region coordinates are in page pixels; the overlay is scaled to
                whatever size the page is drawn at.
              </span>
              <span className="wb-toolbar-spacer" />
              {/*
                These hints describe what the keys do *now*. While the editor has
                focus, ← and → move the caret and Escape asks about unsaved text,
                and a hint that says otherwise sends the reviewer looking for
                navigation that is not happening.
              */}
              <span>
                {editingId
                  ? 'Editing: ←/→ move the caret · Ctrl+Enter saves · Esc asks before discarding'
                  : '←/→ region · R reviewed · H overlays · drag to pan · Ctrl+wheel zoom'}
              </span>
            </div>
          </section>

          {/* --------------------------------------------------- inspector -- */}
          <aside className="wb-inspector" aria-label="Region inspector">
            {selected == null ? (
              <EmptyState
                title="Select a region"
                body="Click a box on the page, or use ← and →."
              />
            ) : (
              <>
                <div className="wb-insp-head">
                  <span className="wb-insp-title">
                    Region {selectedIndex + 1} of {regions.length}
                  </span>
                  <Button
                    variant="secondary"
                    onClick={() =>
                      libraryId &&
                      void act(
                        () =>
                          api.dialogueSetReviewed({
                            libraryId,
                            unitId: selected.id,
                            reviewed: !selected.reviewed,
                          }),
                        selected.reviewed ? 'Marked as not reviewed.' : 'Marked as reviewed.',
                      )
                    }
                  >
                    {selected.reviewed ? 'Reviewed ✓' : 'Mark reviewed'}
                  </Button>
                </div>

                {selected.reattachment && (
                  <div className="wb-insp-section wb-reattach" role="status">
                    <Badge tone="warn">
                      {selected.reattachment === 'ambiguous'
                        ? 'Needs reattaching'
                        : 'Region no longer detected'}
                    </Badge>
                    <p className="hint">
                      {selected.reattachment === 'ambiguous'
                        ? 'A re-index found more than one region this could belong to, so nothing was changed automatically. Check that this correction still matches the balloon underneath, then mark it reviewed.'
                        : 'A re-index no longer finds a region at this position, so your correction was kept exactly as it was rather than being moved or deleted. Check it against the page.'}
                    </p>
                  </div>
                )}

                <CropPreview unit={selected} />

                {/*
                  The canvas is the single editing surface.

                  There used to be a second textarea here. With the addendum's
                  in-place editor there would be two fields bound to one draft,
                  and two sources of truth for the same pending edit - which is
                  how a correction silently diverges between the two. The
                  inspector shows the effective text and points at the canvas.
                */}
                <div className="wb-insp-section">
                  <span className="wb-label">Dialogue text</span>
                  <p className="wb-effective" data-dirty={dirty || undefined}>
                    {(draft ?? selected.text ?? '').trim() || '—'}
                  </p>
                  <span id="wb-text-state" className="hint">
                    <ProvenanceBadge unit={selected} />
                    {dirty ? ' · edited, not saved' : ''}
                  </span>

                  {editingId === selected.id ? (
                    <p className="hint">
                      Editing on the canvas — use the controls under the region,
                      or Ctrl+Enter to save.
                    </p>
                  ) : (
                    <div className="wb-row wb-row-end">
                      <Button variant="secondary" onClick={() => beginEdit(selected.id)}>
                        Edit on canvas
                      </Button>
                    </div>
                  )}
                </div>

                <MachineReadout unit={selected} onRestore={() => setRestoreOpen(true)} />

                <InkSection unit={selected} libraryId={libraryId} onDone={act} />

                <div className="wb-insp-section">
                  <span className="wb-label">Details</span>
                  <dl className="wb-kv">
                    <dt>Reading order</dt>
                    <dd>{selected.unit_index}</dd>
                    <dt>Status</dt>
                    <dd>{statusLabel(selected)}</dd>
                    <dt>OCR</dt>
                    <dd>
                      {selected.ocr_status}
                      {selected.ocr_engine && selected.ocr_engine !== 'none'
                        ? ` · ${selected.ocr_engine}`
                        : ''}
                    </dd>
                    <dt>Position</dt>
                    <dd className="mono">
                      {selected.x ?? '—'}, {selected.y ?? '—'} · {selected.width ?? '—'}×
                      {selected.height ?? '—'}
                    </dd>
                  </dl>
                </div>
              </>
            )}
          </aside>
        </div>
      )}

      <Dialog
        open={restoreOpen}
        onClose={() => setRestoreOpen(false)}
        title="Replace the manual correction?"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRestoreOpen(false)}>
              Keep my correction
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                setRestoreOpen(false);
                if (!libraryId || !selected) return;
                void act(
                  () =>
                    api.dialogueSetText({
                      libraryId,
                      unitId: selected.id,
                      text: selected.machine_text ?? '',
                    }),
                  'Restored to the machine transcription.',
                );
              }}
            >
              Replace it
            </Button>
          </>
        }
      >
        <p>
          This region carries a manual correction. Restoring replaces it with the
          machine transcription “{selected?.machine_text || '(nothing was read)'}”, and
          the correction is removed.
        </p>
      </Dialog>
    </main>
  );
}

// ============================================================== canvas =====

/**
 * The page, drawn to fit with coordinate-correct region overlays.
 *
 * The image box is sized by `aspect-ratio` from the stored page dimensions and
 * each region is placed as a percentage of that box. Percentages are used
 * deliberately: they are independent of the rendered pixel size, so a resize, a
 * zoom change or a font-scale difference cannot move an overlay off its region.
 */
function PageCanvas({
  unit,
  regions,
  selectedId,
  editingId,
  draft,
  dirty,
  saving,
  showOverlays,
  zoom,
  fit,
  pan,
  onSelect,
  onDraft,
  onCommit,
  onCancelEdit,
}: {
  unit: DialogueUnit;
  regions: DialogueUnit[];
  selectedId: string | null;
  editingId: string | null;
  draft: string | null;
  dirty: boolean;
  saving: boolean;
  showOverlays: boolean;
  zoom: number | 'fit';
  /** Scale that fits the page in the stage, measured by the parent. */
  fit: number;
  /** Canvas offset from centre, in screen pixels. */
  pan: { x: number; y: number };
  onSelect: (id: string) => void;
  onDraft: (v: string) => void;
  onCommit: () => void;
  onCancelEdit: () => void;
}) {
  const src = fileUrl(unit.parent_path);
  const naturalW = unit.parent_width ?? 0;
  const naturalH = unit.parent_height ?? 0;

  // The page is sized in pixels from the measured stage rather than left to
  // `aspect-ratio` + `object-fit`. With CSS fitting alone the browser can clamp
  // one axis without recomputing the other, which letterboxes the image inside
  // its box and shifts every percentage-positioned overlay off its region.
  const factor = zoom === 'fit' ? (fit > 0 ? fit : 1) : zoom;

  // ------------------------------------------------------------- editor ---
  const editorRef = useRef<HTMLDivElement>(null);
  const [editorSize, setEditorSize] = useState({ w: 0, h: 0 });

  /**
   * Measure the editor once it is on screen.
   *
   * Placement needs to know how big the editor is before it is positioned, and
   * its height depends on the text in it. jsdom reports zero for every rect, so
   * a zero measurement is treated as "not measured yet" and the nominal size is
   * used instead of dividing by it.
   */
  // oxlint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) {
      setEditorSize((prev) =>
        Math.abs(prev.w - r.width) < 0.5 && Math.abs(prev.h - r.height) < 0.5
          ? prev
          : { w: r.width, h: r.height },
      );
    }
    // Deliberately no dependency list: this measures after every render because
    // the editor's height depends on the text in it, which changes as the
    // reviewer types. The guard above returns the previous state unchanged when
    // the size has not moved, so re-running cannot loop.
  });

  const editing = editingId ? regions.find((r) => r.id === editingId) ?? null : null;

  const placement = useMemo(() => {
    if (!editing || naturalW <= 0 || naturalH <= 0 || factor <= 0) return null;
    const rect = regionRect(editing);
    if (!rect) return null;
    // The editor is sized in screen pixels so it stays typeable at every zoom,
    // but positioned in page units so it stays glued to the region. Converting
    // between them is the single division by the scale, done once here.
    //
    // It is also capped against the page. A page drawn small at "fit" can be
    // narrower on screen than the editor's nominal width, and an editor wider
    // than the image it annotates covers everything - there is no direction left
    // to choose. Capping keeps the placement meaningful at every zoom, at the
    // cost of a narrower box when the reviewer is zoomed out; zooming in is how
    // you get a comfortable one back.
    const maxW = naturalW * factor * EDITOR_MAX_PAGE_FRACTION;
    const maxH = naturalH * factor * EDITOR_MAX_PAGE_FRACTION;
    const screenW = Math.min(
      editorSize.w > 0 ? editorSize.w : NOMINAL_EDITOR_W, maxW);
    const screenH = Math.min(
      editorSize.h > 0 ? editorSize.h : NOMINAL_EDITOR_H, maxH);
    const editor = { w: screenW / factor, h: screenH / factor };
    const others = regions
      .filter((r) => r.id !== editing.id)
      .map(regionRect)
      .filter((r): r is PageRect => r !== null);
    return chooseEditorPlacement({
      region: rect,
      editor,
      others,
      page: { w: naturalW, h: naturalH },
      // A 6px visual gap, expressed in page units so it stays 6px at any zoom.
      gap: 6 / factor,
    });
  }, [editing, editorSize, factor, naturalW, naturalH, regions]);

  useEffect(() => {
    if (editorRef.current && editing) {
      // Keep the editor visible inside the stage when it opens or updates.
      editorRef.current.scrollIntoView({ behavior: 'instant', block: 'nearest' });
    }
  }, [editing, placement]);

  return (
    <div
      className="wb-page"
      data-overlays={showOverlays ? 'on' : 'off'}
      style={{
        // Once measured, both axes are explicit so the box ratio is identical to
        // the page ratio and the <img> fills it exactly. Before that, fall back
        // to a CSS aspect ratio rather than guessing a size.
        ...(fit > 0 && naturalW > 0 && naturalH > 0
          ? { width: `${Math.round(naturalW * factor)}px`, height: `${Math.round(naturalH * factor)}px` }
          : { width: '100%', aspectRatio: naturalW > 0 && naturalH > 0 ? `${naturalW} / ${naturalH}` : undefined }),
        // Panning offsets the already-sized box rather than transforming it.
        // A transform paints the page somewhere the scroll container knows
        // nothing about, so dragging it could push regions past the edge with no
        // way to scroll back; a relative offset grows the scrollable area with
        // it. It also cannot feed back into the fit measurement.
        ...(pan.x !== 0 || pan.y !== 0 ? { left: `${pan.x}px`, top: `${pan.y}px` } : {}),
      }}
    >
      {src ? (
        <img src={src} alt={unit.parent_filename ?? 'Page'} draggable={false} />
      ) : (
        <p className="empty">
          The page file could not be located, so its regions cannot be drawn over
          it. The region coordinates listed in the inspector are still correct.
        </p>
      )}
      {regions.map((r, i) => {
        const rect = regionRect(r);
        if (!rect || naturalW <= 0 || naturalH <= 0) return null;
        const box = {
          left: `${(rect.x / naturalW) * 100}%`,
          top: `${(rect.y / naturalH) * 100}%`,
          width: `${(rect.w / naturalW) * 100}%`,
          height: `${(rect.h / naturalH) * 100}%`,
        };

        return (
          <button
            key={r.id}
            type="button"
            className="wb-region"
            data-selected={r.id === selectedId}
            data-editing={r.id === editingId || undefined}
            data-source={r.text_source}
            data-tag-inside={r.y! < 20}
            style={box}
            onClick={() => onSelect(r.id)}
            aria-label={`Region ${i + 1}: ${describe(r)}`}
          >
            <span className="wb-region-tag" aria-hidden="true">
              {i + 1}
            </span>
            {/*
              The recognised text, drawn where it occurs. The addendum's central
              requirement: a reviewer must see which words belong to which part
              of the page without consulting a separate list.
            */}
            <span className="wb-region-text" aria-hidden="true">
              {overlayText(r)}
            </span>
            {r.text_source === 'manual' && (
              <span className="wb-region-badge" title="Saved manual correction">
                manual
              </span>
            )}
          </button>
        );
      })}

      {/*
        The editor is a separate layer rather than a replacement for the region
        it edits.

        Two things fall out of that. The region being edited stays visible and
        highlighted, so on a dense page - where the editor has to cover
        something - it is never ambiguous which balloon the text belongs to. And
        the editor can be positioned anywhere relative to the region instead of
        only on top of it, which is what stops it swallowing its neighbours'
        clicks.
      */}
      {editing && placement && (
        <div
          ref={editorRef}
          className="wb-region-editor"
          data-placement={placement.placement}
          data-collision={placement.fallback || undefined}
          style={{
            left: `${(placement.rect.x / naturalW) * 100}%`,
            top: `${(placement.rect.y / naturalH) * 100}%`,
            width: `${Math.round(placement.rect.w * factor)}px`,
          }}
          role="group"
          aria-label={`Editing region ${regions.indexOf(editing) + 1}: ${describe(editing)}`}
        >
          {/*
            On a page dense enough that no placement is clear, this says which
            region is being edited on the editor itself. Without it the reviewer
            can be typing into a balloon that is partly under the editor and
            have no way to tell.
          */}
          <span className="wb-editor-head">
            Editing region {regions.indexOf(editing) + 1} of {regions.length}
          </span>
          <textarea
            className="wb-region-input"
            value={draft ?? editing.text ?? ''}
            onChange={(e) => onDraft(e.target.value)}
            aria-label={`Edit text for region ${regions.indexOf(editing) + 1}`}
            autoFocus
            rows={3}
          />
          <div className="wb-region-actions">
            <Button onClick={onCommit} disabled={!dirty || saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="secondary" onClick={onCancelEdit}>
              Cancel
            </Button>
            <span className="wb-region-hint">
              {dirty ? 'Unsaved — Ctrl+Enter to save' : 'Ctrl+Enter to save'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** What the overlay draws in place of the recognised words. */
function overlayText(r: DialogueUnit): string {
  const t = (r.text ?? '').trim();
  if (t) return t;
  if (r.text_source === 'manual') return 'manual correction, empty';
  if (r.ocr_status === 'error') return 'OCR failed';
  return 'not read';
}

/**
 * Scale that fits a `naturalW`×`naturalH` page inside the stage.
 *
 * Returns 0 until the stage has been measured, so the caller can fall back to
 * a CSS aspect ratio for that first frame rather than guessing a size.
 */
function useFitScale(
  ref: React.RefObject<HTMLDivElement | null>,
  naturalW: number,
  naturalH: number,
): number {
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setBox((prev) =>
        prev && prev.w === r.width && prev.h === r.height
          ? prev
          : { w: r.width, h: r.height },
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
    // The page dimensions are part of the dependency list deliberately: the
    // stage is only rendered once a page is loaded, so on the very first commit
    // this hook runs while the ref is still null. Without re-running when the
    // page appears, the measurement would never be taken and the canvas would
    // sit on its unmeasured fallback forever.
  }, [ref, naturalW, naturalH]);

  if (!box || !naturalW || !naturalH || box.w <= 0 || box.h <= 0) return 0;
  // 32px of padding mirrors `.wb-stage`'s gutter on each axis.
  const availW = Math.max(1, box.w - 32);
  const availH = Math.max(1, box.h - 32);
  return Math.min(availW / naturalW, availH / naturalH);
}

// =========================================================== crop preview ===

/**
 * A magnified crop of the region, drawn from the same source image.
 *
 * Rendered as a scaled image inside an overflow box rather than fetched as a
 * separate crop asset. That is deliberate: the crop cannot drift from the
 * region on the canvas, because it is the same pixels from the same file.
 *
 * The whole region is shown. Scaling by the region's *shorter* side - which is
 * what this used to do - filled the box with a slice of a very wide balloon and
 * cut the rest off, so the preview of a 420x170 region showed the middle of it
 * and looked like the region was clipped. Fitting both sides keeps the preview
 * honest, and for extreme aspect ratios it gets small rather than wrong.
 */
function CropPreview({ unit }: { unit: DialogueUnit }) {
  const src = fileUrl(unit.parent_path);
  const pw = unit.parent_width;
  const ph = unit.parent_height;

  if (!src || !pw || !ph || unit.x == null || unit.y == null ||
      unit.width == null || unit.height == null || unit.width <= 0 || unit.height <= 0) {
    return null;
  }

  // Fit the region inside the box on both axes. The width of the inspector is
  // fluid, so the width budget is an estimate; `max-width: 100%` in the
  // stylesheet keeps a wrong estimate from spilling.
  const scale = Math.min(CROP_BOX_W / unit.width, CROP_BOX_H / unit.height);

  return (
    <div className="wb-insp-section">
      <span className="wb-label">Region</span>
      <div
        className="wb-crop"
        style={{
          width: `${Math.round(unit.width * scale)}px`,
          height: `${Math.max(28, Math.round(unit.height * scale))}px`,
        }}
      >
        <img
          src={src}
          alt=""
          aria-hidden="true"
          style={{
            width: pw * scale,
            height: ph * scale,
            left: -unit.x * scale,
            top: -unit.y * scale,
          }}
        />
      </div>
    </div>
  );
}

// ========================================================== transcription ===

function MachineReadout({ unit, onRestore }: { unit: DialogueUnit; onRestore: () => void }) {
  const isManual = unit.text_source === 'manual';

  // Three genuinely different states, collapsed to one by `?? ''`. Saying "the
  // machine read nothing" when the transcript was simply lost would be a
  // confident claim about data that does not exist, so NULL is rendered as its
  // own thing rather than as empty text.
  const unavailable = unit.machine_text === null;
  const machine = unit.machine_text ?? '';
  const differs = isManual && !unavailable && machine !== (unit.text ?? '');

  return (
    <div className="wb-insp-section">
      <span className="wb-label">Machine transcription</span>
      {unavailable ? (
        <p className="wb-machine">
          <em>
            Unavailable. This region was corrected before the original
            transcription was kept, so it cannot be recovered.
          </em>
        </p>
      ) : (
        <p className="wb-machine">
          {machine || <em>Nothing was read from this region.</em>}
        </p>
      )}
      <div className="wb-row">
        <span className="hint">
          Confidence {Math.round(unit.confidence * 100)}%
        </span>
        <span className="wb-toolbar-spacer" />
        {differs && (
          <Button variant="secondary" onClick={onRestore}>
            Restore machine text
          </Button>
        )}
      </div>
      {isManual && (
        <p className="hint">
          This correction is stored separately from the transcription and is kept
          across reprocessing.
        </p>
      )}
    </div>
  );
}

// =================================================================== ink ====

function InkSection({
  unit,
  libraryId,
  onDone,
}: {
  unit: DialogueUnit;
  libraryId: string;
  /** Re-read the region and report the outcome; never reloads the window. */
  onDone: (fn: () => Promise<unknown>, okText: string) => void;
}) {
  const source = unit.effective_ink_source;
  const rgb = unit.effective_ink_rgb;
  const category = unit.effective_ink_category;
  const unknown = !rgb;
  const low = unit.ink_confidence < 0.55;

  const [hexOverride, setHexOverride] = useState<string | null>(null);
  const saved = unit.ink_user_rgb ?? rgb ?? '#000000';
  // Drop a pending edit when the stored colour changes underneath it (after a
  // save, or when another region is selected). Adjusting during render rather
  // than in an effect avoids painting the stale value for a frame.
  if (hexOverride !== null && hexOverride !== saved) setHexOverride(null);
  const hex = hexOverride ?? saved;

  const pips = Math.max(1, Math.min(4, Math.round(unit.ink_confidence * 4)));

  return (
    <div className="wb-insp-section">
      <span className="wb-label">Lettering ink</span>

      <div className="wb-ink">
        <span
          className="wb-swatch"
          data-unknown={unknown}
          style={unknown ? undefined : { background: rgb! }}
          aria-hidden="true"
        />
        <strong>{unknown ? (category === 'mixed' ? 'Mixed' : 'Unknown') : category}</strong>
        <Badge tone={source === 'machine' ? 'muted' : 'ok'}>
          {source === 'machine' ? 'Estimated' : source === 'approved' ? 'Approved' : 'Manual'}
        </Badge>
      </div>

      {unknown ? (
        <p className="hint">
          {category === 'mixed'
            ? 'Two or more distinct inks are present and were not separated. No colour is shown because none was determined.'
            : 'The ink could not be separated from the lettering, so no colour was measured.'}
        </p>
      ) : (
        <div className="wb-row">
          <span className="mono hint">{rgb}</span>
          <span
            className="wb-reliable"
            title="How reliably the ink was separated from the lettering"
          >
            {'●'.repeat(pips)}
            {'○'.repeat(4 - pips)}
          </span>
          <span className="hint">{low ? 'low reliability' : 'good'}</span>
        </div>
      )}

      {unit.ink_source === 'manual' && unit.ink_rgb && (
        <p className="hint">
          You chose this colour. The measurement it replaced was {unit.ink_rgb}.
        </p>
      )}

      <div className="wb-row">
        <Button
          variant="secondary"
          disabled={unknown}
          title={unknown ? 'There is no measurement to approve.' : undefined}
          onClick={() =>
            onDone(
              () => api.dialogueSetInk({ libraryId, unitId: unit.id, inkAction: 'approve' }),
              'Colour approved. The measurement is unchanged.',
            )
          }
        >
          Approve
        </Button>
        <Input
          value={hex}
          onChange={(e) => setHexOverride(e.target.value)}
          aria-label="Lettering ink colour as hex"
          placeholder="#RRGGBB"
        />
        <Button
          variant="secondary"
          onClick={() =>
            onDone(
              () =>
                api.dialogueSetInk({
                  libraryId,
                  unitId: unit.id,
                  inkAction: 'manual',
                  rgb: hex.trim(),
                }),
              'Colour saved.',
            )
          }
        >
          Set colour
        </Button>
      </div>
      <p className="hint">
        Setting a colour keeps the measurement beside it. Approving is unavailable
        when nothing was reliably measured.
      </p>
    </div>
  );
}

// ================================================================ shared ====

function pageKey(u: DialogueUnit): string {
  return u.source_image_id ?? u.panel_crop_id ?? u.parent_filename ?? u.library_id;
}

function describe(u: DialogueUnit): string {
  const t = (u.text ?? '').trim();
  if (t) return t;
  if (u.text_source === 'manual') return 'manual correction, no text';
  return u.ocr_status === 'error' ? 'OCR failed' : 'no text';
}

function statusLabel(u: DialogueUnit): string {
  if (u.ocr_status === 'error') return 'failed';
  if (u.text_source === 'none' || !u.text) return 'not read';
  return 'read';
}

/** Machine vs manual, stated in words rather than implied by a colour. */
function ProvenanceBadge({ unit }: { unit: DialogueUnit }) {
  if (unit.text_source === 'manual') return <Badge tone="ok">Manual correction</Badge>;
  if (unit.text_source === 'ocr') return <Badge tone="muted">Machine</Badge>;
  return <Badge tone="muted">Nothing read</Badge>;
}