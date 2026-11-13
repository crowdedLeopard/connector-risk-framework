"""The site build stamp, bulk downloads and the published data contract."""
import csv
import io
import json

from pipeline import build_site, validate_data
from pipeline.versions import METHOD_VERSION, SCHEMA_VERSION


def test_current_data_matches_schema():
    assert validate_data.check() == []


def test_schema_rejects_a_malformed_row():
    v = validate_data.validator("index.schema.json")
    index = json.loads((validate_data.DATA / "current" / "index.json").read_text("utf-8"))
    bad = dict(index[0], pt="somebody")
    del bad["n"]
    assert len(list(v.iter_errors([bad]))) == 2


def test_build_stamp_records_the_run(monkeypatch):
    monkeypatch.setenv("GITHUB_REPOSITORY", "owner/repo")
    monkeypatch.setenv("GITHUB_RUN_ID", "42")
    monkeypatch.setenv("GITHUB_SHA", "abc123")
    stamp = build_site.build_stamp("2026-11-09")
    assert stamp["runUrl"] == "https://github.com/owner/repo/actions/runs/42"
    assert stamp["commit"] == "abc123"
    assert stamp["methodVersion"] == METHOD_VERSION and stamp["schemaVersion"] == SCHEMA_VERSION
    validate_data.validator("build.schema.json").validate(stamp)


def test_csv_download_is_safe_and_readable():
    row = {name: "" for _, name in build_site.FIELDS}
    row.update(slug="x", name="=HYPERLINK(1)", premium=True, traits=["a", "b"], operationClasses={"read": 2}, kind="")
    text = build_site.catalogue_csv([row])
    header, values = list(csv.reader(io.StringIO(text)))
    data = dict(zip(header, values))
    assert data["name"] == "'=HYPERLINK(1)"
    assert data["premium"] == "yes"
    assert data["traits"] == "a; b"
    assert data["learnUrl"] == "https://learn.microsoft.com/en-us/connectors/x/"
