#!/usr/bin/env python3
"""Evaluate progressive-analysis annotations without exposing private content."""

import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path


CONTRACT_VERSION = "1"
RECORD_TYPES = {
    "metadata",
    "task_grouping",
    "semantic_rounds",
    "evidence",
    "analysis_coverage",
}
REQUIRED_TASK_SLICES = {
    "system_scaffolding",
    "goal_split",
    "explicit_continuation",
    "shared_deliverable",
    "parent_child",
    "ambiguous_proximity",
}
VALID_DATASET_KINDS = {"synthetic", "private"}
VALID_EVIDENCE_STATES = {"present", "observed_absent", "unknown"}
VALID_ANALYSIS_STATUSES = {"complete", "partial", "degraded", "unavailable"}


class ValidationError(ValueError):
    """Raised when an evaluation input violates the versioned contract."""


def load_jsonl(path):
    records = []
    try:
        with Path(path).open(encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, start=1):
                if not line.strip():
                    continue
                try:
                    record = json.loads(line)
                except json.JSONDecodeError as error:
                    raise ValidationError(
                        f"{path}:{line_number}: invalid JSON: {error.msg}"
                    ) from error
                if not isinstance(record, dict):
                    raise ValidationError(f"{path}:{line_number}: record must be an object")
                records.append(record)
    except OSError as error:
        raise ValidationError(f"cannot read {path}: {error}") from error
    return records


def _non_empty_string(value):
    return isinstance(value, str) and bool(value.strip())


def _string_list(value, field, *, non_empty=False):
    if not isinstance(value, list) or (non_empty and not value):
        requirement = "non-empty list" if non_empty else "list"
        raise ValidationError(f"{field} must be a {requirement} of strings")
    if any(not _non_empty_string(item) for item in value):
        raise ValidationError(f"{field} must contain only non-empty strings")
    if len(set(value)) != len(value):
        raise ValidationError(f"{field} must not contain duplicates")


def _ratio(numerator, denominator, *, empty=1.0):
    return numerator / denominator if denominator else empty


def _prf(true_positive, predicted_count, expected_count):
    precision = _ratio(true_positive, predicted_count)
    recall = _ratio(true_positive, expected_count)
    f1 = _ratio(2 * precision * recall, precision + recall)
    return {"precision": precision, "recall": recall, "f1": f1}


def _validate_metadata(record, field):
    expected = {"contractVersion", "recordType", "datasetId", "datasetKind"}
    if set(record) != expected:
        raise ValidationError(f"{field} must contain exactly: {', '.join(sorted(expected))}")
    if not _non_empty_string(record.get("datasetId")):
        raise ValidationError(f"{field}.datasetId must be a non-empty string")
    if record.get("datasetKind") not in VALID_DATASET_KINDS:
        raise ValidationError(f"{field}.datasetKind must be synthetic or private")


def _validate_members(record, field):
    members = record.get("members")
    if not isinstance(members, list) or not members:
        raise ValidationError(f"{field}.members must be a non-empty list")
    ids = []
    for index, member in enumerate(members):
        if not isinstance(member, dict) or set(member) != {"id", "groupId"}:
            raise ValidationError(f"{field}.members[{index}] must contain id and groupId")
        if not _non_empty_string(member.get("id")) or not _non_empty_string(member.get("groupId")):
            raise ValidationError(f"{field}.members[{index}] id and groupId must be non-empty")
        ids.append(member["id"])
    if len(set(ids)) != len(ids):
        raise ValidationError(f"{field}.members ids must be unique")
    return set(ids)


def _validate_relations(record, member_ids, field):
    relations = record.get("relations")
    if not isinstance(relations, list):
        raise ValidationError(f"{field}.relations must be a list")
    seen = set()
    for index, relation in enumerate(relations):
        if not isinstance(relation, dict) or set(relation) != {"from", "to", "type"}:
            raise ValidationError(
                f"{field}.relations[{index}] must contain from, to and type"
            )
        edge = (relation.get("from"), relation.get("to"), relation.get("type"))
        if (
            edge[0] not in member_ids
            or edge[1] not in member_ids
            or not _non_empty_string(edge[2])
            or edge[0] == edge[1]
        ):
            raise ValidationError(f"{field}.relations[{index}] is invalid")
        if edge in seen:
            raise ValidationError(f"{field}.relations must not contain duplicates")
        seen.add(edge)


def _validate_record(record, field, *, gold):
    if record.get("contractVersion") != CONTRACT_VERSION:
        raise ValidationError(f"{field}.contractVersion must be {CONTRACT_VERSION}")
    record_type = record.get("recordType")
    if record_type not in RECORD_TYPES:
        raise ValidationError(f"{field}.recordType is unsupported")
    if record_type == "metadata":
        _validate_metadata(record, field)
        return
    if not _non_empty_string(record.get("caseId")):
        raise ValidationError(f"{field}.caseId must be a non-empty string")
    if not _non_empty_string(record.get("slice")):
        raise ValidationError(f"{field}.slice must be a non-empty string")

    common = {"contractVersion", "recordType", "caseId", "slice"}
    if record_type == "task_grouping":
        expected = common | {"members", "relations"}
        if set(record) != expected:
            raise ValidationError(f"{field} has unexpected or missing fields")
        member_ids = _validate_members(record, field)
        _validate_relations(record, member_ids, field)
    elif record_type == "semantic_rounds":
        if set(record) != common | {"rounds"}:
            raise ValidationError(f"{field} has unexpected or missing fields")
        rounds = record.get("rounds")
        if not isinstance(rounds, list) or not rounds:
            raise ValidationError(f"{field}.rounds must be a non-empty list")
        round_ids = []
        for index, round_value in enumerate(rounds):
            if not isinstance(round_value, dict) or set(round_value) != {"id", "effective"}:
                raise ValidationError(f"{field}.rounds[{index}] must contain id and effective")
            if not _non_empty_string(round_value.get("id")) or not isinstance(
                round_value.get("effective"), bool
            ):
                raise ValidationError(f"{field}.rounds[{index}] is invalid")
            round_ids.append(round_value["id"])
        if len(set(round_ids)) != len(round_ids):
            raise ValidationError(f"{field}.round ids must be unique")
    elif record_type == "evidence":
        if set(record) != common | {"evidence"}:
            raise ValidationError(f"{field} has unexpected or missing fields")
        evidence = record.get("evidence")
        if not isinstance(evidence, list):
            raise ValidationError(f"{field}.evidence must be a list")
        evidence_ids = []
        for index, item in enumerate(evidence):
            if not isinstance(item, dict) or set(item) != {"id", "type", "state"}:
                raise ValidationError(f"{field}.evidence[{index}] must contain id, type and state")
            if (
                not _non_empty_string(item.get("id"))
                or not _non_empty_string(item.get("type"))
                or item.get("state") not in VALID_EVIDENCE_STATES
            ):
                raise ValidationError(f"{field}.evidence[{index}] is invalid")
            evidence_ids.append(item["id"])
        if len(set(evidence_ids)) != len(evidence_ids):
            raise ValidationError(f"{field}.evidence ids must be unique")
    else:
        expected_field = "expectedAnalyzedTaskIds" if gold else "analyzedTaskIds"
        status_field = "expectedStatus" if gold else "status"
        if set(record) != common | ({"taskIds", expected_field, status_field} if gold else {expected_field, status_field}):
            raise ValidationError(f"{field} has unexpected or missing fields")
        if gold:
            _string_list(record.get("taskIds"), f"{field}.taskIds", non_empty=True)
        _string_list(record.get(expected_field), f"{field}.{expected_field}")
        if gold and not set(record[expected_field]).issubset(record["taskIds"]):
            raise ValidationError(f"{field}.{expected_field} must be a subset of taskIds")
        if record.get(status_field) not in VALID_ANALYSIS_STATUSES:
            raise ValidationError(f"{field}.{status_field} is invalid")


def _index_records(records, field, *, gold):
    if not isinstance(records, list) or not records:
        raise ValidationError(f"{field} must be a non-empty list")
    metadata = []
    indexed = {}
    for index, record in enumerate(records):
        if not isinstance(record, dict):
            raise ValidationError(f"{field}[{index}] must be an object")
        _validate_record(record, f"{field}[{index}]", gold=gold)
        if record["recordType"] == "metadata":
            metadata.append(record)
            continue
        key = (record["recordType"], record["caseId"])
        if key in indexed:
            raise ValidationError(f"{field} has duplicate {key[0]} caseId {key[1]}")
        indexed[key] = record
    if len(metadata) != 1:
        raise ValidationError(f"{field} must contain exactly one metadata record")
    return metadata[0], indexed


def _validate_inputs(gold, predictions):
    gold_metadata, gold_index = _index_records(gold, "gold", gold=True)
    prediction_metadata, prediction_index = _index_records(
        predictions, "predictions", gold=False
    )
    if prediction_metadata != gold_metadata:
        raise ValidationError("prediction metadata must exactly match gold metadata")
    if set(prediction_index) != set(gold_index):
        raise ValidationError("predictions must contain exactly the same recordType/caseId pairs as gold")
    for key, expected in gold_index.items():
        actual = prediction_index[key]
        if actual["slice"] != expected["slice"]:
            raise ValidationError(f"prediction slice must match gold for {key[0]}/{key[1]}")
        if key[0] == "task_grouping":
            expected_ids = {member["id"] for member in expected["members"]}
            actual_ids = {member["id"] for member in actual["members"]}
            if actual_ids != expected_ids:
                raise ValidationError(f"prediction members must match gold for {key[1]}")
        elif key[0] == "semantic_rounds":
            expected_ids = {item["id"] for item in expected["rounds"]}
            actual_ids = {item["id"] for item in actual["rounds"]}
            if actual_ids != expected_ids:
                raise ValidationError(f"prediction rounds must match gold for {key[1]}")
    grouping_slices = {
        record["slice"]
        for key, record in gold_index.items()
        if key[0] == "task_grouping"
    }
    missing_slices = REQUIRED_TASK_SLICES - grouping_slices
    if missing_slices:
        raise ValidationError(
            "gold task_grouping records are missing required slices: "
            + ", ".join(sorted(missing_slices))
        )
    return gold_metadata, gold_index, prediction_index


def _bcubed_items(gold_record, prediction_record):
    gold_group = {member["id"]: member["groupId"] for member in gold_record["members"]}
    prediction_group = {
        member["id"]: member["groupId"] for member in prediction_record["members"]
    }
    gold_clusters = defaultdict(set)
    prediction_clusters = defaultdict(set)
    for member_id, group_id in gold_group.items():
        gold_clusters[group_id].add(member_id)
    for member_id, group_id in prediction_group.items():
        prediction_clusters[group_id].add(member_id)
    result = []
    for member_id in sorted(gold_group):
        expected = gold_clusters[gold_group[member_id]]
        actual = prediction_clusters[prediction_group[member_id]]
        overlap = len(expected & actual)
        result.append((overlap / len(actual), overlap / len(expected)))
    return result


def _bcubed_metric(items):
    if not items:
        return {"precision": 1.0, "recall": 1.0, "f1": 1.0, "members": 0}
    precision = sum(item[0] for item in items) / len(items)
    recall = sum(item[1] for item in items) / len(items)
    return {
        "precision": precision,
        "recall": recall,
        "f1": _ratio(2 * precision * recall, precision + recall),
        "members": len(items),
    }


def build_report(gold, predictions):
    metadata, gold_index, prediction_index = _validate_inputs(gold, predictions)

    grouping_items = []
    grouping_by_slice = defaultdict(list)
    expected_relations = set()
    predicted_relations = set()
    round_total = 0
    round_correct = 0
    expected_evidence = set()
    predicted_evidence = set()
    evidence_state_total = 0
    evidence_state_correct = 0
    expected_analyzed = set()
    predicted_analyzed = set()
    status_total = 0
    status_correct = 0
    task_count = 0

    for key, expected in gold_index.items():
        actual = prediction_index[key]
        record_type, case_id = key
        if record_type == "task_grouping":
            task_count += len({member["groupId"] for member in expected["members"]})
            items = _bcubed_items(expected, actual)
            grouping_items.extend(items)
            grouping_by_slice[expected["slice"]].extend(items)
            expected_relations.update(
                (case_id, relation["from"], relation["to"], relation["type"])
                for relation in expected["relations"]
            )
            predicted_relations.update(
                (case_id, relation["from"], relation["to"], relation["type"])
                for relation in actual["relations"]
            )
        elif record_type == "semantic_rounds":
            expected_rounds = {item["id"]: item["effective"] for item in expected["rounds"]}
            actual_rounds = {item["id"]: item["effective"] for item in actual["rounds"]}
            round_total += len(expected_rounds)
            round_correct += sum(
                actual_rounds[round_id] == effective
                for round_id, effective in expected_rounds.items()
            )
        elif record_type == "evidence":
            expected_items = {item["id"]: item for item in expected["evidence"]}
            actual_items = {item["id"]: item for item in actual["evidence"]}
            expected_evidence.update(
                (case_id, item["id"], item["type"]) for item in expected["evidence"]
            )
            predicted_evidence.update(
                (case_id, item["id"], item["type"]) for item in actual["evidence"]
            )
            shared_ids = set(expected_items) & set(actual_items)
            evidence_state_total += len(expected_items)
            evidence_state_correct += sum(
                actual_items[item_id]["type"] == expected_items[item_id]["type"]
                and actual_items[item_id]["state"] == expected_items[item_id]["state"]
                for item_id in shared_ids
            )
        else:
            expected_analyzed.update(
                (case_id, task_id) for task_id in expected["expectedAnalyzedTaskIds"]
            )
            predicted_analyzed.update(
                (case_id, task_id) for task_id in actual["analyzedTaskIds"]
            )
            status_total += 1
            status_correct += actual["status"] == expected["expectedStatus"]

    relation_metric = _prf(
        len(expected_relations & predicted_relations),
        len(predicted_relations),
        len(expected_relations),
    )
    evidence_metric = _prf(
        len(expected_evidence & predicted_evidence),
        len(predicted_evidence),
        len(expected_evidence),
    )
    coverage_metric = _prf(
        len(expected_analyzed & predicted_analyzed),
        len(predicted_analyzed),
        len(expected_analyzed),
    )
    grouping_overall = _bcubed_metric(grouping_items)
    grouping_per_slice = {
        slice_name: _bcubed_metric(grouping_by_slice[slice_name])
        for slice_name in sorted(grouping_by_slice)
    }
    grouping_gate = grouping_overall["f1"] >= 0.8 and all(
        grouping_per_slice[slice_name]["f1"] >= 0.7
        for slice_name in REQUIRED_TASK_SLICES
    )
    private_sample_gate = (
        metadata["datasetKind"] != "private" or (task_count >= 20 and round_total >= 30)
    )

    gates = {
        "taskGrouping": grouping_gate,
        "minimumPrivateSamples": private_sample_gate,
    }
    return {
        "contractVersion": CONTRACT_VERSION,
        "dataset": {
            "id": metadata["datasetId"],
            "kind": metadata["datasetKind"],
        },
        "sampleCounts": {
            "tasks": task_count,
            "taskMembers": len(grouping_items),
            "semanticRounds": round_total,
            "evidenceItems": len(expected_evidence),
            "analysisCoverageCases": status_total,
        },
        "metrics": {
            "taskGrouping": {
                "overall": grouping_overall,
                "perSlice": grouping_per_slice,
            },
            "relationDiagnostics": relation_metric,
            "semanticRounds": {
                "accuracy": _ratio(round_correct, round_total),
                "correct": round_correct,
                "total": round_total,
            },
            "evidence": {
                **evidence_metric,
                "stateAccuracy": _ratio(evidence_state_correct, evidence_state_total),
            },
            "analysisCoverage": coverage_metric,
            "degradation": {
                "statusAccuracy": _ratio(status_correct, status_total),
                "correct": status_correct,
                "total": status_total,
            },
        },
        "gates": gates,
        "qualityGatePassed": all(gates.values()),
    }


def share_safe_summary(report):
    """Return only aggregate counts, ratios and gates safe for public release notes."""
    return {
        "contractVersion": report["contractVersion"],
        "datasetKind": report["dataset"]["kind"],
        "sampleCounts": report["sampleCounts"],
        "metrics": report["metrics"],
        "gates": report["gates"],
        "qualityGatePassed": report["qualityGatePassed"],
    }


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--gold", required=True, help="Gold JSONL annotation path")
    parser.add_argument("--predictions", required=True, help="Prediction JSONL path")
    parser.add_argument(
        "--share-safe",
        action="store_true",
        help="Emit aggregate metrics without dataset IDs, paths or case diagnostics",
    )
    args = parser.parse_args(argv)
    try:
        report = build_report(load_jsonl(args.gold), load_jsonl(args.predictions))
    except ValidationError as error:
        detail = "invalid evaluation input" if args.share_safe else str(error)
        print(f"validation error: {detail}", file=sys.stderr)
        return 2
    output = share_safe_summary(report) if args.share_safe else report
    print(json.dumps(output, indent=2, sort_keys=True))
    return 0 if report["qualityGatePassed"] else 1


if __name__ == "__main__":
    sys.exit(main())
