import type { ButtonHTMLAttributes, PropsWithChildren } from "react";
import { motion, useReducedMotion, type MotionProps } from "framer-motion";

import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

type NativeButtonProps = Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  keyof MotionProps
>;

export interface ButtonProps extends NativeButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const variants: Record<ButtonVariant, string> = {
  primary:
    "border border-[#3f8fe8] bg-[#438fe9] text-white shadow-[0_5px_14px_rgba(47,111,204,.18),inset_0_1px_0_rgba(255,255,255,.28)] hover:bg-[#3987e1]",
  secondary:
    "border border-[#d3e0ec] bg-white/90 text-[#27364a] shadow-[0_2px_8px_rgba(63,102,160,.06),inset_0_1px_0_white] hover:border-[#bdd2e6] hover:bg-white",
  ghost:
    "border border-transparent bg-transparent text-[#66768b] shadow-none hover:border-[#dfe8f2] hover:bg-white/55 hover:text-[#27364a]",
  danger:
    "border border-[#e85252] bg-[linear-gradient(180deg,#ff7474,#e94b4b)] text-white shadow-[0_7px_18px_rgba(220,38,38,.18),inset_0_1px_0_rgba(255,255,255,.36)] hover:brightness-[1.025]",
};

export const Button = ({
  children,
  className,
  variant = "primary",
  size = "md",
  fullWidth = false,
  type = "button",
  ...props
}: PropsWithChildren<ButtonProps>) => {
  const reduceMotion = useReducedMotion();

  return (
    <motion.button
      type={type}
      className={cn(
        "no-drag inline-flex min-w-0 items-center justify-center gap-2 whitespace-nowrap rounded-[11px] font-semibold leading-tight transition-[filter,background-color,border-color,box-shadow,color,opacity] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#4da3ff]/35 focus-visible:ring-offset-2 focus-visible:ring-offset-[#f3f7fc] disabled:pointer-events-none disabled:opacity-45",
        size === "md"
          ? "min-h-11 px-4 py-2 text-[13px]"
          : "min-h-9 px-3 py-1.5 text-[12px]",
        variants[variant],
        fullWidth && "w-full",
        className,
      )}
      whileHover={reduceMotion ? undefined : { y: -1 }}
      whileTap={reduceMotion ? undefined : { scale: 0.98 }}
      transition={{ duration: 0.16 }}
      {...props}
    >
      {children}
    </motion.button>
  );
};
