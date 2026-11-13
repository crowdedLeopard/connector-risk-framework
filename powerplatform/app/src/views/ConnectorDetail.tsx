/**
 * Connector detail: why the connector gets each treatment, the evidence behind every trait, which
 * documented control can carry out the result, the organisation's own decision, and every operation.
 */
import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Field,
  Input,
  Link,
  MessageBar,
  MessageBarBody,
  Radio,
  RadioGroup,
  Tab,
  TabList,
  Textarea,
} from "@fluentui/react-components";
import { Open12Regular, PlugDisconnected24Regular } from "@fluentui/react-icons";
import { EXPOSURES, TOLERANCE_LABELS, ZONES, type Override } from "@engine";
import { useApp } from "../state/AppState";
import { Card, Empty, Monogram, PageHead, TreatmentBadge } from "../components/ui";
import { fmt, daysUntil } from "../lib/format";
import { href } from "../lib/router";
import { ACP_LABELS, CLASS_LABELS, DECISION_HELP, DECISION_LABELS, ISOLATION_LABELS, ORIGIN_LABELS } from "../lib/labels";
import type { Connector, ConnectorDetail as Detail, Decision } from "../data/types";

export function ConnectorDetail({ slug }: { slug: string }) {
  const { bySlug, resultBySlug, settings, repository } = useApp();
  const connector = bySlug.get(slug);
  // Loaded detail is tagged with the connector it belongs to, so a stale response never shows
  // against a newer connector and nothing has to be cleared synchronously when the input changes.
  const [loaded, setLoaded] = useState<{ for: Connector; detail: Detail | null; error: string } | null>(null);
  const current = loaded && loaded.for === connector ? loaded : null;
  const detail = current?.detail ?? null;
  const error = current?.error ?? "";

  useEffect(() => {
    if (!connector || !repository) return;
    let cancelled = false;
    repository
      .loadDetail(connector)
      .then((d) => !cancelled && setLoaded({ for: connector, detail: d, error: "" }))
      .catch((e: unknown) => !cancelled && setLoaded({ for: connector, detail: null, error: e instanceof Error ? e.message : String(e) }));
    return () => {
      cancelled = true;
    };
  }, [connector, repository]);

  if (!connector) {
    return (
      <Empty icon={<PlugDisconnected24Regular />} title="Connector not found">
        No connector has the ID “{slug}”. <Link href={href("catalogue")}>Back to the catalogue</Link>
      </Empty>
    );
  }

  const zoneResults = ZONES.map((z) => ({ zone: z, result: resultBySlug(z.id, slug) }));
  const traits = EXPOSURES.filter((e) => connector.x.includes(e.id) || (e.id === "sensitive-category" && connector.c.some((c) => settings.sensitiveCategories.includes(c))));

  return (
    <>
      <PageHead
        crumbs={
          <>
            <a href={href("catalogue")}>Catalogue</a>
            <span aria-hidden>/</span>
            <span>{connector.n}</span>
          </>
        }
        title={
          <span className="detail-head">
            <Monogram name={connector.n} large />
            <span>
              {connector.n}
              <div className="meta">
                <span>{connector.p}</span>
                <span>{ORIGIN_LABELS[connector.o]}</span>
                {connector.learnUrl && (
                  <Link href={connector.learnUrl} target="_blank" rel="noreferrer">
                    Microsoft Learn <Open12Regular />
                  </Link>
                )}
              </div>
            </span>
          </span>
        }
        actions={
          <div className="row">
            {connector.premium ? <Badge appearance="tint" color="brand">Premium</Badge> : <Badge appearance="tint" color="informative">Standard</Badge>}
            {connector.preview && <Badge appearance="tint" color="warning">Preview</Badge>}
            {connector.m && <Badge appearance="tint" color="important">MCP server</Badge>}
            {connector.deprecated && <Badge appearance="tint" color="danger">Deprecated</Badge>}
            {connector.removed && <Badge appearance="filled" color="danger">Removed from catalogue</Badge>}
          </div>
        }
      />

      <div className="stack">
        <div className="grid grid-3">
          {zoneResults.map(({ zone, result }) =>
            result ? (
              <section className="card zone-card" key={zone.id} aria-label={`${zone.label}: ${result.treatment}`}>
                <h3>{zone.label}</h3>
                <div className="big">
                  <TreatmentBadge treatment={result.treatment} size="lg" />
                </div>
                {result.group && <p className="small muted" style={{ margin: "0 0 8px" }}>Data group: {result.group}</p>}
                <ul>
                  {[...result.why, ...result.steps].map((s, i) => <li key={i}>{s.text}</li>)}
                  {!result.why.length && !result.steps.length && <li>Within your criteria for this zone.</li>}
                </ul>
              </section>
            ) : (
              <section className="card zone-card" key={zone.id}>
                <h3>{zone.label}</h3>
                <p className="muted small">Not assessed: the connector is no longer in the catalogue.</p>
              </section>
            ),
          )}
        </div>

        {zoneResults[0].result?.notes.length ? (
          <MessageBar intent="info" layout="multiline">
            <MessageBarBody>
              {zoneResults[0].result.notes.map((n, i) => (
                <div key={i}>{n.text}</div>
              ))}
            </MessageBarBody>
          </MessageBar>
        ) : null}

        <Card id="traits" title="Traits and evidence" subtitle="What the connector can do and where it reaches, with the evidence for each, and what your criteria say about it." flush>
          {traits.length === 0 ? (
            <p className="muted small" style={{ padding: "0 20px 16px" }}>No documented traits.</p>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th scope="col">Trait</th>
                    <th scope="col">Evidence</th>
                    {ZONES.map((z) => <th scope="col" key={z.id}>{z.label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {traits.map((e) => (
                    <tr key={e.id}>
                      <td style={{ minWidth: 200, paddingTop: 10, paddingBottom: 10 }}>
                        <strong>{e.label}</strong>
                        <div className="small muted">{e.basis}</div>
                      </td>
                      <td className="small" style={{ paddingTop: 10, paddingBottom: 10 }}>{detail ? detail.evidence[e.id] || e.help : "…"}</td>
                      {ZONES.map((z) => {
                        const t = settings.zones[z.id][e.id] ?? "allow";
                        return (
                          <td key={z.id}>
                            <span className={`tolerance ${t}`}>
                              <i aria-hidden />
                              {TOLERANCE_LABELS[t]}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        <div className="grid grid-main">
          {error ? (
            <MessageBar intent="error">
              <MessageBarBody>{error}</MessageBarBody>
            </MessageBar>
          ) : (
            <Operations detail={detail} />
          )}

          <div className="stack">
            <DecisionCard slug={slug} connectorId={connector.id} />
            <Card id="controls" title="Controls">
              <dl className="props">
                <dt>Classic data policies</dt>
                <dd>{!connector.ct.classifiable ? "Not classifiable" : connector.ct.blockable ? "Can be blocked" : "Cannot be blocked"}</dd>
                <dt>Advanced connector policies</dt>
                <dd>{ACP_LABELS[connector.ct.acp] ?? connector.ct.acp}</dd>
                <dt>Action control</dt>
                <dd>{connector.ct.actionControl ? "Supported" : "Not supported"}</dd>
                <dt>Endpoint filtering</dt>
                <dd>{connector.ct.endpointFiltering ? "Supported" : "Not supported"}</dd>
                <dt>Tenant isolation</dt>
                <dd>{ISOLATION_LABELS[connector.ct.tenantIsolation] ?? connector.ct.tenantIsolation}</dd>
                <dt>Works in</dt>
                <dd>{connector.products.join(", ") || "Not stated"}</dd>
                {detail?.authTypes.length ? (
                  <>
                    <dt>Authentication</dt>
                    <dd>{detail.authTypes.join(", ")}</dd>
                  </>
                ) : null}
                {detail?.serviceDomain && (
                  <>
                    <dt>Service domain</dt>
                    <dd>{detail.serviceDomain}</dd>
                  </>
                )}
                <dt>First seen</dt>
                <dd>{fmt.date(connector.firstSeen)}</dd>
              </dl>
              {detail?.originEvidence && <p className="small muted" style={{ marginBottom: 0 }}>{detail.originEvidence}</p>}
            </Card>
          </div>
        </div>

      </div>
    </>
  );
}

/** Actions and triggers, grouped by class with a tab per class. */
function Operations({ detail }: { detail: Detail | null }) {
  const [tab, setTab] = useState("all");
  const groups = useMemo(() => {
    const map = new Map<string, Detail["operations"]>();
    for (const o of detail?.operations ?? []) {
      const key = o.kind === "trigger" ? "trigger" : o.deprecated ? "deprecated" : o.cls;
      map.set(key, [...(map.get(key) ?? []), o]);
    }
    return map;
  }, [detail]);
  const labels: Record<string, string> = { ...CLASS_LABELS, trigger: "Triggers", deprecated: "Deprecated" };
  const order = ["admin", "raw", "send", "delete", "write", "read", "other", "trigger", "deprecated"].filter((k) => groups.has(k));
  const shown = tab === "all" ? detail?.operations ?? [] : groups.get(tab) ?? [];

  return (
    <Card id="operations" title="Operations" subtitle="Each action and trigger, with the class the open classification rules gave it." flush>
      {!detail ? (
        <p className="muted small" style={{ padding: "0 20px 16px" }}>Loading operations…</p>
      ) : detail.operations.length === 0 ? (
        <p className="muted small" style={{ padding: "0 20px 16px" }}>The Learn page lists no operations.</p>
      ) : (
        <>
          <div style={{ padding: "0 12px", borderBottom: "1px solid var(--colorNeutralStroke2)" }}>
            <TabList size="small" selectedValue={tab} onTabSelect={(_, d) => setTab(String(d.value))}>
              <Tab value="all">All {detail.operations.length}</Tab>
              {order.map((k) => (
                <Tab key={k} value={k}>
                  {labels[k] ?? k} {groups.get(k)!.length}
                </Tab>
              ))}
            </TabList>
          </div>
          <div className="table-wrap" style={{ maxHeight: 520 }}>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Operation</th>
                  <th scope="col">Class</th>
                  <th scope="col">Classified by</th>
                  <th scope="col" className="right">Parameters</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((o) => (
                  <tr key={`${o.kind}-${o.opId}-${o.anchor}`}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{o.name}</div>
                      <div className="mono muted">{o.opId}</div>
                    </td>
                    <td className="small">{o.kind === "trigger" ? "Trigger" : CLASS_LABELS[o.cls] ?? o.cls}</td>
                    <td className="small muted">{o.basis}</td>
                    <td className="right num">{o.parameterCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

/** The organisation's decision on this connector: record, change or remove it. */
function DecisionCard({ slug, connectorId }: { slug: string; connectorId: string }) {
  const { decisionBySlug, saveDecision, deleteDecision, repository } = useApp();
  const existing = decisionBySlug.get(slug);
  const blank: Decision = { id: "", connectorId, slug, decision: "approved", rationale: "", reference: "", reviewDate: "", owner: "", modifiedOn: "" };
  const [draft, setDraft] = useState<Decision>(existing ?? blank);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // When the stored decision changes (saved here or elsewhere), start again from it.
  const [base, setBase] = useState(existing);
  if (base !== existing) {
    setBase(existing);
    setDraft(existing ?? blank);
    setEditing(false);
  }

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      setEditing(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const due = existing ? daysUntil(existing.reviewDate) : null;

  if (!editing) {
    return (
      <Card
        id="decision"
        title="Your decision"
        actions={
          repository?.canWrite && (
            <Button size="small" onClick={() => setEditing(true)}>
              {existing ? "Edit" : "Record a decision"}
            </Button>
          )
        }
      >
        {existing ? (
          <dl className="props">
            <dt>Decision</dt>
            <dd><strong>{DECISION_LABELS[existing.decision]}</strong></dd>
            {existing.rationale && (<><dt>Rationale</dt><dd>{existing.rationale}</dd></>)}
            {existing.reference && (<><dt>Reference</dt><dd>{existing.reference}</dd></>)}
            {existing.reviewDate && (
              <>
                <dt>Review by</dt>
                <dd>
                  {fmt.date(existing.reviewDate)}
                  {due !== null && due < 0 && <Badge appearance="tint" color="danger" style={{ marginLeft: 8 }}>Overdue</Badge>}
                </dd>
              </>
            )}
            {existing.owner && (<><dt>Owner</dt><dd>{existing.owner}</dd></>)}
          </dl>
        ) : (
          <p className="small muted" style={{ margin: 0 }}>
            None recorded. The criteria decide this connector's treatment. Record a decision when a contract, review or exception settles it.
          </p>
        )}
      </Card>
    );
  }

  return (
    <Card id="decision" title={existing ? "Edit decision" : "Record a decision"}>
      <form
        className="stack"
        style={{ gap: 12 }}
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => saveDecision({ ...draft, connectorId, slug }));
        }}
      >
        <RadioGroup value={draft.decision} onChange={(_, d) => setDraft({ ...draft, decision: d.value as Override })} aria-label="Decision">
          {(["approved", "allow", "block"] as const).map((k) => (
            <Radio key={k} value={k} label={<span><strong>{DECISION_LABELS[k]}</strong><br /><span className="small muted">{DECISION_HELP[k]}</span></span>} />
          ))}
        </RadioGroup>
        <Field label="Rationale" required>
          <Textarea value={draft.rationale} onChange={(_, d) => setDraft({ ...draft, rationale: d.value })} resize="vertical" maxLength={4000} />
        </Field>
        <div className="grid grid-2" style={{ gap: 12 }}>
          <Field label="Reference" hint="Contract, ticket or review ID">
            <Input value={draft.reference} onChange={(_, d) => setDraft({ ...draft, reference: d.value })} maxLength={200} />
          </Field>
          <Field label="Review by">
            <Input type="date" value={draft.reviewDate} onChange={(_, d) => setDraft({ ...draft, reviewDate: d.value })} />
          </Field>
        </div>
        {error && (
          <MessageBar intent="error">
            <MessageBarBody>{error}</MessageBarBody>
          </MessageBar>
        )}
        <div className="row">
          <Button appearance="primary" type="submit" disabled={busy || !draft.rationale.trim()}>
            Save decision
          </Button>
          <Button onClick={() => setEditing(false)} disabled={busy}>
            Cancel
          </Button>
          <span className="spacer" />
          {existing && (
            <Button appearance="subtle" disabled={busy} onClick={() => void run(() => deleteDecision(existing))}>
              Remove decision
            </Button>
          )}
        </div>
      </form>
    </Card>
  );
}

