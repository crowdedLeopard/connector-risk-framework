/**
 * Criteria: what the organisation accepts in each environment zone. This is the risk profile the
 * engine applies. Edits are previewed live (treatment counts update as you change a cell) and only
 * written to Dataverse when saved, where auditing records who changed what.
 */
import { Fragment, useMemo, useState } from "react";
import { Button, Dropdown, Field, Input, MessageBar, MessageBarBody, Option, Radio, RadioGroup, Switch, TagPicker, TagPickerControl, TagPickerGroup, TagPickerInput, TagPickerList, TagPickerOption, Tag } from "@fluentui/react-components";
import { ArrowResetRegular } from "@fluentui/react-icons";
import {
  countChanges,
  evaluateAll,
  EXPOSURES,
  GROUPS,
  PRESETS,
  setLevel,
  setLimit,
  summarise,
  TOLERANCE_LABELS,
  TOLERANCES,
  clearChanges,
  ZONES,
  type PresetId,
  type Settings,
  type Tolerance,
  type ZoneId,
} from "@engine";
import { useApp } from "../state/AppState";
import { Card, PageHead, TreatmentBadge } from "../components/ui";
import { fmt } from "../lib/format";

const clone = (s: Settings): Settings => structuredClone(s);

export function Criteria() {
  const { profile, saveProfile, live, catalogue, repository, decisions } = useApp();
  const [draft, setDraft] = useState<Settings>(() => clone(profile.settings));
  const [name, setName] = useState(profile.name);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ intent: "success" | "error"; text: string } | null>(null);

  // When the saved profile changes (after a save or a reload), the draft starts again from it.
  const [base, setBase] = useState(profile);
  if (base !== profile) {
    setBase(profile);
    setDraft(clone(profile.settings));
    setName(profile.name);
  }

  const dirty = name !== profile.name || JSON.stringify(draft) !== JSON.stringify(profile.settings);
  const canWrite = repository?.canWrite ?? false;

  // Live preview: the same evaluation the rest of the app uses, on the unsaved draft.
  const preview = useMemo(() => {
    const withDecisions = { ...draft, overrides: Object.fromEntries(decisions.filter((d) => d.slug).map((d) => [d.slug, d.decision])) };
    return Object.fromEntries(ZONES.map((z) => [z.id, summarise(evaluateAll(live, withDecisions, z.id))])) as Record<ZoneId, ReturnType<typeof summarise>>;
  }, [draft, live, decisions]);

  const edit = (fn: (s: Settings) => Settings) => {
    setMessage(null);
    setDraft((s) => fn(clone(s)));
  };

  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      await saveProfile({ ...profile, name: name.trim() || profile.name, settings: draft });
      setMessage({ intent: "success", text: "Saved. Every screen now uses these criteria." });
    } catch (e) {
      setMessage({ intent: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const changes = countChanges(draft);

  return (
    <>
      <PageHead
        title="Criteria"
        subtitle="What your organisation accepts in each environment zone. Start from a level, then change any limit."
      />
      <div className="stack">
        <div className="grid grid-3">
          {ZONES.map((z) => (
            <section className="card" key={z.id} aria-label={z.label}>
              <div className="zone-name">{z.label}</div>
              <div className="zone-help" style={{ marginBottom: 12 }}>{z.help}</div>
              <Field label="Starting level" size="small">
                <Dropdown
                  size="small"
                  disabled={!canWrite}
                  value={PRESETS[draft.levels[z.id]].label}
                  selectedOptions={[draft.levels[z.id]]}
                  onOptionSelect={(_, d) => edit((s) => setLevel(s, d.optionValue as PresetId, z.id))}
                >
                  {(Object.keys(PRESETS) as PresetId[]).map((p) => (
                    <Option key={p} value={p} text={PRESETS[p].label}>
                      {PRESETS[p].label}
                    </Option>
                  ))}
                </Dropdown>
              </Field>
              <p className="small muted" style={{ margin: "8px 0 12px", minHeight: 32 }}>{PRESETS[draft.levels[z.id]].help}</p>
              <dl className="preview" aria-label={`${z.label}: connectors per treatment with these criteria`}>
                {(["block", "retain", "modify", "allow"] as const).map((t) => (
                  <Fragment key={t}>
                    <dt><TreatmentBadge treatment={t} /></dt>
                    <dd className="num">{fmt.n(preview[z.id][t])}</dd>
                  </Fragment>
                ))}
              </dl>
            </section>
          ))}
        </div>

        <Card id="context" title="Your policy setup" subtitle="Which controls exist in your tenant. This decides whether a decision can actually be enforced.">
          <div className="grid grid-2">
            <Field label="Data policy model">
              <RadioGroup
                layout="horizontal"
                disabled={!canWrite}
                value={draft.context.policyModel}
                onChange={(_, d) => edit((s) => ({ ...s, context: { ...s.context, policyModel: d.value as Settings["context"]["policyModel"] } }))}
              >
                <Radio value="classic" label="Classic data policies" />
                <Radio value="mixed" label="Classic and advanced" />
                <Radio value="acp" label="Advanced only" />
              </RadioGroup>
            </Field>
            <div className="stack" style={{ gap: 4 }}>
              <Switch disabled={!canWrite} checked={draft.context.managed} label="Environments are Managed Environments" onChange={(_, d) => edit((s) => ({ ...s, context: { ...s.context, managed: d.checked } }))} />
              <Switch disabled={!canWrite} checked={draft.context.logicApps} label="Azure Logic Apps are in use" onChange={(_, d) => edit((s) => ({ ...s, context: { ...s.context, logicApps: d.checked } }))} />
            </div>
          </div>
          <Field label="Sensitive categories" hint="Connectors in these Learn categories get the trait “In a category you marked as sensitive”." style={{ marginTop: 12 }}>
            <TagPicker
              disabled={!canWrite}
              selectedOptions={draft.sensitiveCategories}
              onOptionSelect={(_, d) => edit((s) => ({ ...s, sensitiveCategories: d.selectedOptions as string[] }))}
            >
              <TagPickerControl>
                <TagPickerGroup aria-label="Selected categories">
                  {draft.sensitiveCategories.map((c) => (
                    <Tag key={c} value={c} shape="rounded" size="small">
                      {c}
                    </Tag>
                  ))}
                </TagPickerGroup>
                <TagPickerInput aria-label="Add a category" />
              </TagPickerControl>
              <TagPickerList>
                {catalogue.categories.filter((c) => !draft.sensitiveCategories.includes(c)).map((c) => (
                  <TagPickerOption key={c} value={c}>
                    {c}
                  </TagPickerOption>
                ))}
              </TagPickerList>
            </TagPicker>
          </Field>
        </Card>

        <Card id="limits" title="Limits" subtitle="For each trait and zone: accept it, accept it with controls, or do not accept it. A bar on the left marks a change from the level." flush>
          <div className="table-wrap">
            <table className="data matrix">
              <thead>
                <tr>
                  <th scope="col">Trait</th>
                  {ZONES.map((z) => <th scope="col" key={z.id}>{z.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {GROUPS.map((g) => (
                  <Fragment key={g.id}>
                    <tr>
                      <th className="group" colSpan={ZONES.length + 1} scope="colgroup">{g.label}</th>
                    </tr>
                    {EXPOSURES.filter((e) => e.group === g.id).map((e) => (
                      <tr key={e.id}>
                        <td className="trait" style={{ paddingTop: 8, paddingBottom: 8 }}>
                          <strong>{e.label}</strong>
                          <div className="small muted">{e.help}</div>
                        </td>
                        {ZONES.map((z) => {
                          const value = draft.zones[z.id][e.id] ?? "allow";
                          const changed = e.id in draft.adjust[z.id];
                          return (
                            <td key={z.id} className={changed ? "changed" : undefined}>
                              <span className="seg" role="group" aria-label={`${e.label}, ${z.label}`}>
                                {TOLERANCES.map((t: Tolerance) => (
                                  <button key={t} type="button" className={t} aria-pressed={value === t} disabled={!canWrite} onClick={() => edit((s) => setLimit(s, z.id, e.id, t))}>
                                    {t === "allow" ? "Accept" : t === "controls" ? "Controls" : "Deny"}
                                  </button>
                                ))}
                              </span>
                              <span className="sr-only">{TOLERANCE_LABELS[value]}</span>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {message && (
          <MessageBar intent={message.intent}>
            <MessageBarBody>{message.text}</MessageBarBody>
          </MessageBar>
        )}

        {canWrite && (
          <div className="savebar">
            <Field label="Profile name" orientation="horizontal" size="small" style={{ minWidth: 320 }}>
              <Input size="small" value={name} onChange={(_, d) => setName(d.value)} maxLength={200} />
            </Field>
            <span className="small muted">{changes ? fmt.plural(changes, "change") + " from the levels" : "Matches the levels"}</span>
            <span className="spacer" />
            <Button size="small" icon={<ArrowResetRegular />} disabled={!changes} onClick={() => edit(clearChanges)}>
              Reset to levels
            </Button>
            <Button size="small" disabled={!dirty || busy} onClick={() => { setDraft(clone(profile.settings)); setName(profile.name); }}>
              Discard
            </Button>
            <Button size="small" appearance="primary" disabled={!dirty || busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save criteria"}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
