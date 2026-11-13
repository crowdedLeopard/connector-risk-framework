/**
 * The two chart forms the app needs, built from plain elements so they inherit theme tokens,
 * work with a keyboard and screen reader, and add nothing to the bundle.
 *
 * - TreatmentBars: one stacked bar per environment zone. A part-to-whole of five states, so a
 *   stacked bar (not a pie) with a 2px gap between segments, a legend, and a tooltip per segment.
 * - BarList: a ranked single-series list (trait prevalence), one hue, value labels in text ink.
 */
import { Tooltip } from "@fluentui/react-components";
import { TREATMENTS, type TreatmentId, type Zone } from "@engine";
import { TREATMENT_COLORS, TREATMENT_ORDER } from "../theme/theme";
import { fmt } from "../lib/format";
import { Swatch } from "./ui";

export function TreatmentLegend() {
  return (
    <ul className="legend" aria-label="Treatments">
      {TREATMENT_ORDER.map((t) => (
        <li key={t}>
          <Swatch color={TREATMENT_COLORS[t]} />
          {TREATMENTS[t].label}
        </li>
      ))}
    </ul>
  );
}

interface ZoneCounts {
  zone: Zone;
  counts: Record<TreatmentId, number>;
}

/**
 * @param onSelect called with the zone and treatment of a clicked segment, to open the filtered catalogue.
 */
export function TreatmentBars({ rows, onSelect }: { rows: ZoneCounts[]; onSelect: (zone: Zone["id"], treatment: TreatmentId) => void }) {
  return (
    <div>
      {rows.map(({ zone, counts }) => {
        const total = TREATMENT_ORDER.reduce((n, t) => n + counts[t], 0);
        return (
          <div className="zone-row" key={zone.id}>
            <div>
              <div className="zone-name">{zone.label}</div>
              <div className="zone-help">{fmt.pct(counts.block, total)} blocked · {fmt.pct(counts.allow, total)} allowed</div>
            </div>
            <div className="stacked" role="group" aria-label={`${zone.label}: treatments`}>
              {TREATMENT_ORDER.filter((t) => counts[t] > 0).map((t) => (
                <Tooltip
                  key={t}
                  relationship="label"
                  withArrow
                  content={`${TREATMENTS[t].label}: ${fmt.n(counts[t])} connectors (${fmt.pct(counts[t], total)})`}
                >
                  <button
                    type="button"
                    className="stacked-seg"
                    style={{ flexGrow: counts[t], flexBasis: 0, background: TREATMENT_COLORS[t] }}
                    onClick={() => onSelect(zone.id, t)}
                  />
                </Tooltip>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export interface BarItem {
  key: string;
  label: string;
  value: number;
  href: string;
  title?: string;
}

export function BarList({ items, max }: { items: BarItem[]; max?: number }) {
  const top = Math.max(1, max ?? Math.max(...items.map((i) => i.value)));
  return (
    <ul className="barlist">
      {items.map((item) => (
        <li key={item.key}>
          <a href={item.href} title={item.title}>
            <span className="bar" style={{ width: `${Math.max(1.5, (item.value / top) * 100)}%` }} aria-hidden />
            <span className="lbl">{item.label}</span>
            <span className="val">{fmt.n(item.value)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
