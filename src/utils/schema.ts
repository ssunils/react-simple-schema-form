import type { JSONSchema, JSONSchemaType } from '../types';
import { combinatorBranches, resolveSchema } from '../resolve';
import { looselyMatches, resolveOptions } from '../validate';

/**
 * Infer a schema's type from `type`, or from structural hints (`properties`,
 * `items`, `enum`, `const`). Returns undefined when nothing constrains the type.
 */
export function inferType(schema: JSONSchema): JSONSchemaType | undefined {
  const t = schema.type;
  if (Array.isArray(t)) {
    // Prefer the first non-null type
    return (t.find((x) => x !== 'null') ?? 'null') as JSONSchemaType;
  }
  if (t) return t;
  if (schema.properties) return 'object';
  if (schema.items) return 'array';
  const sample = schema.const !== undefined ? schema.const : schema.enum?.[0];
  if (sample !== undefined) return typeOfValue(sample);
  return undefined;
}

/** Like `inferType`, but defaults to `string` so a field can always be rendered. */
export function resolveType(schema: JSONSchema): JSONSchemaType {
  return inferType(schema) ?? 'string';
}

function typeOfValue(value: unknown): JSONSchemaType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  switch (typeof value) {
    case 'number':
      return Number.isInteger(value) ? 'integer' : 'number';
    case 'boolean':
      return 'boolean';
    case 'object':
      return 'object';
    default:
      return 'string';
  }
}

export function isNullable(schema: JSONSchema): boolean {
  return Array.isArray(schema.type) && schema.type.includes('null');
}

export function isRequired(parent: JSONSchema | undefined, key: string): boolean {
  return Boolean(parent?.required?.includes(key));
}

/**
 * Compute initial form data by walking `default` values through the schema.
 * `root` is the document `$ref`s resolve against; it defaults to `schema`.
 */
export function getDefaultFormData(
  rawSchema: JSONSchema,
  seed?: unknown,
  root: JSONSchema = rawSchema,
  seenRefs: Set<string> = new Set(),
): unknown {
  // A self-referencing property (`next: { $ref: '#' }`) would recurse forever; stop at the cycle.
  if (rawSchema.$ref) {
    if (seenRefs.has(rawSchema.$ref)) return seed;
    seenRefs = new Set(seenRefs).add(rawSchema.$ref);
  }
  const schema = resolveSchema(rawSchema, seed, resolveOptions(root));

  if (schema.default !== undefined && seed === undefined) {
    return schema.default;
  }
  if (schema.const !== undefined) return schema.const;

  const combinator = combinatorBranches(schema);
  if (combinator) {
    const branch = combinator.branches.find((b) => looselyMatches(b, seed, root)) ?? combinator.branches[0];
    return branch ? getDefaultFormData(branch, seed, root, seenRefs) : seed;
  }

  const type = resolveType(schema);

  switch (type) {
    case 'object': {
      const seedObj = seed !== null && typeof seed === 'object' && !Array.isArray(seed)
        ? (seed as Record<string, unknown>)
        : {};
      const out: Record<string, unknown> = { ...seedObj };
      for (const [key, child] of Object.entries(schema.properties ?? {})) {
        const v = getDefaultFormData(child, seedObj[key], root, seenRefs);
        if (v !== undefined) out[key] = v;
      }
      return out;
    }
    case 'array': {
      if (Array.isArray(seed)) {
        return schema.items ? seed.map((item) => getDefaultFormData(schema.items!, item, root, seenRefs)) : seed;
      }
      return schema.minItems && schema.items
        ? Array.from({ length: schema.minItems }, () => getDefaultFormData(schema.items!, undefined, root, seenRefs))
        : [];
    }
    default:
      return seed;
  }
}
