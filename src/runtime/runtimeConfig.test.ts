import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  getBackendFlavor,
  getPyodideBaseUrl,
  getRuntimeConfigAppSettingsOverrides,
  isRuntimeApiConfigEnforced,
} from './runtimeConfig';

const setRuntimeConfig = (config: Record<string, unknown>) => {
  (window as Window & { __AMC_RUNTIME_CONFIG__?: Record<string, unknown> }).__AMC_RUNTIME_CONFIG__ = config;
};

describe('runtimeConfig', () => {
  afterEach(() => {
    delete window.__AMC_RUNTIME_CONFIG__;
  });

  it('returns empty overrides when runtime config is missing', () => {
    expect(getRuntimeConfigAppSettingsOverrides()).toEqual({});
  });

  it('returns no Pyodide base URL override when runtime config is missing or blank', () => {
    expect(getPyodideBaseUrl()).toBeNull();

    setRuntimeConfig({
      pyodideBaseUrl: '   ',
    });

    expect(getPyodideBaseUrl()).toBeNull();
  });

  it('reads a trimmed Pyodide base URL override from window runtime config', () => {
    setRuntimeConfig({
      pyodideBaseUrl: '  https://cdn.example.com/pyodide/v0.25.1/full/  ',
    });

    expect(getPyodideBaseUrl()).toBe('https://cdn.example.com/pyodide/v0.25.1/full/');
  });

  it('reads supported app setting overrides from window runtime config', () => {
    window.__AMC_RUNTIME_CONFIG__ = {
      serverManagedApi: true,
      useCustomApiConfig: true,
      useApiProxy: true,
      apiProxyUrl: 'https://proxy.runtime.example/v1beta',
    };

    expect(getRuntimeConfigAppSettingsOverrides()).toEqual({
      serverManagedApi: true,
      useCustomApiConfig: true,
      useApiProxy: true,
      apiProxyUrl: 'https://proxy.runtime.example/v1beta',
    });
  });

  it('converts string values into typed setting overrides', () => {
    window.__AMC_RUNTIME_CONFIG__ = {
      serverManagedApi: 'true',
      useCustomApiConfig: '1',
      useApiProxy: 'false',
      apiProxyUrl: '  ',
    };

    expect(getRuntimeConfigAppSettingsOverrides()).toEqual({
      serverManagedApi: true,
      useCustomApiConfig: true,
      useApiProxy: false,
      apiProxyUrl: null,
    });
  });

  it('does not ship a Live API token endpoint in the static runtime config', () => {
    const runtimeConfigSource = fs.readFileSync(path.resolve(__dirname, '../../public/runtime-config.js'), 'utf8');

    expect(runtimeConfigSource).not.toContain('liveApiEphemeralTokenEndpoint');
    expect(runtimeConfigSource).not.toContain('/api/live-token');
  });

  it('ships Pyodide with a nullable static runtime override', () => {
    const runtimeConfigSource = fs.readFileSync(path.resolve(__dirname, '../../public/runtime-config.js'), 'utf8');

    expect(runtimeConfigSource).toContain('pyodideBaseUrl: null');
  });

  it('defaults the backend flavor to AI Studio', () => {
    const runtimeConfigSource = fs.readFileSync(path.resolve(__dirname, '../../public/runtime-config.js'), 'utf8');

    expect(runtimeConfigSource).toContain("backendFlavor: 'aistudio'");
    expect(runtimeConfigSource).toContain('enforceApiConfig: false');
    expect(getBackendFlavor()).toBe('aistudio');
  });

  it('reads the Vertex backend flavor case-insensitively', () => {
    setRuntimeConfig({ backendFlavor: 'vertex' });
    expect(getBackendFlavor()).toBe('vertex');

    setRuntimeConfig({ backendFlavor: 'VERTEX' });
    expect(getBackendFlavor()).toBe('vertex');

    setRuntimeConfig({ backendFlavor: 'unsupported' });
    expect(getBackendFlavor()).toBe('aistudio');
  });

  it('enforces runtime API config only for Vertex or explicit deployment profiles', () => {
    expect(isRuntimeApiConfigEnforced()).toBe(false);

    setRuntimeConfig({ backendFlavor: 'aistudio', enforceApiConfig: 'true' });
    expect(isRuntimeApiConfigEnforced()).toBe(true);

    setRuntimeConfig({ backendFlavor: 'vertex', enforceApiConfig: false });
    expect(isRuntimeApiConfigEnforced()).toBe(true);
  });

  it('forces server-managed proxy routing in Vertex mode', () => {
    setRuntimeConfig({
      backendFlavor: 'vertex',
      serverManagedApi: false,
      useCustomApiConfig: false,
      useApiProxy: false,
      apiProxyUrl: '   ',
    });

    expect(getRuntimeConfigAppSettingsOverrides()).toEqual({
      serverManagedApi: true,
      useCustomApiConfig: true,
      useApiProxy: true,
      apiProxyUrl: '/api/gemini',
    });
  });

  it('uses the configured proxy URL in Vertex mode', () => {
    setRuntimeConfig({
      backendFlavor: 'vertex',
      apiProxyUrl: 'https://api.example.com/api/gemini',
    });

    expect(getRuntimeConfigAppSettingsOverrides()).toMatchObject({
      apiProxyUrl: 'https://api.example.com/api/gemini',
    });
  });

  it('defaults Docker runtime config to BYOK instead of server-managed credentials', () => {
    const projectRoot = path.resolve(__dirname, '../..');
    const webServerSource = fs.readFileSync(path.join(projectRoot, 'docker/web-server.js'), 'utf8');
    const composeSource = fs.readFileSync(path.join(projectRoot, 'docker-compose.yml'), 'utf8');
    const envExampleSource = fs.readFileSync(path.join(projectRoot, '.env.example'), 'utf8');
    const vertexProfileSource = fs.readFileSync(path.join(projectRoot, '.env.vertex.example'), 'utf8');
    const aiStudioProfileSource = fs.readFileSync(path.join(projectRoot, '.env.aistudio.example'), 'utf8');
    const byokProfileSource = fs.readFileSync(path.join(projectRoot, '.env.byok.example'), 'utf8');
    const switchScriptSource = fs.readFileSync(path.join(projectRoot, 'scripts/switch-backend.sh'), 'utf8');

    expect(webServerSource).toContain('serverManagedApi: toBool(process.env.RUNTIME_SERVER_MANAGED_API)');
    expect(webServerSource).toContain('RUNTIME_PYODIDE_BASE_URL');
    expect(webServerSource).toContain('RUNTIME_BACKEND_FLAVOR');
    expect(webServerSource).toContain('RUNTIME_ENFORCE_API_CONFIG');
    expect(webServerSource).toContain("pathname === '/health'");
    expect(composeSource).toContain('RUNTIME_SERVER_MANAGED_API:-false');
    expect(composeSource).toContain('RUNTIME_PYODIDE_BASE_URL');
    expect(composeSource).toContain('RUNTIME_BACKEND_FLAVOR:-aistudio');
    expect(composeSource).toContain('RUNTIME_ENFORCE_API_CONFIG:-false');
    expect(composeSource).toContain('GOOGLE_APPLICATION_CREDENTIALS_DIR:-./docker/empty-secrets');
    expect(envExampleSource).toContain('GEMINI_API_KEY=');
    expect(envExampleSource).toContain('RUNTIME_SERVER_MANAGED_API=false');
    expect(envExampleSource).toContain('RUNTIME_PYODIDE_BASE_URL=');
    expect(envExampleSource).toContain('RUNTIME_BACKEND_FLAVOR=aistudio');
    expect(envExampleSource).toContain('RUNTIME_ENFORCE_API_CONFIG=false');
    expect(envExampleSource).toContain('GEMINI_BACKEND=aistudio');
    expect(envExampleSource).not.toContain('/api/live-token');
    expect(vertexProfileSource).toContain('GEMINI_BACKEND=vertex');
    expect(vertexProfileSource).toContain('GOOGLE_APPLICATION_CREDENTIALS_DIR=./secrets');
    expect(vertexProfileSource).toContain('RUNTIME_ENFORCE_API_CONFIG=true');
    expect(aiStudioProfileSource).toContain('RUNTIME_SERVER_MANAGED_API=true');
    expect(aiStudioProfileSource).toContain('GOOGLE_APPLICATION_CREDENTIALS_DIR=./docker/empty-secrets');
    expect(byokProfileSource).toContain('RUNTIME_SERVER_MANAGED_API=false');
    expect(byokProfileSource).toContain('RUNTIME_ENFORCE_API_CONFIG=true');
    expect(byokProfileSource).toContain('GEMINI_API_KEY=\n');
    expect(switchScriptSource).toContain('up -d --force-recreate');
  });
});
