import type { Widget } from 'react-simple-schema-form';

/** Integer input with −/+ steppers, honouring the schema's minimum/maximum. */
export const CounterWidget: Widget<number | undefined> = ({ id, path, schema, value, onChange, onBlur, required, disabled, readOnly, invalid, options }) => {
  const min = schema.minimum ?? Number.NEGATIVE_INFINITY;
  const max = schema.maximum ?? Number.POSITIVE_INFINITY;
  const step = (n: number) => {
    const next = Math.min(max, Math.max(min, (value ?? 0) + n));
    onChange(next);
    onBlur();
  };
  const locked = disabled || readOnly;
  return (
    <div className="counter">
      <button type="button" className="sf-btn sf-btn--icon" onClick={() => step(-1)} disabled={locked || (value ?? 0) <= min} aria-label="Decrease">−</button>
      <input
        type="number"
        className="sf-input"
        id={id}
        name={path}
        value={value ?? ''}
        min={schema.minimum}
        max={schema.maximum}
        required={required}
        disabled={disabled}
        readOnly={readOnly}
        aria-invalid={invalid || undefined}
        placeholder={options.placeholder}
        onBlur={onBlur}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        {...options.props}
      />
      <button type="button" className="sf-btn sf-btn--icon" onClick={() => step(1)} disabled={locked || (value ?? 0) >= max} aria-label="Increase">+</button>
    </div>
  );
};
