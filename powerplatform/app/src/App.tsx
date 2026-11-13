/**
 * Routes the URL fragment to a screen inside the shell. The shell stays mounted across navigation,
 * so the sidebar and command palette never flash while a screen changes.
 */
import { useApp } from "./state/AppState";
import { useRoute } from "./lib/router";
import { Shell } from "./components/Shell";
import { ErrorState, PageSkeleton } from "./components/ui";
import { Overview } from "./views/Overview";
import { Catalogue } from "./views/Catalogue";
import { ConnectorDetail } from "./views/ConnectorDetail";
import { Changes } from "./views/Changes";
import { Criteria } from "./views/Criteria";
import { Decisions } from "./views/Decisions";
import { Method } from "./views/Method";

export function App() {
  const { status, reload } = useApp();
  const route = useRoute();
  const [page = "overview", arg] = route.parts;
  // A connector page belongs to the catalogue in the navigation.
  const active = page === "connector" ? "catalogue" : page;

  let content;
  if (status.state === "loading") content = <PageSkeleton />;
  else if (status.state === "error") content = <ErrorState message={status.message} onRetry={reload} />;
  else {
    switch (page) {
      case "catalogue":
        content = <Catalogue route={route} />;
        break;
      case "connector":
        content = <ConnectorDetail key={arg} slug={arg ?? ""} />;
        break;
      case "changes":
        content = <Changes />;
        break;
      case "criteria":
        content = <Criteria />;
        break;
      case "decisions":
        content = <Decisions />;
        break;
      case "method":
        content = <Method />;
        break;
      default:
        content = <Overview />;
    }
  }

  return <Shell active={active}>{content}</Shell>;
}
