import type { Widget } from 'react-simple-schema-form';

/**
 * Unix timestamp in *milliseconds* shown as a native date-time picker.
 * (EpochWidget is the same idea in seconds.)
 */
export const DateTimePickerWidget: Widget<number | undefined> = ({ id, path, value, onChange, onBlur, required, disabled, readOnly, invalid, options }) => (
  <input
    type="datetime-local"
    className="sf-input"
    id={id}
    name={path}
    value={value === undefined ? '' : toLocal(value)}
    required={required}
    disabled={disabled}
    readOnly={readOnly}
    aria-invalid={invalid || undefined}
    onBlur={onBlur}
    onChange={(e) => {
      const ms = new Date(e.target.value).getTime();
      onChange(Number.isNaN(ms) ? undefined : ms);
    }}
    {...options.props}
  />
);

function toLocal(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
