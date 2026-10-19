// covers: VWR-01, VWR-02, VWR-03, VWR-04, VWR-05, VWR-06, VWR-07, VWR-08, VWR-09, VWR-10, VWR-11, NAV-20, NAV-21, NAV-22, NAV-23, ARC-11, ARC-12
/**
 * The viewer's cross-page step must ride the shell's RPC permission.
 *
 * `LibraryScreen` asks the backend for the neighbouring image once navigation
 * runs past the edge of the loaded page. That request goes through
 * `api.getAdjacentImage`, whose method name is the string the Rust
 * `ALLOWED_METHODS` allowlist has to admit; if the two drift, the call is
 * rejected by the shell before the worker ever sees it (defect R-1). These
 * tests pin the frontend half of that contract - the exact method name and the
 * parameter names - while `tests/test_rpc_contract_drift.py` pins the Rust side.
 *
 * The api module is exercised for real; only the Tauri `invoke` transport is
 * replaced, so what is verified is the request the shipped code builds.
 *
 * The runtime is also marked as Tauri for the duration. `api.ts` no longer calls
 * `invoke` directly - it goes through `platform/transport`, which is what makes
 * the UI runnable without the shell - and the adapter picks a backend by asking
 * whether `__TAURI_INTERNALS__` is present. Without this the request never reaches
 * the mocked `invoke` at all and every assertion below fails for the wrong reason.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));

// setup.ts already replaces this module with a `convertFileSrc` stub. Both keys
// are provided here so the api module under test gets a real `invoke` to drive.
vi.mock('@tauri-apps/api/core', () => ({
  invoke,
  convertFileSrc: (p: string) => `asset://test/${encodeURIComponent(p)}`,
}));

import { api } from '../api';
import { resetDevBackend } from '../platform/transport';

describe('api.getAdjacentImage', () => {
  beforeEach(() => {
    invoke.mockReset();
    invoke.mockResolvedValue({ image: null, at_boundary: true });
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
    // A dev backend left installed by another test would answer instead of Tauri.
    resetDevBackend();
  });

  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  });

  it('sends the get_adjacent_image RPC with the contract parameter names', async () => {
    await api.getAdjacentImage({
      currentImageId: 'img-7',
      direction: 'next',
      libraryId: 'lib-1',
      sort: 'name',
    });

    expect(invoke).toHaveBeenCalledTimes(1);
    const [command, payload] = invoke.mock.calls[0] as [
      string,
      { method: string; params: Record<string, unknown> },
    ];
    expect(command).toBe('rpc_call');
    expect(payload.method).toBe('get_adjacent_image');
    expect(payload.params).toEqual({
      current_image_id: 'img-7',
      direction: 'next',
      library_id: 'lib-1',
      sort: 'name',
      filters: undefined,
    });
  });

  it('defaults the sort order when the caller omits it', async () => {
    await api.getAdjacentImage({ currentImageId: 'img-7', direction: 'prev' });

    const [, payload] = invoke.mock.calls[0] as [
      string,
      { method: string; params: Record<string, unknown> },
    ];
    expect(payload.params.sort).toBe('mtime_desc');
    expect(payload.params.direction).toBe('prev');
  });

  it('passes a successful neighbour response through unchanged', async () => {
    const neighbour = { id: 'img-8', filename: 'page-08.png' };
    invoke.mockResolvedValue({ image: neighbour, at_boundary: false });

    const res = await api.getAdjacentImage({ currentImageId: 'img-7', direction: 'next' });

    expect(res).toEqual({ image: neighbour, at_boundary: false });
  });
});
