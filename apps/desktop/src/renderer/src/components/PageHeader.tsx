import type { ReactNode } from "react";

export const PageHeader = ({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) => (
  <header className="page-header">
    <div className="min-w-0">
      {eyebrow ? <p className="page-eyebrow">{eyebrow}</p> : null}
      <h1 className="page-title">{title}</h1>
      {description ? <p className="page-description">{description}</p> : null}
    </div>
    {actions ? (
      <div className="flex shrink-0 items-center gap-2">{actions}</div>
    ) : null}
  </header>
);
