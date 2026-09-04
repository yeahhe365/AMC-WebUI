import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import type { PluggableList } from 'unified';

export const mathRemarkPlugins: PluggableList = [remarkMath];

export const getMathRehypePlugins = (): PluggableList => [[rehypeKatex, { throwOnError: false, strict: false }]];
