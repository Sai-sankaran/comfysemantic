# Testing — ComfyPanel Studio

## 1. Test Suite Overview

| Category | Location | Purpose |
|----------|----------|---------|
| Unit | `tests/unit/` | Pure function / isolated logic |
| Integration | `tests/` (root) | End-to-end flows, schema migrations |
| Adversarial | `tests/adversarial/` | Fuzz / malformed input |
| Performance | `tests/performance/` | Scalability, latency baselines |
| Real Model | `tests/test_real_model.py` | Requires GGUF + llama-server |

Run: `pytest tests/ -q --ignore=tests/adversarial --ignore=tests/performance --ignore=tests/test_real_model.py`

## 2. Fixture Philosophy

**No user images, no cloud, no network.** All tests use synthetic fixtures:
- `tests/conftest.py` — `build()` creates a temp catalog with synthetic images
- `scripts/_make_test_images.py` — generates PNGs with known metadata
- `tests/fixtures.py` — shared fixtures

Real images are **never** used in CI or automated tests. The only place real images appear is manual verification (`scripts/verify_cropper_progress.py`, `scripts/verify_portable_rpc.py`).

## 3. Key Test Categories

### Unit Tests (`tests/unit/`)
| File | Coverage |
|------|----------|
| `test_batch_recovery.py` | Pure logic: config extraction, reconstruction, grouping, assignment |
| `test_cropper_adapter.py` | Integrity verification, CSV parsing, path safety |
| `test_metadata_comprehensive.py` | Metadata extraction edge cases |
| `test_prompt_resolution.py` | Prompt candidate resolution logic |
| `test_png_metadata_recovery.py` | PNG chunk parsing, truncated zlib |
| `test_prompt_resolution.py` | Prompt candidate resolution |
| `test_unit.py` | Miscellaneous utilities |

### Integration Tests (`tests/`)
| File | Coverage |
|------|----------|
| `test_e2e_indexing.py` | Full indexing pipeline on synthetic catalog |
| `test_worker_protocol.py` | RPC handshake, shutdown, restart logic |
| `test_search_keywords.py` | FTS5 multi-word AND, limits, pagination |
| `test_search_total.py` | `count_keyword` vs `search_keyword` total |
| `test_scale_simulation.py` | 12k catalog browse/search latency |
| `test_process_lifetime.py` | Worker restart, shutdown, crash recovery |
| `test_batch_recovery_fk.py` | FK constraint enforcement in batch recovery |

### Feature-Specific Tests (v8+)
| File | Coverage |
|------|----------|
| `test_filename_indexing.py` | `clean_filename_for_index` against 12 real naming styles |
| `test_panel_registration.py` | Real CSV header, idempotent upsert, library backfill |
| `test_panel_stages.py` | 9 tests: registration, thumbnails, FTS, ordering, force reset |
| `test_cropper_progress_contract.py` | Live progress events from frozen cropper |
| `test_presets_migration.py` | v8 migration: additive, idempotent, builtins seeded |
| `test_dialogue_extraction.py` | v9 schema; balloon detection; colour bucketing and grouping |
| `test_dialogue_stage_integration.py` | `dialogue` stage dispatch, idempotence, preset scopes, error honesty |
| `test_preset_dialogue_rpc.py` | preset RPCs; dialogue list/accept/split/merge/set_text; manual-text durability |
| `test_comic_search_scope.py` | `unit_scope` panel search, `comic_text` FTS, parent demotion, scope refusals |
| `test_batch_recovery_fk.py` | FK constraint on `library_id` in batch recovery |
| `test_process_lifetime.py` | Orphan reaping via Job Objects |
| `test_cropper_progress_contract.py` | Progress events from frozen cropper |

### Adversarial (`tests/adversarial/`)
- `test_database_concurrency.py` — concurrent writes
- `test_deferred_risks.py` — delayed failures
- `test_embedding_limits.py` — size/zero-vector limits
- `test_filesystem_auth.py` — path traversal
- `test_rpc_csp.py` — CSP violations
- `test_worker_pillow.py` — Pillow decode failures

### Scale (`tests/performance/`)
- `test_benchmark.py` — 12k catalog browse/search latency

### Real Model (`tests/test_real_model.py`)
- Requires `llama-server` + GGUF model; skipped by default

## 4. Running Tests

```bash
# Full suite (excludes slow/real-model)
pytest tests/ -q --ignore=tests/adversarial --ignore=tests/performance --ignore=tests/test_real_model.py

# Specific module
pytest tests/test_filename_indexing.py -q

# With coverage
pytest tests/ --cov=backend --cov=frontend

# Watch mode (dev)
pytest-watch tests/test_filename_indexing.py
```

## 5. Running in CI
```yaml
# .github/workflows/test.yml
- name: Run tests
  run: |
    python -m venv .venv
    .\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
    npm --prefix frontend install
    pytest tests/ -q --ignore=tests/adversarial --ignore=tests/performance --ignore=tests/test_real_model.py
```

## 5. Writing New Tests

### Fixture Pattern
```python
# tests/conftest.py
@pytest.fixture
def scale_db(tmp_path_factory):
    tmp = tmp_path_factory.mktemp("scale")
    lib, dbp, cache, provider, engine = build(tmp, count=12000)
    engine.run_indexing("L1", lib, scope=ALL_STAGES)
    return dbp, provider, 12000
```

### Regression Test Template
```python
def test_regression_<bug_id>():
    """<Description of bug and expected fix>"""
    # Arrange
    # Act
    # Assert
```

## 6. Verification Scripts (Not Tests)

| Script | Purpose |
|--------|---------|
| `scripts/verify_cropper_progress.py` | End-to-end cropper RPC on frozen backend |
| `scripts/verify_frozen_reaping.py` | Job Object orphan reaping |
| `scripts/verify_orphan_reaping.py` | Orphan cropper reaping |
| `scripts/verify_portable_rpc.py` | Frozen backend RPC smoke test |
| `scripts/check_sql_columns.py` | Static SQL column validator |
| `scripts/verify_frozen_reaping.py` | Orphan reaping verification |

Run manually: `.\.venv\Scripts\python.exe scripts\verify_portable_rpc.py`

## 6. CI Integration
```yaml
# .github/workflows/test.yml
jobs:
  test:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - name: Setup Python
        uses: actions/setup-python@v5
        with: { python-version: '3.11' }
      - name: Install deps
        run: |
          python -m venv .venv
          .\.venv\Scripts\pip install -r backend/requirements.txt
          npm --prefix frontend install
      - name: Run tests
        run: pytest tests/ -q --ignore=tests/adversarial --ignore=tests/performance --ignore=tests/test_real_model.py
```

## 7. Writing New Tests

### Principles
1. **No external dependencies** — fixtures only
2. **Test the contract** — assert the observable behavior, not internals
3. **Negative controls** — a test that must fail when the fix is reverted
4. **Isolation** — `tmp_path` per test, no global state

### Example: Regression Test
```python
def test_cropper_csv_column_names():
    """register_panel_crops must read the real CSV header (source_file, filename, etc.)"""
    linked = register_panel_crops(conn, {"panels": [real_row], ...})
    assert linked == 1
```

### Negative Control Pattern
```python
def test_negative_control():
    with monkeypatch.setenv("COMFYPANEL_DISABLE_KILL_JOB", "1"):
        assert test_grandchild_orphans_without_the_job() == False  # must fail
```

## 7. Test Data Generation

```bash
# Generate synthetic PNGs with prompt metadata
.\.venv\Scripts\python.exe scripts\_make_test_images.py

# Benchmarks
.\.venv\Scripts\python.exe scripts\bench_library_load.py
.\.venv\Scripts\python.exe scripts\bench_browse_parts.py
```

## 8. Known Gaps

- [ ] E2E test for `comic+panels` preset end-to-end
- [ ] Load test for `panel_text_embeddings` at scale
- [ ] Adversarial test for colour grouping edge cases
- [ ] Migration rollback test (simulated failure mid-v2)
- [ ] CSP header regression test