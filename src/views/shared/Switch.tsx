import "./Switch.css";

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  ariaLabel?: string;
  testId?: string;
  disabled?: boolean;
}

export const Switch = ({
  checked,
  onChange,
  ariaLabel,
  testId,
  disabled = false,
}: SwitchProps) => (
  <button
    type="button"
    role="switch"
    aria-checked={checked}
    aria-label={ariaLabel}
    data-testid={testId}
    disabled={disabled}
    className={`ui-switch${checked ? " ui-switch--on" : ""}`}
    onClick={() => { onChange(!checked); }}
  >
    <span className="ui-switch__knob" />
  </button>
);
