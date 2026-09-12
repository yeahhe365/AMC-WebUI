import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { projectRoot } from './projectFiles';

const animationsPath = path.join(projectRoot, 'src/styles/animations.css');
const mainCssPath = path.join(projectRoot, 'src/styles/main.css');
const historySidebarPath = path.join(projectRoot, 'src/components/sidebar/HistorySidebar.tsx');
const chatAreaPath = path.join(projectRoot, 'src/components/layout/ChatArea.tsx');
const welcomeScreenPath = path.join(projectRoot, 'src/components/chat/message-list/WelcomeScreen.tsx');

describe('animation utility coverage', () => {
  it('defines local entry animation utilities used across the UI', () => {
    const css = fs.readFileSync(animationsPath, 'utf8');

    expect(css).toContain('.animate-in');
    expect(css).toContain('.fade-in');
    expect(css).toContain('.zoom-in');
    expect(css).toContain('.zoom-in-95');
    expect(css).toContain('.slide-in-from-top-1');
    expect(css).toContain('.slide-in-from-top-4');
    expect(css).toContain('.slide-in-from-bottom-2');
    expect(css).toContain('.slide-in-from-left-1');
  });

  it('provides a reduced-motion fallback for animated surfaces', () => {
    const css = fs.readFileSync(animationsPath, 'utf8');

    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('removes stale message entry utility selectors that are no longer wired into the UI', () => {
    const css = fs.readFileSync(animationsPath, 'utf8');

    expect(css).not.toContain('.message-smooth-entry');
    expect(css).not.toContain('.message-container-animate');
  });
});

describe('motion-sensitive UI behavior', () => {
  it('keeps the welcome easter egg on explicit activation instead of hover timing', () => {
    const source = fs.readFileSync(welcomeScreenPath, 'utf8');

    expect(source).toContain('onClick={handleClick}');
    expect(source).toContain("event.key === 'Enter'");
    expect(source).toContain('setTimeout');
  });

  it('gives the welcome easter egg keyboard and live-region affordances', () => {
    const source = fs.readFileSync(welcomeScreenPath, 'utf8');

    expect(source).toContain('type="button"');
    expect(source).toContain('aria-live="polite"');
  });
});

describe('theme transition scope', () => {
  it('does not animate every div in the application during theme updates', () => {
    const css = fs.readFileSync(mainCssPath, 'utf8');

    expect(css).not.toMatch(/body,\s*#root,\s*div,\s*header/s);
  });

  it('limits theme transitions to dedicated surfaces instead of broad layout tags', () => {
    const css = fs.readFileSync(mainCssPath, 'utf8');

    expect(css).not.toMatch(/body,\s*#root,\s*header,\s*main/s);
    expect(css).toMatch(/body,\s*#root,\s*\.theme-transition-colors/s);
  });
});

describe('layout animation guardrails', () => {
  it('restores a dedicated desktop width transition without coupling it to transform hints', () => {
    const source = fs.readFileSync(historySidebarPath, 'utf8');

    expect(source).toContain('md:transition-[width]');
    expect(source).toContain('transition-transform');
    expect(source).not.toContain('transition-[width,transform]');
    expect(source).not.toContain('will-change-[width,transform]');
  });

  it('keeps desktop full and mini sidebar shells mounted so opacity can animate between them', () => {
    const source = fs.readFileSync(historySidebarPath, 'utf8');

    expect(source).toContain('md:absolute md:inset-0 transition-opacity');
    expect(source).toContain('hidden md:flex absolute inset-0');
    expect(source).not.toContain('{isOpen ? (');
  });

  it('uses a ten-percent narrower desktop history sidebar width', () => {
    const source = fs.readFileSync(historySidebarPath, 'utf8');

    expect(source).toContain("isOpen ? 'w-64 md:w-[16.2rem] translate-x-0'");
    expect(source).toContain('w-64 md:w-[16.2rem] h-full');
    expect(source).toContain('md:min-w-[16.2rem]');
    expect(source).not.toContain('md:w-72');
    expect(source).not.toContain('md:min-w-[18rem]');
  });

  it('tightens collapsed desktop sidebar button spacing so mini actions do not feel too sparse', () => {
    const source = fs.readFileSync(historySidebarPath, 'utf8');

    expect(source).toContain('gap-[0.56rem]');
  });

  it('uses a ten-percent narrower collapsed desktop history sidebar width', () => {
    const source = fs.readFileSync(historySidebarPath, 'utf8');

    expect(source).toContain("isOpen ? 'w-64 md:w-[16.2rem] translate-x-0' : 'w-64 md:w-[52.2px]");
    expect(source).toContain('min-w-[52.2px]');
    expect(source).not.toContain('md:w-[58px]');
    expect(source).not.toContain('min-w-[58px]');
  });

  it('does not keep chat area on width-based will-change hints', () => {
    const source = fs.readFileSync(chatAreaPath, 'utf8');

    expect(source).not.toContain('will-change-[width]');
  });
});

describe('sidebar backdrop behavior', () => {
  it('keeps the mobile backdrop mounted so exit opacity can animate', () => {
    const mainContentPath = path.join(projectRoot, 'src/components/layout/MainContent.tsx');
    const source = fs.readFileSync(mainContentPath, 'utf8');

    expect(source).toContain('opacity-100 pointer-events-auto');
    expect(source).toContain('opacity-0 pointer-events-none');
    expect(source).not.toContain('uiState.isHistorySidebarOpen && (');
  });
});
