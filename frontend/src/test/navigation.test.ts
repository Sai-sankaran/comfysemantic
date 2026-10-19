// covers: NAV-01, NAV-02, NAV-03, NAV-04, NAV-05, NAV-06, NAV-07, NAV-08, NAV-10, NAV-11, NAV-12, NAV-13, NAV-14, NAV-40, NAV-41, NAV-42, NAV-43, NAV-50, NAV-51, NAV-52, TST-14
/**
 * The navigation model (design §6.1, `NAV-01`).
 *
 * The rail is the frame every screen lives in, so its shape is data that the
 * rail, the breadcrumb, the palette and the `Ctrl+1…Ctrl+5` shortcuts all read.
 * These tests pin the documented order, the workspace grouping and the
 * consistency rule that makes a stale or partial view safe to restore.
 */
import { describe, expect, it } from 'vitest';
import {
  DESTINATIONS,
  RAIL_BOTTOM,
  RAIL_MAIN,
  coerceView,
  defaultWorkspace,
  destinationOf,
  hasWorkspace,
  sameView,
  type DestinationId,
  type WorkspaceId,
} from '../app/navigation';

describe('the five rail destinations', () => {
  it('are Explore, Search, Review, Pipeline, Settings — in that order', () => {
    expect(DESTINATIONS.map((d) => d.id)).toEqual([
      'explore',
      'search',
      'review',
      'pipeline',
      'settings',
    ]);
  });

  it('anchor Settings at the bottom of the rail', () => {
    expect(RAIL_MAIN.map((d) => d.id)).toEqual(['explore', 'search', 'review', 'pipeline']);
    expect(RAIL_BOTTOM.map((d) => d.id)).toEqual(['settings']);
  });

  it('gives each destination the Appendix A key for its rail slot', () => {
    expect(DESTINATIONS.map((d) => d.shortcut)).toEqual([
      'mod+1',
      'mod+2',
      'mod+3',
      'mod+4',
      'mod+5',
    ]);
  });

  it('gives every destination a workspace, and every workspace an icon-owning parent', () => {
    for (const destination of DESTINATIONS) {
      expect(destination.workspaces.length).toBeGreaterThan(0);
      expect(destination.icon).toBeTruthy();
      for (const workspace of destination.workspaces) {
        expect(hasWorkspace(destination.id, workspace.id)).toBe(true);
      }
    }
  });

  it('keeps the screens the design folds into a destination', () => {
    // `PIP-12` puts Panel Studio under Pipeline → Tools and `REV-03` puts Batch
    // Recovery under Review → Failed items; neither may be lost in the regrouping.
    expect(destinationOf('pipeline').workspaces.map((w) => w.id)).toEqual([
      'pipeline-jobs',
      'pipeline-tools',
    ]);
    expect(destinationOf('review').workspaces.map((w) => w.id)).toEqual([
      'review-text',
      'review-failed',
    ]);
  });

  it('hides the component gallery from the workspace strip (CTL-06 lives under Diagnostics)', () => {
    const components = destinationOf('settings').workspaces.find(
      (w) => w.id === 'settings-components',
    );
    expect(components?.hidden).toBe(true);
  });
});

describe('coerceView', () => {
  it('keeps a valid view untouched', () => {
    const view = { destination: 'review', workspace: 'review-failed' } as const;
    expect(coerceView(view)).toEqual(view);
  });

  it('falls back to the default workspace when the workspace belongs elsewhere', () => {
    // A restored snapshot or a stale link must never render nothing.
    expect(coerceView({ destination: 'explore', workspace: 'review-failed' })).toEqual({
      destination: 'explore',
      workspace: defaultWorkspace('explore'),
    });
  });

  it('defaults to Explore when given nothing', () => {
    expect(coerceView(undefined)).toEqual({ destination: 'explore', workspace: 'browse' });
    expect(coerceView(null)).toEqual({ destination: 'explore', workspace: 'browse' });
  });

  it('falls back to Explore for an unknown destination', () => {
    expect(coerceView({ destination: 'nope' as DestinationId }).destination).toBe('explore');
  });
});

describe('sameView', () => {
  it('is true only for the same destination and workspace', () => {
    expect(
      sameView({ destination: 'explore', workspace: 'browse' }, { destination: 'explore', workspace: 'browse' }),
    ).toBe(true);
    expect(
      sameView({ destination: 'explore', workspace: 'browse' }, { destination: 'search', workspace: 'results' }),
    ).toBe(false);
    expect(
      sameView(
        { destination: 'review', workspace: 'review-text' },
        { destination: 'review', workspace: 'review-failed' },
      ),
    ).toBe(false);
  });

  it('treats two workspaces of one destination as different views', () => {
    const a = 'review-text' as WorkspaceId;
    const b = 'review-failed' as WorkspaceId;
    expect(sameView({ destination: 'review', workspace: a }, { destination: 'review', workspace: b })).toBe(
      false,
    );
  });
});