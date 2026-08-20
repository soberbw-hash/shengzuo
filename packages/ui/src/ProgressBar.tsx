import { cn } from "./cn";

export const ProgressBar = ({
  value,
  label,
  compact = false,
}: {
  value: number;
  label?: string;
  compact?: boolean;
}) => {
  const normalized = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("progress-stack", compact && "progress-stack--compact")}>
      {label ? (
        <div className="flex items-start justify-between gap-4 text-[12px] text-[#607188]">
          <span className="min-w-0 flex-1 break-words leading-4" title={label}>
            {label}
          </span>
          <span className="shrink-0 font-semibold leading-4 text-[#2f6fcc]">
            {Math.round(normalized)}%
          </span>
        </div>
      ) : null}
      <div
        className="progress-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={normalized}
      >
        <span className="progress-fill" style={{ width: `${normalized}%` }} />
      </div>
    </div>
  );
};
