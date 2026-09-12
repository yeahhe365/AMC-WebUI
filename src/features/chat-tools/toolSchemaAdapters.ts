import type { StandardClientFunctions } from '@/types';
import { isRecord } from '../../../shared/predicates';

export interface OpenAIToolDefinition {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface AnthropicToolDefinition {
  name: string;
  description?: string;
  input_schema: Record<string, unknown>;
}

const mapTypeToLowercase = (val: unknown): string | undefined => {
  if (typeof val !== 'string') return undefined;
  return val.toLowerCase();
};

/**
 * Converts a Gemini Schema (which uses uppercase types like Type.OBJECT)
 * into a standard JSON Schema with lowercase types for OpenAI and Anthropic.
 */
export const geminiSchemaToJsonSchema = (schema?: unknown): Record<string, unknown> => {
  if (!isRecord(schema)) {
    return { type: 'object', properties: {} };
  }

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(schema)) {
    if (key === 'type') {
      result.type = mapTypeToLowercase(value);
    } else if (key === 'properties' && isRecord(value)) {
      const convertedProperties: Record<string, unknown> = {};
      for (const [propName, propSchema] of Object.entries(value)) {
        convertedProperties[propName] = geminiSchemaToJsonSchema(propSchema);
      }
      result.properties = convertedProperties;
    } else if (key === 'items') {
      result.items = geminiSchemaToJsonSchema(value);
    } else {
      result[key] = value;
    }
  }

  if (!result.type && (result.properties !== undefined || isRecord(schema.properties))) {
    result.type = 'object';
  }

  return result;
};

/**
 * Maps StandardClientFunctions into OpenAI tools format.
 */
export const toOpenAITools = (functions: StandardClientFunctions): OpenAIToolDefinition[] => {
  return Object.entries(functions).map(([key, { declaration }]) => ({
    type: 'function',
    function: {
      name: declaration.name || key,
      ...(declaration.description ? { description: declaration.description } : {}),
      parameters: geminiSchemaToJsonSchema(declaration.parameters),
    },
  }));
};

/**
 * Maps StandardClientFunctions into Anthropic tools format.
 */
export const toAnthropicTools = (functions: StandardClientFunctions): AnthropicToolDefinition[] => {
  return Object.entries(functions).map(([key, { declaration }]) => ({
    name: declaration.name || key,
    ...(declaration.description ? { description: declaration.description } : {}),
    input_schema: geminiSchemaToJsonSchema(declaration.parameters),
  }));
};
