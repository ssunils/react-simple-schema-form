import type { FieldError } from 'react-simple-schema-form';

/**
 * Cross-field rules JSON Schema cannot express. Passed to <SchemaForm validate>,
 * so they run on every change and block submission like schema errors do.
 */
export function schedulerRules(data: Record<string, unknown>): FieldError[] {
  const s = data.schedule as Record<string, unknown> | undefined;
  if (!s?.enabled) return [];
  const num = (key: string) => (typeof s[key] === 'number' ? (s[key] as number) : undefined);
  const start = num('startsAt');
  const finish = num('endsAt');
  const runAt = num('runAt');
  const errors: FieldError[] = [];

  if (start !== undefined && finish !== undefined && finish <= start) {
    errors.push({ path: 'schedule.endsAt', keyword: 'range', message: 'Must be after the start of the window' });
  }
  if (runAt !== undefined && ((start !== undefined && runAt < start) || (finish !== undefined && runAt > finish))) {
    errors.push({ path: 'schedule.runAt', keyword: 'range', message: 'Must fall inside the window' });
  }
  return errors;
}
