import type { ComponentType } from 'react';

export type JSONSchemaType =
  | 'string'
  | 'number'
  | 'integer'
  | 'boolean'
  | 'object'
  | 'array'
  | 'null';

/**
 * The subset of JSON Schema (draft-07) this library understands.
 * Unknown keywords are preserved but ignored.
 */
export interface JSONSchema {
  $schema?: string;
  $id?: string;
  title?: string;
  description?: string;
  type?: JSONSchemaType | JSONSchemaType[];
  default?: unknown;
  const?: unknown;
  enum?: unknown[];
  readOnly?: boolean;

  // string
  format?: string;
  minLength?: number;
  maxLength?: number;
  pattern?: string;

  // number / integer
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: number;
  exclusiveMaximum?: number;
  multipleOf?: number;

  // object
  properties?: Record<string, JSONSchema>;
  required?: string[];
  additionalProperties?: boolean | JSONSchema;

  // array
  items?: JSONSchema;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;

  // references & reuse
  $ref?: string;
  definitions?: Record<string, JSONSchema>;
  $defs?: Record<string, JSONSchema>;

  // combinators
  allOf?: JSONSchema[];
  anyOf?: JSONSchema[];
  oneOf?: JSONSchema[];

  // conditionals
  if?: JSONSchema;
  then?: JSONSchema;
  else?: JSONSchema;

  // dependencies (draft-07) and their 2019-09 split forms
  dependencies?: Record<string, JSONSchema | string[]>;
  dependentRequired?: Record<string, string[]>;
  dependentSchemas?: Record<string, JSONSchema>;

  // non-standard but widely used
  enumNames?: string[];

  // inline UI hints — the same options as `UiFieldOptions`, prefixed with `ui:`
  'ui:widget'?: string;
  'ui:placeholder'?: string;
  'ui:help'?: string;
  'ui:disabled'?: boolean;
  'ui:props'?: Record<string, unknown>;
  /**
   * UI hints for this node's children, keyed by property name (or `items` for
   * arrays). Folded into the children during resolution, overriding their own
   * inline `ui:*` — so a `$ref` site can restyle the definition it points at.
   */
  uiSchema?: Record<string, NestedUiSchema>;

  [keyword: string]: unknown;
}

export type FormData = Record<string, unknown>;

/** A JSON-pointer-like path into form data, e.g. "address.street" or "tags.0". */
export type FieldPath = string;

export interface FieldError {
  path: FieldPath;
  message: string;
  keyword: string;
}

/**
 * Per-field UI hints, keyed by field path (dot-separated). Keys may contain
 * globs: `*` matches one segment, `**` matches any number (including none).
 *
 *   "homeAddress.street"   exact
 *   "tags.*"               every item of the `tags` array
 *   "*.street"             `street` in any top-level object
 *   "**.postalCode"        `postalCode` at any depth
 *
 * When several keys match one field, the most specific wins per option
 * (exact > more literal segments > `*` > `**`). All entries override inline
 * `ui:*` keywords on the schema node.
 */
export interface UiSchema {
  [pathOrGlob: string]: UiFieldOptions;
}

/**
 * An entry of a schema node's nested `uiSchema` keyword. Accepts the `ui:*`
 * spelling, the plain option names, and a further `uiSchema` for grandchildren.
 */
export interface NestedUiSchema extends UiFieldOptions {
  'ui:widget'?: string;
  'ui:placeholder'?: string;
  'ui:help'?: string;
  'ui:disabled'?: boolean;
  'ui:props'?: Record<string, unknown>;
  uiSchema?: Record<string, NestedUiSchema>;
  /** Shorthand for `uiSchema: { items: … }` on an array entry. */
  items?: NestedUiSchema;
}

export interface UiFieldOptions {
  /** Name of a registered widget to render this field with. */
  widget?: string;
  placeholder?: string;
  help?: string;
  disabled?: boolean;
  /** Extra props forwarded to the widget element. */
  props?: Record<string, unknown>;
}

export interface WidgetProps<T = unknown> {
  id: string;
  path: FieldPath;
  /** The fully resolved schema for this node ($ref/allOf/if/dependencies already applied). */
  schema: JSONSchema;
  value: T;
  onChange: (value: T) => void;
  onBlur: () => void;
  required: boolean;
  disabled: boolean;
  readOnly: boolean;
  /** True when this field has errors the user should currently see (touched or submitted). */
  invalid: boolean;
  /**
   * All validation errors for this node and its descendants, regardless of
   * touched state. Lets a widget rendering an object/array show what is wrong inside.
   */
  errors: FieldError[];
  options: UiFieldOptions;
}

export type Widget<T = unknown> = ComponentType<WidgetProps<T>>;

export type WidgetRegistry = Record<string, Widget<any>>;

export interface ResolveWidgetContext {
  /** The resolved schema of the node being rendered. */
  schema: JSONSchema;
  path: FieldPath;
  /** What the library would pick on its own; undefined for objects and non-enum arrays (they render structurally). */
  defaultWidget: string | undefined;
}

/**
 * Rule-based widget selection, consulted after `uiSchema` and inline `ui:widget`
 * but before the built-in defaults. Return a registered widget name, a component,
 * or undefined to fall through.
 */
export type ResolveWidget = (ctx: ResolveWidgetContext) => string | Widget<any> | undefined;
