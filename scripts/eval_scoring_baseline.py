#!/usr/bin/env python3
"""Deterministic scoring-baseline validator and evaluator."""

import argparse
import json
import math
import sys
from collections import Counter, defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path


EXPECTED_DIMENSIONS = {
    "taskDefinition": 20,
    "collaborationOrchestration": 20,
    "iterationDepth": 20,
    "verificationClosure": 25,
    "assetCreation": 15,
}
EVIDENCE_GATE_KEYS = {"iteration", "verification", "asset"}
TWO_PLACES = Decimal("0.01")


class ValidationError(ValueError):
    """Raised when rubric, gold cases, or predictions violate the contract."""


def load_jsonl(path):
    records = []
    try:
        with Path(path).open(encoding="utf-8") as handle:
            for line_number, line in enumerate(handle, start=1):
                if not line.strip():
                    continue
                try:
                    value = json.loads(line)
                except json.JSONDecodeError as error:
                    raise ValidationError(
                        f"{path}:{line_number}: invalid JSON: {error.msg}"
                    ) from error
                if not isinstance(value, dict):
                    raise ValidationError(f"{path}:{line_number}: record must be an object")
                records.append(value)
    except OSError as error:
        raise ValidationError(f"cannot read {path}: {error}") from error
    return records


def _is_number(value):
    return (
        isinstance(value, (int, float, Decimal))
        and not isinstance(value, bool)
        and (not isinstance(value, float) or math.isfinite(value))
    )


def _non_empty_string(value):
    return isinstance(value, str) and bool(value.strip())


def _string_array(value, field, *, non_empty=False, unique=False):
    if not isinstance(value, list) or (non_empty and not value):
        requirement = "non-empty array" if non_empty else "array"
        raise ValidationError(f"{field} must be a {requirement} of strings")
    if any(not _non_empty_string(item) for item in value):
        raise ValidationError(f"{field} must contain only non-empty strings")
    if unique and len(set(value)) != len(value):
        raise ValidationError(f"{field} must not contain duplicates")


def _exact_keys(value, expected, field):
    if not isinstance(value, dict) or set(value) != set(expected):
        raise ValidationError(f"{field} must contain exactly: {', '.join(sorted(expected))}")


def _parse_day(value, field):
    if not isinstance(value, str) or len(value) != 10:
        raise ValidationError(f"{field} must use YYYY-MM-DD")
    try:
        parsed = date.fromisoformat(value)
    except ValueError as error:
        raise ValidationError(f"{field} must use YYYY-MM-DD") from error
    if parsed.isoformat() != value:
        raise ValidationError(f"{field} must use YYYY-MM-DD")
    return parsed


def _parse_rfc3339(value, field):
    if not isinstance(value, str):
        raise ValidationError(f"{field} must be RFC3339")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValidationError(f"{field} must be RFC3339") from error
    if parsed.tzinfo is None:
        raise ValidationError(f"{field} must include an RFC3339 timezone")
    return parsed


def validate_rubric(rubric):
    if not isinstance(rubric, dict):
        raise ValidationError("rubric must be a JSON object")
    if rubric.get("dimensions") != EXPECTED_DIMENSIONS:
        raise ValidationError("rubric dimensions and weights must be the fixed 20/20/20/25/15")
    if rubric.get("complexityWeights") != [1, 2, 3]:
        raise ValidationError("rubric complexityWeights must be [1, 2, 3]")

    dataset = rubric.get("dataset")
    if not isinstance(dataset, dict):
        raise ValidationError("rubric.dataset must be an object")
    source_tools = dataset.get("sourceTools")
    if (
        dataset.get("caseCount") != 100
        or dataset.get("casesPerTool") != 20
        or not isinstance(source_tools, list)
        or len(source_tools) != 5
        or len(set(source_tools)) != 5
        or any(not _non_empty_string(tool) for tool in source_tools)
    ):
        raise ValidationError("rubric dataset must define 100 cases and 20 cases for each of 5 tools")

    states = rubric.get("availabilityStates")
    if states != ["present", "observed_absent", "unavailable"]:
        raise ValidationError("rubric availabilityStates must use the fixed three states")
    if not isinstance(rubric.get("prohibitedScoringInputs"), list):
        raise ValidationError("rubric.prohibitedScoringInputs must be an array")

    required_sections = ("recordContract", "aggregation", "maturity", "qualityGates")
    missing = [section for section in required_sections if not isinstance(rubric.get(section), dict)]
    if missing:
        raise ValidationError(f"rubric missing object section(s): {', '.join(missing)}")


def _validate_record(record, kind, rubric, position):
    label = f"{kind}[{position}]"
    if not isinstance(record, dict):
        raise ValidationError(f"{label} must be an object")
    required_key = "goldRequiredFields" if kind == "gold" else "predictionRequiredFields"
    required = rubric["recordContract"].get(required_key)
    if not isinstance(required, list):
        raise ValidationError(f"rubric.recordContract.{required_key} must be an array")
    missing = sorted(set(required) - set(record))
    if missing:
        raise ValidationError(f"{label} missing required field(s): {', '.join(missing)}")

    if not _non_empty_string(record.get("caseId")):
        raise ValidationError(f"{label}.caseId must be a non-empty string")
    for field in ("project", "deliverable"):
        if not _non_empty_string(record.get(field)):
            raise ValidationError(f"{label}.{field} must be a non-empty synthetic string")

    if kind == "gold":
        if record.get("sourceTool") not in rubric["dataset"]["sourceTools"]:
            raise ValidationError(f"{label}.sourceTool is not declared by the rubric")
        window = record.get("evidenceWindow")
        _exact_keys(window, {"day", "start", "end"}, f"{label}.evidenceWindow")
        _parse_day(window["day"], f"{label}.evidenceWindow.day")
        start = _parse_rfc3339(window["start"], f"{label}.evidenceWindow.start")
        end = _parse_rfc3339(window["end"], f"{label}.evidenceWindow.end")
        if start >= end:
            raise ValidationError(f"{label}.evidenceWindow start must be before end")
        _string_array(
            record.get("acceptedTaskNames"),
            f"{label}.acceptedTaskNames",
            non_empty=True,
            unique=True,
        )
        _string_array(record.get("testTags"), f"{label}.testTags")
    elif not _non_empty_string(record.get("taskName")):
        raise ValidationError(f"{label}.taskName must be a non-empty synthetic string")

    boundary = record.get("taskBoundary")
    _exact_keys(boundary, {"segmentIds"}, f"{label}.taskBoundary")
    _string_array(
        boundary["segmentIds"],
        f"{label}.taskBoundary.segmentIds",
        non_empty=True,
        unique=True,
    )

    if record.get("verificationStatus") not in {"verified", "unverified", "unavailable"}:
        raise ValidationError(f"{label}.verificationStatus is invalid")
    if record.get("complexity") not in rubric["complexityWeights"] or isinstance(
        record.get("complexity"), bool
    ):
        raise ValidationError(f"{label}.complexity must be 1, 2, or 3")

    scores = record.get("dimensionScores")
    availability = record.get("availability")
    dimension_keys = set(rubric["dimensions"])
    _exact_keys(scores, dimension_keys, f"{label}.dimensionScores")
    _exact_keys(availability, dimension_keys, f"{label}.availability")
    states = set(rubric["availabilityStates"])
    for dimension in dimension_keys:
        state = availability[dimension]
        score = scores[dimension]
        if state not in states:
            raise ValidationError(f"{label}.availability.{dimension} is invalid")
        if state == "unavailable":
            if score is not None:
                raise ValidationError(
                    f"{label}.dimensionScores.{dimension} must be null when unavailable"
                )
        elif not _is_number(score) or not 0 <= score <= 100:
            raise ValidationError(
                f"{label}.dimensionScores.{dimension} must be numeric 0..100 when available"
            )

    gates = record.get("evidenceGates")
    _exact_keys(gates, EVIDENCE_GATE_KEYS, f"{label}.evidenceGates")
    if any(value not in states for value in gates.values()):
        raise ValidationError(f"{label}.evidenceGates contains an invalid state")

    _string_array(record.get("riskLabels"), f"{label}.riskLabels", unique=True)
    confidence = record.get("confidence")
    if not _is_number(confidence) or not 0 <= confidence <= 1:
        raise ValidationError(f"{label}.confidence must be numeric 0..1")

    if "usageContext" in record:
        usage = record["usageContext"]
        allowed = set(rubric["prohibitedScoringInputs"])
        if not isinstance(usage, dict) or not set(usage).issubset(allowed):
            raise ValidationError(
                f"{label}.usageContext may only contain prohibitedScoringInputs keys"
            )


def _validate_unique_ids(records, kind):
    ids = [record.get("caseId") for record in records if isinstance(record, dict)]
    duplicates = sorted(case_id for case_id, count in Counter(ids).items() if count > 1)
    if duplicates:
        raise ValidationError(f"duplicate {kind} caseId(s): {', '.join(map(str, duplicates))}")


def validate_inputs(rubric, gold, predictions):
    validate_rubric(rubric)
    if not isinstance(gold, list) or not isinstance(predictions, list):
        raise ValidationError("cases and predictions must each be arrays of records")
    expected_count = rubric["dataset"]["caseCount"]
    if len(gold) != expected_count:
        raise ValidationError(f"expected exactly {expected_count} gold cases, found {len(gold)}")
    if len(predictions) != expected_count:
        raise ValidationError(
            f"expected exactly {expected_count} predictions, found {len(predictions)}"
        )

    for position, record in enumerate(gold):
        _validate_record(record, "gold", rubric, position)
    for position, record in enumerate(predictions):
        _validate_record(record, "prediction", rubric, position)
    _validate_unique_ids(gold, "gold")
    _validate_unique_ids(predictions, "prediction")

    counts = Counter(record["sourceTool"] for record in gold)
    expected_per_tool = rubric["dataset"]["casesPerTool"]
    expected_tools = set(rubric["dataset"]["sourceTools"])
    if set(counts) != expected_tools or any(
        counts[tool] != expected_per_tool for tool in expected_tools
    ):
        details = ", ".join(f"{tool}={counts[tool]}" for tool in sorted(expected_tools))
        raise ValidationError(f"expected exactly {expected_per_tool} cases per tool; found {details}")

    gold_ids = {record["caseId"] for record in gold}
    prediction_ids = {record["caseId"] for record in predictions}
    missing = sorted(gold_ids - prediction_ids)
    extra = sorted(prediction_ids - gold_ids)
    if missing or extra:
        parts = []
        if missing:
            parts.append(f"missing predictions: {', '.join(missing)}")
        if extra:
            parts.append(f"extra predictions: {', '.join(extra)}")
        raise ValidationError("; ".join(parts))


def _normalize(value):
    return value.quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


def _task_score(rubric, record):
    if any(value is None for value in record["dimensionScores"].values()):
        return None
    total = sum(
        Decimal(str(record["dimensionScores"][dimension])) * Decimal(weight) / Decimal(100)
        for dimension, weight in rubric["dimensions"].items()
    )
    return _normalize(total)


def assign_maturity(rubric, rolling_score, active_days, records):
    minimum_days = rubric["aggregation"]["minimumActiveDaysForMaturity"]
    if rolling_score is None or active_days < minimum_days:
        return None

    maturity = rubric["maturity"]
    iterated_and_verified = sum(
        record["evidenceGates"]["iteration"] == "present"
        and record["evidenceGates"]["verification"] == "present"
        for record in records
    )
    reusable_assets = sum(
        record["evidenceGates"]["asset"] == "present" for record in records
    )

    if rolling_score >= Decimal(str(maturity["L4"]["scoreFloor"])):
        if (
            iterated_and_verified >= maturity["L4"]["minimumIteratedAndVerifiedTasks"]
            and reusable_assets >= maturity["L4"]["minimumReusableAssetTasks"]
        ):
            return "L4"
    if rolling_score >= Decimal(str(maturity["L3"]["scoreFloor"])):
        if iterated_and_verified >= maturity["L3"]["minimumIteratedAndVerifiedTasks"]:
            return "L3"
    if rolling_score >= Decimal(str(maturity["L2"]["scoreFloor"])):
        return "L2"
    return "L1"


def score_records(rubric, records, day_by_case=None):
    if day_by_case is None:
        day_by_case = {
            record["caseId"]: _parse_day(
                record["evidenceWindow"]["day"], "evidenceWindow.day"
            )
            for record in records
        }
    normalized_days = {
        case_id: _parse_day(value, f"day_by_case[{case_id}]")
        if isinstance(value, str)
        else value
        for case_id, value in day_by_case.items()
    }
    task_scores = {record["caseId"]: _task_score(rubric, record) for record in records}

    tasks_by_day = defaultdict(list)
    records_by_day = defaultdict(list)
    for record in records:
        case_id = record["caseId"]
        if case_id not in normalized_days or not isinstance(normalized_days[case_id], date):
            raise ValidationError(f"missing valid gold day for prediction {case_id}")
        day = normalized_days[case_id]
        records_by_day[day].append(record)
        if task_scores[case_id] is not None:
            tasks_by_day[day].append((task_scores[case_id], record["complexity"]))

    day_scores = {}
    for day in sorted(records_by_day):
        valid = tasks_by_day[day]
        if not valid:
            day_scores[day.isoformat()] = None
            continue
        weighted_sum = sum(score * complexity for score, complexity in valid)
        total_weight = sum(complexity for _, complexity in valid)
        day_scores[day.isoformat()] = _normalize(weighted_sum / Decimal(total_weight))

    if not records_by_day:
        return {
            "taskScores": task_scores,
            "dayScores": day_scores,
            "rolling28DayScore": None,
            "activeDays": 0,
            "maturity": None,
        }

    latest_day = max(records_by_day)
    first_day = latest_day - timedelta(days=27)
    rolling_days = [
        score
        for day_text, score in day_scores.items()
        if first_day <= date.fromisoformat(day_text) <= latest_day and score is not None
    ]
    rolling_score = (
        _normalize(sum(rolling_days, Decimal(0)) / Decimal(len(rolling_days)))
        if rolling_days
        else None
    )
    rolling_records = [
        record
        for day, day_records in records_by_day.items()
        if first_day <= day <= latest_day
        for record in day_records
        if task_scores[record["caseId"]] is not None
    ]
    maturity = assign_maturity(
        rubric, rolling_score, len(rolling_days), rolling_records
    )
    return {
        "taskScores": task_scores,
        "dayScores": day_scores,
        "rolling28DayScore": rolling_score,
        "activeDays": len(rolling_days),
        "maturity": maturity,
    }


def boundary_micro_f1(gold, predictions):
    true_positive = false_positive = false_negative = 0
    for gold_record, prediction in zip(gold, predictions):
        expected = set(gold_record["taskBoundary"]["segmentIds"])
        actual = set(prediction["taskBoundary"]["segmentIds"])
        true_positive += len(expected & actual)
        false_positive += len(actual - expected)
        false_negative += len(expected - actual)
    denominator = 2 * true_positive + false_positive + false_negative
    return 1.0 if denominator == 0 else 2 * true_positive / denominator


def _summary_for_json(summary):
    score = summary["rolling28DayScore"]
    return {
        "rolling28DayScore": str(score) if score is not None else None,
        "activeDays": summary["activeDays"],
        "maturity": summary["maturity"],
    }


def build_report(rubric, gold, predictions):
    validate_inputs(rubric, gold, predictions)
    predictions_by_id = {record["caseId"]: record for record in predictions}
    joined_predictions = [predictions_by_id[record["caseId"]] for record in gold]
    day_by_case = {
        record["caseId"]: _parse_day(record["evidenceWindow"]["day"], "evidenceWindow.day")
        for record in gold
    }
    gold_summary = score_records(rubric, gold, day_by_case)
    prediction_summary = score_records(rubric, joined_predictions, day_by_case)

    task_exact = gold_summary["taskScores"] == prediction_summary["taskScores"]
    day_exact = gold_summary["dayScores"] == prediction_summary["dayScores"]
    rolling_exact = (
        gold_summary["rolling28DayScore"] == prediction_summary["rolling28DayScore"]
    )
    aggregation_exact = task_exact and day_exact and rolling_exact
    maturity_exact = gold_summary["maturity"] == prediction_summary["maturity"]

    correct_by_tool = Counter()
    total_by_tool = Counter()
    correct_total = 0
    usage_negative_passed = True
    for gold_record, prediction in zip(gold, joined_predictions):
        correct = (
            prediction["taskName"] in gold_record["acceptedTaskNames"]
            and prediction["project"] == gold_record["project"]
        )
        tool = gold_record["sourceTool"]
        total_by_tool[tool] += 1
        correct_by_tool[tool] += int(correct)
        correct_total += int(correct)
        if (
            "usage_only_risk_negative" in gold_record["testTags"]
            and prediction["riskLabels"] != []
        ):
            usage_negative_passed = False

    overall = correct_total / len(gold)
    per_tool = {
        tool: correct_by_tool[tool] / total_by_tool[tool]
        for tool in rubric["dataset"]["sourceTools"]
    }
    joint_gate = (
        overall
        >= rubric["qualityGates"]["jointTaskNameProjectConsistency"]["overallMinimum"]
        and all(
            value
            >= rubric["qualityGates"]["jointTaskNameProjectConsistency"][
                "perToolMinimum"
            ]
            for value in per_tool.values()
        )
    )
    gates = {
        "jointTaskNameProjectConsistency": joint_gate,
        "aggregationExactMatch": aggregation_exact,
        "maturityExactMatch": maturity_exact,
        "usageOnlyRiskNegative": usage_negative_passed,
    }
    return {
        "contractVersion": rubric.get("contractVersion"),
        "caseCount": len(gold),
        "metrics": {
            "jointTaskNameProjectConsistency": {
                "overall": overall,
                "perTool": per_tool,
            },
            "boundaryMicroF1": boundary_micro_f1(gold, joined_predictions),
            "aggregationExactness": {
                "taskScores": task_exact,
                "dayScores": day_exact,
                "rolling28DayScore": rolling_exact,
            },
            "gold": _summary_for_json(gold_summary),
            "prediction": _summary_for_json(prediction_summary),
        },
        "gates": gates,
        "qualityGatePassed": all(gates.values()),
    }


def _load_rubric(path):
    try:
        value = json.loads(Path(path).read_text(encoding="utf-8"))
    except OSError as error:
        raise ValidationError(f"cannot read {path}: {error}") from error
    except json.JSONDecodeError as error:
        raise ValidationError(f"{path}: invalid JSON: {error.msg}") from error
    return value


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rubric", required=True, help="rubric JSON path")
    parser.add_argument("--cases", required=True, help="gold cases JSONL path")
    parser.add_argument("--predictions", required=True, help="predictions JSONL path")
    arguments = parser.parse_args(argv)

    try:
        report = build_report(
            _load_rubric(arguments.rubric),
            load_jsonl(arguments.cases),
            load_jsonl(arguments.predictions),
        )
    except ValidationError as error:
        print(f"validation error: {error}", file=sys.stderr)
        return 2

    print(json.dumps(report, indent=2, sort_keys=True))
    if not report["qualityGatePassed"]:
        failed = ", ".join(name for name, passed in report["gates"].items() if not passed)
        print(f"quality gate failed: {failed}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
