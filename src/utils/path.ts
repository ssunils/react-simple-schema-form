import type { FieldPath } from '../types';

export function joinPath(parent: FieldPath, key: string | number): FieldPath {
  return parent === '' ? String(key) : `${parent}.${key}`;
}

export function getAtPath(data: unknown, path: FieldPath): unknown {
  if (path === '') return data;
  let current: unknown = data;
  for (const segment of path.split('.')) {
    if (current === null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Immutably sets a value at a path, creating intermediate objects/arrays.
 * Numeric segments create arrays when the container doesn't exist yet.
 */
export function setAtPath<T>(data: T, path: FieldPath, value: unknown): T {
  if (path === '') return value as T;
  const segments = path.split('.');
  return setRecursive(data, segments, 0, value) as T;
}

function setRecursive(node: unknown, segments: string[], index: number, value: unknown): unknown {
  const key = segments[index]!;
  const isLast = index === segments.length - 1;
  const nextKeyIsIndex = !isLast && /^\d+$/.test(segments[index + 1]!);

  if (Array.isArray(node)) {
    const copy = node.slice();
    const i = Number(key);
    copy[i] = isLast ? value : setRecursive(node[i] ?? (nextKeyIsIndex ? [] : {}), segments, index + 1, value);
    return copy;
  }

  const obj = node !== null && typeof node === 'object' ? (node as Record<string, unknown>) : {};
  const copy: Record<string, unknown> = { ...obj };
  copy[key] = isLast ? value : setRecursive(obj[key] ?? (nextKeyIsIndex ? [] : {}), segments, index + 1, value);
  return copy;
}
