from pathlib import Path

import pytest

from pipeline.crawl import Listing
from pipeline.derive import Classifier, build_record, load_config, service_origin
from pipeline.extract import parse_page
from pipeline.run import diff

FIXTURES = Path(__file__).parent / "fixtures"
curated, class_config = load_config()
classifier = Classifier(class_config)
LISTS = {"microsoft": ["sql", "smtp", "msnweather"], "mcpserver": [], "partners": ["openaiip"]}


def page(slug: str) -> dict:
    return parse_page(slug, (FIXTURES / f"{slug}.html").read_text("utf-8"))


def built(slug: str, markers=()) -> dict:
    listing = Listing(slug=slug, name="", publisher="", markers=list(markers))
    return build_record(page(slug), listing, LISTS, curated, classifier, {})


def test_contact_details_are_never_extracted():
    assert "contact@example.com" in (FIXTURES / "sql.html").read_text("utf-8")
    assert "contact@example.com" not in str(built("sql"))


def test_learn_descriptions_are_not_stored():
    assert "relational database management system" not in str(built("sql"))
    assert "hold a conversation" not in str(built("openaiip"))


def test_products_and_sovereign_exclusions():
    products = {p["service"]: p for p in page("msnweather")["products"]}
    assert products["Power Apps"]["class"] == "Standard"
    assert any("China" in e for e in products["Power Apps"]["regionsExcluded"])


def test_authentication_types_and_secret_parameters():
    smtp = page("smtp")["authTypes"][0]
    assert smtp["shareable"] is True
    assert ("Password", "securestring") in [(p["name"], p["type"]) for p in smtp["parameters"]]


def test_operations_with_ids_and_deprecated_flag():
    sql = page("sql")
    assert any(o["opId"] == "ExecutePassThroughNativeQuery_V2" for o in sql["actions"])
    assert any(o["deprecated"] for o in sql["actions"])
    assert sql["triggers"]


def test_independent_publisher_flag():
    assert "independentPublisher" in page("openaiip")["nameFlags"]


def test_missing_sections_do_not_invent_data():
    weather = page("msnweather")
    assert weather["authTypes"] == []
    assert "undocumented" in built("msnweather")["exposures"]


@pytest.mark.parametrize("name,op_id,expected", [
    ("Get message", "GetMessage", "read"),
    ("Delete message", "DeleteMessage", "delete"),
    ("Send Email (V3)", "SendEmailV3", "send"),
    ("Create a row", "CreateRow", "write"),
    ("Execute a SQL query (V2)", "ExecutePassThroughNativeQuery_V2", "raw"),
    ("Send an HTTP request to SharePoint", "HttpRequest", "raw"),
    ("Assign role to user", "AssignRole", "admin"),
])
def test_operation_classes(name, op_id, expected):
    assert classifier.from_text(name, op_id) == expected


def test_published_delete_method_overrides_words():
    assert classifier.classify("x", "Clear the thing", "ClearThing", "delete")[0] == "delete"


def test_origin_uses_website_not_publisher():
    record = {"slug": "asana", "serviceDomain": "asana.com"}
    assert service_origin(record, curated, True)[0] == "third-party"
    record = {"slug": "x", "serviceDomain": "dev.azure.com"}
    assert service_origin(record, curated, False)[0] == "microsoft"
    record = {"slug": "x", "serviceDomain": ""}
    assert service_origin(record, curated, True)[0] == "unstated"


def test_any_endpoint_exposure():
    assert "any-endpoint" in built("smtp")["exposures"]


def test_every_exposure_has_evidence():
    for slug in ("sql", "smtp", "msnweather", "openaiip"):
        for exposure, evidence in built(slug)["exposures"].items():
            assert evidence, f"{slug} {exposure}"


def test_diff_reports_operations_and_new_connectors():
    before = {"a": {"publisher": "P", "origin": "o", "preview": False, "deprecated": False, "mcp": False,
                    "authTypes": [], "operations": ["x"], "exposures": []}}
    after = {"a": {**before["a"], "operations": ["x", "y"], "preview": True}, "b": before["a"]}
    result = diff(before, after)
    assert result["new"] == ["b"]
    assert result["changed"][0]["operationsAdded"] == ["y"]
    assert result["changed"][0]["preview"] == {"from": False, "to": True}


def test_fail_safe_keeps_last_good_data_when_count_collapses(tmp_path, monkeypatch):
    from pipeline import run as refresh
    current = tmp_path / "current"
    current.mkdir()
    meta = current / "meta.json"
    meta.write_text('{"counts": {"catalogue": 100}}', "utf-8")
    monkeypatch.setattr(refresh, "CURRENT", current)
    shrunk = [Listing(slug=f"c{i}", name="x", publisher="p", markers=[]) for i in range(94)]
    monkeypatch.setattr(refresh, "crawl", lambda: {"overview": shrunk, "lists": {}, "pages": {}, "errors": {}})
    with pytest.raises(refresh.FailSafe):
        refresh.run(False, "2026-01-01")
    assert meta.read_text("utf-8") == '{"counts": {"catalogue": 100}}'
    assert sorted(p.name for p in current.iterdir()) == ["meta.json"]


def test_fail_safe_stops_when_too_many_pages_fail(tmp_path, monkeypatch):
    from pipeline import run as refresh
    current = tmp_path / "current"
    current.mkdir()
    monkeypatch.setattr(refresh, "CURRENT", current)
    monkeypatch.setattr(refresh, "update_repo", lambda: None)
    monkeypatch.setattr(refresh, "load_definitions", lambda repo: {})
    monkeypatch.setattr(refresh, "check_nonblockable_names", lambda c: [])
    listings = [Listing(slug=f"c{i}", name="x", publisher="p", markers=[]) for i in range(10)]
    empty_lists = {"microsoft": [], "partners": [], "mcpserver": [], "preview": [], "premium": []}
    monkeypatch.setattr(refresh, "crawl", lambda: {"overview": listings, "lists": empty_lists, "pages": {}, "errors": {}})
    with pytest.raises(refresh.FailSafe):
        refresh.run(False, "2026-01-01")
    assert not (current / "index.json").exists()


def test_definition_match_picks_the_best_candidate_and_needs_half_the_operations():
    from pipeline.derive import match_definition
    record = {"name": "Thing", "slug": "thing", "actions": [{"opId": "A"}, {"opId": "B"}], "triggers": []}
    weak = {"group": "certified-connectors", "folder": "a", "operations": {"A": {}}}
    strong = {"group": "certified-connectors", "folder": "z", "operations": {"A": {}, "B": {}}}
    other = {"group": "certified-connectors", "folder": "m", "operations": {"X": {}}}
    assert match_definition(record, {"thing": [weak, strong]}) is strong
    assert match_definition(record, {"thing": [other]}) is None
