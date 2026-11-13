/**
 * The frame around every page: sidebar navigation, data provenance, and the quick search
 * (Ctrl+K or ⌘K), which jumps to any connector by name or publisher.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Dialog, DialogBody, DialogSurface, DialogTitle, Input } from "@fluentui/react-components";
import {
  AppsList20Regular,
  BookInformation20Regular,
  Board20Regular,
  Gavel20Regular,
  History20Regular,
  Search16Regular,
  ShieldKeyhole20Regular,
  ShieldTask20Filled,
} from "@fluentui/react-icons";
import { useApp } from "../state/AppState";
import { fmt } from "../lib/format";
import { navigate } from "../lib/router";
import { Monogram, TreatmentBadge } from "./ui";

const NAV = [
  { path: "", label: "Overview", icon: <Board20Regular /> },
  { path: "catalogue", label: "Catalogue", icon: <AppsList20Regular /> },
  { path: "changes", label: "Changes", icon: <History20Regular /> },
];
const GOVERN = [
  { path: "criteria", label: "Criteria", icon: <ShieldKeyhole20Regular /> },
  { path: "decisions", label: "Decisions", icon: <Gavel20Regular /> },
  { path: "method", label: "Method and sources", icon: <BookInformation20Regular /> },
];

export function Shell({ active, children }: { active: string; children: ReactNode }) {
  const { catalogue, live, decisions, profile, repository, user } = useApp();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const link = (item: (typeof NAV)[number], count?: number) => (
    <a key={item.path} className="nav-link" href={`#/${item.path}`} aria-current={active === item.path ? "page" : undefined}>
      {item.icon}
      <span>{item.label}</span>
      {count !== undefined && <span className="nav-count num">{fmt.n(count)}</span>}
    </a>
  );

  return (
    <div className="shell">
      <nav className="sidebar" aria-label="Main">
        <div className="brand">
          <span className="brand-mark" aria-hidden>
            <ShieldTask20Filled />
          </span>
          <span className="brand-text">
            <div className="brand-name">Connector Risk</div>
            <div className="brand-sub">Power Platform governance</div>
          </span>
        </div>
        <button className="search-trigger" type="button" onClick={() => setPaletteOpen(true)}>
          <Search16Regular />
          Find a connector
          <kbd>{isMac ? "⌘" : "Ctrl"} K</kbd>
        </button>
        {link(NAV[0])}
        {link(NAV[1], live.length)}
        {link(NAV[2])}
        <div className="nav-section">Govern</div>
        {link(GOVERN[0])}
        {link(GOVERN[1], decisions.length)}
        {link(GOVERN[2])}
        <div className="sidebar-foot">
          <div>
            Profile: <strong>{profile.name}</strong>
          </div>
          <div>
            Data from <strong>{fmt.date(catalogue.dataDate)}</strong>
          </div>
          <div>{repository?.sourceLabel}</div>
          {user.name && <div>Signed in as {user.name}</div>}
        </div>
      </nav>
      <main className="main" id="main">
        <div className="content">{children}</div>
      </main>
      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}

/** Quick search across connector names, publishers and slugs, ranked by where the match falls. */
function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { live, resultBySlug, zone } = useApp();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return live.slice(0, 8);
    const scored: { c: (typeof live)[number]; score: number }[] = [];
    for (const c of live) {
      const name = c.n.toLowerCase();
      const score = name.startsWith(q) ? 0 : name.includes(` ${q}`) ? 1 : name.includes(q) ? 2 : c.p.toLowerCase().includes(q) || c.s.includes(q) ? 3 : -1;
      if (score >= 0) scored.push({ c, score });
    }
    return scored.sort((a, b) => a.score - b.score || a.c.n.localeCompare(b.c.n)).slice(0, 12).map((x) => x.c);
  }, [live, query]);

  // Reset in the handlers that cause the change, so no effect has to chase state.
  const search = (value: string) => {
    setQuery(value);
    setCursor(0);
  };
  const close = () => {
    setQuery("");
    setCursor(0);
    onClose();
  };

  const go = (slug: string) => {
    close();
    navigate(`connector/${encodeURIComponent(slug)}`);
  };

  return (
    <Dialog open={open} onOpenChange={(_, d) => !d.open && close()}>
      <DialogSurface style={{ maxWidth: 560 }} aria-label="Find a connector">
        <DialogBody style={{ display: "block" }}>
          <DialogTitle className="sr-only">Find a connector</DialogTitle>
          <Input
            autoFocus
            size="large"
            appearance="filled-darker"
            contentBefore={<Search16Regular />}
            placeholder="Search by connector or publisher"
            value={query}
            style={{ width: "100%" }}
            onChange={(_, d) => search(d.value)}
            aria-controls="palette-results"
            aria-activedescendant={matches[cursor] ? `palette-${matches[cursor].s}` : undefined}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setCursor((i) => Math.min(i + 1, matches.length - 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setCursor((i) => Math.max(i - 1, 0));
              } else if (e.key === "Enter" && matches[cursor]) {
                go(matches[cursor].s);
              }
            }}
          />
          <ul className="palette-list" id="palette-results" role="listbox" ref={listRef}>
            {matches.map((c, i) => {
              const r = resultBySlug(zone, c.s);
              return (
                <li key={c.s} id={`palette-${c.s}`} role="option" aria-selected={i === cursor} onMouseEnter={() => setCursor(i)} onClick={() => go(c.s)}>
                  <Monogram name={c.n} />
                  <span>
                    <div style={{ fontWeight: 600 }}>{c.n}</div>
                    <div className="small muted">{c.p}</div>
                  </span>
                  <span className="sub">{r && <TreatmentBadge treatment={r.treatment} />}</span>
                </li>
              );
            })}
            {!matches.length && <li aria-disabled>No connector matches “{query}”.</li>}
          </ul>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
