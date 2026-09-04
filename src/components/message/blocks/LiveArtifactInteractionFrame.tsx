import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { useI18n } from '@/contexts/I18nContext';
import {
  isLiveArtifactFollowupStateWithinLimit,
  type LiveArtifactFollowupPayload,
} from '@/utils/live-artifacts/liveArtifactFollowup';
import {
  buildLiveArtifactInteractionPayload,
  getLiveArtifactInteractionDefaultValue,
  getLiveArtifactInteractionFields,
  type LiveArtifactInteractionField,
  type LiveArtifactInteractionArrayValue,
  type LiveArtifactInteractionPrimitive,
  type LiveArtifactInteractionProperty,
  type LiveArtifactInteractionSpec,
  type LiveArtifactInteractionValue,
} from '@/utils/live-artifacts/liveArtifactInteraction';

const FIELD_ERROR_CLASS = 'mt-1 block text-[0.75em] text-[var(--theme-text-danger)]';

interface LiveArtifactInteractionFrameProps {
  spec: LiveArtifactInteractionSpec;
  baseFontSize?: number;
  onFollowUp?: (payload: LiveArtifactFollowupPayload) => void;
}

interface LiveArtifactInteractionFormProps extends LiveArtifactInteractionFrameProps {
  fields: LiveArtifactInteractionField[];
}

type FormState = Record<string, LiveArtifactInteractionValue | ''>;
type FormErrors = Record<string, string>;

interface ValidationMessages {
  required: string;
  invalidNumber: string;
  integer: string;
  range: string;
  enum: string;
  invalidDate: string;
}

const createInitialState = (fields: LiveArtifactInteractionField[]): FormState => {
  return fields.reduce<FormState>((state, field) => {
    let value = getLiveArtifactInteractionDefaultValue(field.property);
    // A `date` input only accepts YYYY-MM-DD. If the spec ships a default that
    // isn't (e.g. a timestamp or a relative day), show an empty field instead of
    // handing the browser an invalid value the user can't clear.
    if (field.property.format === 'date' && typeof value === 'string' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      value = '';
    }
    state[field.key] = value;
    return state;
  }, {});
};

const coerceNumberValue = (
  value: LiveArtifactInteractionValue | '',
): { value: number | ''; error?: 'invalidNumber' } => {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { value } : { value: '', error: 'invalidNumber' };
  }

  if (typeof value !== 'string' || value.trim() === '') {
    return { value: '' };
  }

  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? { value: numberValue } : { value: '', error: 'invalidNumber' };
};

const validateSubmittedValue = (
  property: LiveArtifactInteractionProperty,
  value: LiveArtifactInteractionValue | '',
  messages: ValidationMessages,
): { value: LiveArtifactInteractionValue | ''; error?: string } => {
  let submittedValue: LiveArtifactInteractionValue | '' = value;

  if (property.type === 'array') {
    if (!Array.isArray(submittedValue)) {
      return { value: [], error: messages.enum };
    }

    const items = property.items;
    const selectedValues = submittedValue;
    if (!items || selectedValues.some((item) => !items.enum.some((option) => option === item))) {
      return { value: selectedValues, error: messages.enum };
    }

    return { value: selectedValues };
  }

  if (property.type === 'string' && typeof submittedValue === 'string') {
    submittedValue = submittedValue.trim();
  }

  if (property.format === 'date' && typeof submittedValue === 'string' && submittedValue !== '') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(submittedValue)) {
      return { value: submittedValue, error: messages.invalidDate };
    }
  }

  if (property.type === 'number' || property.type === 'integer') {
    const numberResult = coerceNumberValue(value);
    if (numberResult.error) {
      return { value: '', error: messages.invalidNumber };
    }

    submittedValue = numberResult.value;

    if (typeof submittedValue === 'number') {
      if (property.type === 'integer' && !Number.isInteger(submittedValue)) {
        return { value: submittedValue, error: messages.integer };
      }

      if (
        (property.minimum !== undefined && submittedValue < property.minimum) ||
        (property.maximum !== undefined && submittedValue > property.maximum)
      ) {
        return { value: submittedValue, error: messages.range };
      }
    }
  }

  if (submittedValue !== '' && property.enum && !property.enum.some((option) => option === submittedValue)) {
    return { value: submittedValue, error: messages.enum };
  }

  return { value: submittedValue };
};

const isEmptySubmittedValue = (value: LiveArtifactInteractionValue | ''): boolean =>
  value === '' || value === undefined || (Array.isArray(value) && value.length === 0);

const validateState = (
  fields: LiveArtifactInteractionField[],
  state: FormState,
  messages: ValidationMessages,
): { errors: FormErrors; submittedState: FormState } => {
  const errors: FormErrors = {};
  const submittedState: FormState = {};

  fields.forEach((field) => {
    const { value, error } = validateSubmittedValue(field.property, state[field.key], messages);
    submittedState[field.key] = value;

    if (field.required && isEmptySubmittedValue(value)) {
      errors[field.key] = messages.required;
      return;
    }

    if (error) {
      errors[field.key] = error;
    }
  });

  return { errors, submittedState };
};

const getEnumOptionLabel = (property: LiveArtifactInteractionProperty, index: number): string => {
  const enumName = property.enumNames?.[index];
  if (enumName) {
    return enumName;
  }

  const enumValue = property.enum?.[index];
  return enumValue === undefined ? '' : String(enumValue);
};

const LiveArtifactInteractionForm: React.FC<LiveArtifactInteractionFormProps> = ({
  spec,
  fields,
  baseFontSize,
  onFollowUp,
}) => {
  const { t } = useI18n();
  const [state, setState] = useState<FormState>(() => createInitialState(fields));
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const updateValue = (key: string, value: LiveArtifactInteractionValue | '') => {
    setState((currentState) => ({ ...currentState, [key]: value }));
    setFormError(null);
    setErrors((currentErrors) => {
      if (!currentErrors[key]) {
        return currentErrors;
      }

      const nextErrors = { ...currentErrors };
      delete nextErrors[key];
      return nextErrors;
    });
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const { errors: validationErrors, submittedState } = validateState(fields, state, {
      required: t('liveArtifactInteractionRequired'),
      invalidNumber: t('liveArtifactInteractionInvalidNumber'),
      integer: t('liveArtifactInteractionInteger'),
      range: t('liveArtifactInteractionRange'),
      enum: t('liveArtifactInteractionEnum'),
      invalidDate: t('liveArtifactInteractionInvalidDate'),
    });
    if (Object.keys(validationErrors).length > 0) {
      setFormError(null);
      setErrors(validationErrors);
      return;
    }

    if (!isLiveArtifactFollowupStateWithinLimit(submittedState)) {
      setFormError(t('liveArtifactInteractionStateTooLarge'));
      return;
    }

    setFormError(null);
    onFollowUp?.(buildLiveArtifactInteractionPayload(spec, submittedState));
  };

  const renderField = (field: LiveArtifactInteractionField) => {
    const value = state[field.key];
    const error = errors[field.key];
    const descriptionId = `${field.key}-description`;
    const errorId = `${field.key}-error`;
    const describedBy = [field.description ? descriptionId : null, error ? errorId : null].filter(Boolean).join(' ');
    const commonControlClassName =
      'mt-1.5 w-full rounded-md border border-[var(--theme-border-primary)] bg-[var(--theme-bg-input)] px-3 py-2 text-[0.875em] text-[var(--theme-text-primary)] outline-none transition focus:border-[var(--theme-border-focus)] focus:ring-2 focus:ring-[var(--theme-border-focus)]/20';

    if (field.property.type === 'array' && field.property.items) {
      const selectedValues: LiveArtifactInteractionArrayValue = Array.isArray(value) ? value : [];
      const updateArrayValue = (option: LiveArtifactInteractionPrimitive, checked: boolean) => {
        updateValue(
          field.key,
          checked ? [...selectedValues, option] : selectedValues.filter((selectedValue) => selectedValue !== option),
        );
      };

      return (
        <fieldset key={field.key} className="block">
          <legend className="text-[0.875em] font-medium text-[var(--theme-text-primary)]">
            {field.label}
            {field.required && <span className="ml-1 text-[var(--theme-text-danger)]">*</span>}
          </legend>
          {field.description && (
            <p id={descriptionId} className="mt-0.5 text-[0.75em] leading-relaxed text-[var(--theme-text-secondary)]">
              {field.description}
            </p>
          )}
          <div className="mt-1.5 grid gap-2">
            {field.property.items.enum.map((option, index) => (
              <label
                key={String(option)}
                className="flex items-center gap-2 rounded-md border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] px-3 py-2"
              >
                <input
                  name={field.key}
                  type="checkbox"
                  value={String(option)}
                  checked={selectedValues.some((selectedValue) => selectedValue === option)}
                  onChange={(event) => updateArrayValue(option, event.currentTarget.checked)}
                  aria-describedby={describedBy || undefined}
                  aria-invalid={Boolean(error)}
                  className="h-4 w-4 rounded border-[var(--theme-border-primary)] accent-[var(--theme-bg-accent)]"
                />
                <span className="text-[0.875em] text-[var(--theme-text-primary)]">
                  {field.property.items?.enumNames?.[index] ?? String(option)}
                </span>
              </label>
            ))}
          </div>
          {error && (
            <span id={errorId} className={FIELD_ERROR_CLASS}>
              {error}
            </span>
          )}
        </fieldset>
      );
    }

    if (field.property.type === 'boolean') {
      return (
        <label
          key={field.key}
          className="flex items-start gap-2 rounded-md border border-[var(--theme-border-secondary)] bg-[var(--theme-bg-primary)] px-3 py-2"
        >
          <input
            name={field.key}
            type="checkbox"
            checked={Boolean(value)}
            onChange={(event) => updateValue(field.key, event.currentTarget.checked)}
            aria-describedby={describedBy || undefined}
            aria-invalid={Boolean(error)}
            className="mt-1 h-4 w-4 rounded border-[var(--theme-border-primary)] accent-[var(--theme-bg-accent)]"
          />
          <span className="min-w-0">
            <span className="block text-[0.875em] font-medium text-[var(--theme-text-primary)]">{field.label}</span>
            {field.description && (
              <span className="mt-0.5 block text-[0.75em] leading-relaxed text-[var(--theme-text-secondary)]">
                {field.description}
              </span>
            )}
            {error && (
              <span id={errorId} className={FIELD_ERROR_CLASS}>
                {error}
              </span>
            )}
          </span>
        </label>
      );
    }

    return (
      <label key={field.key} className="block">
        <span className="text-[0.875em] font-medium text-[var(--theme-text-primary)]">
          {field.label}
          {field.required && <span className="ml-1 text-[var(--theme-text-danger)]">*</span>}
        </span>
        {field.description && (
          <span
            id={descriptionId}
            className="mt-0.5 block text-[0.75em] leading-relaxed text-[var(--theme-text-secondary)]"
          >
            {field.description}
          </span>
        )}

        {field.property.enum ? (
          <select
            name={field.key}
            value={String(value)}
            onChange={(event) => {
              const selectedValue = field.property.enum?.find((option) => String(option) === event.currentTarget.value);
              if (selectedValue !== undefined) {
                updateValue(field.key, selectedValue);
              }
            }}
            required={field.required}
            aria-describedby={describedBy || undefined}
            aria-invalid={Boolean(error)}
            className={commonControlClassName}
          >
            {field.property.enum.map((option, index) => (
              <option key={index} value={String(option)}>
                {getEnumOptionLabel(field.property, index)}
              </option>
            ))}
          </select>
        ) : field.property.format === 'textarea' ? (
          <textarea
            name={field.key}
            value={String(value)}
            onChange={(event) => updateValue(field.key, event.currentTarget.value)}
            required={field.required}
            rows={4}
            aria-describedby={describedBy || undefined}
            aria-invalid={Boolean(error)}
            className={`${commonControlClassName} resize-y`}
          />
        ) : (
          <input
            name={field.key}
            type={
              field.property.format === 'date'
                ? 'date'
                : field.property.format === 'range'
                  ? 'range'
                  : field.property.type === 'string'
                    ? 'text'
                    : 'number'
            }
            step={field.property.type === 'integer' ? 1 : undefined}
            min={field.property.minimum}
            max={field.property.maximum}
            value={String(value)}
            onChange={(event) => updateValue(field.key, event.currentTarget.value)}
            required={field.required}
            aria-describedby={describedBy || undefined}
            aria-invalid={Boolean(error)}
            className={commonControlClassName}
          />
        )}

        {error && (
          <span id={errorId} className="mt-1 block text-[0.75em] text-[var(--theme-text-danger)]">
            {error}
          </span>
        )}
      </label>
    );
  };

  return (
    <form
      data-live-artifact-interaction="true"
      onSubmit={handleSubmit}
      className="my-3 rounded-lg border border-[var(--theme-border-primary)] bg-[var(--theme-bg-model-message)] p-4 shadow-sm"
      style={baseFontSize ? { fontSize: `${baseFontSize}px` } : undefined}
    >
      <div className="mb-4">
        {spec.title && <h2 className="text-[1em] font-semibold text-[var(--theme-text-primary)]">{spec.title}</h2>}
        {spec.description && (
          <p className="mt-1 text-[0.875em] leading-relaxed text-[var(--theme-text-secondary)]">{spec.description}</p>
        )}
      </div>

      <div className="grid gap-3">{fields.map(renderField)}</div>

      {formError && <p className="mt-3 text-[0.875em] text-[var(--theme-text-danger)]">{formError}</p>}

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-md bg-[var(--theme-bg-accent)] px-3 py-2 text-[0.875em] font-medium text-[var(--theme-text-accent)] transition hover:bg-[var(--theme-bg-accent-hover)] focus:outline-none focus:ring-2 focus:ring-[var(--theme-border-focus)]/30"
        >
          <Send size={15} />
          <span>{spec.submitLabel || t('liveArtifactInteractionContinue')}</span>
        </button>
      </div>
    </form>
  );
};

export const LiveArtifactInteractionFrame: React.FC<LiveArtifactInteractionFrameProps> = ({
  spec,
  baseFontSize,
  onFollowUp,
}) => {
  const specSignature = JSON.stringify(spec);
  const fields = getLiveArtifactInteractionFields(spec);

  return (
    <LiveArtifactInteractionForm
      key={specSignature}
      spec={spec}
      fields={fields}
      baseFontSize={baseFontSize}
      onFollowUp={onFollowUp}
    />
  );
};
