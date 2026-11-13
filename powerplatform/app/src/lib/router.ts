/**
 * A minimal hash router. Code apps run inside the Power Apps host's frame, where the path belongs
 * to the host, so all navigation lives in the URL fragment: #/catalogue?trait=send, #/connector/sql.
 */
import { useEffect, useState } from "react";

export interface Route {
  /** Path segments, for example ["connector", "sql"]. Empty for the overview. */
  parts: string[];
  /** Query parameters after the path, for catalogue filters. */
  query: URLSearchParams;
}

export function parseHash(hash: string): Route {
  const raw = hash.replace(/^#\/?/, "");
  const [path, search = ""] = raw.split("?");
  return { parts: path.split("/").filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(search) };
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseHash(window.location.hash));
  useEffect(() => {
    const onChange = () => {
      setRoute(parseHash(window.location.hash));
      // A new page starts at the top, like a normal navigation.
      document.getElementById("main")?.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}

/** Builds a link target. Empty query values are left out. */
export function href(path: string, query: Record<string, string | undefined> = {}): string {
  const q = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => Boolean(e[1])));
  const s = q.toString();
  return `#/${path}${s ? `?${s}` : ""}`;
}

export function navigate(path: string, query: Record<string, string | undefined> = {}, replace = false): void {
  const target = href(path, query);
  if (replace) window.history.replaceState(null, "", target);
  if (replace) window.dispatchEvent(new HashChangeEvent("hashchange"));
  else window.location.hash = target.slice(1);
}
