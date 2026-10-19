// covers: NAV-20, NAV-21, NAV-22, NAV-23, NAV-50, NAV-51, NAV-52, TST-13, TST-14
/**
 * View history (design `NAV-20`).
 *
 * A history entry is a *view*, not a selection: Back must walk library,
 * destination, workspace and query changes, and re-selecting the current view
 * must not add an entry you then have to press through twice.
 */
import { describe, expect, it } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { HISTORY_DEPTH, useViewHistory } from '../app/useViewHistory';
import type { ViewState } from '../app/navigation';

const EXPLORE: ViewState = { destination: 'explore', workspace: 'browse' };
const SEARCH: ViewState = { destination: 'search', workspace: 'results' };
const REVIEW_FAILED: ViewState = { destination: 'review', workspace: 'review-failed' };

function setup(initial?: Partial<ViewState>) {
  return renderHook(() => useViewHistory(initial));
}

describe('useViewHistory', () => {
  it('starts on the given view with nothing to go back to', () => {
    const { result } = setup(EXPLORE);
    expect(result.current.view).toEqual(EXPLORE);
    expect(result.current.canBack).toBe(false);
    expect(result.current.canForward).toBe(false);
    expect(result.current.depth).toBe(1);
  });

  it('pushes an entry when the view changes', () => {
    const { result } = setup(EXPLORE);
    act(() => result.current.go(SEARCH));
    expect(result.current.view).toEqual(SEARCH);
    expect(result.current.canBack).toBe(true);
    expect(result.current.depth).toBe(2);
  });

  it('does not push an entry for the view already shown', () => {
    const { result } = setup(EXPLORE);
    act(() => result.current.go(SEARCH));
    act(() => result.current.go(SEARCH));
    expect(result.current.depth).toBe(2);
  });

  it('walks back and forward through the stack', () => {
    const { result } = setup(EXPLORE);
    act(() => result.current.go(SEARCH));
    act(() => result.current.go(REVIEW_FAILED));
    expect(result.current.view).toEqual(REVIEW_FAILED);

    act(() => result.current.back());
    expect(result.current.view).toEqual(SEARCH);
    act(() => result.current.back());
    expect(result.current.view).toEqual(EXPLORE);
    expect(result.current.canBack).toBe(false);

    act(() => result.current.forward());
    expect(result.current.view).toEqual(SEARCH);
    act(() => result.current.forward());
    expect(result.current.view).toEqual(REVIEW_FAILED);
    expect(result.current.canForward).toBe(false);
  });

  it('does not walk past either end', () => {
    const { result } = setup(EXPLORE);
    act(() => result.current.back());
    expect(result.current.view).toEqual(EXPLORE);
    act(() => result.current.forward());
    expect(result.current.view).toEqual(EXPLORE);
  });

  it('drops the forward history when a new view is pushed after going back', () => {
    const { result } = setup(EXPLORE);
    act(() => result.current.go(SEARCH));
    act(() => result.current.go(REVIEW_FAILED));
    act(() => result.current.back());
    act(() => result.current.go({ destination: 'settings', workspace: 'settings-preferences' }));

    expect(result.current.canForward).toBe(false);
    expect(result.current.depth).toBe(3);
    act(() => result.current.back());
    expect(result.current.view).toEqual(SEARCH);
  });

  it('keeps only the last 100 views', () => {
    const { result } = setup(EXPLORE);
    for (let i = 0; i < HISTORY_DEPTH + 20; i += 1) {
      act(() => result.current.go(i % 2 === 0 ? SEARCH : REVIEW_FAILED));
    }
    expect(result.current.depth).toBe(HISTORY_DEPTH);
    expect(result.current.canBack).toBe(true);
  });

  it('goTo defaults to the destination\'s first workspace', () => {
    const { result } = setup(EXPLORE);
    act(() => result.current.goTo('review'));
    expect(result.current.view).toEqual({ destination: 'review', workspace: 'review-text' });
    act(() => result.current.goTo('review', 'review-failed'));
    expect(result.current.view).toEqual(REVIEW_FAILED);
  });

  it('repairs an inconsistent view pushed from outside', () => {
    const { result } = setup(EXPLORE);
    act(() => result.current.go({ destination: 'explore', workspace: 'pipeline-jobs' }));
    expect(result.current.view).toEqual(EXPLORE);
  });
});