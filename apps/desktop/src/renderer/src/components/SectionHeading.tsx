import type { ReactNode } from "react";

export const SectionHeading = ({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) => (
  <div className="section-heading">
    <div>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
    {action}
  </div>
);
