import { Field, type Widget } from 'react-simple-schema-form';

/**
 * Example of a widget on an *object* node. It receives the whole address as
 * `value`, and renders the object's children itself via <Field> — here on a
 * single row instead of the default stacked fieldset. `errors` includes the
 * children's errors so the widget can summarise them.
 */
export const InlineAddressWidget: Widget<Record<string, unknown> | undefined> = ({ id, path, schema, required, errors, invalid }) => {
  const keys = Object.keys(schema.properties ?? {});
  return (
    <div className="inline-address" id={id} aria-invalid={invalid || undefined}>
      <div className="inline-address__row">
        {keys.map((key) => (
          <Field
            key={key}
            schema={schema.properties![key]!}
            path={`${path}.${key}`}
            required={required && Boolean(schema.required?.includes(key))}
          />
        ))}
      </div>
      {errors.length > 0 && (
        <p className="inline-address__summary">{errors.length} issue{errors.length === 1 ? '' : 's'} in this address</p>
      )}
    </div>
  );
};
