import { describe, it, expect } from 'vitest';
import { validate } from '../validate';
import { getDefaultFormData } from '../utils/schema';
import { setAtPath, getAtPath } from '../utils/path';
import type { JSONSchema } from '../types';
import userSchema from '../../schema.json';

const schema = userSchema as unknown as JSONSchema;

describe('validate', () => {
  it('reports missing required fields', () => {
    const errors = validate(schema, {});
    expect(errors.map((e) => e.path).sort()).toEqual(['email', 'name']);
    expect(errors.every((e) => e.keyword === 'required')).toBe(true);
  });

  it('passes valid data', () => {
    expect(validate(schema, { name: 'Ada', email: 'ada@example.com', age: 36, role: 'Admin' })).toEqual([]);
  });

  it('checks email format', () => {
    const errors = validate(schema, { name: 'Ada', email: 'not-an-email' });
    expect(errors).toEqual([{ path: 'email', keyword: 'format', message: 'Must be a valid email' }]);
  });

  it('checks integer minimum and integer-ness', () => {
    expect(validate(schema, { name: 'A', email: 'a@b.co', age: -1 }).map((e) => e.keyword)).toEqual(['minimum']);
    expect(validate(schema, { name: 'A', email: 'a@b.co', age: 1.5 }).map((e) => e.keyword)).toEqual(['type']);
  });

  it('treats an untouched optional object as absent, but validates a required one', () => {
    expect(validate(schema, { name: 'A', email: 'a@b.co', address: {} })).toEqual([]);
    expect(validate(schema, { name: 'A', email: 'a@b.co', address: { street: '', city: '' } })).toEqual([]);
    const strict: JSONSchema = { ...schema, required: ['name', 'email', 'address'] };
    expect(validate(strict, { name: 'A', email: 'a@b.co', address: {} }).map((e) => e.path)).toEqual(['address.street', 'address.city']);
    expect(validate(strict, { name: 'A', email: 'a@b.co' }).map((e) => e.path)).toEqual(['address']);
  });

  it('requires exactly one scheduler mode, only while enabled', () => {
    const base = { name: 'A', email: 'a@b.co' };
    expect(validate(schema, { ...base })).toEqual([]);
    expect(validate(schema, { ...base, schedule: {} })).toEqual([]);
    expect(validate(schema, { ...base, schedule: { enabled: false } })).toEqual([]);
    expect(validate(schema, { ...base, schedule: { enabled: true } })).toEqual([
      { path: 'schedule', keyword: 'oneOf', message: 'Provide exactly one of: Run at, Repeat every' },
    ]);
    expect(validate(schema, { ...base, schedule: { enabled: true, runAt: 1, intervalMs: 5000 } })).toEqual([
      { path: 'schedule', keyword: 'oneOf', message: 'Choose only one of: Run at, Repeat every' },
    ]);
    expect(validate(schema, { ...base, schedule: { enabled: true, intervalMs: 500 } }).map((e) => `${e.path}:${e.keyword}`)).toEqual(['schedule.intervalMs:minimum']);
    expect(validate(schema, { ...base, schedule: { enabled: true, runAt: 1 } })).toEqual([]);
  });

  it('validates the $ref address definition', () => {
    const errors = validate(schema, { name: 'A', email: 'a@b.co', address: { street: '1 Main St', postalCode: '!' } });
    expect(errors.map((e) => `${e.path}:${e.keyword}`).sort()).toEqual(['address.city:required', 'address.postalCode:pattern']);
    expect(validate(schema, { name: 'A', email: 'a@b.co', address: { street: '1 Main St', city: 'Oslo' } })).toEqual([]);
  });

  it('checks enum membership', () => {
    expect(validate(schema, { name: 'A', email: 'a@b.co', role: 'Owner' }).map((e) => e.keyword)).toEqual(['enum']);
  });

  it('validates string length and pattern', () => {
    const s: JSONSchema = { type: 'string', minLength: 2, maxLength: 4, pattern: '^[a-z]+$' };
    expect(validate(s, 'a').map((e) => e.keyword)).toEqual(['minLength']);
    expect(validate(s, 'abcde').map((e) => e.keyword)).toEqual(['maxLength']);
    expect(validate(s, 'AB').map((e) => e.keyword)).toEqual(['pattern']);
    expect(validate(s, 'abc')).toEqual([]);
  });

  it('validates nested objects and arrays with paths', () => {
    const s: JSONSchema = {
      type: 'object',
      required: ['address'],
      properties: {
        address: {
          type: 'object',
          required: ['city'],
          properties: { city: { type: 'string' } },
        },
        tags: { type: 'array', minItems: 1, uniqueItems: true, items: { type: 'string', minLength: 2 } },
      },
    };
    const errors = validate(s, { address: {}, tags: ['a', 'a'] });
    expect(errors.map((e) => `${e.path}:${e.keyword}`).sort()).toEqual([
      'address.city:required',
      'tags.0:minLength',
      'tags.1:minLength',
      'tags:uniqueItems',
    ]);
  });

  it('validates numeric bounds', () => {
    const s: JSONSchema = { type: 'number', exclusiveMinimum: 0, maximum: 10, multipleOf: 0.5 };
    expect(validate(s, 0).map((e) => e.keyword)).toEqual(['exclusiveMinimum']);
    expect(validate(s, 11).map((e) => e.keyword)).toEqual(['maximum']);
    expect(validate(s, 0.3).map((e) => e.keyword)).toEqual(['multipleOf']);
    expect(validate(s, 2.5)).toEqual([]);
  });
});

describe('getDefaultFormData', () => {
  it('walks defaults through nested schemas and honours minItems', () => {
    const s: JSONSchema = {
      type: 'object',
      properties: {
        name: { type: 'string', default: 'Anon' },
        prefs: { type: 'object', properties: { dark: { type: 'boolean', default: true } } },
        tags: { type: 'array', minItems: 2, items: { type: 'string', default: 'x' } },
      },
    };
    expect(getDefaultFormData(s)).toEqual({ name: 'Anon', prefs: { dark: true }, tags: ['x', 'x'] });
  });

  it('lets a seed override schema defaults', () => {
    const s: JSONSchema = { type: 'object', properties: { name: { type: 'string', default: 'Anon' } } };
    expect(getDefaultFormData(s, { name: 'Ada' })).toEqual({ name: 'Ada' });
  });
});

describe('path utils', () => {
  it('sets nested paths immutably', () => {
    const original = { a: { b: [1, 2] } };
    const next = setAtPath(original, 'a.b.1', 9);
    expect(next).toEqual({ a: { b: [1, 9] } });
    expect(original).toEqual({ a: { b: [1, 2] } });
    expect(getAtPath(next, 'a.b.1')).toBe(9);
  });

  it('creates intermediate containers', () => {
    expect(setAtPath({}, 'x.0.y', 'z')).toEqual({ x: [{ y: 'z' }] });
  });
});
