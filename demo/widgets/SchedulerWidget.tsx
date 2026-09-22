import { Field, FieldWrapper, useFormContext, type Widget } from 'react-simple-schema-form';

/**
 * Object-level widget with an enable toggle. The toggle is a real boolean
 * property of the object (default `enabled`; override with
 * `ui:props: { toggle: "<key>" }`), so the schema's `if`/`then` can make the
 * other settings required only while it is on.
 *
 * Turning it off resets the object to `{ enabled: false }`: a disabled section
 * must never be able to block submission with half-typed values.
 */
export const SchedulerWidget: Widget<Record<string, unknown> | undefined> = ({ id, path, schema, value, errors, disabled, readOnly, options }) => {
  const ctx = useFormContext();
  const toggleKey = typeof options.props?.toggle === 'string' ? options.props.toggle : 'enabled';
  const toggleSchema = schema.properties?.[toggleKey];
  const enabled = Boolean(value?.[toggleKey]);
  const settings = Object.keys(schema.properties ?? {}).filter((key) => key !== toggleKey);
  // `schema` is already resolved for the current value, so `required` reflects the `then` branch.
  const isRequired = (key: string) => Boolean(schema.required?.includes(key));
  const toggleId = `${id}-${toggleKey}`;

  const setEnabled = (on: boolean) => {
    ctx.setValue(path, on ? { ...value, [toggleKey]: true } : { [toggleKey]: false });
    ctx.touch(`${path}.${toggleKey}`);
  };

  return (
    <div className="scheduler" id={id} data-enabled={enabled}>
      {toggleSchema && (
        <FieldWrapper id={toggleId} label={toggleSchema.title ?? 'Enabled'} description={toggleSchema.description} required={false} errors={[]} inline>
          <input
            type="checkbox"
            className="sf-checkbox"
            id={toggleId}
            name={`${path}.${toggleKey}`}
            checked={enabled}
            disabled={disabled || readOnly}
            onChange={(e) => setEnabled(e.target.checked)}
          />
        </FieldWrapper>
      )}
      {enabled && (
        <div className="scheduler__grid">
          {settings.map((key) => (
            <Field key={key} schema={schema.properties![key]!} path={`${path}.${key}`} required={isRequired(key)} />
          ))}
        </div>
      )}
      {enabled && errors.length > 0 && (
        <p className="sf-help">{errors.length} setting{errors.length === 1 ? '' : 's'} need attention</p>
      )}
    </div>
  );
};
