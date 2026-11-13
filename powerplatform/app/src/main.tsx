/**
 * Entry point. Follows the operating system's light or dark setting live, and adds a `theme-dark`
 * class to the root so plain CSS (charts, the treatment palette) can follow it too.
 */
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { FluentProvider } from "@fluentui/react-components";
import { darkTheme, lightTheme } from "./theme/theme";
import { AppStateProvider } from "./state/AppState";
import { App } from "./App";
import "./theme/app.css";

const query = window.matchMedia("(prefers-color-scheme: dark)");

function Root() {
  const [dark, setDark] = useState(query.matches);
  useEffect(() => {
    const onChange = (e: MediaQueryListEvent) => setDark(e.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  useEffect(() => {
    document.documentElement.classList.toggle("theme-dark", dark);
  }, [dark]);

  return (
    <FluentProvider theme={dark ? darkTheme : lightTheme} className="app-root">
      <AppStateProvider>
        <App />
      </AppStateProvider>
    </FluentProvider>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("The page has no #root element.");
createRoot(root).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
