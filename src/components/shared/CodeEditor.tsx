import React, { useMemo } from 'react';
import CodeMirror, { type Extension } from '@uiw/react-codemirror';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { json } from '@codemirror/lang-json';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { markdown } from '@codemirror/lang-markdown';
import { xml } from '@codemirror/lang-xml';
import { sql } from '@codemirror/lang-sql';
import { cpp } from '@codemirror/lang-cpp';
import { rust } from '@codemirror/lang-rust';
import { java } from '@codemirror/lang-java';
import { php } from '@codemirror/lang-php';
import { yaml } from '@codemirror/lang-yaml';
import { go } from '@codemirror/lang-go';
import { oneDark } from '@codemirror/theme-one-dark';
import { useSettingsStore } from '@/stores/settingsStore';

export const getLanguageExtension = (language: string): Extension | null => {
  const lang = (language || '')
    .toLowerCase()
    .trim()
    .replace(/^language-/, '')
    .replace(/^\./, '');
  if (['javascript', 'js', 'jsx', 'ts', 'typescript', 'tsx', 'mjs', 'cjs', 'node'].includes(lang)) {
    return javascript({ jsx: true, typescript: true });
  }
  if (['python', 'py', 'py3'].includes(lang)) {
    return python();
  }
  if (['json', 'jsonc'].includes(lang)) {
    return json();
  }
  if (['html', 'htm'].includes(lang)) {
    return html();
  }
  if (['css', 'scss', 'less'].includes(lang)) {
    return css();
  }
  if (['markdown', 'md'].includes(lang)) {
    return markdown();
  }
  if (['xml', 'svg'].includes(lang)) {
    return xml();
  }
  if (['sql', 'mysql', 'pgsql', 'postgres', 'postgresql', 'sqlite'].includes(lang)) {
    return sql();
  }
  if (['cpp', 'c', 'c++', 'cc', 'cxx', 'h', 'hpp'].includes(lang)) {
    return cpp();
  }
  if (['rust', 'rs'].includes(lang)) {
    return rust();
  }
  if (['java'].includes(lang)) {
    return java();
  }
  if (['php'].includes(lang)) {
    return php();
  }
  if (['yaml', 'yml'].includes(lang)) {
    return yaml();
  }
  if (['go', 'golang'].includes(lang)) {
    return go();
  }
  return null;
};

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  language: string;
  className?: string;
  readOnly?: boolean;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  value,
  onChange,
  language,
  className = '',
  readOnly = false,
}) => {
  const isDark = useSettingsStore((state) => state.currentTheme.isDark);

  const extensions = useMemo(() => {
    const langExt = getLanguageExtension(language);
    return langExt ? [langExt] : [];
  }, [language]);

  return (
    <div className={`relative w-full h-full overflow-hidden bg-[var(--theme-bg-code-block)] ${className}`}>
      <CodeMirror
        value={value}
        height="100%"
        theme={isDark ? oneDark : 'light'}
        extensions={extensions}
        editable={!readOnly}
        readOnly={readOnly}
        onChange={onChange}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: true,
          foldGutter: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: true,
          history: true,
        }}
        className="w-full h-full text-sm font-mono"
      />
    </div>
  );
};
