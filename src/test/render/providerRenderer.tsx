import type { ComponentType, PropsWithChildren, ReactNode } from 'react';
import { render as testingLibraryRender, type RenderOptions } from '@testing-library/react';
import { I18nProvider } from '@/contexts/I18nContext';
import { WindowProvider } from '@/contexts/WindowContext';
import { useSettingsStore } from '@/stores/settingsStore';
import type { SupportedLanguage } from '@/i18n/languageRegistry';
import {
  createTestRenderer,
  renderHook,
  setupTestRenderer as setupBaseTestRenderer,
  type RenderHookOptions,
  type TestRendererOptions,
  type TestWrapper,
} from './renderer';

type TestProviderOptions = {
  language?: SupportedLanguage;
  window?: Window;
  document?: Document;
};

type ProviderRenderOptions = Omit<RenderOptions, 'wrapper'> & {
  wrapper?: TestWrapper;
};

type ProviderTestRendererOptions = Omit<TestRendererOptions, 'wrapper'> & {
  providers?: TestProviderOptions;
  wrapper?: TestWrapper;
};

const setTestLanguage = (language: TestProviderOptions['language']) => {
  if (language) {
    useSettingsStore.setState({ language });
  }
};

const TestAppProviders = ({
  children,
  language,
  window: providerWindow,
  document: providerDocument,
}: PropsWithChildren<TestProviderOptions>) => {
  setTestLanguage(language);

  return (
    <I18nProvider>
      <WindowProvider window={providerWindow} document={providerDocument}>
        {children}
      </WindowProvider>
    </I18nProvider>
  );
};

const createProviderWrapper = (
  providers: TestProviderOptions | undefined,
  Wrapper?: TestWrapper,
): ComponentType<PropsWithChildren> => {
  const providerOptions = providers ?? {};

  return ({ children }) => {
    const content = Wrapper ? <Wrapper>{children}</Wrapper> : children;

    return <TestAppProviders {...providerOptions}>{content}</TestAppProviders>;
  };
};

export const createProviderTestRenderer = (options: ProviderTestRendererOptions = {}) => {
  const { providers, wrapper, ...rendererOptions } = options;

  return createTestRenderer({
    ...rendererOptions,
    wrapper: createProviderWrapper(providers, wrapper),
  });
};

export const setupProviderTestRenderer = (options: ProviderTestRendererOptions = {}) => {
  const { providers, wrapper, ...rendererOptions } = options;

  return setupBaseTestRenderer({
    ...rendererOptions,
    wrapper: createProviderWrapper(providers, wrapper),
  });
};

export const renderWithProviders = (ui: ReactNode, options: TestProviderOptions & ProviderRenderOptions = {}) => {
  const { language, window: providerWindow, document: providerDocument, wrapper, ...renderOptions } = options;

  return testingLibraryRender(ui, {
    ...renderOptions,
    wrapper: createProviderWrapper(
      {
        language,
        window: providerWindow,
        document: providerDocument,
      },
      wrapper,
    ),
  });
};

export const renderHookWithProviders = <T,>(
  callback: () => T,
  options: TestProviderOptions & Omit<RenderHookOptions, 'wrapper'> & { wrapper?: TestWrapper } = {},
) => {
  const { language, window: providerWindow, document: providerDocument, wrapper, ...renderOptions } = options;

  return renderHook(callback, {
    ...renderOptions,
    wrapper: createProviderWrapper(
      {
        language,
        window: providerWindow,
        document: providerDocument,
      },
      wrapper,
    ),
  });
};
