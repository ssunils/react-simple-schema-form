import type { ChangeEvent } from 'react';
import type { JSONSchema, Widget, WidgetProps, WidgetRegistry } from './types';
import { resolveType } from './utils/schema';

function commonAttrs(props: WidgetProps<any>) {
  return {
    id: props.id,
    name: props.path,
    required: props.required,
    disabled: props.disabled,
    readOnly: props.readOnly,
    placeholder: props.options.placeholder,
    'aria-invalid': props.invalid || undefined,
    'aria-describedby': props.invalid ? `${props.id}-error` : undefined,
    onBlur: props.onBlur,
    ...props.options.props,
  };
}

function inputWidget(type: string): Widget<string | undefined> {
  const InputWidget: Widget<string | undefined> = (props) => (
    <input
      type={type}
      className="sf-input"
      {...commonAttrs(props)}
      value={props.value ?? ''}
      minLength={props.schema.minLength}
      maxLength={props.schema.maxLength}
      pattern={props.schema.pattern}
      onChange={(e: ChangeEvent<HTMLInputElement>) =>
        props.onChange(e.target.value === '' ? undefined : e.target.value)
      }
    />
  );
  InputWidget.displayName = `InputWidget(${type})`;
  return InputWidget;
}

export const TextWidget = inputWidget('text');
export const EmailWidget = inputWidget('email');
export const PasswordWidget = inputWidget('password');
export const UrlWidget = inputWidget('url');
export const DateWidget = inputWidget('date');
export const DateTimeWidget = inputWidget('datetime-local');
export const TimeWidget = inputWidget('time');
export const ColorWidget = inputWidget('color');

export const TextareaWidget: Widget<string | undefined> = (props) => (
  <textarea
    className="sf-textarea"
    rows={4}
    {...commonAttrs(props)}
    value={props.value ?? ''}
    minLength={props.schema.minLength}
    maxLength={props.schema.maxLength}
    onChange={(e) => props.onChange(e.target.value === '' ? undefined : e.target.value)}
  />
);

export const NumberWidget: Widget<number | undefined> = (props) => {
  const { schema } = props;
  const isInteger = resolveType(schema) === 'integer';
  return (
    <input
      type="number"
      className="sf-input"
      {...commonAttrs(props)}
      value={props.value ?? ''}
      min={schema.minimum ?? schema.exclusiveMinimum}
      max={schema.maximum ?? schema.exclusiveMaximum}
      step={schema.multipleOf ?? (isInteger ? 1 : 'any')}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === '') return props.onChange(undefined);
        const n = Number(raw);
        props.onChange(Number.isNaN(n) ? undefined : n);
      }}
    />
  );
};

export const CheckboxWidget: Widget<boolean | undefined> = (props) => (
  <input
    type="checkbox"
    className="sf-checkbox"
    {...commonAttrs(props)}
    checked={Boolean(props.value)}
    onChange={(e) => props.onChange(e.target.checked)}
  />
);

function enumOptions(schema: JSONSchema): { value: unknown; label: string }[] {
  const labels = (schema as { enumNames?: string[] }).enumNames;
  return (schema.enum ?? []).map((value, i) => ({
    value,
    label: labels?.[i] ?? String(value),
  }));
}

/** Map an option back to its typed enum value from the string the DOM gives us. */
function fromDomValue(schema: JSONSchema, raw: string): unknown {
  const match = (schema.enum ?? []).find((v) => String(v) === raw);
  return match;
}

export const SelectWidget: Widget<unknown> = (props) => {
  const options = enumOptions(props.schema);
  const current = props.value === undefined || props.value === null ? '' : String(props.value);
  return (
    <select
      className="sf-select"
      {...commonAttrs(props)}
      value={current}
      onChange={(e) =>
        props.onChange(e.target.value === '' ? undefined : fromDomValue(props.schema, e.target.value))
      }
    >
      <option value="">{props.options.placeholder ?? 'Select…'}</option>
      {options.map((opt) => (
        <option key={String(opt.value)} value={String(opt.value)}>
          {opt.label}
        </option>
      ))}
    </select>
  );
};

export const RadioWidget: Widget<unknown> = (props) => {
  const options = enumOptions(props.schema);
  return (
    <div className="sf-radio-group" role="radiogroup" aria-labelledby={`${props.id}-label`}>
      {options.map((opt) => {
        const optId = `${props.id}-${String(opt.value)}`;
        return (
          <label key={optId} htmlFor={optId} className="sf-radio">
            <input
              type="radio"
              id={optId}
              name={props.path}
              value={String(opt.value)}
              checked={props.value === opt.value}
              disabled={props.disabled || props.readOnly}
              onBlur={props.onBlur}
              onChange={() => props.onChange(opt.value)}
            />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
};

/** Multi-select for arrays whose items are an enum. */
export const CheckboxesWidget: Widget<unknown[] | undefined> = (props) => {
  const itemSchema = props.schema.items ?? {};
  const options = enumOptions(itemSchema);
  const selected = props.value ?? [];
  const toggle = (value: unknown, checked: boolean) => {
    const next = checked
      ? [...selected, value]
      : selected.filter((v) => v !== value);
    // Preserve the enum's declared order
    next.sort((a, b) => (itemSchema.enum?.indexOf(a) ?? 0) - (itemSchema.enum?.indexOf(b) ?? 0));
    props.onChange(next.length ? next : undefined);
  };
  return (
    <div className="sf-checkbox-group" role="group" aria-labelledby={`${props.id}-label`}>
      {options.map((opt) => {
        const optId = `${props.id}-${String(opt.value)}`;
        return (
          <label key={optId} htmlFor={optId} className="sf-checkbox-option">
            <input
              type="checkbox"
              id={optId}
              checked={selected.includes(opt.value)}
              disabled={props.disabled || props.readOnly}
              onBlur={props.onBlur}
              onChange={(e) => toggle(opt.value, e.target.checked)}
            />
            {opt.label}
          </label>
        );
      })}
    </div>
  );
};

export const HiddenWidget: Widget<unknown> = (props) => (
  <input type="hidden" id={props.id} name={props.path} value={String(props.value ?? '')} readOnly />
);

export const defaultWidgets: WidgetRegistry = {
  text: TextWidget,
  email: EmailWidget,
  password: PasswordWidget,
  url: UrlWidget,
  date: DateWidget,
  datetime: DateTimeWidget,
  time: TimeWidget,
  color: ColorWidget,
  textarea: TextareaWidget,
  number: NumberWidget,
  checkbox: CheckboxWidget,
  select: SelectWidget,
  radio: RadioWidget,
  checkboxes: CheckboxesWidget,
  hidden: HiddenWidget,
};

const FORMAT_WIDGETS: Record<string, string> = {
  email: 'email',
  uri: 'url',
  url: 'url',
  password: 'password',
  date: 'date',
  'date-time': 'datetime',
  time: 'time',
  color: 'color',
};

/** Pick the default widget name for a leaf schema. */
export function defaultWidgetFor(schema: JSONSchema): string {
  const type = resolveType(schema);
  if (schema.enum) return 'select';
  switch (type) {
    case 'boolean':
      return 'checkbox';
    case 'number':
    case 'integer':
      return 'number';
    case 'array':
      return 'checkboxes';
    case 'string':
      return (schema.format && FORMAT_WIDGETS[schema.format]) || 'text';
    default:
      return 'text';
  }
}
