import { GoogleGenAI } from '@google/genai';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export function summarizeCodeExecutionParts(parts = []) {
  return parts.reduce(
    (summary, part) => {
      if (part.executableCode) {
        summary.executableCodes.push({
          id: part.executableCode.id ?? null,
          language: part.executableCode.language ?? null,
        });
      }

      if (part.codeExecutionResult) {
        summary.executionResults.push({
          id: part.codeExecutionResult.id ?? null,
          outcome: part.codeExecutionResult.outcome ?? null,
          output: part.codeExecutionResult.output ?? '',
        });
      }

      if (part.text) {
        summary.texts.push(part.text);
      }

      if (part.inlineData) {
        summary.inlineMimeTypes.push(part.inlineData.mimeType ?? 'unknown');
      }

      if (part.thoughtSignature) {
        summary.thoughtSignatures += 1;
      }

      return summary;
    },
    {
      executableCodes: [],
      executionResults: [],
      texts: [],
      inlineMimeTypes: [],
      thoughtSignatures: 0,
    },
  );
}

export function assertCodeExecutionSummary(summary) {
  if (summary.executableCodes.length === 0) {
    throw new Error('No executableCode parts were returned by the model.');
  }

  if (summary.executionResults.length === 0) {
    throw new Error('No codeExecutionResult parts were returned by the model.');
  }

  const executableIds = summary.executableCodes.map((part) => part.id).filter(Boolean);
  const resultIds = summary.executionResults.map((part) => part.id).filter(Boolean);

  if (executableIds.length > 0 && resultIds.length > 0) {
    const missingResultId = executableIds.find((id) => !resultIds.includes(id));
    if (missingResultId) {
      throw new Error(`Missing matching codeExecutionResult for executableCode id "${missingResultId}".`);
    }
  }
}

export function buildCodeExecutionFollowUpContents(initialUserContent, modelContent, followUpText) {
  return [
    initialUserContent,
    modelContent,
    {
      role: 'user',
      parts: [{ text: followUpText }],
    },
  ];
}

async function deleteGeminiFile(ai, fileName) {
  if (!fileName) return;

  try {
    await ai.files.delete({ name: fileName });
  } catch (error) {
    console.warn(`Failed to delete Gemini file ${fileName}:`, error instanceof Error ? error.message : error);
  }
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required.');
  }

  const model = process.env.CODE_EXECUTION_MODEL || 'gemini-3.8-flash';
  const ai = new GoogleGenAI({ apiKey });

  const tempCsvPath = path.join(os.tmpdir(), `codex-code-execution-${Date.now()}.csv`);
  const csvData = 'item,amount\napples,4\noranges,6\nbananas,3\n';

  let uploadedFile = null;

  try {
    await fs.writeFile(tempCsvPath, csvData, 'utf8');

    uploadedFile = await ai.files.upload({
      file: tempCsvPath,
      config: {
        displayName: 'codex-code-execution-check.csv',
        mimeType: 'text/csv',
      },
    });

    const initialUserContent = {
      role: 'user',
      parts: [
        {
          fileData: {
            fileUri: uploadedFile.uri,
            mimeType: uploadedFile.mimeType || 'text/csv',
          },
        },
        {
          text: 'Use code execution to sum the amount column in the attached CSV. Show the executed code and end with "TOTAL: <number>".',
        },
      ],
    };

    const response1 = await ai.models.generateContent({
      model,
      contents: [initialUserContent],
      config: {
        tools: [{ codeExecution: {} }],
      },
    });

    const modelContent = response1.candidates?.[0]?.content;
    if (!modelContent?.parts?.length) {
      throw new Error('First response did not include model content parts.');
    }

    const firstSummary = summarizeCodeExecutionParts(modelContent.parts);
    assertCodeExecutionSummary(firstSummary);

    const response2 = await ai.models.generateContent({
      model,
      contents: buildCodeExecutionFollowUpContents(
        initialUserContent,
        modelContent,
        'Repeat only the final answer as "TOTAL: <number>".',
      ),
      config: {
        tools: [{ codeExecution: {} }],
      },
    });

    const followUpText = response2.text?.trim();
    if (!followUpText) {
      throw new Error('Second response returned empty text.');
    }

    console.log(
      JSON.stringify(
        {
          model,
          uploadedMimeType: uploadedFile.mimeType || 'text/csv',
          firstTurn: {
            executableCodeCount: firstSummary.executableCodes.length,
            executionResultCount: firstSummary.executionResults.length,
            thoughtSignatureCount: firstSummary.thoughtSignatures,
            inlineMimeTypes: firstSummary.inlineMimeTypes,
          },
          secondTurnText: followUpText,
        },
        null,
        2,
      ),
    );
  } finally {
    await fs.rm(tempCsvPath, { force: true });
    await deleteGeminiFile(ai, uploadedFile?.name);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
