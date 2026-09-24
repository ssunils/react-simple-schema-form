---
name: react-simple-schema-form
description: Build React forms from JSON Schema with react-simple-schema-form. Use when a task involves rendering a form from a JSON Schema (draft-07), validating form data against a schema, conditional/required fields (if/then/else, dependencies, oneOf), reusing definitions ($ref), or registering custom widgets via uiSchema.
license: MIT
---

# react-simple-schema-form

Generates a React form from a JSON Schema (draft-07 subset). Zero runtime dependencies beyond React 18+.
Package: `react-simple-schema-form` · Repo: https://github.com/ssunils/react-simple-schema-form · Demo: https://ssunils.github.io/react-simple-schema-form/

## Install and minimal use

```sh
npm install react-simple-schema-form
```

```tsx
import { SchemaForm } from 'react-simple-schema-form';
import 'react-simple-schema-form/styles.css'; // optional default styles

<SchemaForm
  schema={schema}                       // JSONSchema object
  uiSchema={{ bio: { widget: 'textarea' } }}
  onSubmit={(data) => save(data)}       // only called when valid
  onError={(errors) => {}}              // called on submit when invalid
  onChange={(data, errors) => {}}       // every edit, with fresh validation
/>
```

`value` + `onChange` makes it controlled; `defaultValue` seeds an uncontrolled form (merged with schema `default`s).
`validate={(data, schemaErrors) => FieldError[]}` adds cross-field rules JSON Schema cannot express (end after start); they show under their `path` and block submit.
Errors are shown per field after blur, or for every field after a submit attempt. First invalid field is focused on submit.

## What the schema can contain

- Types: `string` (formats email, uri/url, date, date-time, time, password, color), `number`/`integer`, `boolean`, `object`, `array`, `enum`, `const`, `enumNames`.
- Constraints: `required`, `minLength`/`maxLength`/`pattern`, `minimum`/`maximum`/`exclusive*`/`multipleOf`, `minItems`/`maxItems`/`uniqueItems`, `default`, `readOnly`, `title`, `description`.
- `$ref` — local pointers only (`#/definitions/x`, `#/$defs/x`, `#`). Sibling keywords override the target.
- `allOf` — deep-merged (properties recursively, required unioned).
- `oneOf` / `anyOf` — rendered as a branch selector + chosen branch. If a branch has a `const` discriminator, changing that field switches branches. All-`const` branches become a labelled select. Branches with only `required` (no shape) are validation-only: no selector, one error "Provide at least one of: A, B" on the node — use this for "a or b must be set".
- `if` / `then` / `else` — re-evaluated against the live data on every change. Put several conditions inside `allOf`.
- `dependencies` (draft-07), `dependentRequired` / `dependentSchemas`.
- NOT supported: remote `$ref`, `not`, `additionalProperties` as a schema, `patternProperties`, `contains`.

## Choosing widgets (precedence, highest first)

1. `uiSchema` prop, keyed by dot path; keys may be globs: `tags.*` (every item), `*.street`, `**.postalCode` (any depth). Most specific wins per option.
2. Parent node's nested `uiSchema` keyword, keyed by child property name (`items` for arrays).
3. Inline `ui:widget` / `ui:placeholder` / `ui:help` / `ui:disabled` / `ui:props` on the schema node.
4. `resolveWidget` prop: `({ schema, path, defaultWidget }) => name | Component | undefined`.
5. Built-in default by type/format/enum.

Built-in widget names: `text email password url date datetime time color textarea number checkbox select radio checkboxes hidden`.
An unregistered name warns once and falls back to the default (never throws).

## Custom widgets

```tsx
import type { Widget } from 'react-simple-schema-form';

const EpochWidget: Widget<number | undefined> = ({ id, value, onChange, onBlur, required, disabled, invalid, options, schema, errors }) => (
  <input type="datetime-local" id={id} required={required} disabled={disabled} aria-invalid={invalid || undefined}
    value={value === undefined ? '' : new Date(value * 1000).toISOString().slice(0, 16)}
    onBlur={onBlur}
    onChange={(e) => { const ms = new Date(e.target.value).getTime(); onChange(Number.isNaN(ms) ? undefined : Math.floor(ms / 1000)); }}
    {...options.props} />
);

<SchemaForm schema={schema} widgets={{ epoch: EpochWidget }} uiSchema={{ startsAt: { widget: 'epoch' } }} />
```

Rules for widget authors:
- `onChange(undefined)` for "empty"; never `''` for non-strings.
- Forward `required`, `disabled`, `readOnly`, `onBlur`, `aria-invalid`, and spread `options.props`.
- A widget on an **object/array** node replaces the fieldset/list; it receives the whole value and can render children with the exported `<Field schema={schema.properties[key]} path={`${path}.${key}`} required={...} />`. `props.errors` holds the node's and descendants' errors.
- `useFormContext()` gives `data`, `setValue(path, value)`, `touch(path)`, `rootSchema` for cross-field behaviour.

## Recipes

**Optional section validated only when enabled.** Toggle is a real boolean inside the object; requirements hang off it.
```jsonc
"schedule": {
  "type": "object",
  "properties": { "enabled": { "type": "boolean", "default": false }, "monday": { "type": "string" } },
  "if":   { "properties": { "enabled": { "const": true } }, "required": ["enabled"] },
  "then": { "required": ["monday"] }
}
```
`"required": ["enabled"]` inside `if` is essential — without it, an object with no `enabled` key satisfies the condition.
An optional object whose values are all empty is treated as absent (no errors). A required object is always validated.

**Discriminated union.**
```jsonc
{ "type": "object", "properties": { "method": { "type": "string", "enum": ["card", "bank"] } }, "required": ["method"],
  "oneOf": [
    { "title": "Card", "properties": { "method": { "const": "card" }, "number": { "type": "string" } }, "required": ["number"] },
    { "title": "Bank", "properties": { "method": { "const": "bank" }, "iban":   { "type": "string" } }, "required": ["iban"] }
  ] }
```

**Reuse a definition and restyle it at the reference site.**
```jsonc
"home": { "$ref": "#/definitions/address", "title": "Home", "uiSchema": { "street": { "widget": "textarea" } } }
```

## Standalone helpers

```ts
import { validate, getDefaultFormData, resolveSchema, resolveOptions } from 'react-simple-schema-form';
validate(schema, data)                            // FieldError[] { path, keyword, message }
getDefaultFormData(schema)                        // initial data from default/const/minItems
resolveSchema(node, data, resolveOptions(root))   // flatten $ref/allOf/if/dependencies for this data
```

## Gotchas

- Field paths are dot-separated (`address.street`, `tags.0`); error `path`s use the same form.
- Numbers are stored as numbers; an `integer` schema renders `step=1`.
- `default` inside a `then` branch is not applied when the branch activates mid-edit (defaults are computed at mount).
- Styles are opt-in (`styles.css`); every element has an `sf-*` class and the palette is CSS variables (`--sf-border`, `--sf-border-focus`, `--sf-error`, `--sf-radius`).
- Multiple forms on one page: pass distinct `id` props so generated element ids don't collide.
