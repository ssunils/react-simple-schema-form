import type { Widget } from 'react-simple-schema-form';

type Unit = 's' | 'ms';

/**
 * Unix-timestamp picker: `"ui:widget": "epoch"` on an integer field is all a
 * schema needs. The user sees a native date-time input; the data holds the
 * epoch in milliseconds. Set `"ui:props": { "unit": "s" }` for seconds.
 */
export const EpochWidget: Widget<number | undefined> = ({ id, path, value, onChange, onBlur, required, disabled, readOnly, invalid, options }) => {
  const { unit: unitProp, ...inputProps } = options.props ?? {};
  const unit: Unit = unitProp === 's' ? 's' : 'ms';
  const toMs = (epoch: number) => (unit === 'ms' ? epoch : epoch * 1000);
  const fromMs = (ms: number) => (unit === 'ms' ? ms : Math.floor(ms / 1000));

  return (
    <div className="epoch-widget">
      <input
        type="datetime-local"
        className="sf-input"
        id={id}
        name={path}
        value={value === undefined ? '' : toDatetimeLocal(toMs(value))}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={invalid || undefined}
        placeholder={options.placeholder}
        onBlur={onBlur}
        onChange={(e) => {
          const ms = new Date(e.target.value).getTime();
          onChange(Number.isNaN(ms) ? undefined : fromMs(ms));
        }}
        {...inputProps}
      />
      <code className="epoch-widget__raw">{value === undefined ? `epoch (${unit}): —` : `epoch (${unit}): ${value}`}</code>
    </div>
  );
};

function toDatetimeLocal(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
