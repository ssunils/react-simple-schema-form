import type { Widget } from 'react-simple-schema-form';

/**
 * Example custom widget: the form data holds a Unix timestamp in seconds
 * (schema type `integer`), the user sees a native date-time picker.
 */
export const EpochWidget: Widget<number | undefined> = ({
  id,
  path,
  value,
  onChange,
  onBlur,
  required,
  disabled,
  readOnly,
  invalid,
  options,
}) => {
  const local = value === undefined ? '' : toDatetimeLocal(value);
  return (
    <div className="epoch-widget">
      <input
        type="datetime-local"
        className="sf-input"
        id={id}
        name={path}
        value={local}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={invalid || undefined}
        placeholder={options.placeholder}
        onBlur={onBlur}
        onChange={(e) => {
          const ms = new Date(e.target.value).getTime();
          onChange(Number.isNaN(ms) ? undefined : Math.floor(ms / 1000));
        }}
        {...options.props}
      />
      <code className="epoch-widget__raw">{value === undefined ? 'epoch: —' : `epoch: ${value}`}</code>
    </div>
  );
};

function toDatetimeLocal(epochSeconds: number): string {
  const d = new Date(epochSeconds * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
