import { Storage } from '@google-cloud/storage';
import { loadConfig } from './config.js';
import { createServer } from './createServer.js';
import { createGcsFilesAdapter } from './gcsFilesAdapter.js';
import { createVertexAuth } from './vertexAuth.js';

const config = loadConfig();
const vertexAuth = config.backendFlavor === 'vertex' ? createVertexAuth() : undefined;
const gcsFilesAdapter =
  config.backendFlavor === 'vertex' && config.gcs
    ? createGcsFilesAdapter({
        storage: new Storage({ projectId: config.vertex?.projectId }),
        config: config.gcs,
      })
    : undefined;
const server = createServer(config, { vertexAuth, gcsFilesAdapter });

server.listen(config.port, '0.0.0.0', () => {
  const features = [
    `backend: ${config.backendFlavor}`,
    config.backendFlavor === 'vertex' && config.gcs ? `gcs-files: ${config.gcs.bucketName}` : null,
  ]
    .filter(Boolean)
    .join(', ');
  console.log(`API server listening on port ${config.port} (${features})`);
});
