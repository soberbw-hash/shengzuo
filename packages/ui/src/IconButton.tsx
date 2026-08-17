import type { PropsWithChildren } from "react";

import { Button, type ButtonProps } from "./Button";
import { cn } from "./cn";

export const IconButton = ({
  children,
  className,
  ...props
}: PropsWithChildren<Omit<ButtonProps, "variant" | "size" | "fullWidth">>) => (
  <Button
    variant="ghost"
    size="sm"
    className={cn("h-9 w-9 rounded-[11px] p-0", className)}
    {...props}
  >
    {children}
  </Button>
);
