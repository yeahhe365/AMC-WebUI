import { describe, expect, it } from 'vitest';
import { DOT_MAX_CHARS, DOT_MAX_EDGES, DOT_MAX_NODES, countDotEdges, countDotNodes } from './graphvizLimits';

describe('countDotEdges', () => {
  it('counts -> and -- operators', () => {
    expect(countDotEdges('digraph { A -> B; C -- D; E -> F -> G }')).toBe(4);
  });

  it('ignores arrows inside comments', () => {
    expect(countDotEdges('digraph { A -> B /* -> */ // ->\n }')).toBe(1);
  });

  it('ignores arrows inside quoted labels', () => {
    expect(countDotEdges('digraph { A[label="a -> b"] -> B }')).toBe(1);
  });
});

describe('countDotNodes', () => {
  it('counts distinct node ids', () => {
    expect(countDotNodes('digraph { A; B; A -> B }')).toBe(2);
  });

  it('counts nodes declared with attribute brackets', () => {
    expect(countDotNodes('digraph { start[label="开始"]; parse[label="解析请求"]; start->parse; }')).toBe(2);
  });

  it('ignores subgraph/node/edge keywords and rank attributes', () => {
    const dot = 'digraph { subgraph cluster0 { rank=same; A; B } A -> B }';
    // A, B are real nodes; subgraph, rank, cluster0 are not counted.
    expect(countDotNodes(dot)).toBe(2);
  });

  it('ignores nodes inside comments and quoted strings', () => {
    const dot = 'digraph { A -> B # comment C\n /* D; E */ }';
    expect(countDotNodes(dot)).toBe(2);
  });

  it('ignores node ids inside quoted labels', () => {
    const dot = 'digraph { A[label="B"] -> C }';
    expect(countDotNodes(dot)).toBe(2);
  });
});

describe('limits consistency', () => {
  it('exposes the same limits the prompts advertise', () => {
    expect(DOT_MAX_CHARS).toBe(16_000);
    expect(DOT_MAX_NODES).toBe(40);
    expect(DOT_MAX_EDGES).toBe(80);
  });

  it('node count is a heuristic upper bound: a 41-node graph trips the limit', () => {
    const dot = `digraph { ${Array.from({ length: 41 }, (_, i) => `n${i}`).join('; ')}; }`;
    expect(countDotNodes(dot)).toBeGreaterThan(DOT_MAX_NODES);
  });
});
