import type { JSONSchema, NestedUiSchema, UiFieldOptions, UiSchema, FieldPath } from './types';

const CONSUMED_KEYWORDS = [
  '$ref',
  'allOf',
  'if',
  'then',
  'else',
  'dependencies',
  'dependentRequired',
  'dependentSchemas',
  'uiSchema',
] as const;

const UI_OPTION_NAMES = ['widget', 'placeholder', 'help', 'disabled', 'props'] as const;

/** Normalise a nested uiSchema entry to inline `ui:*` keywords (plus its own `uiSchema`). */
function toInlineUi(hints: NestedUiSchema): Partial<JSONSchema> {
  const out: Partial<JSONSchema> = {};
  for (const name of UI_OPTION_NAMES) {
    const prefixed = `ui:${name}` as const;
    const value = hints[prefixed] !== undefined ? hints[prefixed] : hints[name];
    if (value !== undefined) (out as Record<string, unknown>)[prefixed] = value;
  }
  if (hints.uiSchema || hints.items) {
    out.uiSchema = { ...hints.uiSchema, ...(hints.items ? { items: hints.items } : {}) };
  }
  return out;
}

/** Push a node's `uiSchema` keyword down onto its `properties` / `items`. */
function foldNestedUiSchema(schema: JSONSchema): JSONSchema {
  const nested = schema.uiSchema;
  if (!nested || typeof nested !== 'object') return schema;
  const out: JSONSchema = { ...schema };
  if (out.properties) {
    out.properties = { ...out.properties };
    for (const [key, hints] of Object.entries(nested)) {
      const child = out.properties[key];
      if (child && key !== 'items') out.properties[key] = { ...child, ...toInlineUi(hints) };
    }
  }
  if (nested.items && out.items) out.items = { ...out.items, ...toInlineUi(nested.items) };
  return out;
}

/** Look up a local JSON pointer (`#/definitions/foo`, `#/$defs/bar`, `#`) in `root`. */
export function resolveRef(ref: string, root: JSONSchema): JSONSchema {
  if (!ref.startsWith('#')) {
    throw new Error(`Only local $ref values are supported, got "${ref}"`);
  }
  const pointer = ref.slice(1);
  if (pointer === '' ) return root;
  if (!pointer.startsWith('/')) {
    throw new Error(`Unsupported $ref "${ref}": expected a JSON pointer starting with "#/"`);
  }
  let node: unknown = root;
  for (const raw of pointer.slice(1).split('/')) {
    const key = decodeURIComponent(raw).replace(/~1/g, '/').replace(/~0/g, '~');
    if (node === null || typeof node !== 'object') node = undefined;
    else node = (node as Record<string, unknown>)[key];
    if (node === undefined) throw new Error(`Cannot resolve $ref "${ref}"`);
  }
  return node as JSONSchema;
}

/**
 * Merge `b` onto `a`. `properties` merge recursively, `required` unions,
 * everything else in `b` overrides `a`.
 */
export function mergeSchemas(a: JSONSchema, b: JSONSchema): JSONSchema {
  const out: JSONSchema = { ...a, ...b };
  if (a.properties && b.properties) {
    out.properties = { ...a.properties };
    for (const [key, schema] of Object.entries(b.properties)) {
      out.properties[key] = a.properties[key] ? mergeSchemas(a.properties[key], schema) : schema;
    }
  }
  if (a.required || b.required) {
    out.required = Array.from(new Set([...(a.required ?? []), ...(b.required ?? [])]));
  }
  if (a.dependencies && b.dependencies) out.dependencies = { ...a.dependencies, ...b.dependencies };
  if (a.allOf && b.allOf) out.allOf = [...a.allOf, ...b.allOf];
  return out;
}

/** Cheap structural check used for `if` and `dependencies`; deliberately not the full validator. */
type Matcher = (schema: JSONSchema, data: unknown) => boolean;

export interface ResolveOptions {
  root: JSONSchema;
  /** Decides whether `data` satisfies an `if` schema. Injected to avoid a circular import with validate.ts. */
  matches: Matcher;
  /** $refs currently being expanded — guards against `{"$ref": "#"}` loops. */
  seen?: Set<string>;
}

/**
 * Flatten a schema node for the given instance data: expand `$ref`, merge `allOf`,
 * apply `dependencies` and `if`/`then`/`else`. `oneOf`/`anyOf` are left in place
 * (they need a UI decision), except when every branch is a `const` — that's just a
 * labelled enum, so it becomes one.
 */
export function resolveSchema(schema: JSONSchema, data: unknown, opts: ResolveOptions): JSONSchema {
  let out: JSONSchema = schema;
  const seen = opts.seen ?? new Set<string>();

  if (schema.$ref) {
    if (seen.has(schema.$ref)) {
      throw new Error(`Circular $ref chain at "${schema.$ref}"`);
    }
    const nextSeen = new Set(seen).add(schema.$ref);
    const target = resolveSchema(resolveRef(schema.$ref, opts.root), data, { ...opts, seen: nextSeen });
    const { $ref: _ref, ...siblings } = schema;
    out = mergeSchemas(target, siblings);
  }

  if (out.allOf) {
    const { allOf, ...rest } = out;
    out = allOf.reduce<JSONSchema>(
      (acc, part) => mergeSchemas(acc, resolveSchema(part, data, { ...opts, seen })),
      rest,
    );
  }

  // Dependencies only apply to object instances that actually contain the trigger key.
  const obj = data !== null && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : undefined;
  if (obj) {
    const required: string[] = [];
    let extra: JSONSchema = {};
    const present = (key: string) => obj[key] !== undefined && obj[key] !== null && obj[key] !== '';

    for (const [key, dep] of Object.entries(out.dependencies ?? {})) {
      if (!present(key)) continue;
      if (Array.isArray(dep)) required.push(...dep);
      else extra = mergeSchemas(extra, resolveSchema(dep, data, { ...opts, seen }));
    }
    for (const [key, keys] of Object.entries(out.dependentRequired ?? {})) {
      if (present(key)) required.push(...keys);
    }
    for (const [key, dep] of Object.entries(out.dependentSchemas ?? {})) {
      if (present(key)) extra = mergeSchemas(extra, resolveSchema(dep, data, { ...opts, seen }));
    }
    if (required.length) extra = mergeSchemas(extra, { required });
    if (Object.keys(extra).length) out = mergeSchemas(out, extra);
  }

  if (out.if) {
    const branch = opts.matches(resolveSchema(out.if, data, { ...opts, seen }), data) ? out.then : out.else;
    if (branch) out = mergeSchemas(out, resolveSchema(branch, data, { ...opts, seen }));
  }

  if (out.uiSchema) out = foldNestedUiSchema(out);

  const variants = out.oneOf ?? out.anyOf;
  if (variants && variants.length > 0 && variants.every((v) => v.const !== undefined && !v.properties)) {
    const { oneOf: _o, anyOf: _a, ...rest } = out;
    out = {
      ...rest,
      enum: variants.map((v) => v.const),
      enumNames: variants.map((v, i) => v.title ?? String(variants[i]!.const)),
    };
  }

  if (out === schema) return schema;
  const cleaned: JSONSchema = { ...out };
  for (const keyword of CONSUMED_KEYWORDS) delete cleaned[keyword];
  return cleaned;
}

const CONSTRAINT_ONLY_KEYWORDS = new Set([
  'required',
  'dependencies',
  'dependentRequired',
  'minProperties',
  'maxProperties',
  'if',
  'then',
  'else',
  'title',
  'description',
  '$comment',
]);

/**
 * True when a combinator branch carries no shape of its own — only presence
 * rules such as `{ "required": ["a"] }`. Such branches express a validation
 * rule ("a or b must be set"), not a choice the user makes, so the form renders
 * the node normally and only the validator looks at them.
 */
export function isConstraintOnly(branch: JSONSchema): boolean {
  return Object.keys(branch).every((k) => CONSTRAINT_ONLY_KEYWORDS.has(k));
}

export interface Combinator {
  kind: 'oneOf' | 'anyOf';
  /** Each branch merged with the node's own keywords, so it sees the shared `properties`. */
  branches: JSONSchema[];
  /** The branches as written, before merging. */
  raw: JSONSchema[];
  /** True when every raw branch is constraint-only: no branch selector is rendered. */
  validationOnly: boolean;
}

/** The branches of a `oneOf`/`anyOf` node, or null when the node has neither. */
export function combinatorBranches(schema: JSONSchema): Combinator | null {
  const kind = schema.oneOf ? 'oneOf' : schema.anyOf ? 'anyOf' : null;
  if (!kind) return null;
  const { oneOf: _o, anyOf: _a, ...base } = schema;
  const raw = schema[kind] ?? [];
  return {
    kind,
    raw,
    branches: raw.map((b) => mergeSchemas(base, b)),
    validationOnly: raw.length > 0 && raw.every(isConstraintOnly),
  };
}

/** Does a uiSchema key (possibly with `*` / `**` segments) match a field path? */
export function matchesPath(pattern: string, path: FieldPath): boolean {
  if (pattern === path) return true;
  const pat = pattern === '' ? [] : pattern.split('.');
  const segs = path === '' ? [] : path.split('.');
  const go = (pi: number, si: number): boolean => {
    if (pi === pat.length) return si === segs.length;
    const p = pat[pi]!;
    if (p === '**') {
      // Try consuming zero or more segments.
      for (let k = si; k <= segs.length; k++) if (go(pi + 1, k)) return true;
      return false;
    }
    if (si === segs.length) return false;
    return (p === '*' || p === segs[si]) && go(pi + 1, si + 1);
  };
  return go(0, 0);
}

/**
 * Specificity of a uiSchema key: higher wins. Exact keys beat any glob; among
 * globs, more literal segments beat fewer, then `*` beats `**`.
 */
export function patternSpecificity(pattern: string, path: FieldPath): number {
  if (pattern === path) return Number.POSITIVE_INFINITY;
  let literal = 0;
  let single = 0;
  let deep = 0;
  for (const seg of pattern.split('.')) {
    if (seg === '**') deep++;
    else if (seg === '*') single++;
    else literal++;
  }
  return literal * 1000 - single * 10 - deep * 100;
}

function mergeUiOptions(base: UiFieldOptions, over: UiFieldOptions): UiFieldOptions {
  const out: UiFieldOptions = { ...base, ...over };
  if (base.props || over.props) out.props = { ...base.props, ...over.props };
  return out;
}

/**
 * Combine inline `ui:*` keywords with every matching uiSchema entry.
 * Precedence, lowest to highest: inline, then uiSchema entries from least to
 * most specific — so an exact path beats `tags.*` beats `**`.
 */
export function getUiOptions(schema: JSONSchema, path: FieldPath, uiSchema: UiSchema): UiFieldOptions {
  const inline: UiFieldOptions = {};
  if (schema['ui:widget'] !== undefined) inline.widget = schema['ui:widget'];
  if (schema['ui:placeholder'] !== undefined) inline.placeholder = schema['ui:placeholder'];
  if (schema['ui:help'] !== undefined) inline.help = schema['ui:help'];
  if (schema['ui:disabled'] !== undefined) inline.disabled = schema['ui:disabled'];
  if (schema['ui:props'] !== undefined) inline.props = schema['ui:props'];

  const matched = Object.keys(uiSchema)
    .filter((key) => matchesPath(key, path))
    .sort((a, b) => patternSpecificity(a, path) - patternSpecificity(b, path));

  return matched.reduce((acc, key) => mergeUiOptions(acc, uiSchema[key]!), inline);
}
