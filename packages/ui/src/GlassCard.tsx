import type { HTMLAttributes, PropsWithChildren } from "react";

import { cn } from "./cn";

export interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  tone?: "glass" | "solid" | "soft";
  padding?: "none" | "sm" | "md" | "lg";
}

const paddingClasses: Record<NonNullable<GlassCardProps["padding"]>, string> = {
  none: "",
  sm: "p-3",
  md: "p-4",
  lg: "p-5",
};

export const GlassCard = ({
  children,
  className,
  tone = "glass",
  padding = "md",
  ...props
}: PropsWithChildren<GlassCardProps>) => (
  <div
    className={cn(
      "glass-card rounded-[22px]",
      tone === "solid" && "glass-card--solid",
      tone === "soft" && "glass-card--soft",
      paddingClasses[padding],
      className,
    )}
    {...props}
  >
    {children}
  </div>
);
