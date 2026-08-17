import type { PropsWithChildren } from "react";

import { cn } from "./cn";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";

export const StatusBadge = ({
  children,
  tone = "neutral",
  className,
}: PropsWithChildren<{ tone?: BadgeTone; className?: string }>) => (
  <span className={cn("status-badge", `status-badge--${tone}`, className)}>
    <span className="status-badge__dot" />
    {children}
  </span>
);
