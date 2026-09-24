import { useState } from 'react';
import { Field, FieldWrapper, useFormContext, type Widget } from 'react-simple-schema-form';

type Mode = 'once' | 'repeat';

/** Which properties belong to each mode; anything else is shared. */
const MODES: Record<Mode, { label: string; fields: string[] }> = {
  once: { label: 'Run once', fields: ['runAt'] },
  repeat: { label: 'Repeat', fields: ['intervalMs', 'runImmediately', 'maxRuns'] },
};
const WINDOW = ['startsAt', 'endsAt'];

/**
 * Scheduler: an enable switch, then an explicit Run once / Repeat choice.
 * Switching mode clears the other mode's fields, so "run at" and "period" can
 * never both be set — the schema's `oneOf` enforces the same rule on the data.
 * The window and the remaining options are shared by both modes.
 */
export const SchedulerWidget: Widget<Record<string, unknown> | undefined> = ({ id, path, schema, value, errors, disabled, readOnly }) => {
  const ctx = useFormContext();
  const v = value ?? {};
  const enabled = Boolean(v.enabled);
  const locked = disabled || readOnly;
  const [mode, setMode] = useState<Mode>(() => (v.intervalMs !== undefined ? 'repeat' : 'once'));

  const props = schema.properties ?? {};
  const has = (key: string) => key in props;
  const isRequired = (key: string) => Boolean(schema.required?.includes(key));
  const at = (key: string) => `${path}.${key}`;
  const known = new Set(['enabled', ...MODES.once.fields, ...MODES.repeat.fields, ...WINDOW]);
  const options = Object.keys(props).filter((key) => !known.has(key));

  const setEnabled = (on: boolean) => {
    ctx.setValue(path, on ? { ...v, enabled: true } : { enabled: false });
    ctx.touch(at('enabled'));
  };

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    const cleared = { ...v };
    for (const key of MODES[mode].fields) delete cleared[key];
    ctx.setValue(path, cleared);
    setMode(next);
  };

  const renderFields = (keys: string[]) =>
    keys.filter(has).map((key) => <Field key={key} schema={props[key]!} path={at(key)} required={isRequired(key)} />);

  return (
    <div className="scheduler" id={id} data-enabled={enabled}>
      {has('enabled') && (
        <FieldWrapper id={`${id}-enabled`} label={props.enabled!.title ?? 'Enabled'} description={props.enabled!.description} required={false} errors={[]} inline>
          <input type="checkbox" className="sf-checkbox" id={`${id}-enabled`} checked={enabled} disabled={locked} onChange={(e) => setEnabled(e.target.checked)} />
        </FieldWrapper>
      )}

      {enabled && (
        <>
          <div className="scheduler__modes" role="radiogroup" aria-label="Schedule mode">
            {(Object.keys(MODES) as Mode[]).map((m) => (
              <label key={m} className={`scheduler__mode${mode === m ? ' scheduler__mode--active' : ''}`}>
                <input type="radio" name={`${id}-mode`} value={m} checked={mode === m} disabled={locked} onChange={() => switchMode(m)} />
                {MODES[m].label}
              </label>
            ))}
          </div>

          <div className="scheduler__grid">{renderFields(MODES[mode].fields)}</div>

          {WINDOW.some(has) && (
            <fieldset className="sf-object scheduler__window">
              <legend className="sf-legend">Window</legend>
              <div className="scheduler__grid">{renderFields(WINDOW)}</div>
            </fieldset>
          )}

          {options.length > 0 && <div className="scheduler__grid">{renderFields(options)}</div>}

          {errors.length > 0 && <p className="sf-help">{errors.length} setting{errors.length === 1 ? '' : 's'} need attention</p>}
        </>
      )}
    </div>
  );
};
