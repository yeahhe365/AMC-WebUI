import React from 'react';
import { Braces, FileCode2, Workflow } from 'lucide-react';
import { MaterialIcon } from './MaterialIcon';

// When a badge has no material icon, which lucide fallback to render.
// 'braces' (default) for code-ish languages without a material icon;
// 'workflow' for diagram languages whose material icon reads poorly at 20px.
type FallbackIcon = 'braces' | 'workflow';

type LanguageBadgeEntry = {
  aliases: string[];
  badgeId: string;
  displayName: string;
  compactLabel?: string;
  // material-icon-theme icon name; absent → lucide fallback
  materialIcon?: string;
  fallbackIcon?: FallbackIcon;
};

type LanguageBadgeConfig = {
  badgeId: string;
  iconId: string;
  displayName: string;
  compactLabel?: string;
  materialIcon?: string;
  fallbackIcon?: FallbackIcon;
};

const normalizeLanguage = (language: string) => language.trim().toLowerCase();
const LANGUAGE_ICON_SIZE = 20;

const LANGUAGE_BADGE_ENTRIES: LanguageBadgeEntry[] = [
  {
    aliases: ['py', 'py3', 'python'],
    badgeId: 'python',
    displayName: 'Python',
    materialIcon: 'python',
  },
  {
    aliases: ['tsx'],
    badgeId: 'tsx',
    displayName: 'TSX',
    materialIcon: 'react-ts',
  },
  {
    aliases: ['ts', 'typescript'],
    badgeId: 'typescript',
    displayName: 'TypeScript',
    materialIcon: 'typescript',
  },
  {
    aliases: ['js', 'javascript', 'node', 'nodejs'],
    badgeId: 'javascript',
    displayName: 'JavaScript',
    materialIcon: 'javascript',
  },
  {
    aliases: ['jsx', 'react'],
    badgeId: 'jsx',
    displayName: 'React',
    materialIcon: 'react',
  },
  {
    aliases: ['html', 'htm'],
    badgeId: 'html',
    displayName: 'HTML',
    materialIcon: 'html',
  },
  {
    aliases: ['css'],
    badgeId: 'css',
    displayName: 'CSS',
    materialIcon: 'css',
  },
  {
    aliases: ['scss', 'sass'],
    badgeId: 'sass',
    displayName: 'Sass',
    materialIcon: 'sass',
  },
  {
    aliases: ['less'],
    badgeId: 'less',
    displayName: 'Less',
    materialIcon: 'less',
  },
  {
    aliases: ['go', 'golang'],
    badgeId: 'go',
    displayName: 'Go',
    materialIcon: 'go',
  },
  {
    aliases: ['rust', 'rs'],
    badgeId: 'rust',
    displayName: 'Rust',
    materialIcon: 'rust',
  },
  {
    aliases: ['java', 'jvm'],
    badgeId: 'java',
    displayName: 'Java',
    materialIcon: 'java',
  },
  {
    aliases: ['cs', 'csharp', 'c#'],
    badgeId: 'csharp',
    displayName: 'C#',
    materialIcon: 'csharp',
  },
  {
    aliases: ['kotlin', 'kt', 'android'],
    badgeId: 'kotlin',
    displayName: 'Kotlin',
    materialIcon: 'kotlin',
  },
  {
    aliases: ['rb', 'ruby', 'rails'],
    badgeId: 'ruby',
    displayName: 'Ruby',
    materialIcon: 'ruby',
  },
  {
    aliases: ['php'],
    badgeId: 'php',
    displayName: 'PHP',
    materialIcon: 'php',
  },
  {
    aliases: ['swift'],
    badgeId: 'swift',
    displayName: 'Swift',
    materialIcon: 'swift',
  },
  {
    aliases: ['dart'],
    badgeId: 'dart',
    displayName: 'Dart',
    materialIcon: 'dart',
  },
  {
    aliases: ['lua'],
    badgeId: 'lua',
    displayName: 'Lua',
    materialIcon: 'lua',
  },
  {
    aliases: ['c', 'h'],
    badgeId: 'c',
    displayName: 'C',
    materialIcon: 'c',
  },
  {
    aliases: ['cpp', 'c++', 'hpp'],
    badgeId: 'cpp',
    displayName: 'C++',
    materialIcon: 'cpp',
  },
  {
    aliases: ['json', 'json5'],
    badgeId: 'json',
    displayName: 'JSON',
    materialIcon: 'json',
  },
  {
    aliases: ['sql', 'mysql', 'postgres', 'postgresql', 'sqlite', 'plsql'],
    badgeId: 'sql',
    displayName: 'SQL',
    materialIcon: 'database',
  },
  {
    aliases: ['sh', 'bash', 'zsh', 'shell', 'terminal', 'batch', 'cmd'],
    badgeId: 'shell',
    displayName: 'Shell',
    materialIcon: 'console',
  },
  {
    aliases: ['powershell', 'ps1'],
    badgeId: 'powershell',
    displayName: 'PowerShell',
    materialIcon: 'powershell',
  },
  {
    aliases: ['yaml', 'yml'],
    badgeId: 'yaml',
    displayName: 'YAML',
    materialIcon: 'yaml',
  },
  {
    aliases: ['toml'],
    badgeId: 'toml',
    displayName: 'TOML',
    materialIcon: 'toml',
  },
  {
    aliases: ['ini', 'config'],
    badgeId: 'ini',
    displayName: 'INI',
    materialIcon: 'settings',
  },
  {
    aliases: ['mermaid'],
    badgeId: 'mermaid',
    displayName: 'Mermaid',
    materialIcon: 'mermaid',
  },
  {
    aliases: ['graphviz'],
    badgeId: 'graphviz',
    displayName: 'Graphviz',
    compactLabel: 'DOT',
    // material dotjs is 4 faint translucent ellipses that read as noise at
    // 20px; Workflow (nodes + edges) is clearer for graphviz.
    fallbackIcon: 'workflow',
  },
  {
    aliases: ['dot'],
    badgeId: 'dot',
    displayName: 'DOT',
    fallbackIcon: 'workflow',
  },
  {
    aliases: ['md'],
    badgeId: 'md',
    displayName: 'Markdown',
    materialIcon: 'markdown',
  },
  {
    aliases: ['markdown'],
    badgeId: 'markdown',
    displayName: 'Markdown',
    materialIcon: 'markdown',
  },
  {
    aliases: ['csv'],
    badgeId: 'csv',
    displayName: 'CSV',
    materialIcon: 'document',
  },
  {
    aliases: ['txt'],
    badgeId: 'txt',
    displayName: 'TXT',
    materialIcon: 'document',
  },
  {
    aliases: ['text'],
    badgeId: 'text',
    displayName: 'TEXT',
    materialIcon: 'document',
  },
  {
    aliases: ['log'],
    badgeId: 'log',
    displayName: 'LOG',
    materialIcon: 'log',
  },
  {
    aliases: ['pl', 'perl'],
    badgeId: 'pl',
    displayName: 'PL',
    materialIcon: 'perl',
  },
  {
    aliases: ['r'],
    badgeId: 'r',
    displayName: 'R',
    materialIcon: 'r',
  },
  {
    aliases: ['docker', 'dockerfile'],
    badgeId: 'docker',
    displayName: 'DOCKER',
    materialIcon: 'docker',
  },
  {
    aliases: ['git'],
    badgeId: 'git',
    displayName: 'GIT',
    materialIcon: 'git',
  },
  {
    aliases: ['diff'],
    badgeId: 'diff',
    displayName: 'DIFF',
    materialIcon: 'diff',
  },
  {
    aliases: ['aws'],
    badgeId: 'aws',
    displayName: 'AWS',
  },
  {
    aliases: ['jenkins'],
    badgeId: 'jenkins',
    displayName: 'JENKINS',
  },
  {
    aliases: ['npm'],
    badgeId: 'npm',
    displayName: 'NPM',
    materialIcon: 'npm',
  },
  {
    aliases: ['yarn'],
    badgeId: 'yarn',
    displayName: 'YARN',
    materialIcon: 'yarn',
  },
  {
    aliases: ['pnpm'],
    badgeId: 'pnpm',
    displayName: 'PNPM',
    materialIcon: 'pnpm',
  },
  {
    aliases: ['xml'],
    badgeId: 'xml',
    displayName: 'XML',
    materialIcon: 'xml',
  },
  {
    aliases: ['svg'],
    badgeId: 'svg',
    displayName: 'SVG',
    materialIcon: 'svg',
  },
  {
    aliases: ['vue'],
    badgeId: 'vue',
    displayName: 'VUE',
    materialIcon: 'vue',
  },
  {
    aliases: ['vuejs'],
    badgeId: 'vuejs',
    displayName: 'VUEJS',
    materialIcon: 'vue',
  },
  {
    aliases: ['angular'],
    badgeId: 'angular',
    displayName: 'ANGULAR',
    materialIcon: 'angular',
  },
  {
    aliases: ['ng'],
    badgeId: 'ng',
    displayName: 'NG',
    materialIcon: 'angular',
  },
  {
    aliases: ['clj', 'cljs', 'clojure'],
    badgeId: 'clojure',
    displayName: 'Clojure',
    materialIcon: 'clojure',
  },
  {
    aliases: ['haskell', 'hs'],
    badgeId: 'haskell',
    displayName: 'Haskell',
    materialIcon: 'haskell',
  },
  {
    aliases: ['elixir', 'ex', 'exs'],
    badgeId: 'elixir',
    displayName: 'Elixir',
    materialIcon: 'elixir',
  },
  {
    aliases: ['erlang', 'erl'],
    badgeId: 'erlang',
    displayName: 'Erlang',
    materialIcon: 'erlang',
  },
  {
    aliases: ['scala', 'sc'],
    badgeId: 'scala',
    displayName: 'Scala',
    materialIcon: 'scala',
  },
  {
    aliases: ['groovy'],
    badgeId: 'groovy',
    displayName: 'Groovy',
    materialIcon: 'groovy',
  },
  {
    aliases: ['gradle'],
    badgeId: 'gradle',
    displayName: 'Gradle',
    materialIcon: 'gradle',
  },
  {
    aliases: ['fsharp', 'fs', 'fsx'],
    badgeId: 'fsharp',
    displayName: 'F#',
    materialIcon: 'fsharp',
  },
  {
    aliases: ['ocaml', 'ml', 'mli'],
    badgeId: 'ocaml',
    displayName: 'OCaml',
    materialIcon: 'ocaml',
  },
  {
    aliases: ['objectivec', 'objective-c', 'm'],
    badgeId: 'objective-c',
    displayName: 'Objective-C',
    materialIcon: 'objective-c',
  },
  {
    aliases: ['objectivecpp', 'objective-c++', 'mm'],
    badgeId: 'objective-cpp',
    displayName: 'Objective-C++',
    materialIcon: 'objective-cpp',
  },
  {
    aliases: ['zig'],
    badgeId: 'zig',
    displayName: 'Zig',
    materialIcon: 'zig',
  },
  {
    aliases: ['asm', 'assembly'],
    badgeId: 'assembly',
    displayName: 'Assembly',
    materialIcon: 'assembly',
  },
  {
    aliases: ['julia', 'jl'],
    badgeId: 'julia',
    displayName: 'Julia',
    materialIcon: 'julia',
  },
  {
    aliases: ['svelte'],
    badgeId: 'svelte',
    displayName: 'Svelte',
    materialIcon: 'svelte',
  },
  {
    aliases: ['astro'],
    badgeId: 'astro',
    displayName: 'Astro',
    materialIcon: 'astro',
  },
  {
    aliases: ['stylus', 'styl'],
    badgeId: 'stylus',
    displayName: 'Stylus',
    materialIcon: 'stylus',
  },
  {
    aliases: ['jupyter', 'ipynb'],
    badgeId: 'jupyter',
    displayName: 'Jupyter',
    materialIcon: 'jupyter',
  },
  {
    aliases: ['makefile', 'make', 'cmake'],
    badgeId: 'makefile',
    displayName: 'Makefile',
    materialIcon: 'makefile',
  },
  {
    aliases: ['graphql', 'gql'],
    badgeId: 'graphql',
    displayName: 'GraphQL',
    materialIcon: 'graphql',
  },
  {
    aliases: ['proto', 'protobuf'],
    badgeId: 'proto',
    displayName: 'Protocol Buffer',
    materialIcon: 'proto',
  },
  {
    aliases: ['prisma'],
    badgeId: 'prisma',
    displayName: 'Prisma',
    materialIcon: 'prisma',
  },
  {
    aliases: ['terraform', 'tf'],
    badgeId: 'terraform',
    displayName: 'Terraform',
    materialIcon: 'terraform',
  },
  {
    aliases: ['hcl'],
    badgeId: 'hcl',
    displayName: 'HCL',
    materialIcon: 'hcl',
  },
  {
    aliases: ['next'],
    badgeId: 'next',
    displayName: 'Next.js',
    materialIcon: 'next',
  },
  {
    aliases: ['nuxt'],
    badgeId: 'nuxt',
    displayName: 'Nuxt',
    materialIcon: 'nuxt',
  },
  {
    aliases: ['vite'],
    badgeId: 'vite',
    displayName: 'Vite',
    materialIcon: 'vite',
  },
  {
    aliases: ['vitest'],
    badgeId: 'vitest',
    displayName: 'Vitest',
    materialIcon: 'vitest',
  },
  {
    aliases: ['webpack'],
    badgeId: 'webpack',
    displayName: 'Webpack',
    materialIcon: 'webpack',
  },
  {
    aliases: ['rollup'],
    badgeId: 'rollup',
    displayName: 'Rollup',
    materialIcon: 'rollup',
  },
  {
    aliases: ['eslint'],
    badgeId: 'eslint',
    displayName: 'ESLint',
    materialIcon: 'eslint',
  },
  {
    aliases: ['prettier'],
    badgeId: 'prettier',
    displayName: 'Prettier',
    materialIcon: 'prettier',
  },
  {
    aliases: ['biome'],
    badgeId: 'biome',
    displayName: 'Biome',
    materialIcon: 'biome',
  },
  {
    aliases: ['postcss'],
    badgeId: 'postcss',
    displayName: 'PostCSS',
    materialIcon: 'postcss',
  },
  {
    aliases: ['tailwind', 'tailwindcss'],
    badgeId: 'tailwindcss',
    displayName: 'Tailwind CSS',
    materialIcon: 'tailwindcss',
  },
  {
    aliases: ['nodejs'],
    badgeId: 'nodejs',
    displayName: 'Node.js',
    materialIcon: 'nodejs',
  },
  {
    aliases: ['deno'],
    badgeId: 'deno',
    displayName: 'Deno',
    materialIcon: 'deno',
  },
  {
    aliases: ['bun'],
    badgeId: 'bun',
    displayName: 'Bun',
    materialIcon: 'bun',
  },
  {
    aliases: ['mdx'],
    badgeId: 'mdx',
    displayName: 'MDX',
    materialIcon: 'mdx',
  },
  {
    aliases: ['pdf'],
    badgeId: 'pdf',
    displayName: 'PDF',
    materialIcon: 'pdf',
  },
  {
    aliases: ['tex', 'latex'],
    badgeId: 'tex',
    displayName: 'TeX',
    materialIcon: 'tex',
  },
  {
    aliases: ['license', 'licence'],
    badgeId: 'license',
    displayName: 'License',
    materialIcon: 'license',
  },
  {
    aliases: ['changelog'],
    badgeId: 'changelog',
    displayName: 'Changelog',
    materialIcon: 'changelog',
  },
  {
    aliases: ['readme'],
    badgeId: 'readme',
    displayName: 'README',
    materialIcon: 'readme',
  },
  {
    aliases: ['lock'],
    badgeId: 'lock',
    displayName: 'Lockfile',
    materialIcon: 'lock',
  },
  {
    aliases: ['zip', 'tar', 'gz', '7z', 'rar'],
    badgeId: 'zip',
    displayName: 'Archive',
    materialIcon: 'zip',
  },
  {
    aliases: ['audio', 'mp3', 'wav', 'ogg'],
    badgeId: 'audio',
    displayName: 'Audio',
    materialIcon: 'audio',
  },
  {
    aliases: ['video', 'mp4', 'mkv'],
    badgeId: 'video',
    displayName: 'Video',
    materialIcon: 'video',
  },
  {
    aliases: ['image', 'png', 'jpg', 'jpeg', 'gif', 'webp'],
    badgeId: 'image',
    displayName: 'Image',
    materialIcon: 'image',
  },
  {
    aliases: ['font', 'ttf', 'otf', 'woff', 'woff2'],
    badgeId: 'font',
    displayName: 'Font',
    materialIcon: 'font',
  },
  {
    aliases: ['env'],
    badgeId: 'tune',
    displayName: 'Environment',
    materialIcon: 'tune',
  },
  {
    aliases: ['jsconfig'],
    badgeId: 'jsconfig',
    displayName: 'JSConfig',
    materialIcon: 'jsconfig',
  },
  {
    aliases: ['tsconfig'],
    badgeId: 'tsconfig',
    displayName: 'TSConfig',
    materialIcon: 'tsconfig',
  },
  {
    aliases: ['typescript-def', 'd.ts'],
    badgeId: 'typescript-def',
    displayName: 'TypeScript Def',
    materialIcon: 'typescript-def',
  },
  {
    aliases: ['gemfile', 'gem'],
    badgeId: 'gemfile',
    displayName: 'Gemfile',
    materialIcon: 'gemfile',
  },
  {
    aliases: ['go-mod', 'gomod'],
    badgeId: 'go-mod',
    displayName: 'Go Module',
    materialIcon: 'go-mod',
  },
] satisfies LanguageBadgeEntry[];

const LANGUAGE_BADGE_CONFIGS = new Map<string, LanguageBadgeConfig>(
  LANGUAGE_BADGE_ENTRIES.flatMap((entry) =>
    entry.aliases.map((alias) => [
      alias,
      {
        badgeId: entry.badgeId,
        iconId: entry.materialIcon ?? entry.fallbackIcon ?? 'braces',
        displayName: entry.displayName,
        compactLabel: entry.compactLabel,
        materialIcon: entry.materialIcon,
        fallbackIcon: entry.fallbackIcon,
      },
    ]),
  ),
);

const renderIcon = (config: LanguageBadgeConfig): React.ReactNode => {
  if (config.materialIcon) {
    return <MaterialIcon name={config.materialIcon} size={LANGUAGE_ICON_SIZE} />;
  }

  if (config.iconId === 'generic') {
    return <FileCode2 size={LANGUAGE_ICON_SIZE} strokeWidth={2.1} className="text-gray-400" />;
  }

  if (config.fallbackIcon === 'workflow') {
    return <Workflow size={LANGUAGE_ICON_SIZE} strokeWidth={2.1} className="text-pink-400" />;
  }

  return <Braces size={LANGUAGE_ICON_SIZE} strokeWidth={2.1} className="text-violet-400" />;
};

const getLanguageBadgeConfig = (language: string): LanguageBadgeConfig => {
  const lang = normalizeLanguage(language || 'text');
  const mappedConfig = LANGUAGE_BADGE_CONFIGS.get(lang);
  if (mappedConfig) {
    return mappedConfig;
  }

  return {
    badgeId: lang,
    iconId: 'generic',
    displayName: lang,
  };
};

// The set of material-icon-theme icons referenced by the badge entries. Guarded
// by materialIconSubset.test.ts against the generated MATERIAL_ICONS module.
export const MATERIAL_ICON_NAMES = Array.from(
  new Set(LANGUAGE_BADGE_ENTRIES.map((entry) => entry.materialIcon).filter((name): name is string => Boolean(name))),
).sort();

export const LanguageIcon: React.FC<{ language: string }> = ({ language }) => {
  const config = getLanguageBadgeConfig(language || 'text');

  return (
    <div
      data-language-badge={config.badgeId}
      className="inline-flex max-w-full items-center gap-1.5 select-none"
      title={config.displayName}
    >
      <span
        data-language-icon={config.iconId}
        className="inline-flex h-5 flex-shrink-0 items-center justify-center"
        aria-hidden="true"
      >
        {renderIcon(config)}
      </span>
      <span data-language-meta className="inline-flex min-w-0 items-center gap-1.5">
        <span className="truncate text-xs font-bold uppercase leading-none tracking-wider text-[var(--theme-text-secondary)]">
          {config.displayName}
        </span>
        {config.compactLabel && (
          <span className="truncate text-xs font-mono font-semibold uppercase leading-none tracking-[0.12em] text-[var(--theme-text-tertiary)]">
            {config.compactLabel}
          </span>
        )}
      </span>
    </div>
  );
};
