import { describe, it, expect } from 'vitest';
import { Type } from '@google/genai';
import type { StandardClientFunctions } from '@/types';
import { geminiSchemaToJsonSchema, toOpenAITools, toAnthropicTools } from './toolSchemaAdapters';

describe('toolSchemaAdapters', () => {
  describe('geminiSchemaToJsonSchema', () => {
    it('converts uppercase types to lowercase JSON schema types', () => {
      const geminiSchema = {
        type: Type.OBJECT,
        description: 'Test object',
        properties: {
          query: {
            type: Type.STRING,
            description: 'Search query',
          },
          count: {
            type: Type.INTEGER,
            description: 'Item count',
          },
          ratio: {
            type: Type.NUMBER,
          },
          enabled: {
            type: Type.BOOLEAN,
          },
          tags: {
            type: Type.ARRAY,
            items: {
              type: Type.STRING,
            },
          },
        },
        required: ['query'],
      };

      const result = geminiSchemaToJsonSchema(geminiSchema);

      expect(result).toEqual({
        type: 'object',
        description: 'Test object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query',
          },
          count: {
            type: 'integer',
            description: 'Item count',
          },
          ratio: {
            type: 'number',
          },
          enabled: {
            type: 'boolean',
          },
          tags: {
            type: 'array',
            items: {
              type: 'string',
            },
          },
        },
        required: ['query'],
      });
    });

    it('handles undefined or non-object schemas gracefully', () => {
      expect(geminiSchemaToJsonSchema(undefined)).toEqual({
        type: 'object',
        properties: {},
      });
      expect(geminiSchemaToJsonSchema(null)).toEqual({
        type: 'object',
        properties: {},
      });
    });

    it('infers object type when properties exist but type is omitted', () => {
      const schema = {
        properties: {
          name: { type: 'STRING' },
        },
      };
      const result = geminiSchemaToJsonSchema(schema);
      expect(result.type).toBe('object');
      expect((result.properties as any).name.type).toBe('string');
    });
  });

  describe('toOpenAITools', () => {
    it('converts StandardClientFunctions to OpenAI tools format', () => {
      const clientFunctions: StandardClientFunctions = {
        mcp_test_tool: {
          declaration: {
            name: 'mcp_test_tool',
            description: 'A test tool',
            parameters: {
              type: Type.OBJECT,
              properties: {
                location: { type: Type.STRING },
              },
              required: ['location'],
            },
          },
          handler: async () => ({ response: 'ok' }),
        },
      };

      const openAiTools = toOpenAITools(clientFunctions);

      expect(openAiTools).toEqual([
        {
          type: 'function',
          function: {
            name: 'mcp_test_tool',
            description: 'A test tool',
            parameters: {
              type: 'object',
              properties: {
                location: { type: 'string' },
              },
              required: ['location'],
            },
          },
        },
      ]);
    });
  });

  describe('toAnthropicTools', () => {
    it('converts StandardClientFunctions to Anthropic tools format', () => {
      const clientFunctions: StandardClientFunctions = {
        mcp_test_tool: {
          declaration: {
            name: 'mcp_test_tool',
            description: 'A test tool',
            parameters: {
              type: Type.OBJECT,
              properties: {
                location: { type: Type.STRING },
              },
              required: ['location'],
            },
          },
          handler: async () => ({ response: 'ok' }),
        },
      };

      const anthropicTools = toAnthropicTools(clientFunctions);

      expect(anthropicTools).toEqual([
        {
          name: 'mcp_test_tool',
          description: 'A test tool',
          input_schema: {
            type: 'object',
            properties: {
              location: { type: 'string' },
            },
            required: ['location'],
          },
        },
      ]);
    });
  });
});
