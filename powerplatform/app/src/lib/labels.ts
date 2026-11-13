/** Display labels shared by every screen. They match the public site's wording. */
import { CHOICES } from "@schema";

const fromChoice = (set: keyof typeof CHOICES) => Object.fromEntries(CHOICES[set].options) as Record<string, string>;

export const ORIGIN_LABELS = fromChoice("crf_origin");
export const PUBLISHER_LABELS = fromChoice("crf_publishertype");
export const CLASS_LABELS: Record<string, string> = { ...fromChoice("crf_operationclass") };
export const DECISION_LABELS: Record<string, string> = {
  approved: "Approved",
  allow: "Always allow",
  block: "Always block",
};
export const DECISION_HELP: Record<string, string> = {
  approved: "An agreement is in place, so third-party, consumer, external AI and independent publisher traits no longer count.",
  allow: "Allow in every zone, whatever the criteria say.",
  block: "Block in every zone where a control can block it.",
};
export const ACP_LABELS = fromChoice("crf_acpsupport");
export const ISOLATION_LABELS = fromChoice("crf_tenantisolation");
