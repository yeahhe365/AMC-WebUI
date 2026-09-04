// Minimal MCP server used by e2e tests (stdio mode). Exposes an echo tool and
// a failing tool so specs can verify both the happy path and error propagation.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({ name: 'amc-e2e-mcp-server', version: '1.0.0' });

server.registerTool(
  'echo',
  {
    description: 'Echo the given text back, plus any env marker.',
    inputSchema: { text: z.string().describe('text to echo') },
  },
  async ({ text }) => ({
    content: [{ type: 'text', text: `echo: ${text} (env=${process.env.MCP_TEST_MARKER ?? 'none'})` }],
  }),
);

server.registerTool(
  'add',
  {
    description: 'Add two integers.',
    inputSchema: { a: z.number().describe('first'), b: z.number().describe('second') },
  },
  async ({ a, b }) => ({
    content: [{ type: 'text', text: String(a + b) }],
  }),
);

server.registerTool(
  'fail_always',
  {
    description: 'Always fails; used to test error propagation.',
    inputSchema: { message: z.string().optional() },
  },
  async ({ message }) => {
    throw new Error(message || 'intentional test failure');
  },
);

server.registerResource(
  'greeting',
  'test://greeting',
  { mimeType: 'text/plain', description: 'A static greeting resource.' },
  async () => ({ contents: [{ uri: 'test://greeting', mimeType: 'text/plain', text: 'hello from mcp resource' }] }),
);

server.registerPrompt(
  'say_hello',
  { title: 'Say hello', description: 'Greets someone.', argsSchema: { name: z.string() } },
  async ({ name }) => ({
    messages: [{ role: 'user', content: { type: 'text', text: `Please greet ${name} warmly.` } }],
  }),
);

await server.connect(new StdioServerTransport());
