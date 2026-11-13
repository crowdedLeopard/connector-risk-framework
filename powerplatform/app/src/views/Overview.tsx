/**
 * Overview: where the catalogue stands against the organisation's criteria, in every zone at once,
 * and what changed most recently. Every number links to the catalogue rows behind it.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "@fluentui/react-components";
import { AddCircle20Regular, ArrowSync20Regular, DismissCircle20Regular } from "@fluentui/react-icons";
import { EXPOSURES, summarise, ZONES, type ZoneId } from "@engine";
import { useApp } from "../state/AppState";
import { BarList, TreatmentBars, TreatmentLegend } from "../components/charts";
import { Card, PageHead, StatTile } from "../components/ui";
import { ZoneSwitch } from "../components/ZoneSwitch";
import { fmt } from "../lib/format";
import { href, navigate } from "../lib/router";
import type { Change } from "../data/types";

export function Overview() {
  const { live, results, zone, settings, profile, catalogue, repository } = useApp();
  const [changes, setChanges] = useState<Change[] | null>(null);

  useEffect(() => {
    repository?.loadChanges().then(setChanges).catch(() => setChanges([]));
  }, [repository]);

  const zoneRows = useMemo(() => ZONES.map((z) => ({ zone: z, counts: summarise(results[z.id]) })), [results]);
  const current = zoneRows.find((r) => r.zone.id === zone)!.counts;
  const needsWork = current.modify + current.retain;

  // How many connectors carry each trait. Category sensitivity is the organisation's choice, so it is
  // counted against the profile's sensitive categories rather than read from the data.
  const traitCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of live) {
      for (const x of c.x) counts.set(x, (counts.get(x) ?? 0) + 1);
      if (c.c.some((cat) => settings.sensitiveCategories.includes(cat))) counts.set("sensitive-category", (counts.get("sensitive-category") ?? 0) + 1);
    }
    return EXPOSURES.map((e) => ({ key: e.id, label: e.label, value: counts.get(e.id) ?? 0, href: href("catalogue", { trait: e.id }), title: e.help }))
      .filter((i) => i.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [live, settings.sensitiveCategories]);

  const latest = changes?.length ? changes[0].date : "";
  const latestChanges = changes?.filter((c) => c.date === latest) ?? [];
  const byType = (t: Change["type"]) => latestChanges.filter((c) => c.type === t).length;

  return (
    <>
      <PageHead
        title="Overview"
        subtitle={`${fmt.n(live.length)} connectors assessed against “${profile.name}”. Data from ${fmt.date(catalogue.dataDate)}.`}
        actions={<ZoneSwitch />}
      />

      <div className="stack">
        <div className="grid grid-4">
          <StatTile label="Connectors in the catalogue" value={fmt.n(live.length)} foot={`${fmt.n(live.filter((c) => c.premium).length)} premium · ${fmt.n(live.filter((c) => c.m).length)} MCP servers`} href={href("catalogue")} />
          <StatTile label="Blocked in this zone" value={fmt.n(current.block)} foot={`${fmt.pct(current.block, live.length)} of the catalogue`} href={href("catalogue", { treatment: "block" })} />
          <StatTile
            label="Need controls or a risk owner"
            value={fmt.n(needsWork)}
            foot={`${fmt.n(current.modify)} with controls · ${fmt.n(current.retain)} cannot be enforced`}
            href={href("catalogue", { treatment: current.retain ? "retain" : "modify" })}
          />
          <StatTile
            label="Changed in the last refresh"
            value={changes ? fmt.n(latestChanges.length) : "…"}
            foot={latest ? `${byType("new")} new · ${byType("removed")} removed · ${byType("changed")} changed` : "No refresh history yet"}
            href={href("changes")}
          />
        </div>

        <Card
          id="by-zone"
          title="Treatment by environment zone"
          subtitle="What your criteria mean for each zone. Select a segment to see those connectors."
          actions={<TreatmentLegend />}
        >
          <TreatmentBars rows={zoneRows} onSelect={(z: ZoneId, t) => navigate("catalogue", { zone: z, treatment: t })} />
        </Card>

        <div className="grid grid-main">
          <Card id="traits" title="Most common traits" subtitle="Connectors that have each documented trait. Select one to filter the catalogue.">
            <BarList items={traitCounts} max={live.length} />
          </Card>

          <Card id="recent" title="Latest changes" subtitle={latest ? `Refresh of ${fmt.date(latest)}` : undefined} actions={<Link href={href("changes")}>All changes</Link>}>
            {changes === null ? (
              <p className="muted small">Loading…</p>
            ) : latestChanges.length === 0 ? (
              <p className="muted small">No changes recorded yet. They appear after the second weekly refresh.</p>
            ) : (
              <div>
                {latestChanges.slice(0, 8).map((c) => (
                  <div className="change" key={c.id}>
                    {c.type === "new" ? <AddCircle20Regular color="#0ca30c" /> : c.type === "removed" ? <DismissCircle20Regular color="#d03b3b" /> : <ArrowSync20Regular />}
                    <div>
                      <a href={href(`connector/${encodeURIComponent(c.slug)}`)}>{c.name}</a>
                      <div className="small muted">{c.summary}</div>
                    </div>
                    <span className="small muted">{c.type === "new" ? "New" : c.type === "removed" ? "Removed" : "Changed"}</span>
                  </div>
                ))}
                {latestChanges.length > 8 && (
                  <p className="small" style={{ margin: "10px 0 0" }}>
                    <Link href={href("changes")}>{fmt.plural(latestChanges.length - 8, "more change")}</Link>
                  </p>
                )}
              </div>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
