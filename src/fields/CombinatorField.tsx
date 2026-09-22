import { useEffect, useState } from 'react';
import type { JSONSchema, FieldPath } from '../types';
import { useFormContext, fieldId } from '../context';
import { getAtPath } from '../utils/path';
import { getDefaultFormData } from '../utils/schema';
import { looselyMatches } from '../validate';
import { Field, humanize } from './Field';

interface CombinatorFieldProps {
  kind: 'oneOf' | 'anyOf';
  /** Branches already merged with the node's shared keywords (see `combinatorBranches`). */
  branches: JSONSchema[];
  schema: JSONSchema;
  path: FieldPath;
  required: boolean;
  label?: string;
}

/**
 * Renders a `oneOf`/`anyOf` node as a branch picker plus the chosen branch's field.
 *
 * The active branch follows the data: if a discriminator inside the branch (e.g. a
 * `kind` select with per-branch `const`) changes so the current branch no longer
 * fits but another does, the form switches automatically.
 */
export function CombinatorField({ kind, branches, schema, path, required, label }: CombinatorFieldProps) {
  const ctx = useFormContext();
  const id = fieldId(ctx.idPrefix, path);
  const value = getAtPath(ctx.data, path);
  const root = ctx.rootSchema;

  const matchIndex = (v: unknown) => branches.findIndex((b) => looselyMatches(b, v, root));

  const [selected, setSelected] = useState(() => Math.max(0, matchIndex(value)));

  useEffect(() => {
    const current = branches[selected];
    if (current && looselyMatches(current, value, root)) return;
    const next = matchIndex(value);
    if (next >= 0 && next !== selected) setSelected(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const choose = (index: number) => {
    setSelected(index);
    const branch = branches[index];
    if (branch) ctx.setValue(path, getDefaultFormData(branch, undefined, root));
    ctx.touch(path);
  };

  const branch = branches[selected] ?? branches[0];
  const title = label ?? schema.title ?? humanize(path);
  const disabled = ctx.disabled || ctx.readOnly || Boolean(schema.readOnly);
  const selectorId = `${id}-${kind}`;

  return (
    <div className="sf-combinator" data-kind={kind}>
      <div className="sf-field">
        <label htmlFor={selectorId} className="sf-label">
          {title}
          {required && <span className="sf-required" aria-hidden="true"> *</span>}
        </label>
        {schema.description && <p className="sf-description">{schema.description}</p>}
        <select
          id={selectorId}
          className="sf-select sf-combinator-select"
          value={selected}
          disabled={disabled}
          onChange={(e) => choose(Number(e.target.value))}
        >
          {branches.map((b, i) => (
            <option key={i} value={i}>
              {b.title ?? `Option ${i + 1}`}
            </option>
          ))}
        </select>
      </div>
      {branch && (
        <Field
          key={selected}
          // The branch already carries the parent's title; drop it so the inner field
          // isn't labelled twice.
          schema={{ ...branch, title: branch.title ?? title, description: undefined }}
          path={path}
          required={required}
        />
      )}
    </div>
  );
}
