import type { ReactNode } from "react";

import { Button } from "./Button";

export const EmptyState = ({
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: {
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) => (
  <div className="empty-state">
    <div className="empty-state__icon">{icon}</div>
    <h3>{title}</h3>
    <p>{description}</p>
    {actionLabel && onAction ? (
      <Button size="sm" variant="secondary" onClick={onAction}>
        {actionLabel}
      </Button>
    ) : null}
  </div>
);
