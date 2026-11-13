/**
 * Picks the environment zone the page evaluates against. The zone is shared app state, so it
 * stays the same as people move between the catalogue and connector pages.
 */
import { Tab, TabList } from "@fluentui/react-components";
import { ZONES, type ZoneId } from "@engine";
import { useApp } from "../state/AppState";

export function ZoneSwitch() {
  const { zone, setZone } = useApp();
  return (
    <TabList size="small" appearance="subtle" selectedValue={zone} onTabSelect={(_, d) => setZone(d.value as ZoneId)} aria-label="Environment zone">
      {ZONES.map((z) => (
        <Tab key={z.id} value={z.id} title={z.help}>
          {z.label}
        </Tab>
      ))}
    </TabList>
  );
}
