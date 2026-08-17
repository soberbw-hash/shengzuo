import { ArrowRight, Check, Circle } from "lucide-react";
import type { ReactNode } from "react";

export interface FirstRunStep {
  label: string;
  description: string;
  complete: boolean;
}

export const FirstRunGuide = ({
  steps,
  action,
}: {
  steps: FirstRunStep[];
  action?: ReactNode;
}) => {
  const completeCount = steps.filter((step) => step.complete).length;
  const allComplete = completeCount === steps.length;

  return (
    <section
      className="first-run-guide"
      aria-label="首次使用准备步骤"
      data-complete={allComplete}
    >
      <div className="first-run-guide__intro">
        <strong>{allComplete ? "准备好了" : "第一次使用，照着做就行"}</strong>
        <span>
          {allComplete
            ? "现在可以直接生成配音。"
            : `已完成 ${completeCount} / ${steps.length} 步`}
        </span>
      </div>
      <ol className="first-run-guide__steps">
        {steps.map((step, index) => (
          <li key={step.label} data-complete={step.complete}>
            <span className="first-run-guide__marker">
              {step.complete ? (
                <Check className="h-3.5 w-3.5" aria-hidden="true" />
              ) : (
                <Circle className="h-3.5 w-3.5" aria-hidden="true" />
              )}
            </span>
            <span>
              <strong>
                {index + 1}. {step.label}
              </strong>
              <small>{step.description}</small>
            </span>
          </li>
        ))}
      </ol>
      {allComplete ? null : (
        <div className="first-run-guide__action">
          {action}
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </div>
      )}
    </section>
  );
};
