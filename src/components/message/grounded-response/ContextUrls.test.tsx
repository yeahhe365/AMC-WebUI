import { act } from 'react';
import { setupProviderTestRenderer } from '@/test/render/providerRenderer';
import { describe, expect, it } from 'vitest';
import { ContextUrls } from './ContextUrls';

describe('ContextUrls', () => {
  const renderer = setupProviderTestRenderer({ providers: { language: 'en' } });

  it('renders nothing when metadata is empty or missing', () => {
    act(() => {
      renderer.root.render(<ContextUrls metadata={undefined} />);
    });
    expect(renderer.container.innerHTML).toBe('');

    act(() => {
      renderer.root.render(<ContextUrls metadata={{ urlMetadata: [] }} />);
    });
    expect(renderer.container.innerHTML).toBe('');
  });

  it('renders camelCase urlMetadata with success, paywall, and error statuses', () => {
    act(() => {
      renderer.root.render(
        <ContextUrls
          metadata={{
            urlMetadata: [
              {
                retrievedUrl: 'https://example.com/recipes/chicken',
                urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_SUCCESS',
              },
              {
                retrievedUrl: 'https://wsj.com/articles/finance-report',
                urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_PAYWALL',
              },
              {
                retrievedUrl: 'https://unsafe-site.com/malware',
                urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_UNSAFE',
              },
              {
                retrievedUrl: 'https://broken.link/404',
                urlRetrievalStatus: 'URL_RETRIEVAL_STATUS_ERROR',
              },
            ],
          }}
        />,
      );
    });

    // Renders section header
    expect(renderer.container.textContent).toContain('Context URLs');

    // Displays formatted paths
    expect(renderer.container.textContent).toContain('example.com/recipes/chicken');
    expect(renderer.container.textContent).toContain('wsj.com/articles/finance-report');
    expect(renderer.container.textContent).toContain('unsafe-site.com/malware');
    expect(renderer.container.textContent).toContain('broken.link/404');

    // Paywall status pill is displayed
    expect(renderer.container.textContent).toContain('Paywall');
    // Unsafe status pill is displayed
    expect(renderer.container.textContent).toContain('Unsafe Content');
    // Error status pill is displayed
    expect(renderer.container.textContent).toContain('Failed to Retrieve');

    // Links are properly anchored with target blank
    const links = renderer.container.querySelectorAll('a');
    expect(links).toHaveLength(4);
    expect(links[0]?.getAttribute('href')).toBe('https://example.com/recipes/chicken');
    expect(links[0]?.getAttribute('target')).toBe('_blank');
    expect(links[0]?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('renders snake_case url_metadata properly', () => {
    act(() => {
      renderer.root.render(
        <ContextUrls
          metadata={{
            url_metadata: [
              {
                retrieved_url: 'https://github.com/google-gemini/cookbook',
                url_retrieval_status: 'SUCCESS',
              },
            ],
          }}
        />,
      );
    });

    expect(renderer.container.textContent).toContain('github.com/google-gemini/cookbook');
    const links = renderer.container.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(links[0]?.getAttribute('href')).toBe('https://github.com/google-gemini/cookbook');
  });
});
