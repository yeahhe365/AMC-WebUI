export interface MarkdownPdfOptions {
  filename: string;
  themeId: string;
}

export type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  alt?: string;
  ordered?: boolean;
  checked?: boolean | null;
  depth?: number;
  lang?: string;
  children?: MarkdownNode[];
};
