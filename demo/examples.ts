import type { JSONSchema, UiSchema } from 'react-simple-schema-form';
import basic from '../schema.json';
import refDefinitions from '../examples/ref-definitions.json';
import allOf from '../examples/all-of.json';
import oneOf from '../examples/one-of.json';
import ifThenElse from '../examples/if-then-else.json';
import dependencies from '../examples/dependencies.json';
import uiWidgets from '../examples/ui-widgets.json';
import widgetSelection from '../examples/widget-selection.json';

export interface Example {
  name: string;
  schema: JSONSchema;
  uiSchema: UiSchema;
}

// JSON imports get a literal type that TS can't always reconcile with `JSONSchema`.
const asSchema = (json: unknown) => json as JSONSchema;

export const examples: Example[] = [
  {
    name: 'Basic (schema.json)',
    schema: asSchema(basic),
    uiSchema: {},
  },
  { name: '$ref & definitions', schema: asSchema(refDefinitions), uiSchema: {} },
  { name: 'allOf', schema: asSchema(allOf), uiSchema: {} },
  { name: 'oneOf / anyOf', schema: asSchema(oneOf), uiSchema: { 'payment.cardNumber': { placeholder: '4111 1111 1111 1111' } } },
  { name: 'if / then / else', schema: asSchema(ifThenElse), uiSchema: {} },
  { name: 'dependencies', schema: asSchema(dependencies), uiSchema: {} },
  {
    name: 'ui:* hints & epoch widget',
    schema: asSchema(uiWidgets),
    uiSchema: { endsAt: { help: 'This help text comes from the external uiSchema, not the schema.' } },
  },
  {
    name: 'Widget selection (globs, resolveWidget)',
    schema: asSchema(widgetSelection),
    uiSchema: {
      'tags.*': { widget: 'textarea', placeholder: 'Applied to every tag via the tags.* glob', props: { rows: 1 } },
      '**.postalCode': { placeholder: 'e.g. 0150', help: 'Set once via the `**.postalCode` glob, applied to both addresses.' },
      endsAt: { widget: 'epoch' },
    },
  },
];
