import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { projectRoot } from './projectFiles';

const manifestPath = path.join(projectRoot, 'public', 'manifest.json');
const indexHtmlPath = path.join(projectRoot, 'index.html');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
  start_url: string;
  scope?: string;
  icons: Array<{ src: string; purpose?: string; type?: string }>;
};
const indexHtml = fs.readFileSync(indexHtmlPath, 'utf8');

describe('web manifest', () => {
  it('uses a root-scoped start URL for installed launches', () => {
    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
  });

  it('uses png icon assets for browser tabs and installed surfaces', () => {
    expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
    expect(indexHtml).toContain('rel="icon" id="favicon" href="/favicon.png" type="image/png"');
    expect(fs.existsSync(path.join(projectRoot, 'public', 'favicon.png'))).toBe(true);
    expect(indexHtml).toContain('rel="apple-touch-icon" id="apple-touch-icon" href="/apple-touch-icon.png"');
    expect(fs.existsSync(path.join(projectRoot, 'public', 'apple-touch-icon.png'))).toBe(true);

    expect(manifest.icons).toEqual([
      { src: '/pwa-192.png', type: 'image/png', sizes: '192x192' },
      { src: '/pwa-512.png', type: 'image/png', sizes: '512x512', purpose: 'any' },
      { src: '/pwa-512.png', type: 'image/png', sizes: '512x512', purpose: 'maskable' },
    ]);

    for (const icon of manifest.icons) {
      expect(icon.src.startsWith('data:')).toBe(false);
      expect(fs.existsSync(path.join(projectRoot, 'public', icon.src.replace(/^\//, '')))).toBe(true);
    }

    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  });
});
