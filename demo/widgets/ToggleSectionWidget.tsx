import { Field, FieldWrapper, useFormContext, type Widget } from 'react-simple-schema-form';

/**
 * Object-level widget with an on/off switch. The switch is a real boolean
 * property of the object (default key `enabled`; override with
 * `ui:props: { toggle: "<key>" }`), so the schema's `if`/`then` can require
 * the other fields only while it is on.
 *
 * Switching off resets the object to `{ <toggle>: false }`: a section that is
 * off must never block submission with half-typed values.
 */
export const ToggleSectionWidget: Widget<Record<string, unknown> | undefined> = ({ id, path, schema, value, errors, disabled, readOnly, options }) => {
  const ctx = useFormContext();
  const toggleKey = typeof options.props?.toggle === 'string' ? options.props.toggle : 'enabled';
  const toggleSchema = schema.properties?.[toggleKey];
  // No toggle property in the schema → the settings are always shown.
  const enabled = toggleSchema ? Boolean(value?.[toggleKey]) : true;
  const settings = Object.keys(schema.properties ?? {}).filter((key) => key !== toggleKey);
  // `schema` is already resolved for the current value, so `required` reflects the `then` branch.
  const isRequired = (key: string) => Boolean(schema.required?.includes(key));
  const toggleId = `${id}-${toggleKey}`;

  const setEnabled = (on: boolean) => {
    ctx.setValue(path, on ? { ...value, [toggleKey]: true } : { [toggleKey]: false });
    ctx.touch(`${path}.${toggleKey}`);
  };

  return (
    <div className="toggle-section" id={id} data-enabled={enabled}>
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
        <div className="toggle-section__grid">
          {settings.map((key) => (
            <Field key={key} schema={schema.properties![key]!} path={`${path}.${key}`} required={isRequired(key)} />
          ))}
        </div>
      )}
      {enabled && errors.length > 0 && (
        <p className="sf-help">{errors.length} field{errors.length === 1 ? '' : 's'} need attention</p>
      )}
    </div>
  );
};
