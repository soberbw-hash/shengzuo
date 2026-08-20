import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

import { ToastCard } from "@ai-voice-studio/ui";

import { useStudioStore } from "../store/studioStore";

const AutoDismissToast = ({
  id,
  title,
  description,
  tone,
  durationMs,
  action,
}: {
  id: string;
  title: string;
  description?: string;
  tone: "neutral" | "info" | "success" | "warning" | "danger";
  durationMs?: number | null;
  action?: {
    label: string;
    to: string;
  };
}) => {
  const dismissToast = useStudioStore((state) => state.dismissToast);
  const navigate = useNavigate();
  useEffect(() => {
    if (durationMs === null) return;
    const timer = window.setTimeout(
      () => dismissToast(id),
      durationMs ?? 4_200,
    );
    return () => window.clearTimeout(timer);
  }, [dismissToast, durationMs, id]);

  return (
    <ToastCard
      title={title}
      description={description}
      tone={tone}
      onClose={() => dismissToast(id)}
      actionLabel={action?.label}
      onAction={
        action
          ? () => {
              dismissToast(id);
              void navigate(action.to);
            }
          : undefined
      }
    />
  );
};

export const ToastRegion = () => {
  const toasts = useStudioStore((state) => state.toasts);
  const reduceMotion = useReducedMotion();
  return (
    <div className="toast-region" aria-live="polite">
      <AnimatePresence initial={false}>
        {toasts.map((toast) => (
          <motion.div
            key={toast.id}
            layout
            initial={
              reduceMotion ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              reduceMotion ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }
            }
            transition={{ duration: reduceMotion ? 0 : 0.18 }}
          >
            <AutoDismissToast {...toast} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
};
