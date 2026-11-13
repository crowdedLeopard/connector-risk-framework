/**
 * Application state: the catalogue, the organisation's profile and decisions, and the engine's
 * results for each environment zone.
 *
 * Results are derived, never stored. They are recomputed (in about 10 ms for 1,600 connectors) only
 * when the catalogue, the profile or a decision changes, so every screen agrees with every other and
 * with the public site, which runs the same engine.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { evaluateAll, ZONES, type Result, type Settings, type ZoneId } from "@engine";
import { createRepository, type Repository } from "../data/repository";
import type { Catalogue, Connector, Decision, Profile, User } from "../data/types";
import { defaultSettings } from "@engine";

type Status = { state: "loading" } | { state: "ready" } | { state: "error"; message: string };

interface AppState {
  status: Status;
  repository: Repository | null;
  user: User;
  catalogue: Catalogue;
  /** Connectors still in the catalogue; removed ones stay in Dataverse for history only. */
  live: Connector[];
  bySlug: Map<string, Connector>;
  profile: Profile;
  decisions: Decision[];
  decisionBySlug: Map<string, Decision>;
  /** The settings the engine sees: the profile plus decisions as overrides. */
  settings: Settings;
  /** results[zone][i] belongs to live[i]. */
  results: Record<ZoneId, Result[]>;
  resultBySlug: (zone: ZoneId, slug: string) => Result | undefined;
  zone: ZoneId;
  setZone: (zone: ZoneId) => void;
  saveProfile: (profile: Profile) => Promise<void>;
  saveDecision: (decision: Decision) => Promise<void>;
  deleteDecision: (decision: Decision) => Promise<void>;
  reload: () => void;
}

const empty: Catalogue = { connectors: [], dataDate: "", categories: [] };
const emptyProfile: Profile = { id: "", name: "Microsoft's starting point", description: "", settings: defaultSettings(), modifiedOn: "" };

const Context = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>({ state: "loading" });
  const [repository, setRepository] = useState<Repository | null>(null);
  const [user, setUser] = useState<User>({ name: "" });
  const [catalogue, setCatalogue] = useState<Catalogue>(empty);
  const [profile, setProfile] = useState<Profile>(emptyProfile);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [zone, setZone] = useState<ZoneId>("shared");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setStatus({ state: "loading" });
      try {
        const repo = await createRepository();
        // The catalogue first: decisions resolve their connector through it.
        const [cat, who, prof] = await Promise.all([repo.loadCatalogue(), repo.currentUser(), repo.loadProfile()]);
        const decs = await repo.loadDecisions();
        if (cancelled) return;
        setRepository(repo);
        setCatalogue(cat);
        setUser(who);
        setProfile(prof ?? emptyProfile);
        setDecisions(decs);
        setStatus({ state: "ready" });
      } catch (error) {
        if (!cancelled) setStatus({ state: "error", message: error instanceof Error ? error.message : String(error) });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const live = useMemo(() => catalogue.connectors.filter((c) => !c.removed), [catalogue]);
  const bySlug = useMemo(() => new Map(catalogue.connectors.map((c) => [c.s, c])), [catalogue]);
  const decisionBySlug = useMemo(() => new Map(decisions.map((d) => [d.slug, d])), [decisions]);

  const settings = useMemo<Settings>(
    () => ({ ...profile.settings, overrides: Object.fromEntries(decisions.filter((d) => d.slug).map((d) => [d.slug, d.decision])) }),
    [profile, decisions],
  );

  const results = useMemo(
    () => Object.fromEntries(ZONES.map((z) => [z.id, evaluateAll(live, settings, z.id)])) as Record<ZoneId, Result[]>,
    [live, settings],
  );

  const indexBySlug = useMemo(() => new Map(live.map((c, i) => [c.s, i])), [live]);
  const resultBySlug = useCallback(
    (z: ZoneId, slug: string) => {
      const i = indexBySlug.get(slug);
      return i === undefined ? undefined : results[z][i];
    },
    [indexBySlug, results],
  );

  const saveProfile = useCallback(
    async (next: Profile) => {
      if (!repository) return;
      setProfile(await repository.saveProfile(next));
    },
    [repository],
  );

  const saveDecision = useCallback(
    async (decision: Decision) => {
      if (!repository) return;
      const saved = await repository.saveDecision(decision);
      setDecisions((current) => [saved, ...current.filter((d) => d.id !== saved.id && d.slug !== saved.slug)]);
    },
    [repository],
  );

  const deleteDecision = useCallback(
    async (decision: Decision) => {
      if (!repository) return;
      await repository.deleteDecision(decision);
      setDecisions((current) => current.filter((d) => d.id !== decision.id));
    },
    [repository],
  );

  const value: AppState = {
    status, repository, user, catalogue, live, bySlug, profile, decisions, decisionBySlug, settings, results, resultBySlug,
    zone, setZone, saveProfile, saveDecision, deleteDecision, reload: () => setAttempt((n) => n + 1),
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useApp(): AppState {
  const value = useContext(Context);
  if (!value) throw new Error("useApp must be used inside AppStateProvider.");
  return value;
}
