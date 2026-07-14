import copy
import json
import subprocess
import sys
import tempfile
import unittest
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path

from scripts import eval_scoring_baseline as runner


ROOT = Path(__file__).resolve().parents[2]
RUBRIC_PATH = ROOT / "tests/eval/scoring-baseline/rubric.v1.json"
SCRIPT_PATH = ROOT / "scripts/eval_scoring_baseline.py"
TOOLS = ["codex", "claude-code", "opencode", "workbuddy", "qoder"]
DIMENSIONS = [
    "taskDefinition",
    "collaborationOrchestration",
    "iterationDepth",
    "verificationClosure",
    "assetCreation",
]


def dimensions(score=50):
    return {name: score for name in DIMENSIONS}


def availability(state="present"):
    return {name: state for name in DIMENSIONS}


def make_records():
    gold = []
    predictions = []
    base = datetime(2026, 1, 1, 9, tzinfo=timezone.utc)
    for index in range(100):
        case_id = f"synthetic-{index:03d}"
        start = base + timedelta(days=index % 4, minutes=index)
        common = {
            "caseId": case_id,
            "taskBoundary": {"segmentIds": [f"segment-{index:03d}"]},
            "project": f"project-{index % 3}",
            "deliverable": f"synthetic deliverable {index}",
            "verificationStatus": "verified",
            "complexity": (index % 3) + 1,
            "dimensionScores": dimensions(),
            "evidenceGates": {
                "iteration": "present",
                "verification": "present",
                "asset": "observed_absent",
            },
            "riskLabels": [],
            "confidence": 0.9,
            "availability": availability(),
        }
        gold.append(
            {
                **copy.deepcopy(common),
                "sourceTool": TOOLS[index // 20],
                "evidenceWindow": {
                    "day": start.date().isoformat(),
                    "start": start.isoformat().replace("+00:00", "Z"),
                    "end": (start + timedelta(minutes=5))
                    .isoformat()
                    .replace("+00:00", "Z"),
                },
                "acceptedTaskNames": [f"task-{index:03d}"],
                "testTags": [],
            }
        )
        predictions.append(
            {
                **copy.deepcopy(common),
                "taskName": f"task-{index:03d}",
            }
        )
    return gold, predictions


class ScoringBaselineTests(unittest.TestCase):
    def setUp(self):
        self.rubric = json.loads(RUBRIC_PATH.read_text(encoding="utf-8"))
        self.gold, self.predictions = make_records()

    def assert_validation_error(self, rubric=None, gold=None, predictions=None):
        with self.assertRaises(runner.ValidationError):
            runner.validate_inputs(
                rubric or self.rubric,
                gold if gold is not None else self.gold,
                predictions if predictions is not None else self.predictions,
            )

    def test_rejects_wrong_case_count_tool_coverage_and_duplicate_ids(self):
        self.assert_validation_error(gold=self.gold[:-1], predictions=self.predictions[:-1])

        wrong_coverage = copy.deepcopy(self.gold)
        wrong_coverage[0]["sourceTool"] = "claude-code"
        self.assert_validation_error(gold=wrong_coverage)

        duplicate = copy.deepcopy(self.gold)
        duplicate[-1]["caseId"] = duplicate[0]["caseId"]
        self.assert_validation_error(gold=duplicate)

        duplicate_predictions = copy.deepcopy(self.predictions)
        duplicate_predictions[-1]["caseId"] = duplicate_predictions[0]["caseId"]
        self.assert_validation_error(predictions=duplicate_predictions)

    def test_rejects_invalid_weights_and_complexity(self):
        bad_rubric = copy.deepcopy(self.rubric)
        bad_rubric["dimensions"]["taskDefinition"] = 19
        self.assert_validation_error(rubric=bad_rubric)

        bad_gold = copy.deepcopy(self.gold)
        bad_gold[0]["complexity"] = 4
        self.assert_validation_error(gold=bad_gold)

        bad_prediction = copy.deepcopy(self.predictions)
        bad_prediction[0]["complexity"] = True
        self.assert_validation_error(predictions=bad_prediction)

    def test_rejects_missing_or_extra_predictions(self):
        self.assert_validation_error(predictions=self.predictions[:-1])

        extra = copy.deepcopy(self.predictions)
        extra.append({**copy.deepcopy(extra[0]), "caseId": "synthetic-extra"})
        self.assert_validation_error(predictions=extra)

        replaced = copy.deepcopy(self.predictions)
        replaced[-1]["caseId"] = "synthetic-extra"
        self.assert_validation_error(predictions=replaced)

    def test_validates_record_shape_and_unavailable_score_linkage(self):
        runner.validate_inputs(self.rubric, self.gold, self.predictions)

        malformed = copy.deepcopy(self.gold)
        malformed[0]["taskBoundary"] = {"segmentIds": []}
        self.assert_validation_error(gold=malformed)

        malformed = copy.deepcopy(self.gold)
        malformed[0]["evidenceWindow"]["extra"] = "not allowed"
        self.assert_validation_error(gold=malformed)

        malformed = copy.deepcopy(self.predictions)
        malformed[0]["availability"]["taskDefinition"] = "unavailable"
        self.assert_validation_error(predictions=malformed)

        valid_unavailable_gold = copy.deepcopy(self.gold)
        valid_unavailable_prediction = copy.deepcopy(self.predictions)
        for records in (valid_unavailable_gold, valid_unavailable_prediction):
            records[0]["availability"]["taskDefinition"] = "unavailable"
            records[0]["dimensionScores"]["taskDefinition"] = None
        runner.validate_inputs(
            self.rubric, valid_unavailable_gold, valid_unavailable_prediction
        )

    def test_decimal_scoring_normalizes_each_aggregation_layer(self):
        records = []
        day_by_case = {}
        for index, score in enumerate((10.005, 20.005, 30.005)):
            record = copy.deepcopy(self.predictions[index])
            record["dimensionScores"] = dimensions(score)
            record["complexity"] = 1
            records.append(record)
            day_by_case[record["caseId"]] = date(2026, 1, index + 1)

        summary = runner.score_records(self.rubric, records, day_by_case)

        self.assertEqual(
            list(summary["taskScores"].values()),
            [Decimal("10.01"), Decimal("20.01"), Decimal("30.01")],
        )
        self.assertEqual(
            list(summary["dayScores"].values()),
            [Decimal("10.01"), Decimal("20.01"), Decimal("30.01")],
        )
        self.assertEqual(summary["rolling28DayScore"], Decimal("20.01"))

        day_by_case[records[1]["caseId"]] = date(2026, 1, 29)
        day_by_case[records[2]["caseId"]] = date(2026, 1, 30)
        rolling_window = runner.score_records(self.rubric, records, day_by_case)
        self.assertEqual(rolling_window["rolling28DayScore"], Decimal("25.01"))

        first = copy.deepcopy(records[0])
        second = copy.deepcopy(records[1])
        first["complexity"] = 1
        second["complexity"] = 3
        same_day = {first["caseId"]: date(2026, 1, 1), second["caseId"]: date(2026, 1, 1)}
        weighted = runner.score_records(self.rubric, [first, second], same_day)
        self.assertEqual(weighted["dayScores"]["2026-01-01"], Decimal("17.51"))

    def test_unavailable_dimension_makes_task_score_null(self):
        record = copy.deepcopy(self.predictions[0])
        record["availability"]["assetCreation"] = "unavailable"
        record["dimensionScores"]["assetCreation"] = None
        summary = runner.score_records(
            self.rubric, [record], {record["caseId"]: date(2026, 1, 1)}
        )
        self.assertIsNone(summary["taskScores"][record["caseId"]])
        self.assertIsNone(summary["rolling28DayScore"])

    def test_maturity_applies_insufficient_evidence_and_l3_l4_downgrades(self):
        records = copy.deepcopy(self.predictions[:5])
        self.assertIsNone(runner.assign_maturity(self.rubric, Decimal("85.00"), 2, records))

        for record in records:
            record["evidenceGates"]["asset"] = "observed_absent"
        records[0]["evidenceGates"]["asset"] = "present"
        self.assertEqual(
            runner.assign_maturity(self.rubric, Decimal("85.00"), 3, records), "L3"
        )

        for record in records[2:]:
            record["evidenceGates"]["iteration"] = "observed_absent"
        self.assertEqual(
            runner.assign_maturity(self.rubric, Decimal("85.00"), 3, records), "L2"
        )

        for record in records:
            record["evidenceGates"]["iteration"] = "present"
        records[1]["evidenceGates"]["asset"] = "present"
        self.assertEqual(
            runner.assign_maturity(self.rubric, Decimal("85.00"), 3, records), "L4"
        )

    def test_report_exactly_compares_gold_and_prediction_aggregates_and_maturity(self):
        report = runner.build_report(self.rubric, self.gold, self.predictions)
        self.assertTrue(report["qualityGatePassed"])
        self.assertTrue(report["gates"]["aggregationExactMatch"])
        self.assertTrue(report["gates"]["maturityExactMatch"])

        changed = copy.deepcopy(self.predictions)
        changed[0]["dimensionScores"] = dimensions(0)
        report = runner.build_report(self.rubric, self.gold, changed)
        self.assertFalse(report["qualityGatePassed"])
        self.assertFalse(report["gates"]["aggregationExactMatch"])

        changed = copy.deepcopy(self.predictions)
        for record in changed:
            record["dimensionScores"] = dimensions(85)
        for record in self.gold:
            record["dimensionScores"] = dimensions(85)
        self.gold[0]["evidenceGates"]["asset"] = "present"
        self.gold[1]["evidenceGates"]["asset"] = "present"
        report = runner.build_report(self.rubric, self.gold, changed)
        self.assertTrue(report["gates"]["aggregationExactMatch"])
        self.assertFalse(report["gates"]["maturityExactMatch"])

    def test_joint_name_project_gates_overall_and_each_gold_source_tool(self):
        predictions = copy.deepcopy(self.predictions)
        for record in predictions[:7]:
            record["taskName"] = "wrong"
        report = runner.build_report(self.rubric, self.gold, predictions)
        joint = report["metrics"]["jointTaskNameProjectConsistency"]
        self.assertEqual(joint["overall"], 0.93)
        self.assertEqual(joint["perTool"]["codex"], 0.65)
        self.assertFalse(report["gates"]["jointTaskNameProjectConsistency"])

        predictions = copy.deepcopy(self.predictions)
        for record in predictions[:21]:
            record["project"] = "wrong"
        report = runner.build_report(self.rubric, self.gold, predictions)
        self.assertEqual(
            report["metrics"]["jointTaskNameProjectConsistency"]["overall"], 0.79
        )
        self.assertFalse(report["gates"]["jointTaskNameProjectConsistency"])

    def test_boundary_micro_f1_and_zero_denominator(self):
        gold = [
            {"taskBoundary": {"segmentIds": ["a", "b"]}},
            {"taskBoundary": {"segmentIds": ["d"]}},
        ]
        predictions = [
            {"taskBoundary": {"segmentIds": ["b", "c"]}},
            {"taskBoundary": {"segmentIds": ["d"]}},
        ]
        self.assertAlmostEqual(runner.boundary_micro_f1(gold, predictions), 2 / 3)
        self.assertEqual(runner.boundary_micro_f1([], []), 1.0)

    def test_usage_only_risk_negative_is_a_gate(self):
        self.gold[0]["testTags"] = ["usage_only_risk_negative"]
        self.predictions[0]["usageContext"] = {
            "tokenCount": 999999,
            "duration": 999999,
        }
        self.predictions[0]["riskLabels"] = ["high_usage"]
        report = runner.build_report(self.rubric, self.gold, self.predictions)
        self.assertFalse(report["gates"]["usageOnlyRiskNegative"])
        self.assertFalse(report["qualityGatePassed"])

    def test_cli_emits_json_and_uses_nonzero_for_gate_or_validation_failure(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            rubric_path = directory / "rubric.json"
            gold_path = directory / "gold.jsonl"
            prediction_path = directory / "predictions.jsonl"
            rubric_path.write_text(json.dumps(self.rubric), encoding="utf-8")

            def write_jsonl(path, records):
                path.write_text(
                    "".join(json.dumps(record) + "\n" for record in records),
                    encoding="utf-8",
                )

            write_jsonl(gold_path, self.gold)
            write_jsonl(prediction_path, self.predictions)
            command = [
                sys.executable,
                str(SCRIPT_PATH),
                "--rubric",
                str(rubric_path),
                "--cases",
                str(gold_path),
                "--predictions",
                str(prediction_path),
            ]

            passed = subprocess.run(command, capture_output=True, text=True, check=False)
            self.assertEqual(passed.returncode, 0, passed.stderr)
            self.assertTrue(json.loads(passed.stdout)["qualityGatePassed"])

            failing_predictions = copy.deepcopy(self.predictions)
            failing_predictions[0]["riskLabels"] = ["usage"]
            self.gold[0]["testTags"] = ["usage_only_risk_negative"]
            write_jsonl(gold_path, self.gold)
            write_jsonl(prediction_path, failing_predictions)
            gate_failure = subprocess.run(command, capture_output=True, text=True, check=False)
            self.assertNotEqual(gate_failure.returncode, 0)
            self.assertIn("quality gate failed", gate_failure.stderr.lower())

            write_jsonl(prediction_path, failing_predictions[:-1])
            validation_failure = subprocess.run(
                command, capture_output=True, text=True, check=False
            )
            self.assertNotEqual(validation_failure.returncode, 0)
            self.assertIn("validation error", validation_failure.stderr.lower())


if __name__ == "__main__":
    unittest.main()
