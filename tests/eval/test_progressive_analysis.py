import copy
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from scripts import eval_progressive_analysis as runner


ROOT = Path(__file__).resolve().parents[2]
SCRIPT = ROOT / "scripts/eval_progressive_analysis.py"
FIXTURES = ROOT / "tests/eval/progressive-analysis"
TASK_SLICES = [
    "system_scaffolding",
    "goal_split",
    "explicit_continuation",
    "shared_deliverable",
    "parent_child",
    "ambiguous_proximity",
]


def dataset(kind="synthetic"):
    gold = [{
        "contractVersion": "1",
        "recordType": "metadata",
        "datasetId": "synthetic-progressive-v1",
        "datasetKind": kind,
    }]
    predictions = copy.deepcopy(gold)
    for index, slice_name in enumerate(TASK_SLICES):
        case_id = f"task-{index + 1}"
        members = [
            {"id": f"member-{index + 1}-a", "groupId": f"gold-{index + 1}"},
            {"id": f"member-{index + 1}-b", "groupId": f"gold-{index + 1}"},
            {"id": f"member-{index + 1}-c", "groupId": f"gold-{index + 1}-other"},
        ]
        gold.append({
            "contractVersion": "1",
            "recordType": "task_grouping",
            "caseId": case_id,
            "slice": slice_name,
            "members": members,
            "relations": [{
                "from": members[0]["id"],
                "to": members[1]["id"],
                "type": "continuation",
            }],
        })
        predicted = copy.deepcopy(gold[-1])
        for member in predicted["members"]:
            member["groupId"] = member["groupId"].replace("gold", "prediction")
        predictions.append(predicted)

    rounds = [
        {"id": f"round-{index + 1}", "effective": index % 2 == 0}
        for index in range(10)
    ]
    gold.append({
        "contractVersion": "1",
        "recordType": "semantic_rounds",
        "caseId": "rounds-1",
        "slice": "test_fix_retest",
        "rounds": rounds,
    })
    predictions.append(copy.deepcopy(gold[-1]))

    evidence = [
        {"id": "evidence-verification", "type": "verification", "state": "present"},
        {"id": "evidence-agent", "type": "subagent", "state": "present"},
        {"id": "evidence-asset", "type": "assetization", "state": "observed_absent"},
    ]
    gold.append({
        "contractVersion": "1",
        "recordType": "evidence",
        "caseId": "evidence-1",
        "slice": "typed_evidence",
        "evidence": evidence,
    })
    predictions.append(copy.deepcopy(gold[-1]))

    gold.append({
        "contractVersion": "1",
        "recordType": "analysis_coverage",
        "caseId": "analysis-1",
        "slice": "partial_degradation",
        "taskIds": ["task-a", "task-b"],
        "expectedAnalyzedTaskIds": ["task-a"],
        "expectedStatus": "partial",
    })
    predictions.append({
        "contractVersion": "1",
        "recordType": "analysis_coverage",
        "caseId": "analysis-1",
        "slice": "partial_degradation",
        "analyzedTaskIds": ["task-a"],
        "status": "partial",
    })
    return gold, predictions


class ProgressiveAnalysisEvalTests(unittest.TestCase):
    def setUp(self):
        self.gold, self.predictions = dataset()

    def test_grouping_uses_partition_equivalence_and_required_slice_gates(self):
        report = runner.build_report(self.gold, self.predictions)
        self.assertEqual(report["metrics"]["taskGrouping"]["overall"]["f1"], 1.0)
        self.assertTrue(report["gates"]["taskGrouping"])

        changed = copy.deepcopy(self.predictions)
        target = next(record for record in changed if record.get("caseId") == "task-1")
        target["members"][1]["groupId"] = target["members"][2]["groupId"]
        failed = runner.build_report(self.gold, changed)
        self.assertGreaterEqual(failed["metrics"]["taskGrouping"]["overall"]["f1"], 0.8)
        self.assertLess(
            failed["metrics"]["taskGrouping"]["perSlice"]["system_scaffolding"]["f1"],
            0.7,
        )
        self.assertFalse(failed["gates"]["taskGrouping"])

    def test_relation_edges_are_diagnostic_only(self):
        changed = copy.deepcopy(self.predictions)
        target = next(record for record in changed if record.get("caseId") == "task-2")
        target["relations"] = []
        report = runner.build_report(self.gold, changed)
        self.assertEqual(report["metrics"]["taskGrouping"]["overall"]["f1"], 1.0)
        self.assertLess(report["metrics"]["relationDiagnostics"]["f1"], 1.0)
        self.assertTrue(report["gates"]["taskGrouping"])

    def test_reports_round_evidence_coverage_and_degradation_separately(self):
        changed = copy.deepcopy(self.predictions)
        rounds = next(record for record in changed if record.get("caseId") == "rounds-1")
        rounds["rounds"][0]["effective"] = False
        evidence = next(record for record in changed if record.get("caseId") == "evidence-1")
        evidence["evidence"][0]["state"] = "observed_absent"
        coverage = next(record for record in changed if record.get("caseId") == "analysis-1")
        coverage["analyzedTaskIds"] = []
        coverage["status"] = "complete"

        report = runner.build_report(self.gold, changed)

        self.assertEqual(report["metrics"]["semanticRounds"]["accuracy"], 0.9)
        self.assertEqual(report["metrics"]["evidence"]["precision"], 1.0)
        self.assertLess(report["metrics"]["evidence"]["stateAccuracy"], 1.0)
        self.assertEqual(report["metrics"]["analysisCoverage"]["recall"], 0.0)
        self.assertEqual(report["metrics"]["degradation"]["statusAccuracy"], 0.0)

    def test_private_profile_requires_twenty_tasks_and_thirty_rounds(self):
        gold, predictions = dataset(kind="private")
        report = runner.build_report(gold, predictions)
        self.assertFalse(report["gates"]["minimumPrivateSamples"])
        self.assertFalse(report["qualityGatePassed"])

        for index in range(4):
            source = copy.deepcopy(next(
                record for record in gold if record.get("recordType") == "task_grouping"
            ))
            source["caseId"] = f"private-extra-{index + 1}"
            for member_index, member in enumerate(source["members"]):
                member["id"] = f"private-member-{index + 1}-{member_index + 1}"
                member["groupId"] = f"private-group-{index + 1}-{member_index // 2 + 1}"
            source["relations"] = [{
                "from": source["members"][0]["id"],
                "to": source["members"][1]["id"],
                "type": "continuation",
            }]
            gold.append(source)
            predictions.append(copy.deepcopy(source))

        gold_rounds = next(record for record in gold if record.get("recordType") == "semantic_rounds")
        prediction_rounds = next(
            record for record in predictions if record.get("recordType") == "semantic_rounds"
        )
        for index in range(10, 30):
            round_value = {"id": f"round-{index + 1}", "effective": index % 2 == 0}
            gold_rounds["rounds"].append(round_value)
            prediction_rounds["rounds"].append(copy.deepcopy(round_value))

        sufficient = runner.build_report(gold, predictions)
        self.assertEqual(sufficient["sampleCounts"]["tasks"], 20)
        self.assertEqual(sufficient["sampleCounts"]["semanticRounds"], 30)
        self.assertTrue(sufficient["gates"]["minimumPrivateSamples"])

    def test_share_safe_summary_excludes_ids_paths_and_case_diagnostics(self):
        report = runner.build_report(self.gold, self.predictions)
        safe = runner.share_safe_summary(report)
        serialized = json.dumps(safe)
        self.assertNotIn("datasetId", serialized)
        self.assertNotIn("caseId", serialized)
        self.assertNotIn("synthetic-progressive-v1", serialized)
        self.assertEqual(safe["sampleCounts"], report["sampleCounts"])

    def test_cli_uses_zero_one_and_two_exit_codes(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            gold_path = directory / "gold.jsonl"
            predictions_path = directory / "predictions.jsonl"

            def write(path, records):
                path.write_text(
                    "".join(json.dumps(record) + "\n" for record in records),
                    encoding="utf-8",
                )

            write(gold_path, self.gold)
            write(predictions_path, self.predictions)
            command = [
                sys.executable,
                str(SCRIPT),
                "--gold",
                str(gold_path),
                "--predictions",
                str(predictions_path),
                "--share-safe",
            ]

            passed = subprocess.run(command, capture_output=True, text=True, check=False)
            self.assertEqual(passed.returncode, 0, passed.stderr)
            self.assertTrue(json.loads(passed.stdout)["qualityGatePassed"])

            failing = copy.deepcopy(self.predictions)
            target = next(record for record in failing if record.get("caseId") == "task-1")
            target["members"][1]["groupId"] = target["members"][2]["groupId"]
            write(predictions_path, failing)
            gate_failure = subprocess.run(command, capture_output=True, text=True, check=False)
            self.assertEqual(gate_failure.returncode, 1)

            write(predictions_path, failing[:-1])
            invalid = subprocess.run(command, capture_output=True, text=True, check=False)
            self.assertEqual(invalid.returncode, 2)
            self.assertIn("validation error", invalid.stderr.lower())

    def test_share_safe_validation_error_does_not_expose_paths_or_case_details(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            directory = Path(temporary_directory)
            gold_path = directory / "private-gold.jsonl"
            predictions_path = directory / "secret-case-path.jsonl"
            gold_path.write_text(
                "".join(json.dumps(record) + "\n" for record in self.gold),
                encoding="utf-8",
            )
            predictions_path.write_text("{not-json}\n", encoding="utf-8")

            result = subprocess.run(
                [
                    sys.executable,
                    str(SCRIPT),
                    "--gold",
                    str(gold_path),
                    "--predictions",
                    str(predictions_path),
                    "--share-safe",
                ],
                capture_output=True,
                text=True,
                check=False,
            )

            self.assertEqual(result.returncode, 2)
            self.assertEqual(result.stderr.strip(), "validation error: invalid evaluation input")
            self.assertNotIn(str(directory), result.stderr)
            self.assertNotIn("secret-case", result.stderr)

    def test_public_fixtures_prove_conformance_and_slice_failure(self):
        base_command = [
            sys.executable,
            str(SCRIPT),
            "--gold",
            str(FIXTURES / "gold.synthetic.v1.jsonl"),
            "--share-safe",
        ]
        conformance = subprocess.run(
            base_command + [
                "--predictions",
                str(FIXTURES / "predictions.conformance.v1.jsonl"),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(conformance.returncode, 0, conformance.stderr)
        self.assertTrue(json.loads(conformance.stdout)["qualityGatePassed"])

        threshold_failure = subprocess.run(
            base_command + [
                "--predictions",
                str(FIXTURES / "predictions.threshold-failure.v1.jsonl"),
            ],
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(threshold_failure.returncode, 1, threshold_failure.stderr)
        failure_report = json.loads(threshold_failure.stdout)
        self.assertGreaterEqual(
            failure_report["metrics"]["taskGrouping"]["overall"]["f1"], 0.8
        )
        self.assertLess(
            failure_report["metrics"]["taskGrouping"]["perSlice"][
                "system_scaffolding"
            ]["f1"],
            0.7,
        )


if __name__ == "__main__":
    unittest.main()
