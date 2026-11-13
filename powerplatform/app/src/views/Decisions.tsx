/**
 * Decisions: the register of connectors the organisation has decided on directly, with owners and
 * review dates. Overdue reviews sort first, because they are the ones that need someone now.
 */
import { useMemo } from "react";
import { Badge, Link } from "@fluentui/react-components";
import { Gavel24Regular } from "@fluentui/react-icons";
import { useApp } from "../state/AppState";
import { Card, Empty, Monogram, PageHead, TreatmentBadge } from "../components/ui";
import { daysUntil, fmt } from "../lib/format";
import { href, navigate } from "../lib/router";
import { DECISION_LABELS } from "../lib/labels";
import { downloadCsv } from "../lib/csv";
import { Button } from "@fluentui/react-components";
import { ArrowDownload16Regular } from "@fluentui/react-icons";

export function Decisions() {
  const { decisions, bySlug, resultBySlug, zone } = useApp();

  const rows = useMemo(
    () =>
      decisions
        .map((d) => ({ d, c: bySlug.get(d.slug), due: daysUntil(d.reviewDate) }))
        .sort((a, b) => (a.due ?? 1e9) - (b.due ?? 1e9) || (a.c?.n ?? a.d.slug).localeCompare(b.c?.n ?? b.d.slug)),
    [decisions, bySlug],
  );
  const overdue = rows.filter((r) => r.due !== null && r.due < 0).length;

  return (
    <>
      <PageHead
        title="Decisions"
        subtitle={decisions.length ? `${fmt.plural(decisions.length, "decision")} on record${overdue ? `, ${overdue} overdue for review` : ""}.` : "Connectors your organisation has decided on directly."}
        actions={
          decisions.length > 0 && (
            <Button
              size="small"
              icon={<ArrowDownload16Regular />}
              onClick={() =>
                downloadCsv("connector-decisions.csv", [
                  ["Connector", "Decision", "Rationale", "Reference", "Review by", "Owner", "Last changed"],
                  ...rows.map(({ d, c }) => [c?.n ?? d.slug, DECISION_LABELS[d.decision], d.rationale, d.reference, d.reviewDate, d.owner, d.modifiedOn.slice(0, 10)]),
                ])
              }
            >
              Export CSV
            </Button>
          )
        }
      />
      <Card flush>
        {rows.length === 0 ? (
          <Empty icon={<Gavel24Regular />} title="No decisions yet">
            Open a connector from the <Link href={href("catalogue")}>catalogue</Link> and record a decision when a contract, review or exception settles it.
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Connector</th>
                  <th scope="col">Decision</th>
                  <th scope="col">Result in this zone</th>
                  <th scope="col">Rationale</th>
                  <th scope="col">Review by</th>
                  <th scope="col">Owner</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ d, c, due }) => {
                  const r = resultBySlug(zone, d.slug);
                  const open = () => navigate(`connector/${encodeURIComponent(d.slug)}`);
                  return (
                    <tr key={d.id} className="clickable" tabIndex={0} onClick={open} onKeyDown={(e) => e.key === "Enter" && open()}>
                      <td>
                        <div className="cell-name">
                          <Monogram name={c?.n ?? d.slug} />
                          <div>
                            <span className="title">{c?.n ?? d.slug}</span>
                            <span className="sub">{c?.p}</span>
                          </div>
                        </div>
                      </td>
                      <td>{DECISION_LABELS[d.decision]}</td>
                      <td>{r ? <TreatmentBadge treatment={r.treatment} /> : <span className="muted small">Not in catalogue</span>}</td>
                      <td className="small" style={{ maxWidth: 360 }}>
                        <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{d.rationale}</span>
                      </td>
                      <td className="small">
                        {d.reviewDate ? fmt.date(d.reviewDate) : <span className="muted">None</span>}
                        {due !== null && due < 0 && <Badge appearance="tint" color="danger" size="small" style={{ marginLeft: 6 }}>Overdue</Badge>}
                        {due !== null && due >= 0 && due <= 30 && <Badge appearance="tint" color="warning" size="small" style={{ marginLeft: 6 }}>Due soon</Badge>}
                      </td>
                      <td className="small muted">{d.owner || "Not recorded"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
