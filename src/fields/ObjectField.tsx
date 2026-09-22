import type { JSONSchema, FieldPath } from '../types';
import { useFormContext, fieldId } from '../context';
import { joinPath } from '../utils/path';
import { isRequired } from '../utils/schema';
import { Field, humanize } from './Field';

interface ObjectFieldProps {
  schema: JSONSchema;
  path: FieldPath;
  required: boolean;
  label?: string;
}

export function ObjectField({ schema, path, label }: ObjectFieldProps) {
  const ctx = useFormContext();
  const id = fieldId(ctx.idPrefix, path);
  const isRoot = path === '';
  const title = label ?? schema.title ?? (isRoot ? undefined : humanize(path));
  const errors = ctx.submitted || ctx.touched.has(path) ? ctx.errors[path] ?? [] : [];

  const children = Object.entries(schema.properties ?? {}).map(([key, child]) => (
    <Field
      key={key}
      schema={child}
      path={joinPath(path, key)}
      required={isRequired(schema, key)}
    />
  ));

  if (isRoot) {
    return <>{children}</>;
  }

  return (
    <fieldset className="sf-object" id={id}>
      {title && <legend className="sf-legend">{title}</legend>}
      {schema.description && <p className="sf-description">{schema.description}</p>}
      {children}
      {errors.length > 0 && (
        <p className="sf-error" role="alert">
          {errors.map((e) => e.message).join('. ')}
        </p>
      )}
    </fieldset>
  );
}
