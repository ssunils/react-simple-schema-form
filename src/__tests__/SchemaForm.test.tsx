import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SchemaForm } from '../SchemaForm';
import type { JSONSchema, Widget } from '../types';
import userSchema from '../../schema.json';
import { demoWidgets } from '../../demo/widgets';

const schema = userSchema as unknown as JSONSchema;

describe('SchemaForm', () => {
  it('renders a control for every property in schema.json', () => {
    render(<SchemaForm schema={schema} widgets={demoWidgets} />);
    expect(screen.getByLabelText(/^Name/)).toHaveAttribute('type', 'text');
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText(/^Age/)).toHaveAttribute('type', 'number');
    expect(screen.getByLabelText(/^Bio/).tagName).toBe('TEXTAREA'); // inline ui:widget
    const role = screen.getByLabelText(/^Role/);
    expect(role.tagName).toBe('SELECT');
    expect(within(role).getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Select…', 'Admin', 'Editor', 'Viewer',
    ]);
    // `address` is a $ref to #/definitions/address
    expect(screen.getByText('Address')).toBeInTheDocument();
    expect(screen.getByLabelText(/^Street/)).toBeRequired();
    expect(screen.getByLabelText(/^Postal code/)).not.toBeRequired();
    // `schedule` uses the `scheduler` object widget: only its switch shows until enabled
    expect(screen.getByLabelText(/^Enable schedule/)).not.toBeChecked();
    expect(screen.queryByLabelText(/^Run at/)).toBeNull();
  });

  describe('scheduler: optional, one mode at a time, cross-field window rules', () => {
    const fill = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.type(screen.getByLabelText(/^Name/), 'Ada');
      await user.type(screen.getByLabelText(/^Email/), 'ada@example.com');
    };
    const setTime = (label: RegExp, local: string) => fireEvent.change(screen.getByLabelText(label), { target: { value: local } });
    const ms = (local: string) => new Date(local).getTime();

    it('submits with the scheduler off, even though its settings are empty', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<SchemaForm schema={schema} widgets={demoWidgets} onSubmit={onSubmit} />);
      await fill(user);
      await user.click(screen.getByRole('button', { name: 'Submit' }));
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ schedule: { enabled: false } }));
    });

    it('shows one mode at a time and clears the other mode\'s fields on switch', async () => {
      const user = userEvent.setup();
      const onChange = vi.fn();
      render(<SchemaForm schema={schema} widgets={demoWidgets} onChange={onChange} />);
      await user.click(screen.getByLabelText(/^Enable schedule/));

      // Default mode: run once
      expect(screen.getByLabelText(/^Run at/)).toHaveAttribute('type', 'datetime-local');
      expect(screen.queryByLabelText(/^Repeat every/)).toBeNull();
      setTime(/^Run at/, '2026-01-15T09:30');
      expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ schedule: expect.objectContaining({ runAt: ms('2026-01-15T09:30') }) }), expect.any(Array));

      // Switch to repeat: run_at_ts is dropped, so the two modes can never overlap
      await user.click(screen.getByRole('radio', { name: 'Repeat' }));
      expect(screen.queryByLabelText(/^Run at/)).toBeNull();
      expect(screen.getByLabelText(/^Repeat every/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Increase' })).toBeInTheDocument(); // counter for max_runs
      const last = onChange.mock.calls[onChange.mock.calls.length - 1]![0].schedule;
      expect(last).toEqual({ enabled: true });
    });

    it('requires exactly one mode: blocks submit until it is filled, then submits', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      const onError = vi.fn();
      render(<SchemaForm schema={schema} widgets={demoWidgets} onSubmit={onSubmit} onError={onError} />);
      await fill(user);
      await user.click(screen.getByLabelText(/^Enable schedule/));
      await user.click(screen.getByRole('radio', { name: 'Repeat' }));

      await user.click(screen.getByRole('button', { name: 'Submit' }));
      expect(onSubmit).not.toHaveBeenCalled();
      expect(onError.mock.calls[0]![0]).toEqual([
        { path: 'schedule', keyword: 'oneOf', message: 'Provide exactly one of: Run at, Repeat every' },
      ]);
      expect(screen.getByText('1 setting need attention')).toBeInTheDocument();

      await user.type(screen.getByLabelText(/^Repeat every/), '5000');
      await user.click(screen.getByLabelText(/^Run immediately/));
      await user.click(screen.getByRole('button', { name: 'Submit' }));
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ schedule: { enabled: true, intervalMs: 5000, runImmediately: true } }),
      );
    });

    it('cross-field rules from the validate prop block an inverted window and a run outside it', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      const onError = vi.fn();
      const { schedulerRules } = await import('../../demo/rules');
      render(<SchemaForm schema={schema} widgets={demoWidgets} validate={schedulerRules} onSubmit={onSubmit} onError={onError} />);
      await fill(user);
      await user.click(screen.getByLabelText(/^Enable schedule/));
      setTime(/^Run at/, '2026-01-15T12:00');
      setTime(/^Not before/, '2026-01-15T10:00');
      setTime(/^Not after/, '2026-01-15T09:00');

      await user.click(screen.getByRole('button', { name: 'Submit' }));
      expect(onSubmit).not.toHaveBeenCalled();
      expect(onError.mock.calls[0]![0].map((e: { path: string; keyword: string }) => `${e.path}:${e.keyword}`)).toEqual([
        'schedule.endsAt:range',
        'schedule.runAt:range',
      ]);
      expect(screen.getByText('Must be after the start of the window')).toBeInTheDocument();

      setTime(/^Not after/, '2026-01-15T13:00');
      await user.click(screen.getByRole('button', { name: 'Submit' }));
      expect(onSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          schedule: { enabled: true, runAt: ms('2026-01-15T12:00'), startsAt: ms('2026-01-15T10:00'), endsAt: ms('2026-01-15T13:00') },
        }),
      );
    });

    it('turning the scheduler off lifts the requirements and clears half-entered values', async () => {
      const user = userEvent.setup();
      const onSubmit = vi.fn();
      render(<SchemaForm schema={schema} widgets={demoWidgets} onSubmit={onSubmit} />);
      await fill(user);
      await user.click(screen.getByLabelText(/^Enable schedule/));
      setTime(/^Run at/, '2026-01-15T09:30');
      await user.click(screen.getByLabelText(/^Enable schedule/));
      expect(screen.queryByLabelText(/^Run at/)).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Submit' }));
      expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ schedule: { enabled: false } }));
    });
  });
});
