import type { JSONSchema, FieldPath, Widget } from '../types';
import { useFormContext, fieldId, type FormContextValue } from '../context';
import { getAtPath } from '../utils/path';
import { resolveType } from '../utils/schema';
import { defaultWidgetFor } from '../widgets';
import { combinatorBranches, getUiOptions, resolveSchema } from '../resolve';
import { resolveOptions } from '../validate';
import { FieldWrapper } from './FieldWrapper';
import { ObjectField } from './ObjectField';
import { ArrayField } from './ArrayField';
import { CombinatorField } from './CombinatorField';

export interface FieldProps {
  schema: JSONSchema;
  path: FieldPath;
  required: boolean;
  /** Override the label derived from schema.title. */
  label?: string;
}

/**
 * Dispatches a schema node to the right field renderer. Resolves `$ref`, `allOf`,
 * `dependencies` and `if/then/else` against the current value first, so every
 * renderer below only ever sees a flat schema.
 */
export function Field({ schema: rawSchema, path, required, label }: FieldProps) {
  const ctx = useFormContext();
  const value = getAtPath(ctx.data, path);
  const schema = resolveSchema(rawSchema, value, resolveOptions(ctx.rootSchema));
  const options = getUiOptions(schema, path, ctx.uiSchema);
  const type = resolveType(schema);
  // A combinator whose branches are only constraints (e.g. anyOf of `required`)
  // is a validation rule, not a choice: render the node as usual.
  const rawCombinator = combinatorBranches(schema);
  const combinator = rawCombinator && !rawCombinator.validationOnly ? rawCombinator : null;
  const isEnumArray = type === 'array' && Boolean(schema.items?.enum);

  // Widget selection, highest precedence first:
  //   uiSchema (exact > glob) → inline ui:widget → resolveWidget → built-in default.
  // Objects and non-enum arrays have no default: they render structurally.
  const defaultWidget =
    combinator || type === 'object' || (type === 'array' && !isEnumArray) ? undefined : defaultWidgetFor(schema);
  let chosen: string | Widget | undefined = options.widget ?? ctx.resolveWidget?.({ schema, path, defaultWidget });

  if (typeof chosen === 'string' && !ctx.widgets[chosen]) {
    // A schema served at runtime may name a widget this app never registered.
    // Degrade to the default rendering rather than taking the whole form down.
    warnOnce(`react-simple-schema-form: no widget registered for "${chosen}" (field "${path || '<root>'}"); using the default.`);
    chosen = undefined;
  }

  if (chosen === undefined) {
    if (combinator) {
      return (
        <CombinatorField
          kind={combinator.kind}
          branches={combinator.branches}
          schema={schema}
          path={path}
          required={required}
          label={label}
        />
      );
    }
    // Structural types render their own children unless a widget was explicitly chosen.
    if (type === 'object') return <ObjectField schema={schema} path={path} required={required} label={label} />;
    if (type === 'array' && !isEnumArray) return <ArrayField schema={schema} path={path} required={required} label={label} />;
    chosen = defaultWidget!;
  }

  const widgetName = typeof chosen === 'string' ? chosen : undefined;
  const Widget = typeof chosen === 'string' ? ctx.widgets[chosen]! : chosen;

  const id = fieldId(ctx.idPrefix, path);
  const errors = ctx.errors[path] ?? [];
  const showErrors = ctx.submitted || ctx.touched.has(path);
  const visibleErrors = showErrors ? errors : [];
  const subtreeErrors = collectSubtreeErrors(ctx.errors, path);
  const isCheckbox = widgetName === 'checkbox';
  const isGroup = widgetName === 'radio' || widgetName === 'checkboxes';

  if (widgetName === 'hidden') {
    return (
      <Widget
        id={id}
        path={path}
        schema={schema}
        value={value}
        onChange={(v: unknown) => ctx.setValue(path, v)}
        onBlur={() => ctx.touch(path)}
        required={required}
        disabled
        readOnly
        invalid={false}
        errors={subtreeErrors}
        options={options}
      />
    );
  }

  return (
    <FieldWrapper
      id={id}
      label={label ?? schema.title ?? humanize(path)}
      description={schema.description}
      help={options.help}
      required={required}
      errors={visibleErrors}
      inline={isCheckbox}
      group={isGroup}
    >
      <Widget
        id={id}
        path={path}
        schema={schema}
        value={value}
        onChange={(v: unknown) => ctx.setValue(path, v)}
        onBlur={() => ctx.touch(path)}
        required={required}
        disabled={ctx.disabled || Boolean(options.disabled)}
        readOnly={ctx.readOnly || Boolean(schema.readOnly)}
        invalid={visibleErrors.length > 0}
        errors={subtreeErrors}
        options={options}
      />
    </FieldWrapper>
  );
}

const warned = new Set<string>();
function warnOnce(message: string) {
  if (warned.has(message)) return;
  warned.add(message);
  console.warn(message);
}

/** Errors at `path` plus everything beneath it (`path.*`), in validation order. */
function collectSubtreeErrors(errors: FormContextValue['errors'], path: FieldPath) {
  const prefix = path === '' ? '' : `${path}.`;
  return Object.entries(errors)
    .filter(([p]) => p === path || p.startsWith(prefix))
    .flatMap(([, list]) => list);
}

export function humanize(path: FieldPath): string {
  const last = path.split('.').pop() ?? '';
  return last
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
}
