import type { CSSProperties, InputHTMLAttributes } from "react";

import { FieldShell } from "./Fields";

interface SliderFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  label: string;
  valueLabel: string;
}

export const SliderField = ({
  label,
  valueLabel,
  min = 0,
  max = 100,
  value,
  style,
  ...props
}: SliderFieldProps) => {
  const minimum = Number(min);
  const maximum = Number(max);
  const current = Number(value ?? minimum);
  const progress =
    maximum > minimum
      ? ((Math.min(maximum, Math.max(minimum, current)) - minimum) /
          (maximum - minimum)) *
        100
      : 0;

  return (
    <FieldShell label={label} hint={valueLabel}>
      <input
        className="avs-slider"
        type="range"
        min={min}
        max={max}
        value={value}
        style={
          {
            ...style,
            "--avs-slider-progress": `${progress}%`,
          } as CSSProperties
        }
        {...props}
      />
    </FieldShell>
  );
};
