import { describe, expect, it } from 'vitest';
import { LOCAL_PYTHON_SYSTEM_PROMPT } from './localPython';

describe('LOCAL_PYTHON_SYSTEM_PROMPT', () => {
  it('instructs the model to use the local python tool instead of returning raw code blocks', () => {
    expect(LOCAL_PYTHON_SYSTEM_PROMPT).toContain('Call the `run_local_python` tool');
    expect(LOCAL_PYTHON_SYSTEM_PROMPT).toContain('Do not return fenced Python code blocks');
    expect(LOCAL_PYTHON_SYSTEM_PROMPT).toContain('After receiving the tool response');
    expect(LOCAL_PYTHON_SYSTEM_PROMPT).toContain('Do NOT write or simulate "Execution Result"');
  });

  it('requires explicit file output for plots', () => {
    expect(LOCAL_PYTHON_SYSTEM_PROMPT).toContain('plt.savefig("chart.png")');
  });

  it('tells the model to answer in prose when the tool is absent instead of inventing calls', () => {
    expect(LOCAL_PYTHON_SYSTEM_PROMPT).toContain('run_local_python');
    expect(LOCAL_PYTHON_SYSTEM_PROMPT).toMatch(/carries no `run_local_python` tool[\s\S]*answer normally in prose/i);
    expect(LOCAL_PYTHON_SYSTEM_PROMPT).toMatch(/never invent tool calls/i);
  });

  it('discloses the per-execution time limit', () => {
    expect(LOCAL_PYTHON_SYSTEM_PROMPT).toMatch(/60\s?seconds/);
  });

  it('tells the model to import libraries directly instead of reaching for micropip', () => {
    expect(LOCAL_PYTHON_SYSTEM_PROMPT).not.toContain('Use `micropip` only if explicitly instructed');
    expect(LOCAL_PYTHON_SYSTEM_PROMPT).toMatch(/import .* directly/i);
  });

  it('names the concrete runtime behind the tool (Pyodide + Python version)', () => {
    expect(LOCAL_PYTHON_SYSTEM_PROMPT).toContain('Pyodide');
    expect(LOCAL_PYTHON_SYSTEM_PROMPT).toMatch(/Python 3\.12/);
  });

  it('describes the tool response shape (output/result/generatedFiles/imageGenerated)', () => {
    expect(LOCAL_PYTHON_SYSTEM_PROMPT).toContain('`output`');
    expect(LOCAL_PYTHON_SYSTEM_PROMPT).toContain('`generatedFiles`');
    expect(LOCAL_PYTHON_SYSTEM_PROMPT).toContain('`imageGenerated`');
  });

  it('declares the sandbox limits (no shell, no sockets)', () => {
    expect(LOCAL_PYTHON_SYSTEM_PROMPT).toMatch(/no (system )?shell/i);
    expect(LOCAL_PYTHON_SYSTEM_PROMPT).toMatch(/no .*sockets?/i);
  });
});
