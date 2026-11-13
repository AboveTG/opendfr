#!/usr/bin/env python3
"""
OpenDFR CLI — Cross-platform batch correlator for Skydio DFR flight logs
and municipal ArcGIS / Socrata open-data endpoints.
"""

import argparse
import csv
import json
from pathlib import Path
from typing import Any
import requests


def load_agency(registry_path: Path, agency_id: str) -> dict[str, Any]:
    data = json.loads(registry_path.read_text(encoding="utf-8"))
    for agency in data.get("agencies", []):
        if agency.get("id") == agency_id:
            return agency
    available = ", ".join(a.get("id", "") for a in data.get("agencies", []))
    raise ValueError(f"Agency '{agency_id}' not found. Available: {available}")


def normalize_flights(raw_payload: Any) -> list[dict[str, Any]]:
    if isinstance(raw_payload, list):
        flights = raw_payload
    elif isinstance(raw_payload, dict):
        flights = (
            raw_payload.get("flights")
            or raw_payload.get("data", {}).get("flights")
            or raw_payload.get("items")
            or []
        )
    else:
        flights = []

    normalized = []
    for idx, f in enumerate(flights):
        raw_cid = f.get("case_id") or f.get("caseId") or f.get("incident_id") or ""
        normalized.append({
            "flightId": str(f.get("id") or f.get("flight_id") or f"flight-{idx}"),
            "caseId": str(raw_cid).strip(),
            "takeoffUtc": f.get("takeoff_time") or f.get("takeoff") or f.get("start_time") or "",
            "durationSec": int(f.get("duration_seconds") or f.get("duration") or 0),
            "purpose": f.get("purpose") or f.get("statutory_purpose") or "Unspecified",
        })
    return normalized


def query_arcgis(backend: dict[str, Any], case_ids: list[str]) -> dict[str, dict[str, str]]:
    fields = backend["fields"]
    is_numeric = backend.get("caseIdIsNumeric", True)
    formatted = []
    for cid in case_ids:
        cleaned = "".join(ch for ch in cid if ch.isdigit()) if is_numeric else cid.replace("'", "''")
        if cleaned:
            formatted.append(cleaned if is_numeric else f"'{cleaned}'")

    if not formatted:
        return {}

    results: dict[str, dict[str, str]] = {}
    out_fields = ",".join(v for v in fields.values() if v)

    for i in range(0, len(formatted), 150):
        chunk = formatted[i : i + 150]
        params = {
            "where": f"{fields['caseId']} IN ({','.join(chunk)})",
            "outFields": out_fields,
            "f": "json",
        }
        resp = requests.get(backend["endpoint"], params=params, timeout=30)
        resp.raise_for_status()
        for feat in resp.json().get("features", []):
            attr = feat.get("attributes", {})
            key = str(attr.get(fields["caseId"], "")).strip()
            if key:
                results[key] = {
                    "incidentType": str(attr.get(fields["incidentType"]) or "Unspecified"),
                    "location": str(attr.get(fields.get("location", "")) or "N/A"),
                    "district": str(attr.get(fields.get("district", "")) or "N/A"),
                    "disposition": str(attr.get(fields.get("disposition", "")) or "N/A"),
                }
    return results


def query_socrata(backend: dict[str, Any], case_ids: list[str]) -> dict[str, dict[str, str]]:
    fields = backend["fields"]
    is_numeric = backend.get("caseIdIsNumeric", False)
    match_mode = backend.get("matchMode", "exact")
    clean_ids = sorted({cid for cid in case_ids if cid})
    if not clean_ids:
        return {}

    results: dict[str, dict[str, str]] = {}
    for i in range(0, len(clean_ids), 75):
        chunk = clean_ids[i : i + 75]
        if match_mode == "contains_or_exact":
            where_clause = " OR ".join(f"{fields['caseId']} like '%{cid.replace(chr(39), chr(39)*2)}'" for cid in chunk)
        else:
            formatted = [
                ("".join(ch for ch in cid if ch.isdigit()) if is_numeric else f"'{cid.replace(chr(39), chr(39)*2)}'")
                for cid in chunk
            ]
            where_clause = f"{fields['caseId']} in({','.join(formatted)})"

        params = {"$where": where_clause, "$limit": "5000"}
        resp = requests.get(backend["endpoint"], params=params, timeout=30)
        resp.raise_for_status()
        for row in resp.json():
            returned_id = str(row.get(fields["caseId"], "")).strip()
            if not returned_id:
                continue
            matched_key = next(
                (req for req in chunk if returned_id == req or returned_id.endswith(req)),
                returned_id,
            )
            results[matched_key] = {
                "incidentType": str(row.get(fields["incidentType"]) or "Unspecified"),
                "location": str(row.get(fields.get("location", "")) or "N/A"),
                "district": str(row.get(fields.get("district", "")) or "N/A"),
                "disposition": str(row.get(fields.get("disposition", "")) or "N/A"),
            }
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="OpenDFR Multi-Agency Drone & Incident Correlator")
    parser.add_argument("--agency", required=True, help="Agency ID from docs/registry/agencies.json (e.g. st-paul-mn)")
    parser.add_argument("--input", required=True, type=Path, help="Path to Skydio flight log JSON")
    parser.add_argument("--output", required=True, type=Path, help="Path to output CSV file")
    parser.add_argument(
        "--registry",
        type=Path,
        default=Path(__file__).resolve().parent.parent / "docs" / "registry" / "agencies.json",
        help="Path to agencies.json registry",
    )
    args = parser.parse_args()

    agency = load_agency(args.registry, args.agency)
    raw_flights = json.loads(args.input.read_text(encoding="utf-8"))
    flights = normalize_flights(raw_flights)

    backends = agency.get("backends") or ([agency["backend"]] if "backend" in agency else [])
    resolved: dict[str, dict[str, str]] = {}
    remaining = sorted({f["caseId"] for f in flights if f["caseId"]})

    for backend in backends:
        if not remaining:
            break
        b_type = backend.get("type")
        matches: dict[str, dict[str, str]] = {}
        if b_type == "arcgis":
            matches = query_arcgis(backend, remaining)
        elif b_type == "socrata":
            matches = query_socrata(backend, remaining)

        for cid, record in matches.items():
            if cid not in resolved:
                resolved[cid] = {**record, "source": backend.get("label") or b_type.upper()}
        remaining = [cid for cid in remaining if cid not in resolved]

    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["Takeoff", "DurationSec", "CaseID", "Purpose", "IncidentType", "Source", "Location", "District"])
        for fl in flights:
            match = resolved.get(fl["caseId"], {})
            writer.writerow([
                fl["takeoffUtc"],
                fl["durationSec"],
                fl["caseId"],
                fl["purpose"],
                match.get("incidentType", "Unmatched / Restricted Call"),
                match.get("source", "Unmatched"),
                match.get("location", "N/A"),
                match.get("district", "N/A"),
            ])

    print(f"Done: {len(flights)} flights processed ({len(resolved)} unique Case IDs resolved) -> {args.output}")


if __name__ == "__main__":
    main()