import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import type { PropsWithChildren, ReactNode } from "react";
import { createPortal } from "react-dom";

import { IconButton } from "./IconButton";

export const Modal = ({
  open,
  title,
  description,
  children,
  footer,
  onClose,
  size = "md",
}: PropsWithChildren<{
  open: boolean;
  title: string;
  description?: string;
  footer?: ReactNode;
  onClose: () => void;
  size?: "md" | "lg" | "xl";
}>) => {
  const reduceMotion = useReducedMotion();
  if (typeof document === "undefined") return null;
  return createPortal(
    <AnimatePresence>
      {open ? (
        <motion.div
          className="modal-layer"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.16 }}
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) onClose();
          }}
        >
          <motion.section
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="modal-card"
            data-size={size}
            initial={
              reduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 12, scale: 0.985 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              reduceMotion ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.99 }
            }
            transition={{
              duration: reduceMotion ? 0 : 0.22,
              ease: [0.22, 1, 0.36, 1],
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-[18px] font-bold text-[#172235]">
                  {title}
                </h2>
                {description ? (
                  <p className="mt-1 text-[13px] leading-5 text-[#66768b]">
                    {description}
                  </p>
                ) : null}
              </div>
              <IconButton aria-label="关闭弹窗" onClick={onClose}>
                <X className="h-4 w-4" />
              </IconButton>
            </div>
            <div className="mt-5">{children}</div>
            {footer ? (
              <div className="mt-5 flex justify-end gap-2">{footer}</div>
            ) : null}
          </motion.section>
        </motion.div>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
};
