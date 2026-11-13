/**
 * Catalogue: every connector with its treatment in the selected zone, filterable and sortable.
 *
 * Filters live in the URL (#/catalogue?treatment=block&trait=send), so any view can be bookmarked,
 * shared, or linked from the overview. Rows render in pages of 100 as the reader scrolls, which keeps
 * the first paint fast with 1,600 connectors and needs no virtualisation library.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Button, Dropdown, Option, SearchBox } from "@fluentui/react-components";
import { ArrowDown12Regular, ArrowDownload16Regular, ArrowUp12Regular, Dismiss12Regular, SearchInfo24Regular } from "@fluentui/react-icons";
import { EXPOSURE_BY_ID, EXPOSURES, TREATMENTS, ZONES, type Result, type TreatmentId, type ZoneId } from "@engine";
import { useApp } from "../state/AppState";
import { Chips, Empty, Monogram, PageHead, TreatmentBadge } from "../components/ui";
import { ZoneSwitch } from "../components/ZoneSwitch";
import { fmt } from "../lib/format";
import { downloadCsv } from "../lib/csv";
import { navigate, type Route } from "../lib/router";
import { ORIGIN_LABELS, PUBLISHER_LABELS } from "../lib/labels";
import { TREATMENT_ORDER } from "../theme/theme";
import type { Connector } from "../data/types";

const PAGE = 100;
type SortKey = "name" | "treatment" | "limits" | "actions" | "origin";
const FILTERS = ["q", "treatment", "trait", "origin", "publisher", "licence", "category", "decision"] as const;
type Filters = Record<(typeof FILTERS)[number], string>;

export function Catalogue({ route }: { route: Route }) {
  const { live, results, zone, setZone, catalogue, decisionBySlug } = useApp();

  // The URL is the source of truth for filters. A zone in the URL (from an overview link) is applied once.
  const queryKey = route.query.toString();
  const { filters, sort, desc } = useMemo(() => {
    const q = new URLSearchParams(queryKey);
    return {
      filters: Object.fromEntries(FILTERS.map((k) => [k, q.get(k) ?? ""])) as Filters,
      sort: ((q.get("sort") as SortKey | null) ?? "name") as SortKey,
      desc: q.get("dir") === "desc",
    };
  }, [queryKey]);
  useEffect(() => {
    const z = route.query.get("zone");
    if (z && ZONES.some((x) => x.id === z) && z !== zone) setZone(z as ZoneId);
  }, [route.query, setZone, zone]);

  const update = (changes: Partial<Filters & { sort: string; dir: string }>) => {
    const next: Record<string, string | undefined> = { ...filters, sort: sort === "name" ? undefined : sort, dir: desc ? "desc" : undefined, ...changes };
    navigate("catalogue", next, true);
  };

  const rows = useMemo(() => {
    const q = filters.q.trim().toLowerCase();
    const out: { c: Connector; r: Result }[] = [];
    live.forEach((c, i) => {
      const r = results[zone][i];
      if (q && !c.n.toLowerCase().includes(q) && !c.p.toLowerCase().includes(q) && !c.s.includes(q)) return;
      if (filters.treatment && r.treatment !== filters.treatment) return;
      if (filters.trait && !(c.x.includes(filters.trait) || r.reasons.some((x) => x.id === filters.trait))) return;
      if (filters.origin && c.o !== filters.origin) return;
      if (filters.publisher && c.pt !== filters.publisher) return;
      if (filters.licence && (filters.licence === "premium") !== c.premium) return;
      if (filters.category && !c.c.includes(filters.category)) return;
      if (filters.decision && !decisionBySlug.has(c.s)) return;
      out.push({ c, r });
    });
    const by: Record<SortKey, (a: (typeof out)[number], b: (typeof out)[number]) => number> = {
      name: (a, b) => a.c.n.localeCompare(b.c.n),
      treatment: (a, b) => TREATMENTS[a.r.treatment].order - TREATMENTS[b.r.treatment].order || a.c.n.localeCompare(b.c.n),
      limits: (a, b) => b.r.redLines - a.r.redLines || b.r.reasons.length - a.r.reasons.length || a.c.n.localeCompare(b.c.n),
      actions: (a, b) => b.c.la - a.c.la || a.c.n.localeCompare(b.c.n),
      origin: (a, b) => (ORIGIN_LABELS[a.c.o] ?? "").localeCompare(ORIGIN_LABELS[b.c.o] ?? "") || a.c.n.localeCompare(b.c.n),
    };
    out.sort(by[sort] ?? by.name);
    if (desc) out.reverse();
    return out;
  }, [live, results, zone, filters, decisionBySlug, sort, desc]);

  // Incremental rendering: show more rows when the sentinel below the table scrolls into view.
  // A new result set starts from the first page again (adjusted during render, as React advises).
  const [shown, setShown] = useState(PAGE);
  const [shownFor, setShownFor] = useState(rows);
  if (shownFor !== rows) {
    setShownFor(rows);
    setShown(PAGE);
  }
  const sentinel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const observer = new IntersectionObserver((entries) => entries[0].isIntersecting && setShown((n) => n + PAGE), { root: document.getElementById("main"), rootMargin: "600px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [rows]);

  const active = FILTERS.filter((k) => filters[k]);
  const zoneLabel = ZONES.find((z) => z.id === zone)!.label;

  const exportCsv = () =>
    downloadCsv(`connectors-${zone}-${catalogue.dataDate}.csv`, [
      ["Connector", "Publisher", "API ID", "Zone", "Treatment", "Data group", "Limits crossed", "Traits", "Live actions", "Service", "Learn"],
      ...rows.map(({ c, r }) => [c.n, c.p, c.api, zoneLabel, TREATMENTS[r.treatment].label, r.group ?? "", r.redLines, c.x.map((x) => EXPOSURE_BY_ID[x]?.label ?? x).join("; "), c.la, ORIGIN_LABELS[c.o] ?? c.o, c.learnUrl]),
    ]);

  const header = (key: SortKey, label: string, align?: "right") => (
    <th scope="col" className={align} aria-sort={sort === key ? (desc ? "descending" : "ascending") : "none"}>
      <button type="button" onClick={() => update({ sort: key === "name" ? "" : key, dir: sort === key && !desc ? "desc" : "" })}>
        {label}
        {sort === key && (desc ? <ArrowDown12Regular /> : <ArrowUp12Regular />)}
      </button>
    </th>
  );

  const dropdown = (key: keyof Filters, placeholder: string, options: [string, string][], width = 160) => (
    <Dropdown
      size="small"
      aria-label={placeholder}
      placeholder={placeholder}
      value={options.find(([v]) => v === filters[key])?.[1] ?? ""}
      selectedOptions={filters[key] ? [filters[key]] : []}
      onOptionSelect={(_, d) => update({ [key]: d.optionValue === "*" ? "" : d.optionValue })}
      style={{ minWidth: width }}
    >
      <Option value="*">{`Any ${placeholder.toLowerCase()}`}</Option>
      {options.map(([v, l]) => (
        <Option key={v} value={v}>
          {l}
        </Option>
      ))}
    </Dropdown>
  );

  return (
    <>
      <PageHead
        title="Catalogue"
        subtitle={`Every connector, assessed for the ${zoneLabel.toLowerCase()} zone.`}
        actions={
          <>
            <ZoneSwitch />
            <Button size="small" icon={<ArrowDownload16Regular />} onClick={exportCsv} disabled={!rows.length}>
              Export CSV
            </Button>
          </>
        }
      />
      <div className="card card-flush">
        <div className="toolbar" role="search">
          <SearchBox size="small" placeholder="Name, publisher or ID" value={filters.q} onChange={(_, d) => update({ q: d.value })} style={{ width: 240 }} aria-label="Search connectors" />
          {dropdown("treatment", "Treatment", TREATMENT_ORDER.map((t) => [t, TREATMENTS[t].label as string]))}
          {dropdown("trait", "Trait", EXPOSURES.map((e) => [e.id, e.label]), 220)}
          {dropdown("origin", "Service", Object.entries(ORIGIN_LABELS))}
          {dropdown("publisher", "Publisher", Object.entries(PUBLISHER_LABELS))}
          {dropdown("licence", "Licence", [["standard", "Standard"], ["premium", "Premium"]], 130)}
          {dropdown("category", "Category", catalogue.categories.map((c) => [c, c]))}
          {dropdown("decision", "Decision", [["any", "Has a decision"]], 150)}
        </div>
        <div className="result-count" aria-live="polite">
          <span className="num">{fmt.plural(rows.length, "connector")}</span>
          {active.length > 0 && (
            <Button size="small" appearance="subtle" icon={<Dismiss12Regular />} onClick={() => update(Object.fromEntries(FILTERS.map((k) => [k, ""])))}>
              Clear filters
            </Button>
          )}
        </div>
        {rows.length === 0 ? (
          <Empty icon={<SearchInfo24Regular />} title="No connectors match">
            Try fewer filters, or search for part of a name.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  {header("name", "Connector")}
                  {header("treatment", "Treatment")}
                  {header("limits", "Red lines", "right")}
                  <th scope="col">Crosses your limits on</th>
                  {header("actions", "Actions", "right")}
                  {header("origin", "Service")}
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, shown).map(({ c, r }) => {
                  const open = () => navigate(`connector/${encodeURIComponent(c.s)}`);
                  return (
                    <tr key={c.s} className="clickable" tabIndex={0} onClick={open} onKeyDown={(e) => e.key === "Enter" && open()}>
                      <td>
                        <div className="cell-name">
                          <Monogram name={c.n} />
                          <div style={{ minWidth: 0 }}>
                            <a className="title" href={`#/connector/${encodeURIComponent(c.s)}`} onClick={(e) => e.stopPropagation()} style={{ textDecoration: "none" }}>
                              {c.n}
                            </a>
                            <span className="sub">
                              {c.kind || c.p}
                              {decisionBySlug.has(c.s) ? " · decision recorded" : ""}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="nowrap">
                        <TreatmentBadge treatment={r.treatment as TreatmentId} />
                      </td>
                      <td className="right num">{r.redLines || <span className="muted">0</span>}</td>
                      <td>
                        <Chips items={r.reasons.filter((x) => x.tolerance !== "allow").map((x) => EXPOSURE_BY_ID[x.id]?.label ?? x.id)} max={2} />
                      </td>
                      <td className="right num">{fmt.n(c.la)}</td>
                      <td className="small muted nowrap">{ORIGIN_LABELS[c.o] ?? c.o}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div ref={sentinel} style={{ height: 1 }} aria-hidden />
            {shown < rows.length && <p className="small muted" style={{ padding: "12px 16px", margin: 0 }}>Showing {fmt.n(shown)} of {fmt.n(rows.length)}. Scroll for more.</p>}
          </div>
        )}
      </div>
    </>
  );
}
