# Contributing

AI Collaboration Insights `v0.2.2` 当前处于 Codex-only 日报公开 alpha 阶段。

## Before Starting

1. Check existing issues and discussions.
2. Confirm the task is not blocked by an unresolved product or architecture decision.
3. Comment on the issue before starting substantial work.

## Branches

- feature/<issue>-<slug>
- fix/<issue>-<slug>
- docs/<issue>-<slug>
- spike/<issue>-<slug>

The main branch is release-ready. Changes reach main through pull requests.

## Pull Requests

- Reference the issue.
- Explain the user-visible behavior delivered.
- Include tests or verification evidence.
- Describe privacy impact and data handling changes.
- Keep unrelated refactors out of the pull request.

## Local Verification

提交 PR 前至少运行：

```sh
deno task verify
python3 -m unittest tests/eval/test_scoring_baseline.py -v
python3 scripts/eval_scoring_baseline.py \
  --rubric tests/eval/scoring-baseline/rubric.v1.json \
  --cases tests/eval/scoring-baseline/cases.v1.jsonl \
  --predictions tests/eval/scoring-baseline/predictions.conformance.jsonl
python3 -m unittest tests/eval/test_progressive_analysis.py -v
python3 scripts/eval_progressive_analysis.py \
  --gold tests/eval/progressive-analysis/gold.synthetic.v1.jsonl \
  --predictions tests/eval/progressive-analysis/predictions.conformance.v1.jsonl \
  --share-safe
sh scripts/privacy_check.sh
sh -n scripts/install.sh scripts/uninstall.sh scripts/privacy_check.sh
git diff --check
```

CI 固定使用 Deno `2.7.1`，任何失败或跳过都不能作为通过证据。

## Test Data

Only synthetic or irreversibly redacted fixtures are allowed. Never commit:

- Real prompts, responses, or tool outputs.
- Local project paths or repository names.
- API keys, tokens, cookies, or model service credentials.
- Generated personal reports or local databases.

## Commit Style

Use Conventional Commits where practical:

- feat: new user-visible capability
- fix: bug fix
- docs: documentation only
- test: tests or evaluation fixtures
- refactor: internal behavior-preserving change
- chore: repository maintenance
