export const Toggle = ({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={label}
    className="toggle"
    data-checked={checked}
    onClick={() => onChange(!checked)}
  >
    <span />
  </button>
);
