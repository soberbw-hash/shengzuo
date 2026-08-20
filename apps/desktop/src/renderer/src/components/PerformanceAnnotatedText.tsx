import type { SmartPerformanceSegment } from "@ai-voice-studio/shared-types";

import { createPerformanceAnnotationParts } from "../lib/performanceAnnotations";

export const PerformanceAnnotatedText = ({
  segments,
}: {
  segments: SmartPerformanceSegment[];
}) => (
  <div
    className="performance-annotated-text generate-script-input"
    role="document"
    aria-label="智能处理后的标注原文"
  >
    {segments.map((segment, segmentIndex) => {
      const parts = createPerformanceAnnotationParts(segment);
      return (
        <span
          className="performance-annotated-text__segment"
          key={`${segmentIndex}-${segment.text.slice(0, 18)}`}
        >
          <span>{segment.text}</span>
          <span className="performance-annotated-text__marks">
            （
            {parts.map((part, partIndex) => (
              <span key={`${part.tone}-${part.label}`}>
                {partIndex ? <span aria-hidden="true"> · </span> : null}
                <span data-tone={part.tone}>{part.label}</span>
              </span>
            ))}
            ）
          </span>
        </span>
      );
    })}
  </div>
);
