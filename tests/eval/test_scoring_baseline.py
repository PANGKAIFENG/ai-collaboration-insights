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

    def test_rejects_missing_or_changed_execution_rubric_config(self):
        missing_l4 = copy.deepcopy(self.rubric)
        del missing_l4["maturity"]["L4"]
        with self.assertRaises(runner.ValidationError):
            runner.validate_rubric(missing_l4)

        for invalid_minimum in ("0.8", 0.81):
            with self.subTest(overallMinimum=invalid_minimum):
                changed_gate = copy.deepcopy(self.rubric)
                changed_gate["qualityGates"]["jointTaskNameProjectConsistency"][
                    "overallMinimum"
                ] = invalid_minimum
                with self.assertRaises(runner.ValidationError):
                    runner.validate_rubric(changed_gate)

        missing_aggregation_config = copy.deepcopy(self.rubric)
        del missing_aggregation_config["aggregation"]["minimumActiveDaysForMaturity"]
        with self.assertRaises(runner.ValidationError):
            runner.validate_rubric(missing_aggregation_config)

        changed_configs = []
        changed_decimal = copy.deepcopy(self.rubric)
        changed_decimal["aggregation"]["decimal"]["mode"] = "ROUND_DOWN"
        changed_configs.append(changed_decimal)
        changed_assignment = copy.deepcopy(self.rubric)
        del changed_assignment["maturity"]["assignment"]["result"]
        changed_configs.append(changed_assignment)
        changed_l3_gate = copy.deepcopy(self.rubric)
        changed_l3_gate["maturity"]["L3"]["minimumIteratedAndVerifiedTasks"] = 2
        changed_configs.append(changed_l3_gate)
        changed_per_tool = copy.deepcopy(self.rubric)
        changed_per_tool["qualityGates"]["jointTaskNameProjectConsistency"][
            "perToolMinimum"
        ] = 0.69
        changed_configs.append(changed_per_tool)
        changed_exact_gate = copy.deepcopy(self.rubric)
        changed_exact_gate["qualityGates"]["aggregationExactMatch"] = False
        changed_configs.append(changed_exact_gate)
        changed_boundary = copy.deepcopy(self.rubric)
        changed_boundary["qualityGates"]["boundaryF1"]["formula"] = "macro"
        changed_configs.append(changed_boundary)
        changed_usage_gate = copy.deepcopy(self.rubric)
        changed_usage_gate["qualityGates"]["usageOnlyRiskNegativeGate"][
            "goldTestTag"
        ] = "changed"
        changed_configs.append(changed_usage_gate)

        for changed_config in changed_configs:
            with self.subTest(changed_config=changed_config):
                with self.assertRaises(runner.ValidationError):
                    runner.validate_rubric(changed_config)

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

    def test_unhashable_json_values_are_validation_errors(self):
        invalid_source_tools = copy.deepcopy(self.rubric)
        invalid_source_tools["dataset"]["sourceTools"][0] = {"tool": "codex"}
        with self.assertRaises(runner.ValidationError):
            runner.validate_rubric(invalid_source_tools)

        invalid_availability = copy.deepcopy(self.predictions)
        invalid_availability[0]["availability"]["taskDefinition"] = {
            "state": "present"
        }
        self.assert_validation_error(predictions=invalid_availability)

        invalid_evidence_gate = copy.deepcopy(self.predictions)
        invalid_evidence_gate[0]["evidenceGates"]["iteration"] = ["present"]
        self.assert_validation_error(predictions=invalid_evidence_gate)

        invalid_required_fields = copy.deepcopy(self.rubric)
        invalid_required_fields["recordContract"]["predictionRequiredFields"].append(
            {"field": "taskName"}
        )
        self.assert_validation_error(rubric=invalid_required_fields)

        invalid_prohibited_inputs = copy.deepcopy(self.rubric)
        invalid_prohibited_inputs["prohibitedScoringInputs"].append(
            {"field": "tokenCount"}
        )
        with self.assertRaises(runner.ValidationError):
            runner.validate_rubric(invalid_prohibited_inputs)

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

    def test_unavailable_task_scores_still_count_for_maturity_evidence(self):
        valid_records = copy.deepcopy(self.predictions[:3])
        day_by_case = {}
        for index, record in enumerate(valid_records):
            record["dimensionScores"] = dimensions(85)
            record["evidenceGates"] = {
                "iteration": "observed_absent",
                "verification": "observed_absent",
                "asset": "observed_absent",
            }
            day_by_case[record["caseId"]] = date(2026, 1, index + 1)

        unavailable_records = copy.deepcopy(self.predictions[3:8])
        for index, record in enumerate(unavailable_records):
            record["dimensionScores"]["taskDefinition"] = None
            record["availability"]["taskDefinition"] = "unavailable"
            record["evidenceGates"] = {
                "iteration": "present",
                "verification": "present",
                "asset": "present" if index < 2 else "observed_absent",
            }
            day_by_case[record["caseId"]] = date(2026, 1, (index % 3) + 1)

        l3_summary = runner.score_records(
            self.rubric, valid_records + unavailable_records[:3], day_by_case
        )
        self.assertEqual(l3_summary["rolling28DayScore"], Decimal("85.00"))
        self.assertEqual(l3_summary["maturity"], "L3")

        l4_summary = runner.score_records(
            self.rubric, valid_records + unavailable_records, day_by_case
        )
        self.assertEqual(l4_summary["rolling28DayScore"], Decimal("85.00"))
        self.assertEqual(l4_summary["maturity"], "L4")

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

    def test_usage_only_gate_rejects_risk_complexity_and_dimension_changes(self):
        self.gold[0]["testTags"] = ["usage_only_risk_negative"]
        self.predictions[0]["usageContext"] = {
            "tokenCount": 999999,
            "duration": 999999,
        }

        mutations = []
        risk_changed = copy.deepcopy(self.predictions)
        risk_changed[0]["riskLabels"] = ["high_usage"]
        mutations.append(("risk label", risk_changed))

        complexity_changed = copy.deepcopy(self.predictions)
        complexity_changed[0]["complexity"] = 3
        mutations.append(("complexity", complexity_changed))

        dimensions_changed = copy.deepcopy(self.predictions)
        dimensions_changed[0]["dimensionScores"]["taskDefinition"] = 60
        dimensions_changed[0]["dimensionScores"]["collaborationOrchestration"] = 40
        mutations.append(("dimension scores", dimensions_changed))

        for field, predictions in mutations:
            with self.subTest(field=field):
                report = runner.build_report(self.rubric, self.gold, predictions)
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

            malformed_rubric = copy.deepcopy(self.rubric)
            del malformed_rubric["maturity"]["L4"]
            rubric_path.write_text(json.dumps(malformed_rubric), encoding="utf-8")
            write_jsonl(prediction_path, self.predictions)
            malformed_rubric_failure = subprocess.run(
                command, capture_output=True, text=True, check=False
            )
            self.assertEqual(malformed_rubric_failure.returncode, 2)
            self.assertIn("validation error", malformed_rubric_failure.stderr.lower())

    def test_cli_maps_unhashable_json_types_to_validation_errors(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            rubric_path = directory / "rubric.json"
            gold_path = directory / "gold.jsonl"
            prediction_path = directory / "predictions.jsonl"

            def write_jsonl(path, records):
                path.write_text(
                    "".join(json.dumps(record) + "\n" for record in records),
                    encoding="utf-8",
                )

            write_jsonl(gold_path, self.gold)
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

            invalid_inputs = []
            source_tool_object = copy.deepcopy(self.rubric)
            source_tool_object["dataset"]["sourceTools"][0] = {"tool": "codex"}
            invalid_inputs.append(("sourceTool object", source_tool_object, self.predictions))
            availability_object = copy.deepcopy(self.predictions)
            availability_object[0]["availability"]["taskDefinition"] = {
                "state": "present"
            }
            invalid_inputs.append(("availability object", self.rubric, availability_object))
            evidence_gate_array = copy.deepcopy(self.predictions)
            evidence_gate_array[0]["evidenceGates"]["iteration"] = ["present"]
            invalid_inputs.append(("evidence gate array", self.rubric, evidence_gate_array))

            for case, rubric, predictions in invalid_inputs:
                with self.subTest(case=case):
                    rubric_path.write_text(json.dumps(rubric), encoding="utf-8")
                    write_jsonl(prediction_path, predictions)
                    result = subprocess.run(
                        command, capture_output=True, text=True, check=False
                    )
                    self.assertEqual(result.returncode, 2)
                    self.assertIn("validation error", result.stderr.lower())
                    self.assertNotIn("traceback", result.stderr.lower())


if __name__ == "__main__":
    unittest.main()
