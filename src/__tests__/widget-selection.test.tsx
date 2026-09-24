import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SchemaForm } from '../SchemaForm';
import { Field } from '../fields/Field';
import { useFormContext } from '../context';
import { getUiOptions, matchesPath } from '../resolve';
import type { JSONSchema, Widget, ResolveWidget } from '../types';

describe('matchesPath', () => {
  it.each([
    ['tags.*', 'tags.0', true],
    ['tags.*', 'tags.0.name', false],
    ['*.street', 'home.street', true],
    ['*.street', 'home.old.street', false],
    ['**.street', 'home.old.street', true],
    ['**.street', 'street', true],
    ['home.**', 'home', true],
    ['home.**', 'home.a.b', true],
    ['**', 'anything.at.all', true],
    ['a.*.c', 'a.b.c', true],
    ['a.*.c', 'a.c', false],
  ])('%s vs %s → %s', (pattern, path, expected) => {
    expect(matchesPath(pattern, path)).toBe(expected);
  });
});

describe('getUiOptions precedence', () => {
  const schema: JSONSchema = { type: 'string', 'ui:widget': 'inline', 'ui:help': 'inline help' };

  it('exact > single-star > double-star > inline', () => {
    expect(getUiOptions(schema, 'a.b', {}).widget).toBe('inline');
    expect(getUiOptions(schema, 'a.b', { '**': { widget: 'deep' } }).widget).toBe('deep');
    expect(getUiOptions(schema, 'a.b', { '**': { widget: 'deep' }, '*.b': { widget: 'star' } }).widget).toBe('star');
    expect(
      getUiOptions(schema, 'a.b', { '**': { widget: 'deep' }, '*.b': { widget: 'star' }, 'a.b': { widget: 'exact' } }).widget,
    ).toBe('exact');
  });

  it('more literal segments beat fewer', () => {
    expect(getUiOptions(schema, 'a.b.c', { '**.c': { widget: 'x' }, 'a.**.c': { widget: 'y' } }).widget).toBe('y');
  });

  it('merges options per key, so a glob can add help while an exact key sets the widget', () => {
    const out = getUiOptions(schema, 'a.b', { '**': { help: 'glob help', props: { a: 1 } }, 'a.b': { widget: 'w', props: { b: 2 } } });
    expect(out).toEqual({ widget: 'w', help: 'glob help', props: { a: 1, b: 2 } });
  });
});

const Tag: Widget<string | undefined> = ({ id, value, onChange }) => (
  <input id={id} data-testid="tag" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
);
const Epoch: Widget<number | undefined> = ({ id, value, onChange, errors }) => (
  <input id={id} data-testid="epoch" data-errors={errors.length} value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))} />
);

const schema: JSONSchema = {
  type: 'object',
  definitions: {
    address: {
      type: 'object',
      properties: { street: { type: 'string', title: 'Street' }, postalCode: { type: 'string', title: 'Postal code', minLength: 3 } },
      required: ['street'],
    },
  },
  properties: {
    tags: { type: 'array', title: 'Tags', items: { type: 'string', title: 'Tag' }, minItems: 2 },
    home: { $ref: '#/definitions/address', title: 'Home' },
    work: { $ref: '#/definitions/address', title: 'Work' },
    startsAt: { type: 'integer', title: 'Starts', format: 'epoch' },
    endsAt: { type: 'integer', title: 'Ends', format: 'epoch', 'ui:widget': 'text' },
  },
};

describe('validation-only combinators in the form', () => {
  it('renders both fields with no selector, and shows the rule on the object', async () => {
    const user = userEvent.setup();
    const onError = vi.fn();
    const s: JSONSchema = {
      type: 'object',
      properties: {
        contact: {
          type: 'object', title: 'Contact',
          properties: { email: { type: 'string', title: 'Email' }, phone: { type: 'string', title: 'Phone' } },
          anyOf: [{ required: ['email'] }, { required: ['phone'] }],
        },
      },
      required: ['contact'],
    };
    render(<SchemaForm schema={s} onError={onError} />);
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.getByLabelText(/^Email/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Phone/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Provide at least one of: Email, Phone');
  });
});

describe('nested uiSchema keyword', () => {
  const Time: Widget<string | undefined> = ({ id, value, onChange }) => (
    <input id={id} data-testid="time" value={value ?? ''} onChange={(e) => onChange(e.target.value)} />
  );

  it('applies hints to children by property name, accepting ui:* or plain names, and nests further', () => {
    const s: JSONSchema = {
      type: 'object',
      properties: {
        week: {
          type: 'object',
          title: 'Week',
          uiSchema: {
            mon: { 'ui:widget': 'time' },
            tue: { widget: 'time', help: 'plain names work too' },
            slots: { items: { 'ui:widget': 'time' } },
            nested: { uiSchema: { deep: { 'ui:widget': 'time' } } },
          },
          properties: {
            mon: { type: 'string', title: 'Mon' },
            tue: { type: 'string', title: 'Tue' },
            wed: { type: 'string', title: 'Wed' },
            slots: { type: 'array', title: 'Slots', minItems: 1, items: { type: 'string', title: 'Slot' } },
            nested: { type: 'object', title: 'Nested', properties: { deep: { type: 'string', title: 'Deep' } } },
          },
        },
      },
    };
    render(<SchemaForm schema={s} widgets={{ time: Time }} />);
    expect(screen.getByLabelText(/^Mon/)).toHaveAttribute('data-testid', 'time');
    expect(screen.getByLabelText(/^Tue/)).toHaveAttribute('data-testid', 'time');
    expect(screen.getByText('plain names work too')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Wed/)).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText('Slots 1')).toHaveAttribute('data-testid', 'time');
    expect(screen.getByLabelText(/^Deep/)).toHaveAttribute('data-testid', 'time');
  });

  it('lets a $ref site override the definition\'s own inline hints, while the uiSchema prop still wins overall', () => {
    const s: JSONSchema = {
      type: 'object',
      definitions: { addr: { type: 'object', properties: { street: { type: 'string', title: 'Street', 'ui:widget': 'text' } } } },
      properties: {
        home: { $ref: '#/definitions/addr', title: 'Home', uiSchema: { street: { widget: 'textarea' } } },
        work: { $ref: '#/definitions/addr', title: 'Work', uiSchema: { street: { widget: 'textarea' } } },
      },
    };
    render(<SchemaForm schema={s} uiSchema={{ 'work.street': { widget: 'text' } }} />);
    const [home, work] = screen.getAllByLabelText(/^Street/);
    expect(home!.tagName).toBe('TEXTAREA'); // nested uiSchema at the $ref site beat the definition's inline ui:widget
    expect(work!.tagName).toBe('INPUT');    // the uiSchema prop beat both
  });
});

describe('SchemaForm widget selection', () => {
  it('applies a glob to every array item and to a $ref reused twice', () => {
    render(<SchemaForm schema={schema} widgets={{ tag: Tag }} uiSchema={{ 'tags.*': { widget: 'tag' }, '**.postalCode': { widget: 'textarea' } }} />);
    expect(screen.getAllByTestId('tag')).toHaveLength(2);
    const postal = screen.getAllByLabelText(/^Postal code/);
    expect(postal).toHaveLength(2);
    postal.forEach((el) => expect(el.tagName).toBe('TEXTAREA'));
  });

  it('resolveWidget picks by rule, loses to inline ui:widget, and may return a component', () => {
    const resolveWidget: ResolveWidget = ({ schema }) => (schema.format === 'epoch' ? Epoch : undefined);
    render(<SchemaForm schema={schema} resolveWidget={resolveWidget} />);
    expect(screen.getByLabelText(/^Starts/)).toHaveAttribute('data-testid', 'epoch');
    expect(screen.getByLabelText(/^Ends/)).toHaveAttribute('type', 'text'); // inline wins
  });

  it('resolveWidget receives the default the library would have chosen', () => {
    const seen: Record<string, string | undefined> = {};
    const resolveWidget: ResolveWidget = ({ path, defaultWidget }) => {
      seen[path] = defaultWidget;
      return undefined;
    };
    render(<SchemaForm schema={schema} resolveWidget={resolveWidget} />);
    expect(seen).toMatchObject({ '': undefined, tags: undefined, 'tags.0': 'text', home: undefined, 'home.street': 'text', startsAt: 'number' });
  });

  it('uiSchema beats resolveWidget', () => {
    const resolveWidget: ResolveWidget = ({ path }) => (path === 'startsAt' ? Epoch : undefined);
    render(<SchemaForm schema={schema} resolveWidget={resolveWidget} uiSchema={{ startsAt: { widget: 'number' } }} />);
    expect(screen.getByLabelText(/^Starts/)).toHaveAttribute('type', 'number');
  });

  it('a widget on an object node receives the whole value and can render children with <Field>', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const Inline: Widget<Record<string, unknown> | undefined> = ({ path, schema, errors }) => {
      const ctx = useFormContext();
      return (
        <div data-testid={`inline-${path}`} data-errors={errors.map((e) => e.path).join(',')}>
          {Object.keys(schema.properties ?? {}).map((key) => (
            <Field key={key} schema={schema.properties![key]!} path={`${path}.${key}`} required={Boolean(schema.required?.includes(key))} />
          ))}
          <span data-testid={`count-${path}`}>{Object.keys((ctx.data as Record<string, unknown>)[path] ?? {}).length}</span>
        </div>
      );
    };
    render(<SchemaForm schema={schema} widgets={{ inline: Inline }} uiSchema={{ home: { widget: 'inline' } }} onChange={onChange} />);

    const home = screen.getByTestId('inline-home');
    expect(home).toBeInTheDocument();
    await user.type(screen.getAllByLabelText(/^Postal code/)[0]!, 'ab');
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ home: { postalCode: 'ab' } }), expect.any(Array));
    // The object-level widget sees errors from inside it: street required, postal too short.
    expect(screen.getByTestId('inline-home').getAttribute('data-errors')).toBe('home.street,home.postalCode');
    expect(screen.getByTestId('count-home')).toHaveTextContent('1');
  });

  it('errors prop lists own errors even when not yet visible', async () => {
    const user = userEvent.setup();
    render(<SchemaForm schema={{ type: 'object', properties: { n: { type: 'integer', title: 'N', minimum: 10, 'ui:widget': 'epoch' } } }} widgets={{ epoch: Epoch }} />);
    await user.type(screen.getByTestId('epoch'), '3');
    expect(screen.getByTestId('epoch')).toHaveAttribute('data-errors', '1');
  });
});
