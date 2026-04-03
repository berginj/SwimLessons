#!/usr/bin/env python

"""
Build a canonical NYC facility reference dataset from a Tableau TWBX/HYPER file
or an exported CSV.

This dataset is intentionally separate from lesson/session data. It preserves
stable facility identity plus deterministic crosswalk keys for linking future
messy offerings feeds back to a canonical facility layer.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import tempfile
import unicodedata
import xml.etree.ElementTree as ET
import zipfile
from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any

try:
    from tableauhyperapi import Connection, HyperProcess, Telemetry
except ImportError:  # pragma: no cover - runtime validation handles this
    Connection = None  # type: ignore[assignment]
    HyperProcess = None  # type: ignore[assignment]
    Telemetry = None  # type: ignore[assignment]

SCHEMA_VERSION = "2026-04-02"
CITY_ID = "nyc"
SOURCE_SYSTEM = "nyc-pool-inspection-tableau"
DEFAULT_JSON_OUTPUT = Path("data/nyc-facilities-canonical.json")
DEFAULT_CSV_OUTPUT = Path("data/nyc-facilities-canonical.csv")

FIELD_ALIASES = {
    "source_record_type": ["Permit_Type", "permit_type", "record_type"],
    "source_facility_id": ["ACCELA", "Permit_ID", "permit_id", "facility_id", "site_id"],
    "facility_grouping": ["Facility Grouping", "facility_grouping"],
    "official_name": ["Facility_Name", "facility_name", "name"],
    "high_level_category": ["High Level Category", "high_level_category"],
    "category": ["Category", "category"],
    "organization_name_type": ["Org. Name/Type", "organization_name_type", "org_name_type"],
    "address_number": ["ADDRESS_ No", "ADDRESS_No", "address_number", "house_number"],
    "address_street": ["ADDRESS_St", "ADDRESS St", "address_street", "street"],
    "borough_code": ["BO", "borough_code", "borough"],
    "postal_code": ["ZIP", "zip", "zip_code", "postal_code"],
    "inspection_date": ["Inspection_Date", "inspection_date"],
    "inspection_type": ["Inspection_Type", "inspection_type"],
    "violations_all": ["# of All Violations", "violations_all", "all_violations"],
    "violations_phh": ["# of PHH Violations", "violations_phh", "phh_violations"],
    "violations_critical": ["# of Critical Violations", "violations_critical", "critical_violations"],
    "violations_general": ["# of General Violations", "violations_general", "general_violations"],
    "latitude": ["Lat", "latitude", "Latitude"],
    "longitude": ["Long", "longitude", "Longitude"],
    "community_board": ["Community Board", "Community_Board", "community_board"],
    "council_district": ["Council District", "Council_District", "council_district"],
    "census_tract": ["Census tract", "Census_tract", "census_tract"],
    "boro_block_lot": ["Boro-Block-Lot", "boro_block_lot", "bbl"],
    "bin": ["BIN", "bin"],
    "neighborhood_name": ["NTA", "neighborhood_name"],
    "neighborhood_code": ["NTA Code", "NTA_Code", "neighborhood_code"],
}

BOROUGH_NAMES = {
    "BK": "Brooklyn",
    "BX": "Bronx",
    "MA": "Manhattan",
    "QU": "Queens",
    "SI": "Staten Island",
}

GEOGRAPHY_IDS = {
    "BK": "brooklyn",
    "BX": "bronx",
    "MA": "manhattan",
    "QU": "queens",
    "SI": "staten-island",
}

NAME_PREFIX_PATTERNS = [
    (re.compile(r"^nyc\s+bd\s+of\s+ed\s*/\s*", re.IGNORECASE), "NYC Department of Education"),
    (re.compile(r"^nyc\s+board\s+of\s+education\s*/\s*", re.IGNORECASE), "NYC Department of Education"),
    (re.compile(r"^nyc\s+dept(?:artment)?\s+of\s+education\s*/\s*", re.IGNORECASE), "NYC Department of Education"),
    (
        re.compile(r"^new\s+york\s+city\s+department\s+of\s+education\s*/\s*", re.IGNORECASE),
        "NYC Department of Education",
    ),
]

NAME_REPLACEMENTS = [
    (re.compile(r"&"), " and "),
    (re.compile(r"\bdept\b", re.IGNORECASE), "department"),
    (re.compile(r"\bbd\b", re.IGNORECASE), "board"),
    (re.compile(r"\bhs\b", re.IGNORECASE), "high school"),
    (re.compile(r"\bh\.?\s*s\.?\b", re.IGNORECASE), "high school"),
    (re.compile(r"\bps\b", re.IGNORECASE), "ps"),
    (re.compile(r"\bp\.?\s*s\.?\b", re.IGNORECASE), "ps"),
]

ADDRESS_SUFFIX_REPLACEMENTS = {
    "avenue": "ave",
    "ave": "ave",
    "boulevard": "blvd",
    "blvd": "blvd",
    "court": "ct",
    "ct": "ct",
    "drive": "dr",
    "dr": "dr",
    "highway": "hwy",
    "hwy": "hwy",
    "lane": "ln",
    "ln": "ln",
    "parkway": "pkwy",
    "pkwy": "pkwy",
    "place": "pl",
    "pl": "pl",
    "road": "rd",
    "rd": "rd",
    "street": "st",
    "st": "st",
    "terrace": "ter",
    "ter": "ter",
}

DIRECTION_REPLACEMENTS = {
    "north": "n",
    "south": "s",
    "east": "e",
    "west": "w",
}

CSV_FIELD_ORDER = [
    "canonical_facility_id",
    "location_id",
    "source_system",
    "source_facility_id",
    "source_record_type",
    "official_name",
    "display_name",
    "normalized_name",
    "operator_name",
    "address_street1",
    "address_street1_normalized",
    "city",
    "state",
    "postal_code",
    "borough_code",
    "borough_name",
    "geography_id",
    "neighborhood_name",
    "neighborhood_code",
    "community_board",
    "council_district",
    "census_tract",
    "boro_block_lot",
    "bin",
    "latitude",
    "longitude",
    "coordinate_source",
    "coordinate_confidence",
    "facility_type",
    "facility_grouping",
    "high_level_category",
    "category",
    "organization_name_type",
    "observation_count",
    "latest_inspection_date",
    "latest_inspection_type",
    "latest_violations_all",
    "latest_violations_phh",
    "latest_violations_critical",
    "latest_violations_general",
    "alternate_names",
    "normalized_crosswalk_names",
    "normalized_address_variants",
    "preferred_keys",
]


@dataclass
class LoadedSource:
    rows: list[dict[str, Any]]
    source_format: str
    source_columns: list[str]
    workbook_name: str | None = None
    relation_name: str | None = None
    extracted_table: str | None = None


def normalize_header(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(value))
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-z0-9]+", "_", ascii_value.lower()).strip("_")


def clean_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def coerce_int_string(value: Any) -> str:
    text = clean_text(value)
    if not text:
        return ""
    if re.fullmatch(r"-?\d+(?:\.0+)?", text):
        return str(int(float(text)))
    return text


def coerce_float(value: Any) -> float | None:
    text = clean_text(value)
    if not text:
        return None
    try:
        number = float(text)
    except ValueError:
        return None
    if number == 0:
        return None
    return number


def coerce_iso_date(value: Any) -> str:
    if value is None or value == "":
        return ""
    if isinstance(value, datetime):
        return value.date().isoformat()
    if isinstance(value, date):
        return value.isoformat()
    text = clean_text(value)
    if not text:
        return ""
    try:
        return datetime.fromisoformat(text).date().isoformat()
    except ValueError:
        pass
    for pattern in ("%m/%d/%Y", "%Y-%m-%d"):
        try:
            return datetime.strptime(text, pattern).date().isoformat()
        except ValueError:
            continue
    return text


def normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", value or "")
    ascii_value = normalized.encode("ascii", "ignore").decode("ascii")
    lower = ascii_value.lower()
    for pattern, replacement in NAME_REPLACEMENTS:
        lower = pattern.sub(replacement, lower)
    lower = re.sub(r"[^a-z0-9]+", " ", lower)
    return re.sub(r"\s+", " ", lower).strip()


def normalize_address(value: str) -> str:
    prepared = unicodedata.normalize("NFKD", value or "").encode("ascii", "ignore").decode("ascii").lower()
    prepared = re.sub(r"(\d+)-(\d+)", r"\1\2", prepared)
    tokens = re.split(r"[^a-z0-9]+", prepared)
    normalized_tokens = []
    for token in tokens:
        if not token:
            continue
        token = DIRECTION_REPLACEMENTS.get(token, token)
        token = ADDRESS_SUFFIX_REPLACEMENTS.get(token, token)
        normalized_tokens.append(token)
    return " ".join(normalized_tokens)


def dedupe_preserve_order(values: list[str]) -> list[str]:
    seen = set()
    ordered = []
    for value in values:
        if not value or value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    return ordered


def remove_parenthetical(value: str) -> str:
    return re.sub(r"\s*\([^)]*\)", "", value or "").strip()


def strip_operator_prefix(value: str) -> tuple[str, str | None]:
    text = clean_text(value)
    for pattern, operator_name in NAME_PREFIX_PATTERNS:
        if pattern.search(text):
            return pattern.sub("", text).strip(), operator_name
    if "/" in text:
        parts = [part.strip() for part in text.split("/") if part.strip()]
        if len(parts) >= 2:
            return parts[-1], None
    return text, None


def derive_operator_name(official_name: str, organization_name_type: str) -> str:
    if clean_text(organization_name_type):
        return clean_text(organization_name_type)
    _, derived = strip_operator_prefix(official_name)
    return derived or ""


def generate_name_aliases(official_name: str) -> list[str]:
    aliases = []
    cleaned = clean_text(official_name)
    if cleaned:
        aliases.append(cleaned)

    stripped, _ = strip_operator_prefix(cleaned)
    if stripped and stripped != cleaned:
        aliases.append(stripped)

    without_parens = remove_parenthetical(cleaned)
    if without_parens and without_parens != cleaned:
        aliases.append(without_parens)

    stripped_without_parens = remove_parenthetical(stripped)
    if stripped_without_parens and stripped_without_parens not in {cleaned, stripped}:
        aliases.append(stripped_without_parens)

    return dedupe_preserve_order(aliases)


def generate_normalized_name_variants(aliases: list[str]) -> list[str]:
    variants = []
    for alias in aliases:
        normalized = normalize_text(alias)
        if normalized:
            variants.append(normalized)

        if normalized.startswith("nyc department of education "):
            variants.append(normalized.replace("nyc department of education ", "", 1).strip())

        public_school_variant = re.sub(r"\bps\b", "public school", normalized).strip()
        if public_school_variant and public_school_variant != normalized:
            variants.append(public_school_variant)
            variants.append(re.sub(r"\bpublic school\b", "ps", public_school_variant).strip())
    return dedupe_preserve_order([variant for variant in variants if variant])


def maybe_get(row: dict[str, Any], *aliases: str) -> Any:
    normalized_lookup = {normalize_header(key): key for key in row.keys()}
    for alias in aliases:
        direct = row.get(alias)
        if direct not in (None, ""):
            return direct
        resolved_key = normalized_lookup.get(normalize_header(alias))
        if resolved_key is not None and row.get(resolved_key) not in (None, ""):
            return row[resolved_key]
    return None


def map_source_row(row: dict[str, Any]) -> dict[str, Any]:
    mapped = {}
    for field_name, aliases in FIELD_ALIASES.items():
        mapped[field_name] = maybe_get(row, *aliases)
    return mapped


def parse_workbook_metadata(twb_path: Path) -> tuple[str | None, list[str]]:
    try:
        tree = ET.parse(twb_path)
    except ET.ParseError:
        return None, []

    relation_name = None
    columns = []
    for element in tree.iter():
        tag = element.tag.split("}")[-1]
        if tag == "relation" and relation_name is None:
            relation_name = element.attrib.get("name")
        if tag == "column":
            column_name = element.attrib.get("name")
            if column_name:
                if column_name.startswith("[") and column_name.endswith("]"):
                    column_name = column_name[1:-1]
                if "__tableau_internal" in column_name.lower():
                    continue
                if column_name not in columns:
                    columns.append(column_name)
    return relation_name, columns


def load_rows_from_csv(input_path: Path) -> LoadedSource:
    with input_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        rows = [dict(row) for row in reader]
        columns = reader.fieldnames or []
    return LoadedSource(rows=rows, source_format="csv", source_columns=columns)


def load_rows_from_hyper(
    hyper_path: Path,
    workbook_name: str | None = None,
    relation_name: str | None = None,
) -> LoadedSource:
    if HyperProcess is None or Connection is None or Telemetry is None:
        raise RuntimeError(
            "tableauhyperapi is required to read .hyper or .twbx files. "
            "Install it into the local Python environment first."
        )

    with HyperProcess(Telemetry.DO_NOT_SEND_USAGE_DATA_TO_TABLEAU) as hyper:
        with Connection(endpoint=hyper.endpoint, database=str(hyper_path)) as connection:
            table_names = []
            for schema_name in connection.catalog.get_schema_names():
                for table_name in connection.catalog.get_table_names(schema_name):
                    table_names.append(table_name)

            if not table_names:
                raise RuntimeError(f"No tables found in Hyper file: {hyper_path}")

            table_name = next((table for table in table_names if str(table.schema_name).strip('"') == "Extract"), table_names[0])
            query = f"SELECT * FROM {table_name}"

            rows: list[dict[str, Any]] = []
            columns: list[str] = []

            with connection.execute_query(query) as result:
                columns = [column.name.unescaped for column in result.schema.columns]
                for row in result:
                    serialized_row = {}
                    for column_name, value in zip(columns, row):
                        if isinstance(value, datetime):
                            serialized_row[column_name] = value.isoformat()
                        elif isinstance(value, date):
                            serialized_row[column_name] = value.isoformat()
                        else:
                            serialized_row[column_name] = value
                    rows.append(serialized_row)

    return LoadedSource(
        rows=rows,
        source_format="tableau-hyper",
        source_columns=columns,
        workbook_name=workbook_name,
        relation_name=relation_name,
        extracted_table=str(table_name).replace('"', ""),
    )


def load_rows_from_twbx(input_path: Path) -> LoadedSource:
    with tempfile.TemporaryDirectory(prefix="nyc-facility-ref-") as temp_dir:
        with zipfile.ZipFile(input_path) as archive:
            archive.extractall(temp_dir)

        extracted_root = Path(temp_dir)
        twb_files = list(extracted_root.rglob("*.twb"))
        hyper_files = list(extracted_root.rglob("*.hyper"))
        if not hyper_files:
            raise RuntimeError(f"No .hyper extract found inside {input_path}")

        relation_name = None
        workbook_columns: list[str] = []
        if twb_files:
            relation_name, workbook_columns = parse_workbook_metadata(twb_files[0])

        loaded = load_rows_from_hyper(
            hyper_files[0],
            workbook_name=input_path.name,
            relation_name=relation_name,
        )
        if workbook_columns:
            loaded.source_columns = workbook_columns
        loaded.source_format = "tableau-twbx"
        return loaded


def load_source(input_path: Path) -> LoadedSource:
    suffix = input_path.suffix.lower()
    if suffix == ".csv":
        return load_rows_from_csv(input_path)
    if suffix == ".hyper":
        return load_rows_from_hyper(input_path)
    if suffix == ".twbx":
        return load_rows_from_twbx(input_path)
    raise RuntimeError(f"Unsupported input type: {input_path.suffix}")


def latest_row(rows: list[dict[str, Any]]) -> dict[str, Any]:
    def row_key(row: dict[str, Any]) -> tuple[str, int]:
        inspection_date = coerce_iso_date(row.get("inspection_date"))
        completeness = sum(1 for value in row.values() if clean_text(value))
        return inspection_date, completeness

    return sorted(rows, key=row_key, reverse=True)[0]


def choose_coordinates(rows: list[dict[str, Any]]) -> tuple[dict[str, float] | None, str | None, str]:
    for row in rows:
        latitude = coerce_float(row.get("latitude"))
        longitude = coerce_float(row.get("longitude"))
        if latitude is None or longitude is None:
            continue
        return (
            {
                "latitude": round(latitude, 6),
                "longitude": round(longitude, 6),
            },
            "tableau-hyper:Lat/Long",
            "high",
        )

    return None, None, "none"


def derive_facility_type(primary_row: dict[str, Any]) -> str:
    category_bits = " ".join(
        [
            clean_text(primary_row.get("source_record_type")),
            clean_text(primary_row.get("high_level_category")),
            clean_text(primary_row.get("category")),
            clean_text(primary_row.get("facility_grouping")),
        ]
    ).lower()

    if "indoor" in category_bits:
        return "indoor"
    if "outdoor" in category_bits:
        return "outdoor"
    return "unknown"


def build_street1(address_number: str, address_street: str) -> str:
    return " ".join(part for part in [clean_text(address_number), clean_text(address_street)] if part).strip()


def build_preferred_keys(
    source_facility_id: str,
    location_id: str,
    bin_value: str,
    bbl_value: str,
    normalized_names: list[str],
    normalized_address_variants: list[str],
    postal_code: str,
    geography_id: str,
) -> list[str]:
    keys = []
    if source_facility_id:
        keys.append(f"source_id:{source_facility_id}")
        keys.append(f"source:accela:{source_facility_id}")
    if location_id:
        keys.append(f"location_id:{location_id}")
    if bin_value:
        keys.append(f"bin:{bin_value}")
    if bbl_value:
        keys.append(f"bbl:{bbl_value}")

    for normalized_name in normalized_names:
        keys.append(f"name:{normalized_name}")
        if postal_code:
            keys.append(f"name_zip:{normalized_name}|{postal_code}")
        if geography_id:
            keys.append(f"name_geo:{normalized_name}|{geography_id}")
        for address_variant in normalized_address_variants[:2]:
            if postal_code:
                keys.append(f"name_address_zip:{normalized_name}|{address_variant}|{postal_code}")

    for address_variant in normalized_address_variants:
        if postal_code:
            keys.append(f"address_zip:{address_variant}|{postal_code}")
        if geography_id:
            keys.append(f"address_geo:{address_variant}|{geography_id}")

    return dedupe_preserve_order(keys)


def build_facility_record(source_rows: list[dict[str, Any]]) -> dict[str, Any]:
    primary = latest_row(source_rows)
    source_facility_id = coerce_int_string(primary.get("source_facility_id"))
    source_record_type = clean_text(primary.get("source_record_type"))
    official_name = clean_text(primary.get("official_name"))
    name_aliases = generate_name_aliases(official_name)
    display_name = name_aliases[1] if len(name_aliases) > 1 else (name_aliases[0] if name_aliases else official_name)
    normalized_names = generate_normalized_name_variants(name_aliases or [official_name])
    normalized_name = normalized_names[0] if normalized_names else normalize_text(display_name or official_name)

    operator_name = derive_operator_name(
        official_name=official_name,
        organization_name_type=clean_text(primary.get("organization_name_type")),
    )

    street1 = build_street1(primary.get("address_number"), primary.get("address_street"))
    normalized_street1 = normalize_address(street1)
    normalized_address_variants = dedupe_preserve_order(
        [
            normalized_street1,
            normalize_address(clean_text(primary.get("address_street"))),
        ]
    )

    borough_code = clean_text(primary.get("borough_code")).upper()
    borough_name = BOROUGH_NAMES.get(borough_code, "")
    geography_id = GEOGRAPHY_IDS.get(borough_code, "")
    postal_code = coerce_int_string(primary.get("postal_code"))
    bin_value = coerce_int_string(primary.get("bin"))
    bbl_value = coerce_int_string(primary.get("boro_block_lot"))

    coordinates, coordinate_source, coordinate_confidence = choose_coordinates(source_rows)

    observed_inspection_types = sorted(
        {
            clean_text(row.get("inspection_type"))
            for row in source_rows
            if clean_text(row.get("inspection_type"))
        }
    )

    inspection_date = coerce_iso_date(primary.get("inspection_date"))
    violation_counts = {
        "all": int(coerce_int_string(primary.get("violations_all"))) if coerce_int_string(primary.get("violations_all")) else None,
        "phh": int(coerce_int_string(primary.get("violations_phh"))) if coerce_int_string(primary.get("violations_phh")) else None,
        "critical": int(coerce_int_string(primary.get("violations_critical"))) if coerce_int_string(primary.get("violations_critical")) else None,
        "general": int(coerce_int_string(primary.get("violations_general"))) if coerce_int_string(primary.get("violations_general")) else None,
    }
    latest_violation_counts = {key: value for key, value in violation_counts.items() if value is not None}

    location_id = f"nyc-loc-{source_facility_id}"
    canonical_facility_id = f"nyc-facility-{source_facility_id}"
    preferred_keys = build_preferred_keys(
        source_facility_id=source_facility_id,
        location_id=location_id,
        bin_value=bin_value,
        bbl_value=bbl_value,
        normalized_names=normalized_names,
        normalized_address_variants=normalized_address_variants,
        postal_code=postal_code,
        geography_id=geography_id,
    )

    stable_ids = [
        {"idType": "source_facility_id", "value": source_facility_id},
        {"idType": "location_id", "value": location_id},
    ]
    if bin_value:
        stable_ids.append({"idType": "bin", "value": bin_value})
    if bbl_value:
        stable_ids.append({"idType": "boro_block_lot", "value": bbl_value})

    record: dict[str, Any] = {
        "canonicalFacilityId": canonical_facility_id,
        "cityId": CITY_ID,
        "locationId": location_id,
        "sourceSystem": SOURCE_SYSTEM,
        "sourceFacilityId": source_facility_id,
        "sourceRecordType": source_record_type or None,
        "officialName": official_name,
        "displayName": display_name,
        "normalizedName": normalized_name,
        "alternateNames": name_aliases,
        "operatorName": operator_name or None,
        "address": {
            "street1": street1,
            "normalizedStreet1": normalized_street1,
            "city": "New York",
            "state": "NY",
            "postalCode": postal_code or None,
        },
        "geography": {
            "boroughCode": borough_code or None,
            "boroughName": borough_name or None,
            "geographyId": geography_id or None,
            "neighborhoodName": clean_text(primary.get("neighborhood_name")) or None,
            "neighborhoodCode": clean_text(primary.get("neighborhood_code")) or None,
            "communityBoard": coerce_int_string(primary.get("community_board")) or None,
            "councilDistrict": coerce_int_string(primary.get("council_district")) or None,
            "censusTract": coerce_int_string(primary.get("census_tract")) or None,
            "boroBlockLot": bbl_value or None,
            "bin": bin_value or None,
        },
        "coordinateSource": coordinate_source,
        "coordinateConfidence": coordinate_confidence,
        "facilityType": derive_facility_type(primary),
        "sourceAttributes": {
            "facilityGrouping": clean_text(primary.get("facility_grouping")) or None,
            "highLevelCategory": clean_text(primary.get("high_level_category")) or None,
            "category": clean_text(primary.get("category")) or None,
            "organizationNameType": clean_text(primary.get("organization_name_type")) or None,
            "observationCount": len(source_rows),
        },
        "crosswalk": {
            "normalizedNames": normalized_names,
            "normalizedAddressVariants": normalized_address_variants,
            "stableIds": stable_ids,
            "preferredKeys": preferred_keys,
        },
    }

    if coordinates is not None:
        record["coordinates"] = coordinates

    if inspection_date or observed_inspection_types or latest_violation_counts:
        record["inspection"] = {
            "latestInspectionDate": inspection_date or None,
            "latestInspectionType": clean_text(primary.get("inspection_type")) or None,
            "observedInspectionTypes": observed_inspection_types,
            "latestViolationCounts": latest_violation_counts or None,
        }

    return record


def build_dataset(loaded_source: LoadedSource) -> dict[str, Any]:
    grouped_rows: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for raw_row in loaded_source.rows:
        mapped = map_source_row(raw_row)
        facility_id = coerce_int_string(mapped.get("source_facility_id"))
        if not facility_id:
            continue
        grouped_rows[facility_id].append(mapped)

    facilities = [
        build_facility_record(rows)
        for _, rows in sorted(grouped_rows.items(), key=lambda item: item[0])
    ]

    return {
        "schemaVersion": SCHEMA_VERSION,
        "cityId": CITY_ID,
        "sourceSnapshot": {
            "sourceSystem": SOURCE_SYSTEM,
            "sourceFormat": loaded_source.source_format,
            "workbookName": loaded_source.workbook_name,
            "relationName": loaded_source.relation_name,
            "extractedTable": loaded_source.extracted_table,
            "rowCount": len(loaded_source.rows),
            "uniqueFacilityCount": len(facilities),
            "sourceColumns": loaded_source.source_columns,
        },
        "facilities": facilities,
    }


def flatten_record_for_csv(record: dict[str, Any]) -> dict[str, str]:
    coordinates = record.get("coordinates") or {}
    inspection = record.get("inspection") or {}
    violation_counts = inspection.get("latestViolationCounts") or {}
    return {
        "canonical_facility_id": record["canonicalFacilityId"],
        "location_id": record["locationId"],
        "source_system": record["sourceSystem"],
        "source_facility_id": record["sourceFacilityId"],
        "source_record_type": clean_text(record.get("sourceRecordType")),
        "official_name": record["officialName"],
        "display_name": record["displayName"],
        "normalized_name": record["normalizedName"],
        "operator_name": clean_text(record.get("operatorName")),
        "address_street1": record["address"]["street1"],
        "address_street1_normalized": record["address"]["normalizedStreet1"],
        "city": record["address"]["city"],
        "state": record["address"]["state"],
        "postal_code": clean_text(record["address"].get("postalCode")),
        "borough_code": clean_text(record["geography"].get("boroughCode")),
        "borough_name": clean_text(record["geography"].get("boroughName")),
        "geography_id": clean_text(record["geography"].get("geographyId")),
        "neighborhood_name": clean_text(record["geography"].get("neighborhoodName")),
        "neighborhood_code": clean_text(record["geography"].get("neighborhoodCode")),
        "community_board": clean_text(record["geography"].get("communityBoard")),
        "council_district": clean_text(record["geography"].get("councilDistrict")),
        "census_tract": clean_text(record["geography"].get("censusTract")),
        "boro_block_lot": clean_text(record["geography"].get("boroBlockLot")),
        "bin": clean_text(record["geography"].get("bin")),
        "latitude": clean_text(coordinates.get("latitude")),
        "longitude": clean_text(coordinates.get("longitude")),
        "coordinate_source": clean_text(record.get("coordinateSource")),
        "coordinate_confidence": record["coordinateConfidence"],
        "facility_type": record["facilityType"],
        "facility_grouping": clean_text(record["sourceAttributes"].get("facilityGrouping")),
        "high_level_category": clean_text(record["sourceAttributes"].get("highLevelCategory")),
        "category": clean_text(record["sourceAttributes"].get("category")),
        "organization_name_type": clean_text(record["sourceAttributes"].get("organizationNameType")),
        "observation_count": clean_text(record["sourceAttributes"].get("observationCount")),
        "latest_inspection_date": clean_text(inspection.get("latestInspectionDate")),
        "latest_inspection_type": clean_text(inspection.get("latestInspectionType")),
        "latest_violations_all": clean_text(violation_counts.get("all")),
        "latest_violations_phh": clean_text(violation_counts.get("phh")),
        "latest_violations_critical": clean_text(violation_counts.get("critical")),
        "latest_violations_general": clean_text(violation_counts.get("general")),
        "alternate_names": "|".join(record.get("alternateNames", [])),
        "normalized_crosswalk_names": "|".join(record["crosswalk"].get("normalizedNames", [])),
        "normalized_address_variants": "|".join(record["crosswalk"].get("normalizedAddressVariants", [])),
        "preferred_keys": "|".join(record["crosswalk"].get("preferredKeys", [])),
    }


def write_json(dataset: dict[str, Any], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(dataset, handle, indent=2, ensure_ascii=True)
        handle.write("\n")


def write_csv(dataset: dict[str, Any], output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=CSV_FIELD_ORDER)
        writer.writeheader()
        for record in dataset["facilities"]:
            writer.writerow(flatten_record_for_csv(record))


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build a canonical NYC facility reference dataset from TWBX/HYPER/CSV input."
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Path to a .twbx, .hyper, or .csv facility source file.",
    )
    parser.add_argument(
        "--output",
        default=str(DEFAULT_JSON_OUTPUT),
        help=f"Path to the canonical JSON output. Default: {DEFAULT_JSON_OUTPUT}",
    )
    parser.add_argument(
        "--csv-output",
        default=str(DEFAULT_CSV_OUTPUT),
        help=f"Optional flattened CSV output. Default: {DEFAULT_CSV_OUTPUT}",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    input_path = Path(args.input)
    if not input_path.exists():
        raise RuntimeError(f"Input not found: {input_path}")

    loaded_source = load_source(input_path)
    dataset = build_dataset(loaded_source)

    output_path = Path(args.output)
    csv_output_path = Path(args.csv_output) if args.csv_output else None

    write_json(dataset, output_path)
    if csv_output_path is not None:
        write_csv(dataset, csv_output_path)

    facilities = dataset["facilities"]
    print("Canonical facility reference built successfully")
    print(f"  Input: {input_path}")
    print(f"  Source format: {loaded_source.source_format}")
    print(f"  Source rows: {dataset['sourceSnapshot']['rowCount']}")
    print(f"  Facilities: {len(facilities)}")
    print(f"  JSON output: {output_path}")
    if csv_output_path is not None:
        print(f"  CSV output: {csv_output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
