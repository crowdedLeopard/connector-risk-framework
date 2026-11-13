/**
 * Method and sources: how the assessment works, how accurate the operation classifier is, and
 * every governance fact with its source page and when it was last checked.
 */
import { useEffect, useState } from "react";
import { Badge, Link } from "@fluentui/react-components";
import { Open12Regular } from "@fluentui/react-icons";
import { useApp } from "../state/AppState";
import { Card, PageHead } from "../components/ui";
import { fmt } from "../lib/format";
import type { Fact, Refresh } from "../data/types";

export function Method() {
  const { repository } = useApp();
  const [facts, setFacts] = useState<Fact[]>([]);
  const [refreshes, setRefreshes] = useState<Refresh[]>([]);

  useEffect(() => {
    repository?.loadFacts().then(setFacts).catch(() => setFacts([]));
    repository?.loadRefreshes().then(setRefreshes).catch(() => setRefreshes([]));
  }, [repository]);

  const latest = refreshes.at(-1);

  return (
    <>
      <PageHead title="Method and sources" subtitle="How the assessment works, and the evidence behind it." />
      <div className="grid grid-main">
        <div className="stack">
          <Card>
            <div className="prose">
              <p style={{ marginTop: 0 }}>
                There is deliberately no risk score. A score hides which property of a connector matters to you, and different organisations accept different things.
                Instead the app keeps four things separate:
              </p>
              <ol>
                <li><strong>Facts</strong> from Microsoft Learn and Microsoft's connector repository, refreshed every week.</li>
                <li><strong>Traits</strong> derived from those facts by open rules, such as “sends or shares data outward”.</li>
                <li><strong>Your criteria</strong>: what you accept for each trait in each environment zone.</li>
                <li><strong>The result</strong>: a treatment, and the documented control that can carry it out. When no control can, the result says so.</li>
              </ol>
              <h2>Treatments</h2>
              <p>
                <strong>Block</strong> when a trait you do not accept is present and a control can block the connector. <strong>Cannot enforce</strong> when no control
                can carry out your decision, so a risk owner has to accept it. <strong>Allow with controls</strong> when it can be used with the listed steps.{" "}
                <strong>Allow</strong> when it meets your criteria. <strong>Outside data policies</strong> when Power Platform data policies do not govern it.
              </p>
              <h2>Accuracy</h2>
              <p>
                Operation classes come from operation names. Each refresh checks them against the HTTP methods in Microsoft's published definitions.
                {latest?.classifierComparable ? ` In the latest refresh ${fmt.n(latest.classifierAgree)} of ${fmt.n(latest.classifierComparable)} comparable operations agreed (${fmt.pct(latest.classifierAgree, latest.classifierComparable)}).` : ""}
              </p>
              <h2>Disclaimer</h2>
              <p>
                This is indicative guidance derived from public Microsoft documentation. It is not an official Microsoft assessment and does not replace your own
                risk assessment. Check each connector's Learn page, and test any policy change outside production first.
              </p>
            </div>
          </Card>
        </div>
        <Card title="Governance facts" subtitle={`${facts.length} claims about Microsoft behaviour, each checked against its source on every refresh.`} flush>
          <div className="table-wrap" style={{ maxHeight: 640 }}>
            <table className="data">
              <tbody>
                {facts.map((f) => (
                  <tr key={f.id}>
                    <td style={{ paddingTop: 10, paddingBottom: 10 }}>
                      <div className="small">{f.statement}</div>
                      <div className="row small muted" style={{ marginTop: 4 }}>
                        <Badge size="small" appearance="tint" color={f.status === "verified" ? "success" : "warning"}>{f.status}</Badge>
                        {f.sourceUrl && (
                          <Link href={f.sourceUrl} target="_blank" rel="noreferrer">
                            Source <Open12Regular />
                          </Link>
                        )}
                        <span>Checked {fmt.date(f.lastChecked)}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </>
  );
}
