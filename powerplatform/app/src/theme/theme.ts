/**
 * The visual system: Fluent 2, as Power Apps itself uses, tuned for a dense data product.
 *
 * Fluent's web themes supply colour, type and spacing tokens; they reach plain CSS as custom
 * properties (var(--colorNeutralBackground1)), so app.css and the components share one source.
 * The only additions are the treatment colours below.
 */
import { webDarkTheme, webLightTheme, type Theme } from "@fluentui/react-components";
import type { TreatmentId } from "@engine";

const fontFamilyBase = `"Segoe UI Variable Text", "Segoe UI", -apple-system, BlinkMacSystemFont, Roboto, "Helvetica Neue", sans-serif`;

export const lightTheme: Theme = { ...webLightTheme, fontFamilyBase };
export const darkTheme: Theme = { ...webDarkTheme, fontFamilyBase, colorNeutralBackground1: "#1f1f1f", colorNeutralBackground2: "#181818" };

/**
 * Treatments are states, so they use a fixed status palette (critical, serious, warning, good),
 * validated for colour-vision deficiency and kept distinct from any series colour. A treatment is
 * never shown by colour alone: every use pairs it with its label, and the badge adds an icon.
 */
export const TREATMENT_COLORS: Record<TreatmentId, string> = {
  block: "#d03b3b",
  retain: "#ec835a",
  modify: "#fab219",
  allow: "#0ca30c",
  outside: "var(--treatment-outside)",
};

/** Display order: most restrictive first, the same order the public site uses. */
export const TREATMENT_ORDER: TreatmentId[] = ["block", "retain", "modify", "allow", "outside"];
