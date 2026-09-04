import React from 'react';

const MAX_DEPTH = 5;

const TYPE_BADGE_CLASS =
  'rounded bg-[var(--theme-bg-tertiary)] px-1 py-0.5 font-mono text-[10px] text-[var(--theme-text-secondary)]';

const formatType = (schema: Record<string, unknown>): string => {
  const type = schema.type;
  if (typeof type === 'string') return type;
  if (Array.isArray(type)) return type.join(' | ');
  if (Array.isArray(schema.anyOf)) {
    return (schema.anyOf as Array<Record<string, unknown>>).map((entry) => formatType(entry)).join(' | ');
  }
  if (Array.isArray(schema.oneOf)) {
    return (schema.oneOf as Array<Record<string, unknown>>).map((entry) => formatType(entry)).join(' | ');
  }
  if (schema.properties || schema.required) return 'object';
  if (schema.items) return 'array';
  return 'any';
};

const ScalarRow: React.FC<{ name: string; schema: Record<string, unknown>; required: boolean }> = ({
  name,
  schema,
  required,
}) => (
  <div className="flex items-baseline gap-1.5 py-0.5">
    <span className="font-mono text-[11px]">{name}</span>
    {required && <span className="text-[10px] text-red-500">*</span>}
    <span className={TYPE_BADGE_CLASS}>{formatType(schema)}</span>
    {typeof schema.description === 'string' && (
      <span className="truncate text-[10px] text-[var(--theme-text-secondary)]" title={schema.description}>
        {schema.description}
      </span>
    )}
  </div>
);

const SchemaNode: React.FC<{ schema: Record<string, unknown>; depth: number; name?: string; required?: boolean }> = ({
  schema,
  depth,
  name,
  required,
}) => {
  if (depth > MAX_DEPTH) return null;
  const properties = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
  const requiredList = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  const entries = Object.entries(properties);
  const isBranch = entries.length > 0;

  return (
    <div className={depth > 0 ? 'ml-3 border-l pl-2' : ''}>
      {name && <ScalarRow name={name} schema={schema} required={!!required} />}
      {!name && !isBranch && <ScalarRow name="(root)" schema={schema} required={false} />}
      {isBranch &&
        entries.map(([key, child]) => (
          <div key={key}>
            <ScalarRow name={key} schema={child} required={requiredList.includes(key)} />
            <SchemaNode schema={child} depth={depth + 1} />
          </div>
        ))}
      {!isBranch && !!(schema.items as Record<string, unknown> | undefined)?.properties && (
        <SchemaNode schema={schema.items as Record<string, unknown>} depth={depth + 1} />
      )}
      {!isBranch && Array.isArray(schema.enum) && (
        <div className="py-0.5 text-[10px] text-[var(--theme-text-secondary)]">
          enum: {(schema.enum as unknown[]).map((value) => String(value)).join(' | ')}
        </div>
      )}
      {!isBranch && (Array.isArray(schema.anyOf) || Array.isArray(schema.oneOf)) && (
        <div className="ml-3 border-l pl-2">
          {((schema.anyOf ?? schema.oneOf) as Array<Record<string, unknown>>).map((branch, index) => (
            <SchemaNode key={index} schema={branch} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

export const McpToolSchemaView: React.FC<{ inputSchema: Record<string, unknown> }> = ({ inputSchema }) => (
  <div data-testid="mcp-tool-schema-view" className="mt-1 rounded-md border bg-[var(--theme-bg-primary)] p-2">
    <SchemaNode schema={inputSchema} depth={0} />
  </div>
);
