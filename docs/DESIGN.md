# Design system

The site follows the conventions of established product interfaces: a neutral palette, one type family, hairline borders and colour kept for meaning. All tokens live at the top of `site/css/app.css`.

## Principles

1. **Neutral first.** Greys carry the structure. Colour appears only for treatments and status, and for the single interactive accent used by links and focus rings.
2. **Borders, not shadows.** Surfaces are separated by 1px borders. Shadows are kept for things that float: the results dock, menus and tooltips.
3. **One type family, a tight scale.** Inter at 12, 13, 14 and 16px for interface text, with headings from 16 to 52px. Numbers use tabular figures so columns line up.
4. **Accessible by construction.** Every text colour pair meets WCAG 2.1 AA contrast in both themes. Focus is always visible. Every page is checked with axe-core in CI.
5. **Quiet motion.** 150ms transitions on hover and focus only, switched off under `prefers-reduced-motion`.

## Tokens

| Group | Tokens | Notes |
|---|---|---|
| Type | `--font`, `--mono`, `--text-xs` to `--text-base` | Inter is self-hosted in `site/fonts/` under the SIL Open Font Licence. |
| Space | `--s1` to `--s16` | A 4px grid: `--s4` is 16px. |
| Shape | `--radius` (10px), `--radius-sm` (6px) | Cards and panels, then controls and badges. |
| Neutrals | `--bg`, `--surface`, `--surface-2`, `--surface-3`, `--ink`, `--ink-2`, `--ink-3`, `--line`, `--line-strong` | Zinc greys. `--ink-3` is the lightest text colour allowed. |
| Accent | `--accent`, `--accent-soft`, `--focus` | Indigo. Links, focus rings and selection only. |
| Primary action | `--primary`, `--primary-hover`, `--on-primary` | Ink-coloured: near black in light theme and near white in dark. |
| Treatments | `--block`, `--retain`, `--modify`, `--allow`, `--outside`, each with `-soft` and `-ink` | Solid for bars and dots, `-soft` for tinted backgrounds, `-ink` for text on those tints. |

Dark theme values are declared twice, once for the system setting and once for `data-theme="dark"`, because CSS cannot share one block between a media query and an attribute selector. Change both together.

## Components

| Component | Classes | Use |
|---|---|---|
| Button | `.btn`, `.btn.primary`, `.btn.ghost`, `.btn.small` | One primary action per view. |
| Card | `.card` | A bordered surface for grouped content. |
| KPI strip | `.stats` > `.stat` | Headline numbers in one framed row. |
| Treatment badge | `.pill.block`, `.retain`, `.modify`, `.allow`, `.outside` | Always with its icon and label, never colour alone. |
| Count chip | `.chip` | Small counts such as "Writes 8". |
| Status dot | `.status-dot`, `.late`, `.stale` | Data freshness. Always beside a text label. |
| Table | `table` in `.table-scroll` or `.table-card` | Quiet header row, hairline rows and hover highlight. Scroll regions are made keyboard-focusable by `app.js`. |
| Segmented control | `.tabs`, `.tri` | Switching views, and the three-way limit control. |
| Choice card | `.choice`, `.never`, `.radio-card`, `.toggle-row` | Large hit areas for options with explanations. |
| Treatment bar | `.bar` with `.seg-*`, `.legend` | Proportions of treatments, with a text equivalent. |

## Adding a page

1. Write an async view function that renders into `main` and returns its title, in the module that fits (`views.js`, `build.js` or `status.js`).
2. Add it to `routes` in `app.js`, and to the header or footer navigation.
3. Use existing components and tokens. If something new is needed, add it to `app.css` under section 5 and list it in the table above.
4. Add the route to `PAGES` in `tests/site.test.cjs`, so it is checked for errors and accessibility in both themes.
