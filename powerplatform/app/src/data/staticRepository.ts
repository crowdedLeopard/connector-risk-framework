/**
 * Demo repository: reads the repository's published JSON (data/current, data/changes) and keeps the
 * profile and decisions in this browser's localStorage. Used by `npm run demo` for local design work
 * and screenshots, so the app can be seen with real data without a Power Platform environment.
 */
import { describeChange } from "@describe";
import { defaultSettings } from "@engine";
import type { Repository } from "./repository";
import type { Catalogue, Change, Connector, ConnectorDetail, Decision, Fact, Profile, Refresh, User } from "./types";
import { connectorFromIndex, parseSettings, type IndexEntry } from "./mapping";

const PROFILE_KEY = "crf.demo.profile";
const DECISIONS_KEY = "crf.demo.decisions";

/** localStorage can be unavailable (private windows, blocked storage); the demo must still work. */
const store = {
  read<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
      return fallback;
    }
  },
  write(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* Not persisted; the change still applies for this session. */
    }
  },
};

interface DetailFile {
  actions: { name: string; opId: string; class: string; basis: string; method: string | null; deprecated: boolean; parameters?: unknown[]; anchor: string }[];
  triggers: DetailFile["actions"];
  exposures: Record<string, string>;
  originEvidence?: string;
  authTypes?: { name: string; shareable: boolean; nameResolved?: boolean }[];
  website?: string;
  privacyPolicy?: string;
  serviceDomain?: string;
  lastChanged?: string;
}

export class StaticRepository implements Repository {
  readonly sourceLabel = "Demo data from this repository";
  readonly canWrite = true;
  private readonly base: string;

  constructor(base: string) {
    this.base = base.endsWith("/") ? base : `${base}/`;
  }

  private async json<T>(path: string): Promise<T> {
    const response = await fetch(`${this.base}${path}`);
    if (!response.ok) throw new Error(`Could not load ${path} (HTTP ${response.status}).`);
    return (await response.json()) as T;
  }

  async currentUser(): Promise<User> {
    return { name: "Demo user" };
  }

  async loadCatalogue(): Promise<Catalogue> {
    const [index, meta] = await Promise.all([
      this.json<IndexEntry[]>("data/current/index.json"),
      this.json<{ dataDate: string; categories: string[] }>("data/current/meta.json"),
    ]);
    const connectors = index.map(connectorFromIndex).sort((a, b) => a.n.localeCompare(b.n));
    return { connectors, dataDate: meta.dataDate, categories: meta.categories };
  }

  async loadDetail(connector: Connector): Promise<ConnectorDetail> {
    const d = await this.json<DetailFile>(`data/current/connectors/${encodeURIComponent(connector.s)}.json`).catch(() => null);
    if (!d) return { operations: [], evidence: {}, originEvidence: "", authTypes: [], website: "", privacyPolicy: "", serviceDomain: "" };
    const op = (kind: "action" | "trigger") => (o: DetailFile["actions"][number]) => ({
      name: o.name,
      opId: o.opId,
      kind,
      cls: o.class,
      basis: o.basis,
      method: (o.method ?? "").toUpperCase(),
      deprecated: o.deprecated,
      parameterCount: o.parameters?.length ?? 0,
      anchor: o.anchor,
    });
    return {
      operations: [...d.actions.map(op("action")), ...d.triggers.map(op("trigger"))],
      evidence: d.exposures ?? {},
      originEvidence: d.originEvidence ?? "",
      authTypes: (d.authTypes ?? []).filter((a) => a.nameResolved !== false).map((a) => `${a.name}${a.shareable ? " (shareable)" : ""}`),
      website: d.website ?? "",
      privacyPolicy: d.privacyPolicy ?? "",
      serviceDomain: d.serviceDomain ?? "",
    };
  }

  async loadChanges(): Promise<Change[]> {
    const dates = await this.json<string[]>("data/changes/index.json").catch(() => [] as string[]);
    const files = await Promise.all(
      dates.map((d) =>
        this.json<{ date: string; names: Record<string, string>; new: string[]; removed: string[]; changed: { slug: string; exposuresAdded?: string[]; exposuresRemoved?: string[]; operationsAdded?: string[]; operationsRemoved?: string[] }[] }>(
          `data/changes/${d}.json`,
        ),
      ),
    );
    return files
      .flatMap((f) => [
        ...f.new.map((slug) => ({ id: `${f.date}-n-${slug}`, date: f.date, type: "new" as const, slug, name: f.names[slug] ?? slug, summary: "Added to the catalogue." })),
        ...f.removed.map((slug) => ({ id: `${f.date}-r-${slug}`, date: f.date, type: "removed" as const, slug, name: f.names[slug] ?? slug, summary: "No longer in the catalogue." })),
        ...f.changed.map((c) => ({
          id: `${f.date}-c-${c.slug}`,
          date: f.date,
          type: "changed" as const,
          slug: c.slug,
          name: f.names[c.slug] ?? c.slug,
          summary: describeChange(c),
        })),
      ])
      .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
  }

  async loadRefreshes(): Promise<Refresh[]> {
    const meta = await this.json<{ dataDate: string; counts: Record<string, number>; classifier: { agree: number; comparable: number } }>("data/current/meta.json");
    const c = meta.counts;
    return [
      {
        date: meta.dataDate, connectors: c.catalogue, operations: c.operations, premium: c.premium, preview: c.preview, mcp: c.mcp,
        independent: c.independent, added: 0, removed: 0, changed: 0, classifierAgree: meta.classifier.agree, classifierComparable: meta.classifier.comparable,
      },
    ];
  }

  async loadFacts(): Promise<Fact[]> {
    const f = await this.json<{ facts: { id: string; statement: string; status: string; source: string; lastChecked: string }[]; sources: Record<string, { url: string }> }>(
      "data/current/facts.json",
    );
    return f.facts.map((x) => ({ ...x, sourceUrl: f.sources[x.source]?.url ?? "" }));
  }

  async loadProfile(): Promise<Profile> {
    const saved = store.read<Profile | null>(PROFILE_KEY, null);
    if (saved) return { ...saved, settings: parseSettings(JSON.stringify(saved.settings)) };
    return { id: "demo", name: "Microsoft's starting point", description: "", settings: defaultSettings(), modifiedOn: "" };
  }

  async saveProfile(profile: Profile): Promise<Profile> {
    const saved = { ...profile, id: profile.id || "demo", modifiedOn: new Date().toISOString() };
    store.write(PROFILE_KEY, saved);
    return saved;
  }

  async loadDecisions(): Promise<Decision[]> {
    return store.read<Decision[]>(DECISIONS_KEY, []);
  }

  async saveDecision(decision: Decision): Promise<Decision> {
    const saved = { ...decision, id: decision.id || crypto.randomUUID(), owner: "Demo user", modifiedOn: new Date().toISOString() };
    store.write(DECISIONS_KEY, [saved, ...store.read<Decision[]>(DECISIONS_KEY, []).filter((d) => d.id !== saved.id)]);
    return saved;
  }

  async deleteDecision(decision: Decision): Promise<void> {
    store.write(DECISIONS_KEY, store.read<Decision[]>(DECISIONS_KEY, []).filter((d) => d.id !== decision.id));
  }
}
