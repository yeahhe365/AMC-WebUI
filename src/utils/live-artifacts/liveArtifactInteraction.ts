import type { LiveArtifactFollowupPayload } from './liveArtifactFollowup';

const LIVE_ARTIFACT_INTERACTION_SOURCE = 'amc-live-artifact-interaction:v1';

export type LiveArtifactInteractionPrimitive = string | number | boolean;
export type LiveArtifactInteractionArrayValue = LiveArtifactInteractionPrimitive[];
export type LiveArtifactInteractionValue = LiveArtifactInteractionPrimitive | LiveArtifactInteractionArrayValue;
export type LiveArtifactInteractionScalarPropertyType = 'string' | 'number' | 'integer' | 'boolean';
export type LiveArtifactInteractionPropertyType = LiveArtifactInteractionScalarPropertyType | 'array';

// ─── Diagnosis types ────────────────────────────────────────────────────────

export type LiveArtifactInteractionErrorCode =
  | 'INVALID_JSON'
  | 'NOT_OBJECT'
  | 'SCHEMA_MISSING'
  | 'VERSION_UNSUPPORTED'
  | 'INSTRUCTION_MISSING'
  | 'INSTRUCTION_TOO_LONG'
  | 'TITLE_TOO_LONG'
  | 'DESCRIPTION_TOO_LONG'
  | 'SUBMIT_LABEL_TOO_LONG'
  | 'SCHEMA_NOT_OBJECT'
  | 'PROPERTIES_NOT_OBJECT'
  | 'PROPERTIES_EMPTY'
  | 'TOO_MANY_FIELDS'
  | 'KEY_NON_ASCII'
  | 'KEY_TOO_LONG'
  | 'FIELD_TYPE_UNSUPPORTED'
  | 'ENUM_TOO_MANY'
  | 'ENUM_TYPE_MISMATCH'
  | 'ENUM_NAME_LENGTH_MISMATCH'
  | 'ITEMS_MISSING'
  | 'ITEMS_TYPE_UNSUPPORTED'
  | 'ITEMS_ENUM_MISSING'
  | 'ITEMS_ENUM_TYPE_MIXED'
  | 'ARRAY_DEFAULT_INVALID'
  | 'DEFAULT_NOT_IN_ENUM'
  | 'DEFAULT_TYPE_MISMATCH'
  | 'RANGE_MIN_GT_MAX'
  | 'FORMAT_TYPE_MISMATCH'
  | 'REQUIRED_KEY_MISSING';

export interface LiveArtifactInteractionParseError {
  code: LiveArtifactInteractionErrorCode;
  message: string;
  context?: Record<string, unknown>;
}

export interface LiveArtifactInteractionDiagnosis {
  spec: LiveArtifactInteractionSpec | null;
  errors: LiveArtifactInteractionParseError[];
  repairs: LiveArtifactInteractionParseError[];
}

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface LiveArtifactInteractionArrayItems {
  type: LiveArtifactInteractionScalarPropertyType;
  enum: LiveArtifactInteractionPrimitive[];
  enumNames?: string[];
}

export interface LiveArtifactInteractionProperty {
  type: LiveArtifactInteractionPropertyType;
  title?: string;
  description?: string;
  enum?: LiveArtifactInteractionPrimitive[];
  enumNames?: string[];
  default?: LiveArtifactInteractionValue;
  format?: 'textarea' | 'range' | 'date' | string;
  minimum?: number;
  maximum?: number;
  items?: LiveArtifactInteractionArrayItems;
}

export interface LiveArtifactInteractionSchema {
  type: 'object';
  required?: string[];
  properties: Record<string, LiveArtifactInteractionProperty>;
}

export interface LiveArtifactInteractionSpec {
  version: 1;
  title?: string;
  description?: string;
  instruction: string;
  submitLabel?: string;
  schema: LiveArtifactInteractionSchema;
}

export interface LiveArtifactInteractionField {
  key: string;
  label: string;
  description?: string;
  required: boolean;
  property: LiveArtifactInteractionProperty;
}

const MAX_FIELDS = 24;
const MAX_TEXT_LENGTH = 2000;
const MAX_SHORT_TEXT_LENGTH = 500;
const FIELD_KEY_REGEX = /^[A-Za-z0-9_.-]{1,80}$/;
const SUPPORTED_SCALAR_PROPERTY_TYPES = new Set<LiveArtifactInteractionScalarPropertyType>([
  'string',
  'number',
  'integer',
  'boolean',
]);
const SUPPORTED_PROPERTY_TYPES = new Set<LiveArtifactInteractionPropertyType>([
  ...SUPPORTED_SCALAR_PROPERTY_TYPES,
  'array',
]);

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const isPrimitive = (value: unknown): value is LiveArtifactInteractionPrimitive =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

const isValidNumberForType = (value: unknown, type: LiveArtifactInteractionScalarPropertyType): value is number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return false;
  }

  return type !== 'integer' || Number.isInteger(value);
};

const arePrimitiveValuesEqual = (
  first: LiveArtifactInteractionPrimitive,
  second: LiveArtifactInteractionPrimitive,
): boolean => first === second;

// Infers the scalar type of array items from the enum values when `items.type`
// is missing. Mixed-type enums yield null (the spec stays rejected).
const inferArrayItemsType = (values: unknown[]): LiveArtifactInteractionScalarPropertyType | null => {
  if (values.length === 0) {
    return null;
  }
  if (values.every((item) => typeof item === 'string')) {
    return 'string';
  }
  if (values.every((item) => typeof item === 'boolean')) {
    return 'boolean';
  }
  if (values.every((item) => isValidNumberForType(item, 'integer'))) {
    return 'integer';
  }
  if (values.every((item) => isValidNumberForType(item, 'number'))) {
    return 'number';
  }
  return null;
};

export const getLiveArtifactInteractionFields = (spec: LiveArtifactInteractionSpec): LiveArtifactInteractionField[] => {
  const requiredKeys = new Set(spec.schema.required ?? []);

  return Object.entries(spec.schema.properties).map(([key, property]) => ({
    key,
    label: property.title || key,
    description: property.description,
    required: requiredKeys.has(key),
    property,
  }));
};

// ─── Error collection helpers ───────────────────────────────────────────────

const addError = (
  errors: LiveArtifactInteractionParseError[],
  code: LiveArtifactInteractionErrorCode,
  message: string,
  context?: Record<string, unknown>,
): void => {
  errors.push({ code, message, ...(context ? { context } : {}) });
};

/**
 * Attempt to coerce a scalar value for a number/integer field.
 * Returns { value, repair } when a fixable coercion is performed.
 * Returns { value, repair: undefined } when the value is already valid.
 * Returns null when the value is irreparably wrong.
 */
const tryCoerceNumberValue = (
  value: LiveArtifactInteractionPrimitive,
  type: LiveArtifactInteractionScalarPropertyType,
): { value: number; repair?: string } | null => {
  if (typeof value === 'number') {
    if (Number.isFinite(value)) {
      // integer float "3.0" → 3 (repair)
      if (type === 'integer' && !Number.isInteger(value)) return null;
      if (type === 'integer' && value % 1 !== 0 && Math.abs(value % 1) < Number.EPSILON) {
        return { value: Math.round(value), repair: 'integer' };
      }
      return { value };
    }
    return null;
  }
  // String "3" → number 3 (repair)
  if (typeof value === 'string') {
    const num = Number(value);
    if (!Number.isFinite(num)) return null;
    if (type === 'integer' && !Number.isInteger(num)) return null;
    return { value: num, repair: 'coerced' };
  }
  return null;
};

/**
 * Attempt to coerce all values in an array for number/integer fields.
 */
const tryCoerceNumberArray = (
  values: LiveArtifactInteractionPrimitive[],
  type: LiveArtifactInteractionScalarPropertyType,
): { values: number[]; repaired: boolean } => {
  const result: number[] = [];
  let repaired = false;
  for (const item of values) {
    const coerced = tryCoerceNumberValue(item, type);
    if (!coerced) return { values: [], repaired: false };
    if (coerced.repair) repaired = true;
    result.push(coerced.value);
  }
  return { values: result, repaired };
};

/**
 * Deep-clone a raw parsed JSON value without losing primitives.
 */
const cloneRaw = <T>(value: T): T => JSON.parse(JSON.stringify(value));

// ─── Diagnosis ──────────────────────────────────────────────────────────────

export const diagnoseLiveArtifactInteraction = (content: string): LiveArtifactInteractionDiagnosis => {
  const errors: LiveArtifactInteractionParseError[] = [];
  const repairs: LiveArtifactInteractionParseError[] = [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch (parseError) {
    const pos = (parseError as Error & { position?: number })?.position;
    addError(errors, 'INVALID_JSON', `JSON parse error${pos != null ? ` at position ${pos}` : ''}`, {
      ...(pos != null ? { position: pos } : {}),
    });
    return { spec: null, errors, repairs };
  }

  if (!isPlainObject(parsed)) {
    addError(errors, 'NOT_OBJECT', 'The JSON root must be a plain object.');
    return { spec: null, errors, repairs };
  }

  // Check version
  const version = parsed.version === undefined ? 1 : parsed.version;
  if (version !== 1) {
    addError(errors, 'VERSION_UNSUPPORTED', `Unsupported version "${version}". Only version 1 is supported.`);
    return { spec: null, errors, repairs };
  }

  // Clone so repairs do not mutate the caller's reference
  const spec = cloneRaw(parsed) as Record<string, unknown>;

  // Validate instruction
  if (
    spec.instruction === undefined ||
    spec.instruction === null ||
    typeof spec.instruction !== 'string' ||
    !spec.instruction.trim()
  ) {
    addError(errors, 'INSTRUCTION_MISSING', 'The "instruction" field is required and must be a non-empty string.');
  } else if ((spec.instruction as string).trim().length > MAX_TEXT_LENGTH) {
    const len = (spec.instruction as string).trim().length;
    addError(errors, 'INSTRUCTION_TOO_LONG', `"instruction" exceeds ${MAX_TEXT_LENGTH} characters (${len}).`);
  }

  // Validate title
  if (
    spec.title !== undefined &&
    spec.title !== null &&
    typeof spec.title === 'string' &&
    spec.title.trim().length > MAX_SHORT_TEXT_LENGTH
  ) {
    const len = spec.title.trim().length;
    spec.title = spec.title.trim().slice(0, MAX_SHORT_TEXT_LENGTH);
    addError(repairs, 'TITLE_TOO_LONG', `"title" truncated from ${len} to ${MAX_SHORT_TEXT_LENGTH} characters.`, {
      originalLength: len,
      max: MAX_SHORT_TEXT_LENGTH,
    });
  }

  // Validate description
  if (
    spec.description !== undefined &&
    spec.description !== null &&
    typeof spec.description === 'string' &&
    spec.description.trim().length > MAX_TEXT_LENGTH
  ) {
    const len = spec.description.trim().length;
    spec.description = spec.description.trim().slice(0, MAX_TEXT_LENGTH);
    addError(repairs, 'DESCRIPTION_TOO_LONG', `"description" truncated from ${len} to ${MAX_TEXT_LENGTH} characters.`, {
      originalLength: len,
      max: MAX_TEXT_LENGTH,
    });
  }

  // Validate submitLabel
  if (
    spec.submitLabel !== undefined &&
    spec.submitLabel !== null &&
    typeof spec.submitLabel === 'string' &&
    spec.submitLabel.trim().length > 120
  ) {
    const len = spec.submitLabel.trim().length;
    spec.submitLabel = spec.submitLabel.trim().slice(0, 120);
    addError(repairs, 'SUBMIT_LABEL_TOO_LONG', `"submitLabel" truncated from ${len} to 120 characters.`, {
      originalLength: len,
      max: 120,
    });
  }

  // If there are hard errors on the top-level fields, stop
  if (errors.some((e) => e.code === 'INSTRUCTION_MISSING' || e.code === 'INSTRUCTION_TOO_LONG')) {
    return { spec: null, errors, repairs };
  }

  // Validate schema
  const schema = spec.schema;
  if (!isPlainObject(schema)) {
    addError(errors, 'SCHEMA_MISSING', 'The "schema" field must be a plain object.');
    return { spec: null, errors, repairs };
  }

  if (schema.type !== 'object') {
    addError(errors, 'SCHEMA_NOT_OBJECT', 'schema.type must be "object".');
    return { spec: null, errors, repairs };
  }

  const props = schema.properties;
  if (!isPlainObject(props)) {
    addError(errors, 'PROPERTIES_NOT_OBJECT', 'schema.properties must be a plain object.');
    return { spec: null, errors, repairs };
  }

  const propertyEntries = Object.entries(props as Record<string, unknown>);
  if (propertyEntries.length === 0) {
    addError(errors, 'PROPERTIES_EMPTY', 'schema.properties must have at least one field.');
    return { spec: null, errors, repairs };
  }

  if (propertyEntries.length > MAX_FIELDS) {
    addError(
      errors,
      'TOO_MANY_FIELDS',
      `Number of fields (${propertyEntries.length}) exceeds the maximum of ${MAX_FIELDS}.`,
      {
        count: propertyEntries.length,
        max: MAX_FIELDS,
      },
    );
    return { spec: null, errors, repairs };
  }

  // Validate each property key — collecting errors, not short-circuiting
  let hasKeyError = false;
  for (const [key] of propertyEntries) {
    const normalizedKey = typeof key === 'string' ? key : String(key);
    if (!FIELD_KEY_REGEX.test(normalizedKey)) {
      addError(
        errors,
        'KEY_NON_ASCII',
        `Field key "${normalizedKey}" contains non-ASCII characters; only ASCII letters, digits, _, ., - are allowed.`,
        { key: normalizedKey },
      );
      hasKeyError = true;
    }
    if (normalizedKey.length > 80) {
      addError(errors, 'KEY_TOO_LONG', `Field key "${normalizedKey}" exceeds 80 characters.`, { key: normalizedKey });
      hasKeyError = true;
    }
  }

  if (hasKeyError) {
    return { spec: null, errors, repairs };
  }

  // Normalize each property
  const normalizedProperties: Record<string, LiveArtifactInteractionProperty> = {};
  let hasFatalError = false;

  for (const [key, rawProperty] of propertyEntries) {
    if (!isPlainObject(rawProperty) || typeof (rawProperty as Record<string, unknown>).type !== 'string') {
      addError(errors, 'FIELD_TYPE_UNSUPPORTED', `Property "${key}" is missing a valid "type" field.`);
      hasFatalError = true;
      continue;
    }

    const prop = rawProperty as Record<string, unknown>;
    const rawType = (prop.type as string).toLowerCase();
    if (!SUPPORTED_PROPERTY_TYPES.has(rawType as LiveArtifactInteractionPropertyType)) {
      addError(errors, 'FIELD_TYPE_UNSUPPORTED', `Property "${key}" has unsupported type "${rawType}".`);
      hasFatalError = true;
      continue;
    }

    const type = rawType as LiveArtifactInteractionPropertyType;
    const normalized: LiveArtifactInteractionProperty = { type };
    let propError = false;

    // title
    if (prop.title !== undefined && typeof prop.title === 'string') {
      const t = prop.title.trim();
      if (t.length > MAX_SHORT_TEXT_LENGTH) {
        normalized.title = t.slice(0, MAX_SHORT_TEXT_LENGTH);
        addError(
          repairs,
          'TITLE_TOO_LONG',
          `Property "${key}" title truncated from ${t.length} to ${MAX_SHORT_TEXT_LENGTH} chars.`,
          { key, originalLength: t.length, max: MAX_SHORT_TEXT_LENGTH },
        );
      } else if (t) {
        normalized.title = t;
      }
    }

    // description
    if (prop.description !== undefined && typeof prop.description === 'string') {
      const d = prop.description.trim();
      if (d.length > MAX_TEXT_LENGTH) {
        normalized.description = d.slice(0, MAX_TEXT_LENGTH);
        addError(
          repairs,
          'DESCRIPTION_TOO_LONG',
          `Property "${key}" description truncated from ${d.length} to ${MAX_TEXT_LENGTH} chars.`,
          { key, originalLength: d.length, max: MAX_TEXT_LENGTH },
        );
      } else if (d) {
        normalized.description = d;
      }
    }

    // format
    if (prop.format !== undefined && typeof prop.format === 'string') {
      const f = prop.format.trim().toLowerCase();
      if (f.length <= 80) {
        normalized.format = f;
        // Validate format-type compatibility
        if (
          (f === 'textarea' && type !== 'string') ||
          (f === 'date' && type !== 'string') ||
          (f === 'range' && type !== 'number' && type !== 'integer')
        ) {
          addError(
            errors,
            'FORMAT_TYPE_MISMATCH',
            `Property "${key}" has format "${f}" which is incompatible with type "${type}".`,
            { key, format: f, type },
          );
          propError = true;
        }
      }
    }

    // Process scalar properties
    if (type === 'number' || type === 'integer' || type === 'string' || type === 'boolean') {
      const scalarType = type as LiveArtifactInteractionScalarPropertyType;

      // Enum
      if (prop.enum !== undefined) {
        if (!Array.isArray(prop.enum)) {
          addError(errors, 'ENUM_TYPE_MISMATCH', `Property "${key}" enum must be an array.`, { key });
          propError = true;
        } else {
          let enumValues = prop.enum as unknown[];

          // Truncate enum if too long
          if (enumValues.length > 50) {
            const dropped = enumValues.length - 50;
            enumValues = enumValues.slice(0, 50);
            addError(
              repairs,
              'ENUM_TOO_MANY',
              `Property "${key}" enum truncated from ${dropped + 50} to 50 items (${dropped} dropped).`,
              { key, originalLength: dropped + 50, max: 50, dropped },
            );
          }

          // Coerce number/integer enum values
          if (scalarType === 'number' || scalarType === 'integer') {
            const coerced = tryCoerceNumberArray(enumValues as LiveArtifactInteractionPrimitive[], scalarType);
            if (!coerced.repaired && coerced.values.length === 0) {
              addError(
                errors,
                'ENUM_TYPE_MISMATCH',
                `Property "${key}" enum values must be numeric for type "${scalarType}".`,
                { key },
              );
              propError = true;
            } else {
              if (coerced.repaired) {
                addError(
                  repairs,
                  'ENUM_TYPE_MISMATCH',
                  `Property "${key}" enum values coerced from strings/floats to ${scalarType}.`,
                  { key },
                );
              }
              normalized.enum = coerced.values;
            }
          } else if (scalarType === 'boolean') {
            if ((enumValues as LiveArtifactInteractionPrimitive[]).every((v) => typeof v === 'boolean')) {
              normalized.enum = enumValues as boolean[];
            } else {
              addError(
                errors,
                'ENUM_TYPE_MISMATCH',
                `Property "${key}" enum values must be booleans for type "boolean".`,
                { key },
              );
              propError = true;
            }
          } else {
            normalized.enum = enumValues as string[];
          }
        }
      }

      // Min/max + range check
      const minimum = typeof prop.minimum === 'number' && Number.isFinite(prop.minimum) ? prop.minimum : undefined;
      const maximum = typeof prop.maximum === 'number' && Number.isFinite(prop.maximum) ? prop.maximum : undefined;
      if (minimum !== undefined && maximum !== undefined && minimum > maximum) {
        addError(errors, 'RANGE_MIN_GT_MAX', `Property "${key}" minimum (${minimum}) exceeds maximum (${maximum}).`, {
          key,
          minimum,
          maximum,
        });
        propError = true;
      } else {
        if (minimum !== undefined) normalized.minimum = minimum;
        if (maximum !== undefined) normalized.maximum = maximum;
      }

      // Default value
      if (prop.default !== undefined) {
        const rawDefault = prop.default;
        const enumAvailable = normalized.enum && normalized.enum.length > 0;
        let defErr = false;

        if (scalarType === 'number' || scalarType === 'integer') {
          if (typeof rawDefault === 'number') {
            if (!Number.isFinite(rawDefault)) {
              addError(errors, 'DEFAULT_TYPE_MISMATCH', `Property "${key}" default must be a finite number.`, { key });
              defErr = true;
            } else if (scalarType === 'integer' && !Number.isInteger(rawDefault)) {
              // Check if it's something like 3.0 that can be coerced
              if (Number.isInteger(Math.round(rawDefault)) && Math.abs(rawDefault - Math.round(rawDefault)) < 1e-10) {
                normalized.default = Math.round(rawDefault);
                addError(
                  repairs,
                  'DEFAULT_TYPE_MISMATCH',
                  `Property "${key}" default rounded from ${rawDefault} to ${Math.round(rawDefault)}.`,
                  { key, originalValue: rawDefault },
                );
              } else {
                addError(
                  errors,
                  'DEFAULT_TYPE_MISMATCH',
                  `Property "${key}" default must be an integer for type "integer".`,
                  { key },
                );
                defErr = true;
              }
            } else {
              normalized.default = rawDefault;
            }
          } else if (typeof rawDefault === 'string') {
            const num = Number(rawDefault);
            if (Number.isFinite(num) && !(scalarType === 'integer' && !Number.isInteger(num))) {
              normalized.default = scalarType === 'integer' ? Math.round(num) : num;
              addError(
                repairs,
                'DEFAULT_TYPE_MISMATCH',
                `Property "${key}" default coerced from string "${rawDefault}" to number ${normalized.default}.`,
                { key, originalValue: rawDefault, coercedValue: normalized.default },
              );
            } else {
              addError(
                errors,
                'DEFAULT_TYPE_MISMATCH',
                `Property "${key}" default must be numeric for type "${scalarType}".`,
                { key },
              );
              defErr = true;
            }
          } else {
            addError(
              errors,
              'DEFAULT_TYPE_MISMATCH',
              `Property "${key}" default must be a number for type "${scalarType}".`,
              { key },
            );
            defErr = true;
          }
        } else if (scalarType === 'boolean') {
          if (typeof rawDefault !== 'boolean') {
            addError(
              errors,
              'DEFAULT_TYPE_MISMATCH',
              `Property "${key}" default must be a boolean for type "boolean".`,
              { key },
            );
            defErr = true;
          } else {
            normalized.default = rawDefault;
          }
        } else {
          if (typeof rawDefault !== 'string') {
            addError(errors, 'DEFAULT_TYPE_MISMATCH', `Property "${key}" default must be a string for type "string".`, {
              key,
            });
            defErr = true;
          } else {
            normalized.default = rawDefault;
          }
        }

        // Check default against enum
        if (!defErr && enumAvailable && normalized.default !== undefined) {
          const defVal = normalized.default as LiveArtifactInteractionPrimitive;
          if (!normalized.enum!.some((e) => arePrimitiveValuesEqual(e, defVal))) {
            addError(
              errors,
              'DEFAULT_NOT_IN_ENUM',
              `Property "${key}" default value "${defVal}" is not in the enum options.`,
              { key, value: defVal },
            );
            propError = true;
          }
        }

        if (defErr) propError = true;
      }
    }

    // Array type
    if (type === 'array') {
      const itemsRaw = prop.items;
      if (!isPlainObject(itemsRaw)) {
        addError(errors, 'ITEMS_MISSING', `Property "${key}" is type "array" but has no "items" field.`, { key });
        propError = true;
      } else {
        const items = itemsRaw as Record<string, unknown>;
        const itemsTypeRaw = typeof items.type === 'string' ? items.type.toLowerCase() : undefined;
        const itemsType: LiveArtifactInteractionScalarPropertyType | null = itemsTypeRaw
          ? SUPPORTED_SCALAR_PROPERTY_TYPES.has(itemsTypeRaw as LiveArtifactInteractionScalarPropertyType)
            ? (itemsTypeRaw as LiveArtifactInteractionScalarPropertyType)
            : null
          : Array.isArray(items.enum)
            ? inferArrayItemsType(items.enum)
            : null;

        if (!itemsType) {
          addError(errors, 'ITEMS_TYPE_UNSUPPORTED', `Property "${key}" items type could not be inferred.`, { key });
          propError = true;
        } else if (!Array.isArray(items.enum) || items.enum.length === 0) {
          addError(errors, 'ITEMS_ENUM_MISSING', `Property "${key}" items must have a non-empty "enum" array.`, {
            key,
          });
          propError = true;
        } else {
          let enumValues = items.enum as unknown[];

          // Truncate enum
          if (enumValues.length > 50) {
            const dropped = enumValues.length - 50;
            enumValues = enumValues.slice(0, 50);
            addError(
              repairs,
              'ENUM_TOO_MANY',
              `Property "${key}" items enum truncated from ${dropped + 50} to 50 items (${dropped} dropped).`,
              { key, originalLength: dropped + 50, max: 50, dropped },
            );
          }

          // Coerce number/integer items
          let coercedEnum: LiveArtifactInteractionPrimitive[] | null = null;
          if (itemsType === 'number' || itemsType === 'integer') {
            const coerced = tryCoerceNumberArray(enumValues as LiveArtifactInteractionPrimitive[], itemsType);
            if (coerced.values.length === 0) {
              addError(
                errors,
                'ITEMS_ENUM_TYPE_MIXED',
                `Property "${key}" items enum values must be numeric for type "${itemsType}".`,
                { key },
              );
              propError = true;
            } else {
              coercedEnum = coerced.values;
              if (coerced.repaired) {
                addError(
                  repairs,
                  'ENUM_TYPE_MISMATCH',
                  `Property "${key}" items enum values coerced from strings/floats to ${itemsType}.`,
                  { key },
                );
              }
            }
          } else {
            coercedEnum = enumValues as LiveArtifactInteractionPrimitive[];
          }

          if (!propError) {
            const finalEnum = coercedEnum;
            const itemsResult: LiveArtifactInteractionArrayItems = {
              type: itemsType,
              enum: finalEnum!,
            };

            // enumNames
            if (Array.isArray(items.enumNames) && items.enumNames.length > 0) {
              if (items.enumNames.length === finalEnum!.length) {
                itemsResult.enumNames = items.enumNames
                  .filter((n: unknown): n is string => typeof n === 'string')
                  .slice(0, finalEnum!.length);
              } else {
                addError(
                  errors,
                  'ENUM_NAME_LENGTH_MISMATCH',
                  `Property "${key}" items.enumNames length (${items.enumNames.length}) must match items.enum length (${finalEnum!.length}).`,
                  { key },
                );
                propError = true;
              }
            }

            if (!propError) {
              normalized.items = itemsResult;

              // Default for array
              if (prop.default !== undefined) {
                if (!Array.isArray(prop.default)) {
                  addError(
                    errors,
                    'ARRAY_DEFAULT_INVALID',
                    `Property "${key}" default must be an array for type "array".`,
                    { key },
                  );
                  propError = true;
                } else {
                  const defArr = prop.default as unknown[];
                  if (defArr.some((v) => !isPrimitive(v))) {
                    addError(
                      errors,
                      'ARRAY_DEFAULT_INVALID',
                      `Property "${key}" default array contains non-primitive values.`,
                      { key },
                    );
                    propError = true;
                  } else {
                    const coercedDef = tryCoerceNumberArray(defArr as LiveArtifactInteractionPrimitive[], itemsType);
                    if (coercedDef.values.length === 0) {
                      addError(
                        errors,
                        'ARRAY_DEFAULT_INVALID',
                        `Property "${key}" default array values could not be coerced.`,
                        { key },
                      );
                      propError = true;
                    } else {
                      const seen = new Set<LiveArtifactInteractionPrimitive>();
                      for (const item of coercedDef.values) {
                        if (seen.has(item) || !finalEnum!.some((e) => arePrimitiveValuesEqual(e, item))) {
                          addError(
                            errors,
                            'ARRAY_DEFAULT_INVALID',
                            `Property "${key}" default contains values not in items.enum or duplicates.`,
                            { key },
                          );
                          propError = true;
                          break;
                        }
                        seen.add(item);
                      }
                      if (!propError) {
                        normalized.default = coercedDef.values;
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    if (propError) {
      hasFatalError = true;
    } else {
      normalizedProperties[key] = normalized;
    }
  }

  if (hasFatalError) {
    return { spec: null, errors, repairs };
  }

  // Build required list
  const required = Array.isArray(schema.required)
    ? (schema.required as unknown[]).filter((k): k is string => typeof k === 'string' && k in normalizedProperties)
    : undefined;

  // Resolve instruction
  const instruction = (spec.instruction as string).trim();

  const resultSpec: LiveArtifactInteractionSpec = {
    version: 1,
    instruction,
    schema: {
      type: 'object',
      properties: normalizedProperties,
      ...(required && required.length > 0 ? { required } : {}),
    },
  };

  if (typeof spec.title === 'string' && spec.title.trim()) {
    resultSpec.title = spec.title.trim();
  }
  if (typeof spec.description === 'string' && spec.description.trim()) {
    resultSpec.description = spec.description.trim();
  }
  if (typeof spec.submitLabel === 'string' && spec.submitLabel.trim()) {
    resultSpec.submitLabel = spec.submitLabel.trim();
  }

  return { spec: resultSpec, errors, repairs };
};

/**
 * Quick shape check: does the content look like it could be a Live Artifact
 * Interaction JSON? Checks only for the presence of "instruction" and "schema"
 * keys without doing a full parse. Used for the ````json fence upgrade (P0-2)
 * where we want to avoid parse cost on every code block.
 */
export const hasLiveArtifactInteractionShape = (content: string): boolean => {
  const trimmed = content.trim();
  return trimmed.startsWith('{') && trimmed.includes('"instruction"') && trimmed.includes('"schema"');
};

export const getLiveArtifactInteractionDefaultValue = (
  property: LiveArtifactInteractionProperty,
): LiveArtifactInteractionValue | '' => {
  if (property.default !== undefined) {
    return Array.isArray(property.default) ? [...property.default] : property.default;
  }

  if (property.type === 'array') {
    return [];
  }

  if (property.enum && property.enum.length > 0) {
    return property.enum[0];
  }

  if (property.type === 'boolean') {
    return false;
  }

  return '';
};

export const buildLiveArtifactInteractionPayload = (
  spec: LiveArtifactInteractionSpec,
  state: Record<string, LiveArtifactInteractionValue | ''>,
): LiveArtifactFollowupPayload => ({
  instruction: spec.instruction,
  ...(spec.title ? { title: spec.title } : {}),
  source: LIVE_ARTIFACT_INTERACTION_SOURCE,
  state,
});
