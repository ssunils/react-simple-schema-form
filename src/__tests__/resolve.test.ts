import { describe, it, expect } from 'vitest';
import { resolveSchema, resolveRef, mergeSchemas, getUiOptions, combinatorBranches } from '../resolve';
import { validate, resolveOptions } from '../validate';
import { getDefaultFormData } from '../utils/schema';
import type { JSONSchema } from '../types';
import refSchema from '../../examples/ref-definitions.json';
import allOfSchema from '../../examples/all-of.json';
import oneOfSchema from '../../examples/one-of.json';
import ifSchema from '../../examples/if-then-else.json';
import depSchema from '../../examples/dependencies.json';

const refs = refSchema as unknown as JSONSchema;
const allOf = allOfSchema as unknown as JSONSchema;
const oneOf = oneOfSchema as unknown as JSONSchema;
const cond = ifSchema as unknown as JSONSchema;
const deps = depSchema as unknown as JSONSchema;

describe('$ref', () => {
  it('resolves definitions, $defs and the root pointer', () => {
    expect(resolveRef('#/definitions/address', refs).properties).toHaveProperty('street');
    expect(resolveRef('#/$defs/phone', refs).pattern).toBeDefined();
    expect(resolveRef('#', refs)).toBe(refs);
    expect(() => resolveRef('#/definitions/nope', refs)).toThrow(/Cannot resolve/);
    expect(() => resolveRef('other.json#/x', refs)).toThrow(/local/);
  });

  it('decodes JSON-pointer escapes', () => {
    const root: JSONSchema = { definitions: { 'a/b': { type: 'string' }, 'c~d': { type: 'number' } } };
    expect(resolveRef('#/definitions/a~1b', root).type).toBe('string');
    expect(resolveRef('#/definitions/c~0d', root).type).toBe('number');
  });

  it('lets sibling keywords override the referenced schema', () => {
    const shipping = resolveSchema(refs.properties!.shippingAddress!, undefined, resolveOptions(refs));
    expect(shipping.title).toBe('Shipping address');
    expect(shipping.required).toEqual(['street', 'city']);
    expect(shipping.$ref).toBeUndefined();
  });

  it('validates through references', () => {
    const errors = validate(refs, { name: 'A', homeAddress: { street: 'x' }, phone: 'abc' });
    expect(errors.map((e) => `${e.path}:${e.keyword}`).sort()).toEqual(['homeAddress.city:required', 'phone:pattern']);
  });

  it('detects circular $ref chains and stops default generation on self references', () => {
    const loop: JSONSchema = { definitions: { a: { $ref: '#/definitions/b' }, b: { $ref: '#/definitions/a' } }, $ref: '#/definitions/a' };
    expect(() => resolveSchema(loop, undefined, resolveOptions(loop))).toThrow(/Circular/);

    const tree: JSONSchema = {
      type: 'object',
      properties: { label: { type: 'string', default: 'node' }, next: { $ref: '#' } },
    };
    expect(getDefaultFormData(tree)).toEqual({ label: 'node', next: { label: 'node' } });
  });
});

describe('allOf', () => {
  it('merges properties and unions required', () => {
    const resolved = resolveSchema(allOf, {}, resolveOptions(allOf));
    expect(Object.keys(resolved.properties!)).toEqual(['firstName', 'lastName', 'email', 'department', 'startDate', 'manager']);
    expect(resolved.required).toEqual(['firstName', 'lastName', 'department']);
    expect(resolved.properties!.email).toMatchObject({ format: 'email', description: expect.stringContaining('Merged') });
    expect(resolved.allOf).toBeUndefined();
  });

  it('mergeSchemas is recursive on properties', () => {
    const merged = mergeSchemas(
      { properties: { a: { type: 'object', properties: { x: { type: 'string' } } } } },
      { properties: { a: { properties: { y: { type: 'number' } } } } },
    );
    expect(Object.keys(merged.properties!.a!.properties!)).toEqual(['x', 'y']);
  });
});

describe('oneOf / anyOf', () => {
  const payment = oneOf.properties!.payment!;

  it('validates against the matching branch', () => {
    expect(validate(payment, { method: 'card', cardNumber: '4111111111111111', expiry: '12/30' }, oneOf)).toEqual([]);
    expect(validate(payment, { method: 'bank', iban: 'DE89370400440532013000' }, oneOf)).toEqual([]);
  });

  it('reports the errors of the branch the data belongs to', () => {
    const errors = validate(payment, { method: 'card' }, oneOf);
    expect(errors.map((e) => `${e.path}:${e.keyword}`).sort()).toEqual(['cardNumber:required', 'expiry:required']);
  });

  it('flags data matching more than one oneOf branch', () => {
    const ambiguous: JSONSchema = { oneOf: [{ type: 'string' }, { type: 'string', minLength: 1 }] };
    expect(validate(ambiguous, 'x').map((e) => e.keyword)).toEqual(['oneOf']);
    const any: JSONSchema = { anyOf: [{ type: 'string' }, { type: 'string', minLength: 1 }] };
    expect(validate(any, 'x')).toEqual([]);
  });

  it('turns const-only oneOf into a labelled enum', () => {
    const priority = resolveSchema(oneOf.properties!.priority!, undefined, resolveOptions(oneOf));
    expect(priority.enum).toEqual([1, 2, 3]);
    expect(priority.enumNames).toEqual(['Low', 'Normal', 'High']);
    expect(priority.oneOf).toBeUndefined();
    expect(validate(oneOf.properties!.priority!, 4, oneOf).map((e) => e.keyword)).toEqual(['enum']);
  });

  it('seeds defaults from the first branch, including discriminator consts', () => {
    expect(getDefaultFormData(payment, undefined, oneOf)).toEqual({ method: 'card' });
    expect(getDefaultFormData(payment, { method: 'invoice' }, oneOf)).toEqual({ method: 'invoice' });
  });
});

describe('validation-only combinators', () => {
  const s: JSONSchema = {
    type: 'object',
    properties: { a: { type: 'string', title: 'A' }, b: { type: 'integer', title: 'B', minimum: 1 } },
    anyOf: [{ required: ['a'] }, { required: ['b'] }],
  };

  it('anyOf of required reports one readable error naming the choices', () => {
    expect(validate(s, {})).toEqual([{ path: '', keyword: 'anyOf', message: 'Provide at least one of: A, B' }]);
    expect(validate(s, { a: 'x' })).toEqual([]);
    expect(validate(s, { b: 0 }).map((e) => e.keyword)).toEqual(['minimum']);
  });

  it('oneOf of required says exactly one', () => {
    const one: JSONSchema = { ...s, anyOf: undefined, oneOf: s.anyOf };
    expect(validate(one, {}).map((e) => e.message)).toEqual(['Provide exactly one of: A, B']);
    expect(validate(one, { a: 'x', b: 2 }).map((e) => e.message)).toEqual(['Choose only one of: A, B']);
  });

  it('is flagged validationOnly so the form renders no branch selector', () => {
    expect(combinatorBranches(s)?.validationOnly).toBe(true);
    expect(combinatorBranches({ anyOf: [{ type: 'string' }, { required: ['x'] }] })?.validationOnly).toBe(false);
  });
});

describe('if / then / else', () => {
  const opts = resolveOptions(cond);

  it('applies then for a matching condition', () => {
    const us = resolveSchema(cond, { country: 'US' }, opts);
    expect(us.properties).toHaveProperty('state');
    expect(us.properties!.postalCode!.title).toBe('ZIP code');
    expect(us.required).toEqual(['country', 'state', 'postalCode']);
  });

  it('applies nested else branches', () => {
    const ca = resolveSchema(cond, { country: 'CA' }, opts);
    expect(ca.properties).toHaveProperty('province');
    expect(ca.properties).not.toHaveProperty('state');
    const other = resolveSchema(cond, { country: 'Other' }, opts);
    expect(other.properties).not.toHaveProperty('province');
    expect(other.required).toEqual(['country']);
  });

  it('validates conditionally', () => {
    expect(validate(cond, { country: 'US', state: 'CA', postalCode: '1234' }).map((e) => `${e.path}:${e.keyword}`)).toEqual(['postalCode:pattern']);
    expect(validate(cond, { country: 'Other', postalCode: '1234' })).toEqual([]);
    expect(validate(cond, { country: 'Other', subscribe: true }).map((e) => e.path)).toEqual(['frequency']);
  });
});

describe('dependencies', () => {
  const opts = resolveOptions(deps);

  it('property dependencies add required keys only when the trigger is present', () => {
    expect(resolveSchema(deps, {}, opts).required).toEqual(['name']);
    expect(resolveSchema(deps, { creditCard: '4111111111111111' }, opts).required).toContain('billingAddress');
    expect(validate(deps, { name: 'A', creditCard: '4111111111111111' }).map((e) => e.path)).toEqual(['billingAddress']);
  });

  it('schema dependencies merge in extra fields', () => {
    expect(resolveSchema(deps, {}, opts).properties).not.toHaveProperty('petName');
    const withPet = resolveSchema(deps, { hasPet: true }, opts);
    expect(withPet.properties).toHaveProperty('petName');
    expect(withPet.required).toContain('petName');
  });

  it('supports dependentRequired / dependentSchemas too', () => {
    const s: JSONSchema = {
      type: 'object',
      properties: { a: { type: 'string' }, b: { type: 'string' } },
      dependentRequired: { a: ['b'] },
      dependentSchemas: { b: { properties: { c: { type: 'string' } } } },
    };
    expect(validate(s, { a: 'x' }).map((e) => e.path)).toEqual(['b']);
    expect(resolveSchema(s, { b: 'y' }, resolveOptions(s)).properties).toHaveProperty('c');
  });
});

describe('getUiOptions', () => {
  it('reads inline ui:* keywords and lets the external uiSchema override them', () => {
    const schema: JSONSchema = { type: 'string', 'ui:widget': 'epoch', 'ui:help': 'inline', 'ui:props': { a: 1 } };
    expect(getUiOptions(schema, 'x', {})).toEqual({ widget: 'epoch', help: 'inline', props: { a: 1 } });
    expect(getUiOptions(schema, 'x', { x: { help: 'external', props: { b: 2 } } })).toEqual({
      widget: 'epoch',
      help: 'external',
      props: { a: 1, b: 2 },
    });
  });
});
