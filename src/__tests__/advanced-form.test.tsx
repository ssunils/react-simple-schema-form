import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SchemaForm } from '../SchemaForm';
import type { JSONSchema, Widget } from '../types';
import refSchema from '../../examples/ref-definitions.json';
import oneOfSchema from '../../examples/one-of.json';
import ifSchema from '../../examples/if-then-else.json';
import depSchema from '../../examples/dependencies.json';
import uiSchemaExample from '../../examples/ui-widgets.json';

describe('SchemaForm with $ref', () => {
  it('renders the referenced definition twice with its own titles', () => {
    render(<SchemaForm schema={refSchema as unknown as JSONSchema} />);
    expect(screen.getByText('Home address')).toBeInTheDocument();
    expect(screen.getByText('Shipping address')).toBeInTheDocument();
    expect(screen.getAllByLabelText(/^Street/)).toHaveLength(2);
    expect(screen.getByLabelText(/^Phone/)).toBeInTheDocument();
  });
});

describe('SchemaForm with oneOf / anyOf', () => {
  const schema = oneOfSchema as unknown as JSONSchema;

  it('shows the first branch and switches via the branch selector', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<SchemaForm schema={schema} onChange={onChange} />);

    expect(screen.getByLabelText(/^Card number/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^IBAN/)).toBeNull();

    await user.selectOptions(screen.getByLabelText(/^Payment method/), '1');
    expect(screen.getByLabelText(/^IBAN/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Card number/)).toBeNull();
    // Switching seeds the branch's defaults, including its discriminator const.
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ payment: { method: 'bank' } }), expect.any(Array));
  });

  it('follows the discriminator when it changes inside the branch', async () => {
    const user = userEvent.setup();
    render(<SchemaForm schema={schema} />);
    await user.selectOptions(screen.getByLabelText(/^Method/), 'invoice');
    expect(screen.getByLabelText(/^PO number/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Card number/)).toBeNull();
  });

  it('renders anyOf branches with different types', async () => {
    const user = userEvent.setup();
    render(<SchemaForm schema={schema} />);
    expect(screen.getByLabelText(/^Preferred contact/).tagName).toBe('SELECT');
    expect(screen.getByLabelText(/^Email address/)).toHaveAttribute('type', 'email');
    await user.selectOptions(screen.getByLabelText(/^Preferred contact/), '1');
    expect(screen.getByLabelText(/^Number/)).toBeInTheDocument();
    expect(screen.getByLabelText(/^SMS allowed/)).toHaveAttribute('type', 'checkbox');
  });

  it('renders a const-only oneOf as a labelled select', () => {
    render(<SchemaForm schema={schema} />);
    const priority = screen.getByLabelText(/^Priority/);
    expect(priority.tagName).toBe('SELECT');
    expect(screen.getByRole('option', { name: 'High' })).toHaveValue('3');
  });

  it('submits only when the active branch is valid', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SchemaForm schema={schema} onSubmit={onSubmit} />);
    await user.selectOptions(screen.getByLabelText(/^Payment method/), '2');
    await user.type(screen.getByLabelText(/^PO number/), 'PO-1');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onSubmit).toHaveBeenCalledWith({ payment: { method: 'invoice', poNumber: 'PO-1' } });
  });
});

describe('SchemaForm with if/then/else', () => {
  it('adds and relabels fields based on another field', async () => {
    const user = userEvent.setup();
    render(<SchemaForm schema={ifSchema as unknown as JSONSchema} />);
    expect(screen.queryByLabelText(/^State/)).toBeNull();
    expect(screen.getByLabelText(/^Postal code/)).not.toBeRequired();

    await user.selectOptions(screen.getByLabelText(/^Country/), 'US');
    expect(screen.getByLabelText(/^State/)).toBeRequired();
    expect(screen.getByLabelText(/^ZIP code/)).toBeRequired();

    await user.selectOptions(screen.getByLabelText(/^Country/), 'CA');
    expect(screen.queryByLabelText(/^State/)).toBeNull();
    expect(screen.getByLabelText(/^Province/)).toBeInTheDocument();
  });

  it('reveals fields from a then branch once it activates', async () => {
    const user = userEvent.setup();
    render(<SchemaForm schema={ifSchema as unknown as JSONSchema} />);
    await user.click(screen.getByLabelText(/^Subscribe/));
    expect(screen.getByLabelText(/^Frequency/)).toBeInTheDocument();
  });
});

describe('SchemaForm with dependencies', () => {
  it('makes dependent fields required and reveals dependent schemas', async () => {
    const user = userEvent.setup();
    render(<SchemaForm schema={depSchema as unknown as JSONSchema} />);
    expect(screen.getByLabelText(/^Billing address/)).not.toBeRequired();
    await user.type(screen.getByLabelText(/^Credit card/), '4111111111111111');
    expect(screen.getByLabelText(/^Billing address/)).toBeRequired();

    expect(screen.queryByLabelText(/^Pet name/)).toBeNull();
    await user.click(screen.getByLabelText(/^I have a pet/));
    expect(screen.getByLabelText(/^Pet name/)).toBeRequired();
  });
});

describe('inline ui:* hints and custom widgets', () => {
  const Epoch: Widget<number | undefined> = ({ id, value, onChange, options }) => (
    <input id={id} data-testid="epoch" data-help={options.help} value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))} />
  );

  it('loads a custom widget named in ui:widget and merges uiSchema over inline hints', () => {
    render(
      <SchemaForm
        schema={uiSchemaExample as unknown as JSONSchema}
        widgets={{ epoch: Epoch }}
        uiSchema={{ endsAt: { help: 'external help' } }}
      />,
    );
    expect(screen.getAllByTestId('epoch')).toHaveLength(2);
    expect(screen.getByLabelText(/^Starts at/)).toHaveAttribute('data-help', expect.stringContaining('seconds since'));
    expect(screen.getByLabelText(/^Ends at/)).toHaveAttribute('data-help', 'external help');
    expect(screen.getByLabelText(/^Description/).tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText(/^Description/)).toHaveAttribute('rows', '6');
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getByPlaceholderText('e.g. Launch party')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Created by/)).toBeDisabled();
  });

  it('warns once and falls back to the default for an unregistered widget', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    render(
      <SchemaForm
        schema={{
          type: 'object',
          properties: {
            x: { type: 'string', title: 'X', 'ui:widget': 'nope' },
            o: { type: 'object', title: 'O', 'ui:widget': 'nope-obj', properties: { y: { type: 'string', title: 'Y' } } },
          },
        }}
      />,
    );
    expect(screen.getByLabelText(/^X/)).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText(/^Y/)).toBeInTheDocument(); // object rendered structurally
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('no widget registered for "nope"'));
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('"nope-obj"'));
    warn.mockRestore();
  });
});
