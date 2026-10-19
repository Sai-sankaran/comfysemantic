import { useEffect, useMemo, useRef, useState } from 'react';
import { useLibrary } from '../../app/providers';
import { Button, Dialog, Input } from '../../components/ui';
import {
  CATEGORY_HINT,
  CATEGORY_LABEL,
  categoriesWithEntries,
  searchSettings,
  type SettingCategory,
} from '../../settings/registry';
import { originLabel } from '../../settings/resolver';
import { useSettingsStore } from '../../settings/useSettingsStore';
import { SettingRow } from './SettingRow';
import { SettingsOperations } from './SettingsOperations';
import { ProfileAffordance, ProfilesPanel } from './ProfilesPanel';
import { SettingsTransfer } from './SettingsTransfer';

/**
 * The Settings screen (design §12.1).
 *
 * Layout: a category list on the left — Appearance, Browsing, Search, Processing,
 * Comics, OCR & review, Models & runtime, Storage, Shortcuts, Advanced &
 * diagnostics — a **Search settings** box at the top of the right pane, and the
 * selected category's rows in the `SET-03` anatomy. Processing also hosts the
 * Profiles manager (a later increment; the registry already marks the
 * `profileable` rows).
 *
 * What this screen is *not*: it is not the settings store. Values resolve through
 * `settings/resolver.ts` from folder → library → app → default, and only the keys
 * the backend already stores are written through today. The banner below says so
 * when a session-only change is pending, rather than implying it was saved.
 */
export function SettingsScreen({ onOpenGallery }: { onOpenGallery?: () => void } = {}) {
  const store = useSettingsStore();
  const { thumbFit, setThumbFit, updateAppSetting } = useLibrary();

  const context = useMemo(() => ({ libraryType: 'none' as const }), []);
  const categories = useMemo(() => categoriesWithEntries(context), [context]);

  const [category, setCategory] = useState<SettingCategory>('appearance');
  const [query, setQuery] = useState('');
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const [confirmResetAll, setConfirmResetAll] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // A category can disappear when the library type hides it. Falling back during
  // render keeps the pane valid without a state-clearing effect, and the sidebar
  // still shows the requested category as the user's last choice.
  const activeCategory = categories.includes(category)
    ? category
    : categories[0] ?? 'appearance';

  // `SET-05`: Enter jumps to the setting and highlights it for 1.5 s.
  useEffect(() => {
    if (!highlightKey) return undefined;
    const t = window.setTimeout(() => setHighlightKey(null), 1500);
    return () => window.clearTimeout(t);
  }, [highlightKey]);

  const searching = query.trim().length > 0;
  const matches = useMemo(
    () => (searching ? searchSettings(query, context) : null),
    [searching, query, context],
  );

  const visible = useMemo(() => {
    // The search returns entries; the rows need resolved settings, so map through
    // the store's resolution rather than resolving twice.
    if (matches) {
      return matches
        .map((entry) => store.byKey.get(entry.key))
        .filter((r): r is NonNullable<typeof r> => Boolean(r));
    }
    return store.resolved.filter((r) => r.entry.category === activeCategory);
  }, [matches, store.byKey, store.resolved, activeCategory]);

  const rowsByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of store.resolved) {
      if (!r.modified && r.overriddenAt.length === 0) continue;
      map.set(r.entry.category, (map.get(r.entry.category) ?? 0) + 1);
    }
    return map;
  }, [store.resolved]);

  const jumpToFirst = () => {
    const first = matches?.[0];
    if (!first) return;
    setCategory(first.category);
    setHighlightKey(first.key);
  };

  const operations = (['runtime', 'storage', 'advanced'] as const).includes(
    activeCategory as 'runtime' | 'storage' | 'advanced',
  )
    ? (activeCategory as 'runtime' | 'storage' | 'advanced')
    : null;

  return (
    <main className="main settings-screen">
      <nav className="settings-categories" aria-label="Settings categories">
        {categories.map((c) => {
          const changed = rowsByCategory.get(c) ?? 0;
          return (
            <button
              key={c}
              type="button"
              className={`settings-category${c === category ? ' active' : ''}`}
              aria-current={c === activeCategory ? 'page' : undefined}
              onClick={() => {
                setCategory(c);
                setQuery('');
              }}
            >
              <span>{CATEGORY_LABEL[c]}</span>
              {changed > 0 ? (
                <span className="settings-category-count" aria-label={`${changed} changed`}>
                  {changed}
                </span>
              ) : null}
            </button>
          );
        })}
      </nav>

      <section className="settings-pane" aria-label={`${CATEGORY_LABEL[activeCategory]} settings`}>
        <div className="settings-pane-head">
          <h2>{CATEGORY_LABEL[activeCategory]}</h2>
          <Input
            ref={searchRef}
            className="settings-search"
            placeholder="Search settings"
            aria-label="Search settings"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') jumpToFirst();
            }}
          />
          <Button
            variant="ghost"
            onClick={() => setConfirmResetAll(true)}
            title="Reset every setting in this category"
          >
            Reset category
          </Button>
          {/* `SET-06`: the import/export document lives with the settings. */}
          <Button variant="ghost" onClick={() => setTransferOpen(true)}>
            Import / export…
          </Button>
        </div>

        {CATEGORY_HINT[activeCategory] ? <p className="hint">{CATEGORY_HINT[category]}</p> : null}

        {store.pendingCount > 0 ? (
          <p className="notice" role="status">
            {store.pendingCount} change{store.pendingCount === 1 ? '' : 's'} held for this
            session. Theme, density and text size are saved; every other setting is
            persisted with the settings-registry integration.
          </p>
        ) : null}

        {searching && matches?.length === 0 ? (
          <p className="empty">
            No settings match &ldquo;{query.trim()}&rdquo;.
          </p>
        ) : null}

        <div className="settings-rows">
          {visible.map((resolved) => (
            <SettingRow
              key={resolved.entry.key}
              resolved={resolved}
              highlighted={highlightKey === resolved.entry.key}
              scopeWriteEnabled={false}
              below={<ProfileAffordance store={store} settingKey={resolved.entry.key} />}
              onChange={(value) => store.set(resolved.entry.key, value, 'app')}
              onReset={() => store.reset(resolved.entry.key, 'app')}
              onOverride={(scope, value) => {
                // Library/folder overrides are not writable yet; the row disables
                // them and states why. Reaching here means a scope was allowed.
                if (scope === 'app') store.set(resolved.entry.key, value, 'app');
              }}
            />
          ))}
        </div>

        {/*
          The legacy `thumb_fit` preference is not a registry key in `design.md`
          §12.2 — it is how a catalog thumbnail is cropped, not a browsing
          setting. It is kept here, labelled as legacy, rather than being dropped
          (SET-11) or given an invented registry key.
        */}
        {activeCategory === 'browsing' ? (
          <section className="settings-legacy">
            <h3>Legacy</h3>
            <SettingRow
              resolved={{
                entry: {
                  key: 'legacy.thumb_fit',
                  type: 'enum',
                  default: 'crop',
                  allowedScopes: ['app'],
                  category: 'browsing',
                  label: 'Thumbnail fit',
                  description:
                    'How catalog thumbnails are cropped in the results grid. Not a §12.2 setting; kept so nothing is lost.',
                },
                value: thumbFit,
                origin: 'app',
                modified: thumbFit !== 'crop',
                overridableScopes: ['app'],
                overriddenAt: thumbFit !== 'crop' ? ['app'] : [],
              }}
              scopeWriteEnabled={false}
              onChange={(value) => {
                setThumbFit(value as typeof thumbFit);
                void updateAppSetting('thumb_fit', value as never);
                return { ok: true };
              }}
              onReset={() => {
                setThumbFit('crop');
                void updateAppSetting('thumb_fit', 'crop' as never);
              }}
              onOverride={() => undefined}
            />
          </section>
        ) : null}

        {/*
          `SET-07`: Processing also hosts the Profiles manager.
        */}
        {activeCategory === 'processing' ? <ProfilesPanel store={store} /> : null}

        {operations ? (
          <SettingsOperations focus={operations} onOpenGallery={onOpenGallery} />
        ) : null}

        {category === 'advanced' && onOpenGallery ? null : null}
      </section>

      <Dialog
        open={confirmResetAll}
        onClose={() => setConfirmResetAll(false)}
        title={`Reset ${CATEGORY_LABEL[activeCategory]}?`}
        footer={
          <>
            <Button onClick={() => setConfirmResetAll(false)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                store.resetCategory(activeCategory, 'app');
                setConfirmResetAll(false);
              }}
            >
              Reset category
            </Button>
          </>
        }
      >
        <p>
          Every {CATEGORY_LABEL[activeCategory].toLowerCase()} setting goes back to its default.
          Settings in other categories are untouched.
        </p>
      </Dialog>

      <SettingsTransfer store={store} open={transferOpen} onClose={() => setTransferOpen(false)} />

      {/* `NAV-31`: the component gallery is reached from here (CTL-06). */}
      {onOpenGallery ? (
        <div className="settings-gallery-link">
          <Button variant="ghost" onClick={onOpenGallery}>
            Open component gallery
          </Button>
        </div>
      ) : null}

      {/* Keeps `originLabel` reachable for the scope summary shown to a11y. */}
      <span className="sr-only" aria-live="polite">
        {store.resolved.filter((r) => r.modified).length} settings changed from their default.
        First:{' '}
        {store.resolved.find((r) => r.modified)
          ? `${originLabel(store.resolved.find((r) => r.modified)!)}, ${store.resolved.find((r) => r.modified)!.entry.label}`
          : 'none'}
      </span>
    </main>
  );
}