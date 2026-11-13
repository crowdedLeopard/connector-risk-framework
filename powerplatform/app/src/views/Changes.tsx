/**
 * Changes: what each weekly refresh added, removed or changed, newest first, so a reviewer can
 * work through new connectors and changed traits before they reach makers.
 */
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { Tab, TabList } from "@fluentui/react-components";
import { AddCircle20Regular, ArrowSync20Regular, DismissCircle20Regular, History24Regular } from "@fluentui/react-icons";
import { useApp } from "../state/AppState";
import { Card, Empty, ErrorState, PageHead, TreatmentBadge } from "../components/ui";
import { fmt } from "../lib/format";
import { href } from "../lib/router";
import type { Change } from "../data/types";

const ICON: Record<Change["type"], ReactElement> = {
  new: <AddCircle20Regular color="#0ca30c" aria-label="New" />,
  removed: <DismissCircle20Regular color="#d03b3b" aria-label="Removed" />,
  changed: <ArrowSync20Regular aria-label="Changed" />,
};

export function Changes() {
  const { repository, resultBySlug, zone, bySlug } = useApp();
  const [changes, setChanges] = useState<Change[] | null>(null);
  const [error, setError] = useState("");
  const [type, setType] = useState<"all" | Change["type"]>("all");

  useEffect(() => {
    repository?.loadChanges().then(setChanges).catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [repository]);

  const groups = useMemo(() => {
    const map = new Map<string, Change[]>();
    for (const c of changes ?? []) if (type === "all" || c.type === type) map.set(c.date, [...(map.get(c.date) ?? []), c]);
    return [...map.entries()];
  }, [changes, type]);

  const count = (t: Change["type"]) => changes?.filter((c) => c.type === t).length ?? 0;

  if (error) return <ErrorState message={error} />;

  return (
    <>
      <PageHead title="Changes" subtitle="What each weekly refresh added, removed or changed in the catalogue." />
      <Card flush>
        <div style={{ padding: "8px 12px", borderBottom: "1px solid var(--colorNeutralStroke2)" }}>
          <TabList size="small" selectedValue={type} onTabSelect={(_, d) => setType(d.value as typeof type)}>
            <Tab value="all">All {changes?.length ?? ""}</Tab>
            <Tab value="new">New {count("new")}</Tab>
            <Tab value="changed">Changed {count("changed")}</Tab>
            <Tab value="removed">Removed {count("removed")}</Tab>
          </TabList>
        </div>
        <div style={{ padding: "0 20px 12px" }}>
          {changes === null ? (
            <p className="muted small">Loading…</p>
          ) : groups.length === 0 ? (
            <Empty icon={<History24Regular />} title="No changes recorded">
              Changes appear here after each weekly refresh.
            </Empty>
          ) : (
            groups.map(([date, items]) => (
              <section key={date} aria-label={`Refresh of ${fmt.date(date)}`}>
                <div className="timeline-date">
                  {fmt.date(date)} · {fmt.plural(items.length, "change")}
                </div>
                {items.map((c) => {
                  const r = resultBySlug(zone, c.slug);
                  return (
                    <div className="change" key={c.id}>
                      {ICON[c.type]}
                      <div>
                        {bySlug.has(c.slug) ? <a href={href(`connector/${encodeURIComponent(c.slug)}`)}>{c.name}</a> : <strong>{c.name}</strong>}
                        <div className="small muted">{c.summary}</div>
                      </div>
                      <span>{r && <TreatmentBadge treatment={r.treatment} />}</span>
                    </div>
                  );
                })}
              </section>
            ))
          )}
        </div>
      </Card>
    </>
  );
}
