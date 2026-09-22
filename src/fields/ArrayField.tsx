import type { JSONSchema, FieldPath } from '../types';
import { useFormContext, fieldId } from '../context';
import { getAtPath, joinPath } from '../utils/path';
import { getDefaultFormData } from '../utils/schema';
import { Field, humanize } from './Field';

interface ArrayFieldProps {
  schema: JSONSchema;
  path: FieldPath;
  required: boolean;
  label?: string;
}

export function ArrayField({ schema, path, required, label }: ArrayFieldProps) {
  const ctx = useFormContext();
  const id = fieldId(ctx.idPrefix, path);
  const items = (getAtPath(ctx.data, path) as unknown[] | undefined) ?? [];
  const itemSchema = schema.items ?? {};
  const title = label ?? schema.title ?? humanize(path);
  const errors = ctx.submitted || ctx.touched.has(path) ? ctx.errors[path] ?? [] : [];
  const disabled = ctx.disabled || ctx.readOnly || Boolean(schema.readOnly);

  const canAdd = !disabled && (schema.maxItems === undefined || items.length < schema.maxItems);
  const canRemove = !disabled && (schema.minItems === undefined || items.length > schema.minItems);

  const update = (next: unknown[]) => {
    ctx.setValue(path, next);
    ctx.touch(path);
  };

  const add = () => update([...items, getDefaultFormData(itemSchema, undefined, ctx.rootSchema)]);
  const remove = (i: number) => update(items.filter((_, j) => j !== i));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= items.length) return;
    const next = items.slice();
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    update(next);
  };

  return (
    <fieldset className="sf-array" id={id}>
      <legend className="sf-legend">
        {title}
        {required && <span className="sf-required" aria-hidden="true"> *</span>}
      </legend>
      {schema.description && <p className="sf-description">{schema.description}</p>}

      {items.length === 0 && <p className="sf-array-empty">No items</p>}

      <ol className="sf-array-items">
        {items.map((_, i) => (
          <li key={i} className="sf-array-item">
            <div className="sf-array-item-body">
              <Field schema={itemSchema} path={joinPath(path, i)} required={false} label={`${title} ${i + 1}`} />
            </div>
            {!disabled && (
              <div className="sf-array-item-actions">
                <button type="button" className="sf-btn sf-btn--icon" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move up">↑</button>
                <button type="button" className="sf-btn sf-btn--icon" onClick={() => move(i, i + 1)} disabled={i === items.length - 1} aria-label="Move down">↓</button>
                <button type="button" className="sf-btn sf-btn--icon sf-btn--danger" onClick={() => remove(i)} disabled={!canRemove} aria-label="Remove">✕</button>
              </div>
            )}
          </li>
        ))}
      </ol>

      {canAdd && (
        <button type="button" className="sf-btn sf-btn--add" onClick={add}>
          + Add {itemSchema.title ?? 'item'}
        </button>
      )}

      {errors.length > 0 && (
        <p id={`${id}-error`} className="sf-error" role="alert">
          {errors.map((e) => e.message).join('. ')}
        </p>
      )}
    </fieldset>
  );
}
