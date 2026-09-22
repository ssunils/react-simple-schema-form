import type { Widget } from 'react-simple-schema-form';

/**
 * A start–end time range stored as one string, "HH:MM-HH:MM".
 * Referenced as `timePicker` from the schedule's nested uiSchema.
 */
export const TimePickerWidget: Widget<string | undefined> = ({ id, path, value, onChange, onBlur, required, disabled, readOnly, invalid, options }) => {
  const [start = '', end = ''] = (value ?? '').split('-');
  const update = (s: string, e: string) => onChange(!s && !e ? undefined : `${s}-${e}`);
  const shared = { disabled, readOnly, onBlur, 'aria-invalid': invalid || undefined, className: 'sf-input', ...options.props };
  return (
    <div className="time-range">
      <input type="time" id={id} name={path} value={start} required={required} onChange={(e) => update(e.target.value, end)} {...shared} />
      <span aria-hidden="true">–</span>
      <input type="time" id={`${id}-end`} aria-label="End time" value={end} onChange={(e) => update(start, e.target.value)} {...shared} />
    </div>
  );
};
