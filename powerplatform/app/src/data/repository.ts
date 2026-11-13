/**
 * The one boundary between the screens and where data lives.
 *
 * DataverseRepository is used inside Power Apps. StaticRepository reads the repository's JSON files
 * for `npm run demo` and screenshots, and keeps edits in the browser.
 */
import type { Catalogue, Change, ConnectorDetail, Connector, Decision, Fact, Profile, Refresh, User } from "./types";

export interface Repository {
  /** Shown in the footer so people know where numbers come from. */
  readonly sourceLabel: string;
  /** False when the signed-in user cannot change criteria or decisions. */
  readonly canWrite: boolean;

  currentUser(): Promise<User>;
  loadCatalogue(): Promise<Catalogue>;
  loadDetail(connector: Connector): Promise<ConnectorDetail>;
  loadChanges(): Promise<Change[]>;
  loadRefreshes(): Promise<Refresh[]>;
  loadFacts(): Promise<Fact[]>;

  /** The default profile, or null if the organisation has none yet. */
  loadProfile(): Promise<Profile | null>;
  saveProfile(profile: Profile): Promise<Profile>;

  loadDecisions(): Promise<Decision[]>;
  saveDecision(decision: Decision): Promise<Decision>;
  deleteDecision(decision: Decision): Promise<void>;
}

/** Picks the repository for the current build. Loaded lazily so the demo code never ships to Power Apps. */
export async function createRepository(): Promise<Repository> {
  if (import.meta.env.MODE === "demo") {
    const { StaticRepository } = await import("./staticRepository");
    return new StaticRepository(import.meta.env.VITE_DEMO_DATA_URL ?? "./");
  }
  const { DataverseRepository } = await import("./dataverseRepository");
  return new DataverseRepository();
}
