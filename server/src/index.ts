import { loadConfig } from './config.js';
import { attachLiveWsUpgrade, createServer } from './createServer.js';

const config = loadConfig();
const server = createServer(config);
attachLiveWsUpgrade(server, config);

server.listen(config.port, '0.0.0.0', () => {
  console.log(`API server listening on port ${config.port}`);
  if (config.enableMcpStdio) {
    console.warn(
      '[mcp] ENABLE_MCP_STDIO is on: any client that can reach this port can run arbitrary commands through stdio MCP servers. Keep the port internal (docker expose / localhost only).',
    );
  }
});
