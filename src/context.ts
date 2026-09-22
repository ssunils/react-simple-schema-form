import { createContext, useContext } from 'react';
import type { FieldError, FieldPath, JSONSchema, ResolveWidget, UiSchema, WidgetRegistry } from './types';

export interface FormContextValue {
  /** The top-level schema; `$ref`s resolve against it. */
  rootSchema: JSONSchema;
  data: unknown;
  errors: Record<FieldPath, FieldError[]>;
  touched: Set<FieldPath>;
  submitted: boolean;
  uiSchema: UiSchema;
  widgets: WidgetRegistry;
  resolveWidget?: ResolveWidget;
  disabled: boolean;
  readOnly: boolean;
  idPrefix: string;
  setValue: (path: FieldPath, value: unknown) => void;
  touch: (path: FieldPath) => void;
}

export const FormContext = createContext<FormContextValue | null>(null);

export function useFormContext(): FormContextValue {
  const ctx = useContext(FormContext);
  if (!ctx) throw new Error('Form fields must be rendered inside <SchemaForm>');
  return ctx;
}

export function fieldId(prefix: string, path: FieldPath): string {
  return path === '' ? prefix : `${prefix}-${path.replace(/\./g, '-')}`;
}
