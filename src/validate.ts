import type { FieldError, FieldPath, JSONSchema } from './types';
import { joinPath } from './utils/path';
import { inferType } from './utils/schema';
import { combinatorBranches, resolveSchema, type ResolveOptions } from './resolve';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^\d{2}:\d{2}(:\d{2})?$/;

const FORMAT_VALIDATORS: Record<string, (v: string) => boolean> = {
  email: (v) => EMAIL_RE.test(v),
  uri: (v) => {
    try {
      new URL(v);
      return true;
    } catch {
      return false;
    }
  },
  url: (v) => FORMAT_VALIDATORS.uri!(v),
  date: (v) => DATE_RE.test(v) && !Number.isNaN(Date.parse(v)),
  time: (v) => TIME_RE.test(v),
  'date-time': (v) => !Number.isNaN(Date.parse(v)),
};

/**
 * "Not provided" for validation purposes. A plain object whose values are all
 * empty counts too: nested object fields are seeded with `{}` so their inputs
 * can render, and an untouched optional object must read as absent.
 */
export function isEmpty(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value === 'object' && !Array.isArray(value)) {
    return Object.values(value as Record<string, unknown>).every(isEmpty);
  }
  return false;
}

function isPrimitiveEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/**
 * Validate `data` against `schema`. Returns a flat list of errors keyed by
 * dot-separated field paths. Intentionally covers the common subset of
 * draft-07 rather than the full spec.
 */
export function validate(schema: JSONSchema, data: unknown, root: JSONSchema = schema): FieldError[] {
  const errors: FieldError[] = [];
  validateNode(schema, data, '', errors, root, true);
  return errors;
}

/** True when `data` satisfies `schema`. Used for `if` conditions and combinator matching. */
export function matches(schema: JSONSchema, data: unknown, root: JSONSchema = schema): boolean {
  return validate(schema, data, root).length === 0;
}

/**
 * Like `matches`, but ignores `required` — tells whether `data` *belongs to* a branch
 * (discriminators, types, consts line up) even if the user hasn't finished filling it in.
 */
export function looselyMatches(schema: JSONSchema, data: unknown, root: JSONSchema = schema): boolean {
  return validate(schema, data, root).every((e) => e.keyword === 'required');
}

export function resolveOptions(root: JSONSchema): ResolveOptions {
  return { root, matches: (schema, data) => matches(schema, data, root) };
}

export function errorsByPath(errors: FieldError[]): Record<FieldPath, FieldError[]> {
  const map: Record<FieldPath, FieldError[]> = {};
  for (const err of errors) {
    (map[err.path] ??= []).push(err);
  }
  return map;
}

function push(errors: FieldError[], path: FieldPath, keyword: string, message: string) {
  errors.push({ path, keyword, message });
}

function validateNode(
  rawSchema: JSONSchema,
  value: unknown,
  path: FieldPath,
  errors: FieldError[],
  root: JSONSchema,
  /** Whether the parent requires this node; the root is always validated. */
  required: boolean,
) {
  // Presence is checked by the parent object's `required` list, so absent values
  // are skipped here. An optional object nobody has touched is skipped as well —
  // its own `required` children only matter once the user starts filling it in.
  if (isPrimitiveEmpty(value) || (!required && isEmpty(value))) {
    return;
  }

  const schema = resolveSchema(rawSchema, value, resolveOptions(root));

  const combinator = combinatorBranches(schema);
  if (combinator) {
    validateCombinator(combinator.kind, combinator.branches, value, path, errors, root, required);
    return;
  }

  const type = inferType(schema);

  if (schema.const !== undefined && value !== schema.const) {
    push(errors, path, 'const', `Must be ${JSON.stringify(schema.const)}`);
  }

  if (schema.enum && !schema.enum.some((option) => option === value)) {
    push(errors, path, 'enum', 'Must be one of the allowed values');
  }

  switch (type) {
    case 'string':
      validateString(schema, value, path, errors);
      break;
    case 'number':
    case 'integer':
      validateNumber(schema, value, path, errors, type === 'integer');
      break;
    case 'boolean':
      if (typeof value !== 'boolean') push(errors, path, 'type', 'Must be true or false');
      break;
    case 'object':
      validateObject(schema, value, path, errors, root);
      break;
    case 'array':
      validateArray(schema, value, path, errors, root);
      break;
  }
}

function validateCombinator(
  kind: 'oneOf' | 'anyOf',
  branches: JSONSchema[],
  value: unknown,
  path: FieldPath,
  errors: FieldError[],
  root: JSONSchema,
  required: boolean,
) {
  const results = branches.map((branch) => {
    const branchErrors: FieldError[] = [];
    validateNode(branch, value, path, branchErrors, root, required);
    return branchErrors;
  });
  const passing = results.filter((r) => r.length === 0).length;

  if (passing === 0) {
    // Surface the errors of the branch the data most plausibly belongs to, so the
    // user sees actionable field-level messages instead of a bare "no match".
    const loose = branches
      .map((b, i) => (looselyMatches(b, value, root) ? i : -1))
      .filter((i) => i >= 0);
    const candidates = loose.length ? loose : results.map((_, i) => i);
    const best = candidates.reduce((a, b) => (results[b]!.length < results[a]!.length ? b : a));
    errors.push(...results[best]!);
    return;
  }
  if (kind === 'oneOf' && passing > 1) {
    push(errors, path, 'oneOf', 'Must match exactly one option');
  }
}

function validateString(schema: JSONSchema, value: unknown, path: FieldPath, errors: FieldError[]) {
  if (typeof value !== 'string') {
    push(errors, path, 'type', 'Must be text');
    return;
  }
  if (schema.minLength !== undefined && value.length < schema.minLength) {
    push(errors, path, 'minLength', `Must be at least ${schema.minLength} characters`);
  }
  if (schema.maxLength !== undefined && value.length > schema.maxLength) {
    push(errors, path, 'maxLength', `Must be at most ${schema.maxLength} characters`);
  }
  if (schema.pattern !== undefined && !new RegExp(schema.pattern).test(value)) {
    push(errors, path, 'pattern', 'Does not match the required format');
  }
  if (schema.format) {
    const check = FORMAT_VALIDATORS[schema.format];
    if (check && !check(value)) {
      push(errors, path, 'format', `Must be a valid ${schema.format}`);
    }
  }
}

function validateNumber(
  schema: JSONSchema,
  value: unknown,
  path: FieldPath,
  errors: FieldError[],
  integer: boolean,
) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    push(errors, path, 'type', 'Must be a number');
    return;
  }
  if (integer && !Number.isInteger(value)) {
    push(errors, path, 'type', 'Must be a whole number');
  }
  if (schema.minimum !== undefined && value < schema.minimum) {
    push(errors, path, 'minimum', `Must be at least ${schema.minimum}`);
  }
  if (schema.maximum !== undefined && value > schema.maximum) {
    push(errors, path, 'maximum', `Must be at most ${schema.maximum}`);
  }
  if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
    push(errors, path, 'exclusiveMinimum', `Must be greater than ${schema.exclusiveMinimum}`);
  }
  if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
    push(errors, path, 'exclusiveMaximum', `Must be less than ${schema.exclusiveMaximum}`);
  }
  if (schema.multipleOf !== undefined && !isMultipleOf(value, schema.multipleOf)) {
    push(errors, path, 'multipleOf', `Must be a multiple of ${schema.multipleOf}`);
  }
}

function isMultipleOf(value: number, step: number): boolean {
  const quotient = value / step;
  return Math.abs(quotient - Math.round(quotient)) < 1e-9;
}

function validateObject(
  schema: JSONSchema,
  value: unknown,
  path: FieldPath,
  errors: FieldError[],
  root: JSONSchema,
) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    push(errors, path, 'type', 'Must be an object');
    return;
  }
  const obj = value as Record<string, unknown>;

  for (const key of schema.required ?? []) {
    // Presence only (as per spec): an empty *object* is present, and its own
    // required children report what is missing.
    if (isPrimitiveEmpty(obj[key])) {
      push(errors, joinPath(path, key), 'required', 'This field is required');
    }
  }

  const required = new Set(schema.required ?? []);
  for (const [key, child] of Object.entries(schema.properties ?? {})) {
    validateNode(child, obj[key], joinPath(path, key), errors, root, required.has(key));
  }
}

function validateArray(
  schema: JSONSchema,
  value: unknown,
  path: FieldPath,
  errors: FieldError[],
  root: JSONSchema,
) {
  if (!Array.isArray(value)) {
    push(errors, path, 'type', 'Must be a list');
    return;
  }
  if (schema.minItems !== undefined && value.length < schema.minItems) {
    push(errors, path, 'minItems', `Must have at least ${schema.minItems} item${schema.minItems === 1 ? '' : 's'}`);
  }
  if (schema.maxItems !== undefined && value.length > schema.maxItems) {
    push(errors, path, 'maxItems', `Must have at most ${schema.maxItems} item${schema.maxItems === 1 ? '' : 's'}`);
  }
  if (schema.uniqueItems) {
    const seen = new Set(value.map((v) => JSON.stringify(v)));
    if (seen.size !== value.length) {
      push(errors, path, 'uniqueItems', 'Items must be unique');
    }
  }
  if (schema.items) {
    value.forEach((item, i) => validateNode(schema.items!, item, joinPath(path, i), errors, root, true));
  }
}
