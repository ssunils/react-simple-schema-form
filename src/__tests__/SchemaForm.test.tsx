import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SchemaForm } from '../SchemaForm';
import type { JSONSchema, Widget } from '../types';
import userSchema from '../../schema.json';
import { demoWidgets } from '../../demo/widgets';

const schema = userSchema as JSONSchema;

describe('SchemaForm', () => {
  it('renders a control for every property in schema.json', () => {
    render(<SchemaForm schema={schema} widgets={demoWidgets} />);
    expect(screen.getByLabelText(/^Name/)).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText(/^Age/)).toHaveAttribute('type', 'number');
    expect(screen.getByLabelText(/^Bio/)).toHaveAttribute('type', 'text');
    const role = screen.getByLabelText(/^Role/);
    expect(role.tagName).toBe('SELECT');
    expect(within(role).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Select…', 'Admin', 'Editor', 'Viewer',
    ]);
    // `address` is a $ref to #/definitions/address
    expect(screen.getByText('Address')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Street/)).toBeRequired();
    expect(screen.getByLabelText(/^Postal code/)).not.toBeRequired();
    // `schedule` uses the `scheduler` object widget: only its toggle shows until enabled
    expect(screen.getByLabelText(/^Enable schedule/)).not.toBeChecked();
    expect(screen.queryByLabelText(/^Monday/)).toBeNull();
  });

  describe('optional scheduler validated only while enabled', () => {
    it('submits with the scheduler off, even though its settings are empty', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<SchemaForm schema={schema} widgets={demoWidgets} onSubmit={onSubmit} />);
      await user.type(screen.getByLabelText(/^Name/), 'Ada');
      await user.type(screen.getByLabelText(/^Email/), 'ada@example.com');
      await user.click(screen.getByRole('button', { name: 'Submit' }));
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ schedule: { enabled: false } }));
    });

    it('once enabled, the then-branch fields become required, block submit, and use the nested-uiSchema widgets', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      const onError = vi.fn();
      render(<SchemaForm schema={schema} widgets={demoWidgets} onSubmit={onSubmit} onError={onError} />);
      await user.type(screen.getByLabelText(/^Name/), 'Ada');
      await user.type(screen.getByLabelText(/^Email/), 'ada@example.com');

      await user.click(screen.getByLabelText(/^Enable schedule/));
      expect(screen.getByLabelText(/^Monday/)).toBeRequired();
      expect(screen.getByLabelText(/^Tuesday/)).toBeRequired();
      expect(screen.getByLabelText(/^Wednesday/)).not.toBeRequired();
      expect(screen.getByLabelText(/^Monday/)).toHaveAttribute('type', 'time'); // timePicker via nested uiSchema

      await user.click(screen.getByRole('button', { name: 'Submit' }));
      expect(onSubmit).not.toHaveBeenCalled();
      expect(onError.mock.calls[0]![0].map((e: { path: string }) => e.path).sort()).toEqual(['schedule.monday', 'schedule.tuesday']);
      expect(screen.getByText('2 settings need attention')).toBeInTheDocument();

      await user.type(screen.getByLabelText(/^Monday/), '09:00');
      await user.type(screen.getAllByLabelText('End time')[0]!, '17:00');
      await user.type(screen.getByLabelText(/^Tuesday/), '10:00');
      await user.type(screen.getAllByLabelText('End time')[1]!, '16:00');
      await user.click(screen.getByRole('button', { name: 'Submit' }));
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ schedule: { enabled: true, monday: '09:00-17:00', tuesday: '10:00-16:00' } }));
    });

    it('turning the scheduler back off lifts the requirements and clears half-entered values', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<SchemaForm schema={schema} widgets={demoWidgets} onSubmit={onSubmit} />);
      await user.type(screen.getByLabelText(/^Name/), 'Ada');
      await user.type(screen.getByLabelText(/^Email/), 'ada@example.com');
      await user.click(screen.getByLabelText(/^Enable schedule/));
      await user.type(screen.getByLabelText(/^Monday/), '09:00');
      await user.click(screen.getByLabelText(/^Enable schedule/));
      expect(screen.queryByLabelText(/^Monday/)).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Submit' }));
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ schedule: { enabled: false } }));
    });
  });

  it('marks required fields', () => {
    render(<SchemaForm schema={schema} widgets={demoWidgets} />);
    expect(screen.getByLabelText(/^Name/)).toBeRequired();
    expect(screen.getByLabelText(/^Bio/)).not.toBeRequired();
  });

  it('blocks submit with errors, then submits typed data when valid', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const onError = vi.fn();
    render(<SchemaForm schema={schema} widgets={demoWidgets} onSubmit={onSubmit} onError={onError} />);

    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
    expect(screen.getAllByRole('alert')).toHaveLength(2);
    expect(screen.getByLabelText(/^Name/)).toHaveFocus();

    await user.type(screen.getByLabelText(/^Name/), 'Ada');
    await user.type(screen.getByLabelText(/^Email/), 'ada@example.com');
    await user.type(screen.getByLabelText(/^Age/), '36');
    await user.selectOptions(screen.getByLabelText(/^Role/), 'Editor');
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onSubmit).toHaveBeenCalledWith({ name: 'Ada', email: 'ada@example.com', age: 36, role: 'Editor', address: {}, schedule: { enabled: false } });
  });

  it('only shows a field error after it is touched', async () => {
    const user = userEvent.setup();
    render(<SchemaForm schema={schema} widgets={demoWidgets} />);
    const email = screen.getByLabelText(/^Email/);
    await user.type(email, 'nope');
    expect(screen.queryByRole('alert')).toBeNull();
    await user.tab();
    expect(screen.getByRole('alert')).toHaveTextContent('Must be a valid email');
  });

  it('supports controlled usage', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const { rerender } = render(<SchemaForm schema={schema} widgets={demoWidgets} value={{ name: 'A' }} onChange={onChange} />);
    await user.type(screen.getByLabelText(/^Name/), 'd');
    expect(onChange).toHaveBeenLastCalledWith({ name: 'Ad' }, expect.any(Array));
    // Parent didn't update value, so the input stays at the controlled value.
    expect(screen.getByLabelText(/^Name/)).toHaveValue('A');
    rerender(<SchemaForm schema={schema} widgets={demoWidgets} value={{ name: 'Ad' }} onChange={onChange} />);
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Ad');
  });

  it('honours uiSchema widget overrides and custom widgets', () => {
    const Stars: Widget<number | undefined> = ({ id, value, onChange }) => (
      <input id={id} data-testid="stars" value={value ?? ''} onChange={(e) => onChange(Number(e.target.value))} />
    );
    render(
      <SchemaForm
        schema={schema}
        uiSchema={{ bio: { widget: 'textarea', placeholder: 'Tell us…' }, age: { widget: 'stars' }, role: { widget: 'radio' } }}
        widgets={{ ...demoWidgets, stars: Stars }}
      />,
    );
    expect(screen.getByLabelText(/^Bio/).tagName).toBe('TEXTAREA');
    expect(screen.getByPlaceholderText('Tell us…')).toBeInTheDocument();
    expect(screen.getByTestId('stars')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('renders nested objects and editable arrays', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    const nested: JSONSchema = {
      type: 'object',
      properties: {
        address: {
          type: 'object',
          title: 'Address',
          properties: { city: { type: 'string', title: 'City' } },
        },
        tags: { type: 'array', title: 'Tags', items: { type: 'string', title: 'Tag' } },
        perms: { type: 'array', title: 'Perms', uniqueItems: true, items: { type: 'string', enum: ['read', 'write'] } },
      },
    };
    render(<SchemaForm schema={nested} onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText(/^City/), 'Oslo');
    await user.click(screen.getByRole('button', { name: '+ Add Tag' }));
    await user.click(screen.getByRole('button', { name: '+ Add Tag' }));
    await user.type(screen.getByLabelText('Tags 1'), 'one');
    await user.type(screen.getByLabelText('Tags 2'), 'two');
    await user.click(screen.getAllByRole('button', { name: 'Remove' })[0]!);
    await user.click(screen.getByLabelText('write'));
    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(onSubmit).toHaveBeenCalledWith({ address: { city: 'Oslo' }, tags: ['two'], perms: ['write'] });
  });

  it('uses schema defaults as initial values', () => {
    const s: JSONSchema = {
      type: 'object',
      properties: { name: { type: 'string', title: 'Name', default: 'Anon' }, ok: { type: 'boolean', title: 'OK', default: true } },
    };
    render(<SchemaForm schema={s} />);
    expect(screen.getByLabelText(/^Name/)).toHaveValue('Anon');
    expect(screen.getByLabelText(/^OK/)).toBeChecked();
  });
});
