import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Dialog, Input, Textarea } from '../../components/ui';
import { privacyImageStyle, usePrivacy } from '../../app/privacy';
import type {
  ExploreItem,
  ExploreItemDetail,
  ExplorePanelDetail,
  LibraryType,
} from './exploreTypes';

// The section order constants and the autosave delay are exported alongside the
// components so a test can assert the documented values instead of inferring
// them from rendered markup. That costs the React Fast Refresh boundary for
// this file, which is a development-only convenience, not a behaviour.
/* eslint-disable react-refresh/only-export-components -- see above */
/**
 * The Inspector (design §7.2).
 *
 * Its rules are mostly about **absence**. `INS-03` shapes the whole component: a
 * field with no value is hidden, and a section with no visible fields is hidden
 * entirely — only Preview and File are always shown.
 *
 * That rule is enforced by each section returning `null` before rendering when it
 * has nothing to say, rather than by a convention every future section has to
 * remember. A section that renders its own fields conditionally, and returns
 * `null` when the result would be empty, cannot accidentally produce a heading
 * above a list of em dashes.
 *
 * `INS-02` fixes the section order, which differs by library type. Both orders
 * are exported so a test can assert them rather than trusting this file.
 */

/** `INS-02`: the documented section order for each library type. */
export const SECTION_ORDER_COMFYUI = [
  'preview',
  'file',
  'generation',
  'workflow',
  'tags',
  'processing',
] as const;

export const SECTION_ORDER_COMIC = [
  'preview',
  'file',
  'panels',
  'text',
  'tags',
  'processing',
] as const;

export type InspectorActions = {
  onCopy: (text: string, what: string) => void;
  onReveal: (path: string) => void;
  onOpenSourceUrl: (url: string) => void;
  onSearchPrompt: (prompt: string) => void;
  onSaveTags: (itemId: string, tags: string[]) => Promise<void>;
  onSaveRating: (itemId: string, rating: number) => Promise<void>;
  onSaveFavourite: (itemId: string, favourite: boolean) => Promise<void>;
  onSaveNotes: (itemId: string, notes: string) => Promise<void>;
  /** `INS-07`: the JSON is fetched only when the user asks for it. */
  onRequestWorkflow: (itemId: string) => Promise<string | null>;
  /** `INS-09`: a job scoped to this one item and stage; never auto-started. */
  onRetryStage: (itemId: string, stage: string) => void;
  onDecompose: (itemId: string) => void;
  onEditPanels: (itemId: string) => void;
  onEditInReview: (itemId: string) => void;
  onOpenViewer: (item: ExploreItem) => void;
  onOpenParentPage: (pageId: string) => void;
};

/** `INS-08`: notes autosave this long after typing stops. */
export const NOTES_AUTOSAVE_MS = 2000;

export type InspectorProps = {
  detail: ExploreItemDetail | null;
  libraryType: LibraryType;
  item: ExploreItem | null;
  panel: ExplorePanelDetail | null;
  actions: InspectorActions;
  /**
   * Overrides the notes autosave delay.
   *
   * It exists so the test can prove the *rule* (save after typing stops, not
   * during, and not on an unrelated timer) without waiting on a real two-second
   * clock, which is timing-sensitive enough to fail under load while passing
   * alone. Production always uses {@link NOTES_AUTOSAVE_MS}.
   */
  autosaveMs?: number;
};

export function Inspector({ detail, libraryType, item, panel, actions, autosaveMs }: InspectorProps) {
  const comic = libraryType === 'comic';

  if (panel) return <PanelInspector panel={panel} actions={actions} />;
  if (!detail) return <p className="hint">Loading…</p>;

  return (
    <div className="inspector-body">
      <h2 className="inspector-title">{detail.fileName}</h2>
      <PreviewSection detail={detail} item={item} comic={comic} actions={actions} />
      <FileSection detail={detail} comic={comic} actions={actions} />
      {comic ? (
        <>
          <PanelsSection detail={detail} actions={actions} />
          <TextSection detail={detail} actions={actions} />
        </>
      ) : (
        <>
          <GenerationSection detail={detail} actions={actions} />
          <WorkflowSection detail={detail} actions={actions} />
        </>
      )}
      <TagsSection detail={detail} actions={actions} autosaveMs={autosaveMs} />
      <ProcessingSection detail={detail} actions={actions} />
    </div>
  );
}

/**
 * A collapsible section (`INS-02`): a heading with a toggle button whose open
 * state is remembered. Whether it renders at all is the caller's decision — see
 * the note on `INS-03` at the top of this file.
 */
function Section({
  id,
  title,
  defaultOpen = true,
  children,
}: {
  id: string;
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const headingId = useId();
  const bodyId = useId();

  return (
    <section className="inspector-section" aria-labelledby={headingId} data-section={id}>
      <h3 id={headingId}>
        <button
          type="button"
          className="section-toggle"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="section-chevron" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
          {title}
        </button>
      </h3>
      {open ? (
        <div id={bodyId} className="section-body">
          {children}
        </div>
      ) : null}
    </section>
  );
}

/** `INS-04`: preview at inspector width − 32 px, `contain`, click opens the viewer. */
function PreviewSection({
  detail,
  item,
  comic,
  actions,
}: {
  detail: ExploreItemDetail;
  item: ExploreItem | null;
  comic: boolean;
  actions: InspectorActions;
}) {
  const privacy = usePrivacy();
  const [showPanels, setShowPanels] = useState(false);
  const [showText, setShowText] = useState(false);
  // `INS-04`: while the 1280 px preview loads, show the cached thumbnail scaled
  // up with a caption — never a blank box. The flag resets when the item
  // changes, during render rather than in an effect, so the new item never paints
  // with the previous item's "already loaded" state.
  const [previewLoaded, setPreviewLoaded] = useState(false);
  const [loadedFor, setLoadedFor] = useState(detail.itemId);
  if (loadedFor !== detail.itemId) {
    setLoadedFor(detail.itemId);
    setPreviewLoaded(false);
  }

  const previewUrl = item?.previewUrl ?? null;
  const thumbUrl = item?.thumbnailUrl ?? null;

  return (
    <Section id="preview" title="Preview">
      <button
        type="button"
        className="inspector-preview"
        onClick={() => item && actions.onOpenViewer(item)}
        aria-label={`Open ${detail.fileName} in the viewer`}
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={`Preview of ${detail.fileName}`}
            // `PRV-02`: the inspector preview is one of the eleven surfaces.
            style={{
              objectFit: 'contain',
              ...(privacy.isImageMasked(detail.itemId) ? privacyImageStyle(privacy) : {}),
            }}
            className={previewLoaded ? 'loaded' : ''}
            onLoad={() => setPreviewLoaded(true)}
          />
        ) : thumbUrl ? (
          <img src={thumbUrl} alt="" style={{ objectFit: 'contain' }} className="scaled-up" />
        ) : (
          // `STA-12`: the file is missing, so say so rather than showing nothing.
          <span className="hint">File not found: {detail.displayPath}</span>
        )}
        {/* `PRV-06`: one item, for the session, with no hold-to-reveal. */}
        {privacy.isImageMasked(detail.itemId) ? (
          <button
            type="button"
            className="privacy-reveal preview-reveal"
            onClick={() => privacy.reveal(detail.itemId)}
            title="Reveal this item while privacy blur is on"
          >
            Reveal
          </button>
        ) : null}
        {previewUrl && !previewLoaded ? (
          <span className="preview-caption">Loading preview…</span>
        ) : null}
      </button>

      {comic ? (
        // `INS-10`: two preview toggles for a comic page.
        <div className="preview-toggles">
          <Button variant="ghost" onClick={() => setShowPanels((v) => !v)} title="H">
            {showPanels ? 'Hide' : 'Show'} panels
          </Button>
          <Button variant="ghost" onClick={() => setShowText((v) => !v)}>
            {showText ? 'Hide' : 'Show'} text regions
          </Button>
        </div>
      ) : null}
    </Section>
  );
}

/** `INS-05` and `INS-05a`. File is always shown, so it never returns null. */
function FileSection({
  detail,
  comic,
  actions,
}: {
  detail: ExploreItemDetail;
  comic: boolean;
  actions: InspectorActions;
}) {
  return (
    <Section id="file" title="File">
      <dl className="kv inspector-kv">
        <Row label="Name" value={detail.fileName} onCopy={() => actions.onCopy(detail.fileName, 'name')} />
        <Row
          label="Folder"
          value={detail.displayPath}
          onCopy={() => actions.onCopy(detail.displayPath, 'path')}
          onReveal={() => actions.onReveal(detail.displayPath)}
        />
        {/* `INS-03`: a field with no value is hidden, not shown as an em dash. */}
        {detail.format ? <Row label="Format" value={detail.format} /> : null}
        {detail.width && detail.height ? (
          <Row label="Dimensions" value={`${detail.width} × ${detail.height}`} />
        ) : null}
        {detail.fileSizeBytes !== null ? (
          <Row label="Size" value={`${(detail.fileSizeBytes / 1_000_000).toFixed(1)} MB`} />
        ) : null}
        <Row label="Modified" value={formatDate(detail.modifiedAt)} />
        {detail.addedAt ? <Row label="Added" value={formatDate(detail.addedAt)} /> : null}
        {comic && detail.sourceUrl ? (
          // `INS-05a`: the URL opens the system browser only on an explicit
          // click, and is copyable without ever being opened.
          <Row
            label="Source URL"
            value={detail.sourceUrl}
            onCopy={() => actions.onCopy(detail.sourceUrl as string, 'source URL')}
            onOpen={() => actions.onOpenSourceUrl(detail.sourceUrl as string)}
          />
        ) : null}
        {comic && detail.sourceSite ? <Row label="Source site" value={detail.sourceSite} /> : null}
        {comic && detail.creator ? <Row label="Artist" value={detail.creator} /> : null}
      </dl>
    </Section>
  );
}

function Row({
  label,
  value,
  onCopy,
  onReveal,
  onOpen,
}: {
  label: string;
  value: string;
  onCopy?: () => void;
  onReveal?: () => void;
  onOpen?: () => void;
}) {
  return (
    <div className="kv-row">
      <dt>{label}</dt>
      <dd>
        <span className="kv-value">{value}</span>
        {onCopy ? (
          <button type="button" className="kv-action" onClick={onCopy} aria-label={`Copy ${label}`}>
            Copy
          </button>
        ) : null}
        {onReveal ? (
          <button type="button" className="kv-action" onClick={onReveal} aria-label={`Reveal ${label}`}>
            Reveal
          </button>
        ) : null}
        {onOpen ? (
          <button type="button" className="kv-action" onClick={onOpen} aria-label={`Open ${label}`}>
            Open
          </button>
        ) : null}
      </dd>
    </div>
  );
}

/** `INS-06`. Hidden entirely when the item carries no generation record. */
function GenerationSection({
  detail,
  actions,
}: {
  detail: ExploreItemDetail;
  actions: InspectorActions;
}) {
  const hasAny =
    detail.positivePrompt !== null ||
    detail.negativePrompt !== null ||
    detail.model !== null ||
    detail.loras.length > 0 ||
    detail.sampler !== null ||
    detail.scheduler !== null ||
    detail.steps !== null ||
    detail.cfg !== null ||
    detail.seed !== null ||
    detail.denoise !== null;
  // `INS-03`: no visible fields means no heading.
  if (!hasAny) return null;

  return (
    <Section id="generation" title="Generation">
      {detail.positivePrompt ? (
        <PromptBlock
          label="Positive prompt"
          text={detail.positivePrompt}
          onCopy={() => actions.onCopy(detail.positivePrompt as string, 'positive prompt')}
          onSearch={() => actions.onSearchPrompt(detail.positivePrompt as string)}
        />
      ) : null}

      {detail.negativePrompt ? (
        // `INS-06`: the negative prompt is collapsed by default.
        <PromptBlock
          label="Negative prompt"
          text={detail.negativePrompt}
          defaultOpen={false}
          onCopy={() => actions.onCopy(detail.negativePrompt as string, 'negative prompt')}
          onSearch={() => actions.onSearchPrompt(detail.negativePrompt as string)}
        />
      ) : null}

      <dl className="kv inspector-kv">
        {detail.model ? <Row label="Model" value={detail.model} /> : null}
        {detail.loras.length > 0 ? (
          <div className="kv-row">
            <dt>LoRAs</dt>
            <dd>
              {detail.loras.map((lora) => (
                // `INS-06`: one per line, "name · weight".
                <div key={lora.name} className="kv-multiline">
                  {lora.name} · {lora.weight.toFixed(2)}
                </div>
              ))}
            </dd>
          </div>
        ) : null}
        {detail.sampler ? <Row label="Sampler" value={detail.sampler} /> : null}
        {detail.scheduler ? <Row label="Scheduler" value={detail.scheduler} /> : null}
        {detail.steps !== null ? <Row label="Steps" value={String(detail.steps)} /> : null}
        {detail.cfg !== null ? <Row label="CFG" value={detail.cfg.toFixed(1)} /> : null}
        {detail.seed ? (
          <Row label="Seed" value={detail.seed} onCopy={() => actions.onCopy(detail.seed as string, 'seed')} />
        ) : null}
        {detail.denoise !== null ? <Row label="Denoise" value={detail.denoise.toFixed(2)} /> : null}
      </dl>
    </Section>
  );
}

/** Six lines then "Show more" (`INS-06`). */
function PromptBlock({
  label,
  text,
  defaultOpen = true,
  onCopy,
  onSearch,
}: {
  label: string;
  text: string;
  defaultOpen?: boolean;
  onCopy: () => void;
  onSearch: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [open, setOpen] = useState(defaultOpen);
  const long = text.length > 200;

  return (
    <div className="prompt-block">
      <div className="prompt-head">
        <button
          type="button"
          className="prompt-label"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          {label}
        </button>
        <span className="prompt-actions">
          <button type="button" onClick={onCopy} aria-label={`Copy ${label}`}>
            Copy
          </button>
          <button type="button" onClick={onSearch} aria-label={`Search ${label}`}>
            Search this prompt
          </button>
        </span>
      </div>
      {open ? (
        <>
          <p className={`prompt${expanded ? ' expanded' : ''}`}>{text}</p>
          {long ? (
            <button type="button" className="prompt-more" onClick={() => setExpanded((v) => !v)}>
              {expanded ? 'Show less' : 'Show more'}
            </button>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** `INS-07`: collapsed by default; the JSON is fetched only when asked. */
function WorkflowSection({
  detail,
  actions,
}: {
  detail: ExploreItemDetail;
  actions: InspectorActions;
}) {
  const [json, setJson] = useState<string | null>(detail.workflowJson);
  const [loading, setLoading] = useState(false);
  const [showJson, setShowJson] = useState(false);
  const [search, setSearch] = useState('');

  // `INS-07`: shown only when the item has a workflow at all.
  if (!detail.hasWorkflow) return null;

  const request = async () => {
    setLoading(true);
    const fetched = await actions.onRequestWorkflow(detail.itemId);
    setJson(fetched);
    setShowJson(true);
    setLoading(false);
  };

  return (
    <Section id="workflow" title="Workflow" defaultOpen={false}>
      <p className="hint">
        {detail.workflowNodeCount !== null ? `${detail.workflowNodeCount} nodes` : 'Workflow present'}
      </p>
      <div className="row">
        <Button
          onClick={() => {
            if (json) actions.onCopy(json, 'workflow JSON');
            else void request();
          }}
        >
          Copy workflow JSON
        </Button>
        <Button variant="ghost" onClick={() => (json ? setShowJson(true) : void request())}>
          View JSON
        </Button>
      </div>
      {loading ? <p className="hint">Loading workflow…</p> : null}

      <Dialog
        open={showJson && json !== null}
        onClose={() => setShowJson(false)}
        title={`Workflow — ${detail.fileName}`}
        wide
      >
        <Input
          aria-label="Search workflow JSON"
          value={search}
          placeholder="Search…"
          onChange={(e) => setSearch(e.target.value)}
        />
        <pre className="json-view">
          {search.trim() ? (
            json
              ?.split('\n')
              .map((line, index) => (
                <span
                  key={index}
                  className={line.toLowerCase().includes(search.trim().toLowerCase()) ? 'json-hit' : 'json-miss'}
                >
                  {line}
                  {'\n'}
                </span>
              ))
          ) : (
            json
          )}
        </pre>
      </Dialog>
    </Section>
  );
}

/** `INS-10`: panels for a comic page. */
function PanelsSection({
  detail,
  actions,
}: {
  detail: ExploreItemDetail;
  actions: InspectorActions;
}) {
  if (!detail.panelStatus) return null;
  const decomposed = detail.panelStatus === 'decomposed';

  return (
    <Section id="panels" title="Panels">
      <p className="panel-status">
        {decomposed
          ? `Decomposed — ${detail.panels.length} panels`
          : detail.panelStatus === 'no-panels'
            ? 'No panels found'
            : detail.panelStatus === 'stale'
              ? 'Stale'
              : 'Not decomposed'}
      </p>

      {decomposed ? (
        <ul className="panel-list">
          {detail.panels.map((panel) => (
            <li key={panel.id} className="panel-row">
              {panel.thumbnailUrl ? (
                <img src={panel.thumbnailUrl} alt="" className="panel-thumb" />
              ) : (
                <span className="panel-thumb placeholder" aria-hidden="true" />
              )}
              <span className="panel-index">#{panel.index}</span>
              <span className="panel-size">
                {panel.width} × {panel.height}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="row">
        {decomposed ? (
          <>
            <Button variant="ghost" onClick={() => actions.onDecompose(detail.itemId)}>
              Re-decompose
            </Button>
            <Button variant="ghost" onClick={() => actions.onEditPanels(detail.itemId)}>
              Edit panels
            </Button>
          </>
        ) : (
          <Button onClick={() => actions.onDecompose(detail.itemId)}>Decompose</Button>
        )}
      </div>
    </Section>
  );
}

/** `INS-10`: effective OCR text, grouped by panel then page-level. */
function TextSection({
  detail,
  actions,
}: {
  detail: ExploreItemDetail;
  actions: InspectorActions;
}) {
  if (detail.text.length === 0) return null;
  return (
    <Section id="text" title="Text">
      {detail.text.map((entry) => (
        <div key={entry.region} className="ocr-group">
          <span className="ocr-region">{entry.region}</span>
          <p className="ocr-text">{entry.text}</p>
        </div>
      ))}
      <Button variant="ghost" onClick={() => actions.onEditInReview(detail.itemId)}>
        Edit in Review
      </Button>
    </Section>
  );
}

/** `INS-08`: tag chips, a star rating, favourite, and autosaving notes. */
function TagsSection({
  detail,
  actions,
  autosaveMs,
}: {
  detail: ExploreItemDetail;
  actions: InspectorActions;
  autosaveMs?: number;
}) {
  const [tags, setTags] = useState<string[]>(detail.tags);
  const [rating, setRating] = useState(detail.rating);
  const [favourite, setFavourite] = useState(detail.favourite);
  const [notes, setNotes] = useState(detail.notes ?? '');
  const [noteState, setNoteState] = useState<'idle' | 'saving' | 'saved' | 'failed'>('idle');
  const notesTimer = useRef<number | null>(null);
  const delay = autosaveMs ?? NOTES_AUTOSAVE_MS;

  // Switching items must not leave the previous item's edits on screen.
  useEffect(() => {
    setTags(detail.tags);
    setRating(detail.rating);
    setFavourite(detail.favourite);
    setNotes(detail.notes ?? '');
    setNoteState('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.itemId]);

  /**
   * The text is passed in rather than read from state.
   *
   * The autosave timer is scheduled from the `onChange` handler, whose closure
   * still holds the value *before* this keystroke — reading `notes` inside the
   * timer would save the previous text and lose the last edit.
   */
  const saveNotes = async (text: string) => {
    if (notesTimer.current !== null) window.clearTimeout(notesTimer.current);
    setNoteState('saving');
    try {
      await actions.onSaveNotes(detail.itemId, text);
      setNoteState('saved');
    } catch {
      // `STA-15`: the text stays in the field so nothing is lost.
      setNoteState('failed');
    }
  };

  return (
    <Section id="tags" title="Tags & notes">
      <TagInput
        tags={tags}
        existing={detail.existingTags}
        onChange={(next) => {
          setTags(next);
          void actions.onSaveTags(detail.itemId, next);
        }}
      />

      <StarRating
        value={rating}
        onChange={(next) => {
          setRating(next);
          void actions.onSaveRating(detail.itemId, next);
        }}
      />

      <label className="favourite-toggle">
        <input
          type="checkbox"
          checked={favourite}
          onChange={(e) => {
            setFavourite(e.target.checked);
            void actions.onSaveFavourite(detail.itemId, e.target.checked);
          }}
        />
        Favourite
      </label>

      <Textarea
        label="Notes"
        rows={3}
        value={notes}
        onChange={(text) => {
          setNotes(text);
          setNoteState('saving');
          // `INS-08`: autosave once typing has stopped.
          if (notesTimer.current !== null) window.clearTimeout(notesTimer.current);
          notesTimer.current = window.setTimeout(() => void saveNotes(text), delay);
        }}
        onBlur={() => void saveNotes(notes)}
      />
      <p className="notes-status" role="status">
        {noteState === 'saving' ? 'Saving…' : null}
        {noteState === 'saved' ? 'Saved' : null}
        {noteState === 'failed' ? (
          <>
            Couldn't save — your text is still here.{' '}
            <button type="button" onClick={() => void saveNotes(notes)}>
              Retry
            </button>
          </>
        ) : null}
      </p>
    </Section>
  );
}

/**
 * The tag input (`INS-08`, `TAG-01`–`TAG-03`).
 *
 * `Enter` commits; `Backspace` on an empty field removes the last chip; and a
 * comma also commits, because `TAG-02` requires that pasting "a, b" create two
 * tags rather than one tag containing a comma.
 */
function TagInput({
  tags,
  existing,
  onChange,
}: {
  tags: string[];
  existing: string[];
  onChange: (tags: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const suggestions = useMemo(() => {
    const term = draft.trim().toLowerCase();
    if (!term) return [];
    return existing
      .filter((t) => t.toLowerCase().startsWith(term) && !tags.includes(t))
      .slice(0, 5);
  }, [draft, existing, tags]);

  const commit = (raw: string) => {
    const next = [...tags];
    for (const part of raw.split(',')) {
      const name = part.trim();
      // `TAG-01`: 1-60 characters after trimming.
      if (name.length === 0 || name.length > 60) continue;
      // `TAG-03`: uniqueness is case-insensitive; the first spelling wins.
      if (next.some((t) => t.toLowerCase() === name.toLowerCase())) continue;
      next.push(name);
    }
    onChange(next);
    setDraft('');
  };

  return (
    <div className="tag-input">
      {tags.map((tag) => (
        <span key={tag} className="chip">
          {tag}
          <button
            type="button"
            aria-label={`Remove tag ${tag}`}
            onClick={() => onChange(tags.filter((t) => t !== tag))}
          >
            ×
          </button>
        </span>
      ))}
      <input
        aria-label="Add a tag"
        value={draft}
        list="tag-suggestions"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault();
            commit(draft);
          } else if (e.key === 'Backspace' && draft === '' && tags.length > 0) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => {
          if (draft.trim()) commit(draft);
        }}
      />
      <datalist id="tag-suggestions">
        {suggestions.map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

/** `INS-08`: 0–5 stars; the keys `0`–`5` work when the rating has focus. */
function StarRating({
  value,
  onChange,
}: {
  value: number;
  onChange: (rating: number) => void;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div
      className="star-rating"
      role="radiogroup"
      aria-label="Rating"
      tabIndex={0}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      onKeyDown={(e) => {
        if (!focused) return;
        if (/^[0-5]$/.test(e.key)) {
          e.preventDefault();
          onChange(Number(e.key));
        }
      }}
    >
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={value === star}
          aria-label={`${star} star${star === 1 ? '' : 's'}`}
          className={star <= value ? 'star on' : 'star'}
          onClick={() => onChange(star === value ? 0 : star)}
        >
          ★
        </button>
      ))}
      <button type="button" className="star-clear" onClick={() => onChange(0)} aria-label="Clear rating">
        ×
      </button>
    </div>
  );
}

/** `INS-09`: one line per stage, with a retry that scopes a job to that item. */
function ProcessingSection({
  detail,
  actions,
}: {
  detail: ExploreItemDetail;
  actions: InspectorActions;
}) {
  return (
    <Section id="processing" title="Processing">
      {detail.stages.map((stage) => (
        <div key={stage.name} className={`stage-line ${stage.status}`}>
          <span className="stage-status" aria-hidden="true">
            {stageIcon(stage.status)}
          </span>
          <span className="stage-name">{stage.name}</span>
          <span className="stage-text">{stageText(stage.status)}</span>
          {stage.at ? <span className="stage-time">{formatDate(stage.at)}</span> : null}
          {stage.status === 'failed' ? (
            <>
              <p className="stage-error">{stage.error ?? 'This stage failed.'}</p>
              {/* The job is scoped to this one item and stage, and is never
                  started automatically (`PRD-06`). */}
              <Button variant="ghost" onClick={() => actions.onRetryStage(detail.itemId, stage.name)}>
                Retry this stage
              </Button>
            </>
          ) : null}
        </div>
      ))}
    </Section>
  );
}

function stageIcon(status: string): string {
  if (status === 'done') return '✓';
  if (status === 'failed') return '⚠';
  if (status === 'stale') return '↻';
  if (status === 'skipped') return '–';
  return '○';
}

function stageText(status: string): string {
  if (status === 'done') return 'Done';
  if (status === 'failed') return 'Failed';
  if (status === 'skipped') return 'Skipped';
  if (status === 'stale') return 'Stale';
  return 'Not processed';
}

/** `INS-11`: a comic panel, whose flag state is inherited from its page. */
function PanelInspector({
  panel,
  actions,
}: {
  panel: ExplorePanelDetail;
  actions: InspectorActions;
}) {
  return (
    <div className="inspector-body">
      <h2 className="inspector-title">Panel #{panel.index}</h2>

      <Section id="preview" title="Preview">
        <div className="inspector-preview">
          {panel.thumbnailUrl ? (
            <img src={panel.thumbnailUrl} alt={`Panel ${panel.index}`} style={{ objectFit: 'contain' }} />
          ) : (
            <span className="hint">No panel thumbnail</span>
          )}
        </div>
      </Section>

      <Section id="parent" title="Parent page">
        {/* `GAL-20`: the chip links to the parent page. */}
        <button
          type="button"
          className="chip parent-chip"
          onClick={() => actions.onOpenParentPage(panel.parentPageId)}
        >
          {panel.parentSeriesLabel} · {panel.parentFilename}
        </button>
      </Section>

      <Section id="box" title="Box">
        <dl className="kv inspector-kv">
          <Row label="x" value={String(panel.box.x)} />
          <Row label="y" value={String(panel.box.y)} />
          <Row label="width" value={String(panel.box.width)} />
          <Row label="height" value={String(panel.box.height)} />
          <Row label="Reading order" value={String(panel.index)} />
        </dl>
      </Section>

      <Section id="text" title="Text">
        {panel.text.length > 0 ? (
          panel.text.map((entry) => (
            <div key={entry.region} className="ocr-group">
              <span className="ocr-region">{entry.region}</span>
              <p className="ocr-text">{entry.text}</p>
            </div>
          ))
        ) : (
          <p className="hint">No text in this panel.</p>
        )}
      </Section>

      <Section id="tags" title="Tags">
        {panel.tags.length > 0 ? (
          <div className="tag-input">
            {panel.tags.map((tag) => (
              <span key={tag} className="chip">
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p className="hint">No tags.</p>
        )}
        {/* `FLG-06` and Appendix D.1 finding 9: a panel has no rating of its
            own, so the parent page's rating and favourite are shown read-only. */}
        <div className="inherited-state">
          <p className="hint">Rating and favourite come from the parent page, read-only here.</p>
          {panel.parentRating > 0 ? <p>{'★'.repeat(panel.parentRating)} from the page</p> : null}
          {panel.parentFavourite ? <p>★ Favourite on the page</p> : null}
        </div>
      </Section>
    </div>
  );
}

function formatDate(iso: string): string {
  // `ASSUMPTION` 5: dates use the system locale; UI copy stays English.
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}