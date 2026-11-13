/**
 * Small presentational components shared by every screen. None of them fetch data or hold state
 * beyond their own interaction, so they stay predictable and easy to test visually.
 */
import type { ReactNode } from "react";
import { Button, Skeleton, SkeletonItem } from "@fluentui/react-components";
import {
  CheckmarkCircle16Filled,
  CircleOff16Regular,
  DismissCircle16Filled,
  ErrorCircle24Regular,
  ShieldTask16Filled,
  Warning16Filled,
} from "@fluentui/react-icons";
import { TREATMENTS, type TreatmentId } from "@engine";
import { TREATMENT_COLORS } from "../theme/theme";

const TREATMENT_ICONS: Record<TreatmentId, ReactNode> = {
  block: <DismissCircle16Filled />,
  retain: <Warning16Filled />,
  modify: <ShieldTask16Filled />,
  allow: <CheckmarkCircle16Filled />,
  outside: <CircleOff16Regular />,
};

/** A treatment, always as icon and label together so it never relies on colour alone. */
export function TreatmentBadge({ treatment, size = "md" }: { treatment: TreatmentId; size?: "md" | "lg" }) {
  return (
    <span className="treatment" style={size === "lg" ? { fontSize: 16, fontWeight: 600 } : undefined}>
      <span style={{ color: TREATMENT_COLORS[treatment], display: "inline-flex" }} aria-hidden>
        {TREATMENT_ICONS[treatment]}
      </span>
      {TREATMENTS[treatment].label}
    </span>
  );
}

/** Square swatch used in chart legends. */
export const Swatch = ({ color }: { color: string }) => <span className="treatment-swatch" style={{ background: color }} aria-hidden />;

/** Two-letter monogram in place of a logo. Connector logos are publishers' marks, so none are shown. */
export function Monogram({ name, large = false }: { name: string; large?: boolean }) {
  const words = name.replace(/\(.*?\)/g, "").split(/[\s\-_.]+/).filter((w) => /[a-z0-9]/i.test(w));
  const letters = words.length > 1 ? words[0][0] + words[1][0] : (words[0] ?? "?").slice(0, 2);
  return (
    <span className={`monogram${large ? " lg" : ""}`} aria-hidden>
      {letters.toUpperCase()}
    </span>
  );
}

export function PageHead({ title, subtitle, actions, crumbs }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; crumbs?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        {crumbs && <nav className="crumbs" aria-label="Breadcrumb">{crumbs}</nav>}
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="row">{actions}</div>}
    </header>
  );
}

export function Card({ title, subtitle, actions, children, flush = false, id }: { title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; flush?: boolean; id?: string }) {
  return (
    <section className={`card${flush ? " card-flush" : ""}`} aria-labelledby={title && id ? id : undefined}>
      {(title || actions) && (
        <div className="card-head">
          <div>
            {title && <h2 id={id}>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({ label, value, foot, href }: { label: string; value: ReactNode; foot?: ReactNode; href?: string }) {
  const body = (
    <div className="card stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
      {foot && <span className="stat-foot">{foot}</span>}
    </div>
  );
  return href ? <a className="stat-link" href={href}>{body}</a> : body;
}

export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="empty" role="status">
      {icon}
      <h3>{title}</h3>
      {children && <div className="small">{children}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty" role="alert">
      <ErrorCircle24Regular />
      <h3>Something went wrong</h3>
      <p className="small" style={{ maxWidth: 520, margin: "0 auto 14px" }}>{message}</p>
      {onRetry && <Button onClick={onRetry}>Try again</Button>}
    </div>
  );
}

/** A loading placeholder with the shape of the page, so nothing jumps when data arrives. */
export function PageSkeleton() {
  return (
    <div className="skeleton-wrap" aria-busy="true" aria-label="Loading">
      <Skeleton>
        <SkeletonItem shape="rectangle" style={{ width: 220, height: 28, marginBottom: 24 }} />
        <div className="grid grid-4" style={{ marginBottom: 16 }}>
          {[0, 1, 2, 3].map((i) => <SkeletonItem key={i} shape="rectangle" style={{ height: 104, borderRadius: 10 }} />)}
        </div>
        <SkeletonItem shape="rectangle" style={{ height: 220, borderRadius: 10, marginBottom: 16 }} />
        <SkeletonItem shape="rectangle" style={{ height: 320, borderRadius: 10 }} />
      </Skeleton>
    </div>
  );
}

/** Trait labels as chips, with a count for any that do not fit. */
export function Chips({ items, max = 3 }: { items: string[]; max?: number }) {
  const shown = items.slice(0, max);
  return (
    <span className="chips">
      {/* Long labels are cut with an ellipsis; the title keeps the full text on hover. */}
      {shown.map((t) => <span className="chip" key={t} title={t}>{t}</span>)}
      {items.length > max && <span className="chip strong" title={items.slice(max).join(", ")}>+{items.length - max}</span>}
    </span>
  );
}
