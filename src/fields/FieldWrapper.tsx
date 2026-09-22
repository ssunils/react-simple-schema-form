import type { ReactNode } from 'react';
import type { FieldError } from '../types';

interface FieldWrapperProps {
  id: string;
  label?: string;
  description?: string;
  help?: string;
  required: boolean;
  errors: FieldError[];
  /** Render the label after the control (used for checkboxes). */
  inline?: boolean;
  /** Use a fieldset/legend instead of label (for groups without a single input). */
  group?: boolean;
  children: ReactNode;
}

export function FieldWrapper({
  id,
  label,
  description,
  help,
  required,
  errors,
  inline,
  group,
  children,
}: FieldWrapperProps) {
  const hasError = errors.length > 0;
  const className = ['sf-field', hasError && 'sf-field--error', inline && 'sf-field--inline']
    .filter(Boolean)
    .join(' ');

  const labelNode = label ? (
    group ? (
      <span id={`${id}-label`} className="sf-label">
        {label}
        {required && <span className="sf-required" aria-hidden="true"> *</span>}
      </span>
    ) : (
      <label id={`${id}-label`} htmlFor={id} className="sf-label">
        {label}
        {required && <span className="sf-required" aria-hidden="true"> *</span>}
      </label>
    )
  ) : null;

  return (
    <div className={className} data-field={id}>
      {!inline && labelNode}
      {description && !inline && <p className="sf-description">{description}</p>}
      {children}
      {inline && labelNode}
      {help && <p className="sf-help">{help}</p>}
      {hasError && (
        <p id={`${id}-error`} className="sf-error" role="alert">
          {errors.map((e) => e.message).join('. ')}
        </p>
      )}
    </div>
  );
}
