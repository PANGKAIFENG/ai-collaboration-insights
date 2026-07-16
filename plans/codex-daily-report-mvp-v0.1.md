# Codex 日报 MVP v0.1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 发布一个可安装、可自动运行、只读分析本地 Codex 会话并生成“数据与层级、工作成果、教练建议”静态日报的 `aci v0.1.0`。

**Architecture:** `aci` 是 Deno 2 编写的一次性 CLI。Codex adapter 流式扫描目标 19:00-19:00 窗口，生成最小 `UnifiedEvent`，确定性分析器计算指标、区间、任务和评分，可选 analyzer 通过隔离的 `codex exec --ephemeral` 补充语义结果，最后原子写入版本化 JSON、HTML 和 manifest。`launchd` 只负责触发同一个 CLI，不运行 daemon 或本地服务。

**Tech Stack:** Deno 2、TypeScript、Deno/Web 标准库能力、原生 macOS `launchd`、GitHub Actions、Python 现有 eval harness。

---

## File Map

| Path | Responsibility |
| --- | --- |
| `deno.json` | Deno tasks、imports、fmt/lint/test 配置和版本入口 |
| `apps/cli/main.ts` | argv 解析、命令路由、结构化退出码 |
| `packages/core/types.ts` | `UnifiedEvent`、`DailyReport`、manifest 和 analyzer 契约 |
| `packages/core/paths.ts` | source/output allowlist、realpath containment 和应用目录 |
| `packages/core/time.ts` | 19:00 窗口、指定日期和最近 7 日补偿 |
| `packages/core/io.ts` | 原子 JSON/文本写入、文件权限和 report lock |
| `packages/codex/adapter.ts` | Codex session 发现、fingerprint、窗口流式扫描 |
| `packages/codex/parser.ts` | Codex JSONL 到 `UnifiedEvent` 的有界、容错映射 |
| `packages/analysis/deterministic.ts` | 指标、活跃段、工作区间和任务候选 |
| `packages/analysis/scoring.ts` | 五维证据、0-100 和 L1-L4 门槛 |
| `packages/analysis/redaction.ts` | secret/path/code/output 最小化与大小限制 |
| `packages/analysis/codex_analyzer.ts` | 同意检查、ephemeral argv、超时和 schema 校验 |
| `packages/report/schema.ts` | 运行时 DailyReport/manifest 校验 |
| `packages/report/renderer.ts` | 无脚本、自包含、严格 CSP 的 HTML 与索引页 |
| `packages/report/pipeline.ts` | 锁、扫描、分析、revision、原子发布和补偿编排 |
| `packages/runtime/commands.ts` | doctor、consent、schedule、purge、version 行为 |
| `scripts/install.sh` | 架构检测、checksum 校验、用户域原子安装 |
| `scripts/uninstall.sh` | LaunchAgent/二进制移除和显式派生数据清理 |
| `.github/workflows/ci.yml` | fmt/lint/check/test/eval/privacy/macOS compile 门禁 |
| `.github/workflows/release.yml` | tag 构建、双架构 assets、checksums、attestation、Release |
| `tests/fixtures/codex/` | 合成 Codex JSONL、恶意输入和边界 fixture |
| `tests/unit/` | 纯函数、parser、scoring、redaction、renderer 测试 |
| `tests/integration/` | 只读扫描、pipeline、manifest、锁、调度测试 |
| `tests/e2e/` | 临时 HOME 安装到静态日报的 smoke test |

## Task 1: CLI Foundation and Quality Gate (#7, #24)

**Files:**
- Create: `deno.json`
- Create: `apps/cli/main.ts`
- Create: `packages/core/types.ts`
- Create: `packages/core/time.ts`
- Create: `packages/core/paths.ts`
- Create: `packages/core/io.ts`
- Test: `tests/unit/time_test.ts`
- Test: `tests/unit/paths_test.ts`
- Test: `tests/integration/cli_test.ts`

- [ ] **Step 1: Write failing window, path and CLI contract tests**

Define tests proving `reportDateWindow("2026-07-15", "Asia/Shanghai")` returns `[2026-07-14T11:00:00Z, 2026-07-15T11:00:00Z)`, invalid dates fail, symlink escapes are rejected, `version` prints only the semantic version, and unknown commands return `ACI_USAGE`.

- [ ] **Step 2: Verify RED**

Run: `deno test tests/unit/time_test.ts tests/unit/paths_test.ts tests/integration/cli_test.ts`

Expected: FAIL because `packages/core/time.ts`, `paths.ts` and CLI entrypoint do not exist.

- [ ] **Step 3: Implement the minimal contracts**

Add schema-versioned TypeScript types, strict argv parsing, local-time window calculation using `TZ`-aware child-free date arithmetic, XDG/macOS application paths, `realPathContained(root, candidate)`, atomic same-directory writes and an atomic directory report lock with stale-PID recovery.

- [ ] **Step 4: Verify GREEN and baseline gates**

Run: `deno fmt --check && deno lint && deno check apps/cli/main.ts && deno test tests/unit/time_test.ts tests/unit/paths_test.ts tests/integration/cli_test.ts`

Expected: all checks PASS.

- [ ] **Step 5: Commit**

```bash
git add deno.json apps/cli packages/core tests/unit tests/integration/cli_test.ts
git commit -m "feat(cli): establish aci runtime foundation (#7)"
```

## Task 2: Read-only Codex Adapter and Metrics (#8)

**Files:**
- Create: `packages/codex/parser.ts`
- Create: `packages/codex/adapter.ts`
- Create: `packages/analysis/deterministic.ts`
- Create: `tests/fixtures/codex/window-basic.jsonl`
- Create: `tests/fixtures/codex/window-malicious.jsonl`
- Test: `tests/unit/codex_parser_test.ts`
- Test: `tests/integration/codex_adapter_test.ts`

- [ ] **Step 1: Write failing parser and source-integrity tests**

Use synthetic `session_meta`, user/assistant response items, token usage, tool calls, Skill and subagent records. Assert left-boundary inclusion, right-boundary exclusion, stable IDs, unavailable token fields, duplicate suppression, max-line skip diagnostics, unknown event counting, and unchanged source bytes/mtime/mode after scanning.

- [ ] **Step 2: Verify RED**

Run: `deno test tests/unit/codex_parser_test.ts tests/integration/codex_adapter_test.ts`

Expected: FAIL because the Codex adapter is missing.

- [ ] **Step 3: Implement bounded streaming discovery and parsing**

Discover only `.jsonl` below the resolved Codex session root, reject symlink escapes, stream lines with byte/event/content limits, extract only metric and bounded analysis text fields, hash source/session/project references, prefer native IDs, and fingerprint relevant file metadata plus contents without modifying sources.

- [ ] **Step 4: Verify GREEN**

Run: `deno test tests/unit/codex_parser_test.ts tests/integration/codex_adapter_test.ts`

Expected: parser and source-integrity tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/codex packages/analysis/deterministic.ts tests/fixtures/codex tests/unit/codex_parser_test.ts tests/integration/codex_adapter_test.ts
git commit -m "feat(codex): scan daily sessions read-only (#8)"
```

## Task 3: Work Blocks, Tasks, Scoring and Report Schema (#13, #14, #16)

**Files:**
- Modify: `packages/analysis/deterministic.ts`
- Create: `packages/analysis/scoring.ts`
- Create: `packages/report/schema.ts`
- Test: `tests/unit/deterministic_test.ts`
- Test: `tests/unit/scoring_test.ts`
- Test: `tests/unit/report_schema_test.ts`

- [ ] **Step 1: Write failing inference and rubric tests**

Assert 5-minute active segments, 20-minute same-project/task merge, cross-project separation, independent subagent duration, evidence-linked confidence, usage-only negative cases, unavailable dimensions, L3 requiring 3 iteration+validation tasks, and L4 requiring 5 such tasks plus 2 reusable assets.

- [ ] **Step 2: Verify RED**

Run: `deno test tests/unit/deterministic_test.ts tests/unit/scoring_test.ts tests/unit/report_schema_test.ts`

Expected: FAIL because inference/scoring/schema functions are missing.

- [ ] **Step 3: Implement deterministic task projection and scoring**

Group events by project digest and semantic hint, create bounded human-readable fallback task names, calculate metrics and completeness, derive five dimensions only from explicit evidence, compute weighted score only when dimensions are available, and apply L1-L4 evidence gates independently from usage volume.

- [ ] **Step 4: Verify GREEN plus approved eval**

Run: `deno test tests/unit/deterministic_test.ts tests/unit/scoring_test.ts tests/unit/report_schema_test.ts && python3 -m unittest tests/eval/test_scoring_baseline.py -v && python3 scripts/eval_scoring_baseline.py --gold tests/fixtures/eval/scoring-task-baseline-gold.json --predictions tests/fixtures/eval/scoring-task-baseline-predictions.json --json`

Expected: Deno tests PASS, Python 16/16 PASS, 100-case conformance exits 0.

- [ ] **Step 5: Commit**

```bash
git add packages/analysis packages/report/schema.ts tests/unit
git commit -m "feat(report): infer tasks and evidence maturity (#13 #16)"
```

## Task 4: Idempotent Report Pipeline and Static HTML (#14, #17)

**Files:**
- Create: `packages/report/renderer.ts`
- Create: `packages/report/pipeline.ts`
- Modify: `apps/cli/main.ts`
- Test: `tests/unit/renderer_test.ts`
- Test: `tests/integration/report_pipeline_test.ts`

- [ ] **Step 1: Write failing renderer, revision and injection tests**

Assert fixed section order, exact window/provenance/completeness states, maximum three suggestions, escaping of `<script>`, event handlers and malicious URLs, strict CSP, no `<script>`/remote resources/forms, stable no-op when fingerprint is unchanged, revision increment when source changes, and preservation of the previous current report on injected write failure.

- [ ] **Step 2: Verify RED**

Run: `deno test tests/unit/renderer_test.ts tests/integration/report_pipeline_test.ts`

Expected: FAIL because renderer and pipeline are missing.

- [ ] **Step 3: Implement schema-first atomic report publishing**

Validate `DailyReport`, render escaped self-contained responsive HTML, write report JSON and HTML to a same-filesystem temporary revision, rename only after both validate, update manifest last, regenerate a controlled relative-link history index, and optionally call `/usr/bin/open` with an argv array.

- [ ] **Step 4: Verify GREEN and inspect generated synthetic report**

Run: `deno test tests/unit/renderer_test.ts tests/integration/report_pipeline_test.ts && deno task aci report --date 2026-07-15 --no-ai --source tests/fixtures/codex --data-dir /tmp/aci-plan-smoke`

Expected: tests PASS and `/tmp/aci-plan-smoke/reports/2026-07-15/index.html` exists with no remote requests.

- [ ] **Step 5: Commit**

```bash
git add packages/report apps/cli/main.ts tests/unit/renderer_test.ts tests/integration/report_pipeline_test.ts
git commit -m "feat(report): publish idempotent static daily report (#14 #17)"
```

## Task 5: Consent and Codex Ephemeral Analyzer (#15)

**Files:**
- Create: `packages/analysis/redaction.ts`
- Create: `packages/analysis/codex_analyzer.ts`
- Create: `packages/analysis/analysis-schema.json`
- Create: `packages/runtime/commands.ts`
- Modify: `packages/report/pipeline.ts`
- Modify: `apps/cli/main.ts`
- Test: `tests/unit/redaction_test.ts`
- Test: `tests/integration/codex_analyzer_test.ts`

- [ ] **Step 1: Write failing disclosure, redaction, argv and fallback tests**

Assert no subprocess before consent, consent schema/disclosure version, API keys and private paths removed, code/tool output truncated, non-shell `codex exec --ephemeral --ignore-user-config --ignore-rules --sandbox read-only` argv with only allowlisted model-provider route overrides, empty temp cwd, bounded stdin, four-task core batches, partial coverage after an isolated batch timeout, invalid JSON, extra suggestions and missing Codex all returning deterministic fallback status.

- [ ] **Step 2: Verify RED**

Run: `deno test tests/unit/redaction_test.ts tests/integration/codex_analyzer_test.ts`

Expected: FAIL because consent and analyzer are missing.

- [ ] **Step 3: Implement minimal authorized analyzer**

Persist only disclosure version/time/scope, build a minimal redacted package from bounded event text and deterministic tasks, invoke an injected command runner with stdin and timeout, parse only the output file, validate schema/business limits, merge model fields as untrusted text, and preserve deterministic evidence when any stage fails.

- [ ] **Step 4: Verify GREEN**

Run: `deno test tests/unit/redaction_test.ts tests/integration/codex_analyzer_test.ts`

Expected: all analyzer and fallback cases PASS without accessing real Codex auth or logs.

- [ ] **Step 5: Commit**

```bash
git add packages/analysis packages/runtime packages/report/pipeline.ts apps/cli/main.ts tests/unit/redaction_test.ts tests/integration/codex_analyzer_test.ts
git commit -m "feat(analysis): add consented ephemeral review (#15)"
```

## Task 6: Launchd, Catch-up, Purge and Install Lifecycle (#14, #25)

**Files:**
- Modify: `packages/runtime/commands.ts`
- Create: `scripts/install.sh`
- Create: `scripts/uninstall.sh`
- Test: `tests/unit/catch_up_test.ts`
- Test: `tests/integration/schedule_test.ts`
- Test: `tests/e2e/install_smoke_test.ts`

- [ ] **Step 1: Write failing scheduler, purge and temporary-HOME tests**

Assert local 19:00 `StartCalendarInterval`, `RunAtLoad`, fixed absolute argv without shell, idempotent install/remove, at most 7 missing closed windows in chronological order, manifest-owned purge rejecting symlinks/root/home/Codex paths, default uninstall preserving reports, and `--purge-data` removing only application data.

- [ ] **Step 2: Verify RED**

Run: `deno test tests/unit/catch_up_test.ts tests/integration/schedule_test.ts tests/e2e/install_smoke_test.ts`

Expected: FAIL because schedule/install lifecycle is missing.

- [ ] **Step 3: Implement user-domain lifecycle**

Generate a deterministic plist, use `launchctl bootstrap/bootout` argv on real macOS and a dry-run runner in tests, calculate closed missing windows from manifest, implement ownership-safe purge, and write POSIX installer/uninstaller scripts that detect `arm64`/`x86_64`, verify the release checksum, chmod, atomically rename and never call `sudo`.

- [ ] **Step 4: Verify GREEN**

Run: `deno test tests/unit/catch_up_test.ts tests/integration/schedule_test.ts tests/e2e/install_smoke_test.ts && sh -n scripts/install.sh scripts/uninstall.sh`

Expected: all lifecycle tests and shell syntax checks PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/runtime packages/core/time.ts scripts tests/unit/catch_up_test.ts tests/integration/schedule_test.ts tests/e2e/install_smoke_test.ts
git commit -m "feat(install): add launchd and user lifecycle (#14 #25)"
```

## Task 7: CI, Privacy, Documentation and Release Automation (#24, #25)

**Files:**
- Create: `scripts/privacy_check.sh`
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`
- Modify: `README.md`
- Modify: `CONTRIBUTING.md`
- Create: `docs/RELEASES/v0.1.0.md`
- Test: `tests/integration/privacy_gate_test.ts`

- [ ] **Step 1: Write failing privacy gate tests**

Use temporary synthetic files to prove private absolute paths, known secret formats, real session metadata patterns, SQLite databases and generated personal report paths fail while repository fixtures pass.

- [ ] **Step 2: Verify RED**

Run: `deno test tests/integration/privacy_gate_test.ts`

Expected: FAIL because the privacy checker does not exist.

- [ ] **Step 3: Implement reproducible CI and release workflows**

Add a narrow repository scanner with fixture allowlist, pin Deno 2.7.1, run fmt/lint/check/test/eval/privacy, compile and smoke-test arm64/x64 macOS binaries, upload checksums, generate GitHub artifact attestations, and publish on `v*` tags. Document install, consent, daily report, scheduler, purge, uninstall, data boundaries and known unsigned/notarized limitation.

- [ ] **Step 4: Verify GREEN and full local gate**

Run: `deno task verify && python3 -m unittest tests/eval/test_scoring_baseline.py -v && sh scripts/privacy_check.sh && sh -n scripts/install.sh scripts/uninstall.sh`

Expected: every gate exits 0 with no skipped checks.

- [ ] **Step 5: Commit**

```bash
git add scripts .github README.md CONTRIBUTING.md docs/RELEASES tests/integration/privacy_gate_test.ts deno.json
git commit -m "ci: enforce Codex daily release gates (#24 #25)"
```

## Task 8: Visual, Security and Release Verification (#17, #24, #25)

**Files:**
- Modify as failures require: only files owned by Tasks 1-7
- Create: `docs/TESTS/v0.1.0-verification.md`
- Modify: `docs/RELEASES/v0.1.0.md`

- [ ] **Step 1: Generate only synthetic report fixtures**

Run the compiled binary with a temporary HOME and `tests/fixtures/codex`; never point release evidence at real `~/.codex`.

- [ ] **Step 2: Verify static report visually and technically**

Open the local file URL at desktop and narrow mobile widths. Capture screenshots outside tracked paths; verify no overflow/overlap, all three sections, visible degraded states, no JavaScript execution, no network requests and nonblank content.

- [ ] **Step 3: Run the complete release matrix**

Run: `deno task verify`, scoring conformance, privacy scan, source-integrity tests, both `deno compile --target` commands, SHA-256 verification, temporary-HOME installer/doctor/report/schedule/uninstall/reinstall smoke, and `git diff --check`.

Expected: all commands exit 0; source fixture digest/mtime/mode are unchanged; no real data appears in `git diff` or artifacts.

- [ ] **Step 4: Record evidence and commit**

```bash
git add docs/TESTS/v0.1.0-verification.md docs/RELEASES/v0.1.0.md
git commit -m "docs(release): record v0.1.0 verification (#25)"
```

- [ ] **Step 5: Merge, tag and publish**

Push issue branches, open PRs with exact verification commands, wait for required checks, merge into `main`, tag `v0.1.0`, publish the GitHub Release, then install from the public Release assets and confirm `aci version`, `aci doctor`, one synthetic `report --no-ai`, and schedule status.

## Self-review

- Spec coverage: #7/#8/#13/#14/#15/#16/#17/#24/#25 and every non-negotiable MVP boundary map to Tasks 1-8.
- Placeholder scan: no TBD/TODO or unspecified implementation step remains.
- Type consistency: `UnifiedEvent` is produced only by Codex adapter; `DailyReport` is the only renderer input; manifest owns current revision; optional analyzer only enriches schema-valid deterministic output.
- Scope control: no second adapter, weekly/monthly aggregation, daemon, localhost API, SQLite, dynamic Dashboard, correction overlay, `.app`, signing, notarization or updater is included.
