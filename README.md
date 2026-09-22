# react-simple-schema-form

Generate React forms from [JSON Schema](https://json-schema.org/) (draft-07 subset). Zero runtime dependencies beyond React.

**[Live demo →](https://ssunils.github.io/react-simple-schema-form/)** — pick an example, edit the schema and uiSchema, watch the form regenerate.

```sh
npm install react-simple-schema-form
```

```tsx
import { SchemaForm } from 'react-simple-schema-form';
import 'react-simple-schema-form/styles.css'; // optional default styles
import schema from './schema.json';

<SchemaForm
  schema={schema}
  uiSchema={{ bio: { widget: 'textarea' } }}
  onSubmit={(data) => console.log(data)}
/>
```

## Scripts

| Command             | What it does                                  |
| ------------------- | --------------------------------------------- |
| `npm run dev`       | Vite playground at `demo/` — pick an example from `examples/`, edit the schema and uiSchema live |
| `npm test`          | Vitest unit + rendering tests                 |
| `npm run typecheck` | `tsc --noEmit`                                |
| `npm run build`     | ESM + CJS + `.d.ts` + `styles.css` into `dist/` |
| `npm run build:demo`| Static demo into `docs/` (served by GitHub Pages) |

## Supported schema keywords

| Type              | Keywords                                                                     | Default widget |
| ----------------- | ---------------------------------------------------------------------------- | -------------- |
| `string`          | `format` (email, uri/url, date, date-time, time, password, color), `minLength`, `maxLength`, `pattern`, `enum` | `text` / by format / `select` |
| `number`/`integer`| `minimum`, `maximum`, `exclusiveMinimum`, `exclusiveMaximum`, `multipleOf`, `enum` | `number` / `select` |
| `boolean`         |                                                                              | `checkbox`     |
| `object`          | `properties`, `required`                                                     | fieldset (nested) |
| `array`           | `items`, `minItems`, `maxItems`, `uniqueItems`                               | add/remove/reorder list; `checkboxes` when `items.enum` |
| any               | `title`, `description`, `default`, `const`, `readOnly`, `enumNames`          |                |

### Composition, references and conditionals

| Keyword | Behaviour | Example |
| ------- | --------- | ------- |
| `$ref` | Local JSON pointers (`#/definitions/x`, `#/$defs/x`, `#`). Sibling keywords override the target. Circular chains throw; self-referencing properties stop default generation at the cycle. | [examples/ref-definitions.json](examples/ref-definitions.json) |
| `allOf` | Parts are deep-merged: `properties` recursively, `required` unioned, later parts override scalars. | [examples/all-of.json](examples/all-of.json) |
| `oneOf` / `anyOf` | Rendered as a branch selector plus the chosen branch. Keywords next to the combinator (shared `properties`, `required`) apply to every branch. If a branch has a `const` discriminator, changing that field switches the branch automatically. A combinator whose branches are all `const` becomes a labelled select. | [examples/one-of.json](examples/one-of.json) |
| `if` / `then` / `else` | Evaluated against the current data on every change; `then`/`else` are merged in. Nest inside `allOf` for several independent conditions. | [examples/if-then-else.json](examples/if-then-else.json) |
| `dependencies` | Property form (`{"a": ["b"]}`) adds `required`; schema form merges a sub-schema. `dependentRequired` / `dependentSchemas` (2019-09) work the same way. Only active when the trigger property is non-empty. | [examples/dependencies.json](examples/dependencies.json) |

**Recipe — an optional section that is validated only once enabled.** Put the toggle *inside* the object as a boolean and hang the requirements off it with `if`/`then`. An optional object that nobody has touched is treated as absent (no errors); once the toggle is on the object is present and the `then` requirements apply. See `schedule` in [schema.json](schema.json) and the demo's [SchedulerWidget](demo/widgets/SchedulerWidget.tsx), which renders the toggle, hides the settings while off, and resets the object to `{ enabled: false }` on disable so half-entered values can never block submission:

```jsonc
"schedule": {
  "type": "object",
  "ui:widget": "scheduler",
  "uiSchema": { "monday": { "ui:widget": "timePicker" }, "tuesday": { "ui:widget": "timePicker" } },
  "properties": {
    "enabled": { "type": "boolean", "title": "Enable schedule", "default": false },
    "monday":  { "type": "string", "pattern": "^\\d{2}:\\d{2}-\\d{2}:\\d{2}$" },
    "tuesday": { "type": "string", "pattern": "^\\d{2}:\\d{2}-\\d{2}:\\d{2}$" }
  },
  "if":   { "properties": { "enabled": { "const": true } }, "required": ["enabled"] },
  "then": { "required": ["monday", "tuesday"] }
}
```
The `"required": ["enabled"]` inside `if` matters: without it an object with no `enabled` key at all would satisfy the condition.

Validation follows the same resolution: for `oneOf`/`anyOf` the errors shown are those of the branch the data belongs to (matched on everything except `required`), so users get field-level messages rather than a bare "no match".

Not supported: remote `$ref`s, `not`, `additionalProperties` as a schema, `patternProperties`, `contains`.

### Choosing widgets

Precedence, highest first:

1. **`uiSchema` prop** — exact path, then globs from most to least specific
2. **parent's nested `uiSchema` keyword** (see below) — folded onto the child during resolution
3. **inline `ui:widget`** on the schema node
4. **`resolveWidget` prop** — a rule function
5. built-in default from `type` / `format` / `enum`

The app's `uiSchema` always beats the schema, so a field can be restyled without editing a schema that may be shared or served by a backend.

**Globs in `uiSchema` keys** cover arrays and reused `$ref`s without listing every path:

```ts
uiSchema={{
  'tags.*':        { widget: 'tag' },       // every item of tags
  '*.street':      { placeholder: '…' },    // street in any top-level object
  '**.postalCode': { widget: 'postal' },    // postalCode at any depth
}}
```
`*` matches one segment, `**` any number. When several keys match, the most specific wins per option (exact > more literal segments > `*` > `**`); options from different keys merge, so a glob can add `help` while an exact key sets `widget`.

**`resolveWidget`** selects by rule and sees the fully resolved schema:

```tsx
const resolveWidget: ResolveWidget = ({ schema, path, defaultWidget }) => {
  if (schema.format === 'epoch') return 'epoch';         // a registered name
  if (schema['x-widget']) return schema['x-widget'];     // your own keyword
  if (path.endsWith('.notes')) return NotesWidget;       // or a component directly
  return undefined;                                      // fall through to defaults
};
<SchemaForm schema={schema} widgets={{ epoch: EpochWidget }} resolveWidget={resolveWidget} />
```
`defaultWidget` is what the library would pick on its own — `undefined` for objects and non-enum arrays, which otherwise render structurally.

**Nested `uiSchema` keyword.** An object node can carry hints for its children keyed by property name (`items` for arrays), nesting as deep as needed. Entries accept `ui:*` or plain option names. They are folded onto the children during resolution and override the children's own inline `ui:*`, so a `$ref` site can restyle the definition it points at:

```jsonc
"schedule": {
  "type": "object",
  "ui:widget": "scheduler",                  // widget for the object itself
  "uiSchema": {
    "monday":  { "ui:widget": "timePicker" }, // hints for its children
    "tuesday": { "widget": "timePicker" }     // plain names work too
  },
  "properties": { "monday": { "type": "string" }, "tuesday": { "type": "string" } }
}
```
This is the shape of `schedule` in [schema.json](schema.json).

**Unregistered names** don't break the form: the library warns once in the console and renders the built-in default for that field (structurally, for objects and arrays).

**Widgets on object/array nodes.** Selecting a widget for an object or array replaces the default fieldset/list. The widget gets the whole value, and can render children itself with the exported `<Field>` (see [InlineAddressWidget](demo/widgets/InlineAddressWidget.tsx)). `props.errors` contains the errors of the node *and its descendants*, regardless of touched state, so such a widget can summarise what's wrong inside; `props.invalid` stays the "should show an error now" flag.

### UI hints: `uiSchema` prop and inline `ui:*` keywords

The same options can live in either place; the `uiSchema` prop wins when both are set.

```jsonc
// inline, in the schema itself
{ "type": "integer", "title": "Starts at", "ui:widget": "epoch", "ui:help": "Unix seconds" }
```
```tsx
// external, keyed by dot path
<SchemaForm schema={schema} uiSchema={{ startsAt: { widget: 'epoch', help: 'Unix seconds' } }} />
```

Options: `widget`, `placeholder`, `help`, `disabled`, `props` (forwarded to the widget element; `props` objects from both sources merge). See [examples/ui-widgets.json](examples/ui-widgets.json) and [examples/widget-selection.json](examples/widget-selection.json).

## `<SchemaForm>` props

| Prop           | Type                                      | Notes |
| -------------- | ----------------------------------------- | ----- |
| `schema`       | `JSONSchema`                              | Required. |
| `uiSchema`     | `Record<path, UiFieldOptions>`            | Keyed by dot path (`address.city`, `tags.0`). Options: `widget`, `placeholder`, `help`, `disabled`, `props`. |
| `value`        | `T`                                       | Controlled data; pair with `onChange`. |
| `defaultValue` | `Partial<T>`                              | Uncontrolled initial data, merged with schema `default`s. |
| `onChange`     | `(data, errors) => void`                  | Fires on every edit with the fresh validation result. |
| `onSubmit`     | `(data) => void`                          | Only called when there are no validation errors. |
| `onError`      | `(errors) => void`                        | Called on submit when invalid; the first invalid field is focused. |
| `widgets`      | `Record<string, Widget>`                  | Add or replace widgets by name. |
| `resolveWidget`| `(ctx) => name \| Widget \| undefined`     | Rule-based widget selection; see *Choosing widgets*. |
| `disabled` / `readOnly` | `boolean`                        | |
| `id`           | `string`                                  | Id prefix; set it when rendering more than one form per page. |
| `submitLabel`  | `string`                                  | Default `"Submit"`. |
| `children`     | `ReactNode`                               | Replace the submit button; pass `null` to omit it. |

Field errors are shown once a field is blurred, or for every field after a submit attempt.

## Custom widgets

A widget is a component receiving `WidgetProps<T>`. Register it under a name with the `widgets` prop, then reference that name from `ui:widget` or `uiSchema`. The demo's [EpochWidget](demo/widgets/EpochWidget.tsx) stores a Unix timestamp (`type: integer`) but renders a `datetime-local` picker:

```tsx
import { SchemaForm, type Widget } from 'react-simple-schema-form';

const EpochWidget: Widget<number | undefined> = ({ id, value, onChange, onBlur, disabled }) => (
  <input
    type="datetime-local"
    id={id}
    disabled={disabled}
    value={value === undefined ? '' : new Date(value * 1000).toISOString().slice(0, 16)}
    onBlur={onBlur}
    onChange={(e) => {
      const ms = new Date(e.target.value).getTime();
      onChange(Number.isNaN(ms) ? undefined : Math.floor(ms / 1000));
    }}
  />
);

<SchemaForm
  schema={{ type: 'object', properties: { startsAt: { type: 'integer', 'ui:widget': 'epoch' } } }}
  widgets={{ epoch: EpochWidget }}
/>
```

Another example, overriding the number widget with a range slider:

```tsx
import type { Widget } from 'react-simple-schema-form';

const Slider: Widget<number | undefined> = ({ id, value, onChange, onBlur, schema, disabled }) => (
  <input
    type="range"
    id={id}
    min={schema.minimum}
    max={schema.maximum}
    value={value ?? schema.minimum ?? 0}
    disabled={disabled}
    onBlur={onBlur}
    onChange={(e) => onChange(Number(e.target.value))}
  />
);

<SchemaForm schema={schema} widgets={{ slider: Slider }} uiSchema={{ age: { widget: 'slider' } }} />
```

Built-in widget names: `text`, `email`, `password`, `url`, `date`, `datetime`, `time`, `color`, `textarea`, `number`, `checkbox`, `select`, `radio`, `checkboxes`, `hidden`. Overriding one of these in `widgets` changes the default for every field that resolves to it.

## Standalone helpers

```ts
import { validate, getDefaultFormData, resolveSchema, resolveOptions } from 'react-simple-schema-form';

validate(schema, data);                              // FieldError[] — { path, keyword, message }
getDefaultFormData(schema);                          // initial data from `default` / `minItems` / `const`
resolveSchema(node, data, resolveOptions(root));     // flatten $ref/allOf/if/dependencies for this data
```

## Styling

All elements carry `sf-*` class names (`sf-form`, `sf-field`, `sf-field--error`, `sf-label`, `sf-input`, `sf-select`, `sf-error`, `sf-object`, `sf-array`, `sf-btn`, …). The shipped `styles.css` is a small, theme-agnostic default driven by CSS variables (`--sf-border`, `--sf-border-focus`, `--sf-error`, `--sf-radius`); skip the import to bring your own.
