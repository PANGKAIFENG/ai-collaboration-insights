# Repository Scripts

Deterministic repository automation belongs here: fixture validation, compatibility checks, eval runners, documentation checks, release verification, and local development helpers.

Scripts must avoid uploading local data, modifying source logs, or depending on untracked personal paths.

## Scoring baseline eval

Run the Issue #5 deterministic scoring baseline with a rubric JSON, synthetic gold
case JSONL, and prediction JSONL:

```sh
python3 scripts/eval_scoring_baseline.py \
  --rubric tests/eval/scoring-baseline/rubric.v1.json \
  --cases path/to/cases.jsonl \
  --predictions path/to/predictions.jsonl
```

The runner joins predictions to gold cases by `caseId`, uses gold `sourceTool` and
`evidenceWindow.day` for grouping, and writes only aggregate JSON metrics to
stdout. Exit code `0` means every quality gate passed, `1` means valid inputs
failed a quality gate, and `2` means input or contract validation failed. Failure
details are written to stderr.
