import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { FieldError, FieldPath, JSONSchema, ResolveWidget, UiSchema, WidgetRegistry } from './types';
import { FormContext, type FormContextValue } from './context';
import { Field } from './fields/Field';
import { setAtPath } from './utils/path';
import { getDefaultFormData } from './utils/schema';
import { errorsByPath, validate } from './validate';
import { defaultWidgets } from './widgets';

export interface SchemaFormProps<T = Record<string, unknown>> {
  schema: JSONSchema;
  uiSchema?: UiSchema;
  /** Controlled form data. When provided, `onChange` must update it. */
  value?: T;
  /** Initial data for uncontrolled usage; merged with schema defaults. */
  defaultValue?: Partial<T>;
  onChange?: (data: T, errors: FieldError[]) => void;
  /** Called on submit only when the data is valid. */
  onSubmit?: (data: T) => void;
  /** Called on submit when the data has validation errors. */
  onError?: (errors: FieldError[]) => void;
  /** Extra or replacement widgets, merged over the defaults. */
  widgets?: WidgetRegistry;
  /**
   * Rule-based widget selection (e.g. "every integer with format epoch").
   * Consulted after `uiSchema` and inline `ui:widget`, before built-in defaults.
   */
  resolveWidget?: ResolveWidget;
  disabled?: boolean;
  readOnly?: boolean;
  /** Prefix for generated element ids; needed when rendering multiple forms on one page. */
  id?: string;
  className?: string;
  submitLabel?: string;
  /** Replace the default submit button (pass `null` to omit it). */
  children?: ReactNode;
}

let formCounter = 0;

export function SchemaForm<T = Record<string, unknown>>({
  schema,
  uiSchema = {},
  value,
  defaultValue,
  onChange,
  onSubmit,
  onError,
  widgets,
  resolveWidget,
  disabled = false,
  readOnly = false,
  id,
  className,
  submitLabel = 'Submit',
  children,
}: SchemaFormProps<T>) {
  const isControlled = value !== undefined;
  const [internal, setInternal] = useState<T>(
    () => getDefaultFormData(schema, defaultValue) as T,
  );
  const data = isControlled ? value : internal;

  const [touched, setTouched] = useState<Set<FieldPath>>(() => new Set());
  const [submitted, setSubmitted] = useState(false);
  const idPrefix = useRef(id ?? `sf${++formCounter}`).current;

  const errors = useMemo(() => validate(schema, data), [schema, data]);
  const errorMap = useMemo(() => errorsByPath(errors), [errors]);
  const mergedWidgets = useMemo(() => ({ ...defaultWidgets, ...widgets }), [widgets]);

  // Keep latest callbacks without re-creating context value on every render.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  });

  const setValue = useCallback(
    (path: FieldPath, fieldValue: unknown) => {
      const next = setAtPath(data, path, fieldValue);
      if (!isControlled) setInternal(next);
      onChangeRef.current?.(next, validate(schema, next));
    },
    [data, isControlled, schema],
  );

  const touch = useCallback((path: FieldPath) => {
    setTouched((prev) => {
      if (prev.has(path)) return prev;
      const next = new Set(prev);
      next.add(path);
      return next;
    });
  }, []);

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitted(true);
    if (errors.length > 0) {
      onError?.(errors);
      focusFirstError(e.currentTarget, errors, idPrefix);
      return;
    }
    onSubmit?.(data);
  };

  const ctx: FormContextValue = {
    rootSchema: schema,
    data,
    errors: errorMap,
    touched,
    submitted,
    uiSchema,
    widgets: mergedWidgets,
    resolveWidget,
    disabled,
    readOnly,
    idPrefix,
    setValue,
    touch,
  };

  return (
    <FormContext.Provider value={ctx}>
      <form
        id={idPrefix}
        className={['sf-form', className].filter(Boolean).join(' ')}
        onSubmit={handleSubmit}
        noValidate
      >
        {schema.title && <h2 className="sf-title">{schema.title}</h2>}
        {schema.description && <p className="sf-description">{schema.description}</p>}
        <Field schema={schema} path="" required={false} />
        {children === undefined ? (
          <button type="submit" className="sf-btn sf-btn--submit" disabled={disabled}>
            {submitLabel}
          </button>
        ) : (
          children
        )}
      </form>
    </FormContext.Provider>
  );
}

function focusFirstError(form: HTMLFormElement, errors: FieldError[], idPrefix: string) {
  const first = errors[0];
  if (!first) return;
  const id = first.path === '' ? idPrefix : `${idPrefix}-${first.path.replace(/\./g, '-')}`;
  const el = form.querySelector<HTMLElement>(`#${CSS.escape(id)}`);
  el?.focus?.();
}
