import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";

import type { BadgeTone } from "./StatusBadge";

const icons = {
  neutral: Info,
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
} as const;

export const ToastCard = ({
  title,
  description,
  tone,
  onClose,
}: {
  title: string;
  description?: string;
  tone: BadgeTone;
  onClose: () => void;
}) => {
  const Icon = icons[tone];
  return (
    <div className={`toast-card toast-card--${tone}`}>
      <span className="toast-card__icon">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <strong>{title}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <button aria-label="关闭提示" onClick={onClose}>
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
};
