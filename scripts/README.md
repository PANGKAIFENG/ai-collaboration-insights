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

## Progressive analysis eval

Run the Issue #57 task-reconstruction and progressive-analysis gate with the
same JSONL contract for public synthetic or ignored private-local annotations:

```sh
python3 scripts/eval_progressive_analysis.py \
  --gold tests/eval/progressive-analysis/gold.synthetic.v1.jsonl \
  --predictions tests/eval/progressive-analysis/predictions.conformance.v1.jsonl \
  --share-safe
```

The primary metric is B-cubed task-grouping F1. Overall F1 must be at least 80%
and every required boundary slice at least 70%. Relation edges, semantic-round
accuracy, typed-evidence precision/state accuracy, analysis coverage and
degradation status are reported separately. A private dataset additionally
requires at least 20 final gold task groups and 30 labeled semantic rounds.

`--share-safe` emits aggregate counts, ratios and gates only. It excludes
dataset IDs, case IDs, paths, content and per-case diagnostics. Exit code `0`
means all release gates passed, `1` means valid inputs failed a quality gate,
and `2` means contract or input validation failed.
