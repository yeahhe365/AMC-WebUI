import { executeConfiguredApiRequest } from '@/services/api/apiExecutor';
import { getErrorMessage } from '@/utils/errorMessage';
import { getHttpOptionsForContents } from '@/services/api/geminiApiVersion';
import { logService } from '@/services/logService';
import type { ContentListUnion, CountTokensConfig, CountTokensResponse, Part } from '@google/genai';

const sanitizeCountTokensConfig = (config?: CountTokensConfig): CountTokensConfig | undefined => {
  if (!config) {
    return undefined;
  }

  const rest = { ...config };
  delete (rest as { generationConfig?: CountTokensConfig['generationConfig'] }).generationConfig;
  return Object.keys(rest).length > 0 ? rest : undefined;
};

const isUnsupportedCountTokensConfigError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  return /not supported in gemini api|unknown name|invalid json payload/i.test(error.message);
};

const isRetryableCountTokensArgumentError = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  return /invalid_argument|request contains an invalid argument|unknown name|invalid json payload/i.test(error.message);
};

const extractSingleTextPrompt = (parts: Part[]): string | null => {
  if (parts.length !== 1) {
    return null;
  }

  const candidate = parts[0] as Part & { text?: unknown };
  return typeof candidate.text === 'string' ? candidate.text : null;
};

export const countTokensApi = async (
  apiKey: string,
  modelId: string,
  parts: Part[],
  config?: CountTokensConfig,
  options?: { directGoogleApi?: boolean },
): Promise<number> => {
  const contentHttpOptions = getHttpOptionsForContents([{ parts }]);

  return executeConfiguredApiRequest({
    apiKey,
    label: `Counting tokens for model ${modelId}...`,
    errorLabel: 'Error counting tokens:',
    routingOverrides: options?.directGoogleApi ? { directGoogleApi: true } : undefined,
    run: async ({ client: ai }) => {
      // Sanitize parts to remove custom internal properties.
      // We MUST retain mediaResolution and videoMetadata as they significantly affect token counts
      // for Gemini 3.0 models (resolution) and video inputs (cropping).
      const sanitizedParts = parts.map((part) => {
        const sanitized = { ...(part as Record<string, unknown>) };
        delete (sanitized as { thoughtSignature?: unknown }).thoughtSignature;
        return sanitized as Part;
      });
      const contents = [{ parts: sanitizedParts }] as ContentListUnion;
      const sanitizedConfig = sanitizeCountTokensConfig(config);
      const plainTextPrompt = extractSingleTextPrompt(sanitizedParts);
      const requestTokenCount = async (
        requestContents: ContentListUnion,
        requestConfig?: CountTokensConfig,
      ): Promise<CountTokensResponse> => {
        return ai.models.countTokens({
          model: modelId,
          contents: requestContents,
          ...(requestConfig ? { config: requestConfig } : {}),
        });
      };

      let response: CountTokensResponse;
      try {
        response = await requestTokenCount(contents, sanitizedConfig);
      } catch (error) {
        if (sanitizedConfig && isUnsupportedCountTokensConfigError(error)) {
          const originalErrorMessage = getErrorMessage(error);

          logService.warn('Retrying token count without unsupported Gemini Developer API config.', {
            category: 'MODEL',
            data: {
              modelId,
              originalError: originalErrorMessage,
              droppedConfigKeys: Object.keys(sanitizedConfig),
            },
          });

          try {
            response = await requestTokenCount(contents);
          } catch (retryError) {
            if (!plainTextPrompt || !isRetryableCountTokensArgumentError(retryError)) {
              throw retryError;
            }

            logService.warn('Retrying token count with plain-text contents after INVALID_ARGUMENT.', {
              category: 'MODEL',
              data: {
                modelId,
                originalError: getErrorMessage(retryError),
              },
            });

            response = await requestTokenCount(plainTextPrompt);
          }
        } else if (plainTextPrompt && isRetryableCountTokensArgumentError(error)) {
          logService.warn('Retrying token count with plain-text contents after INVALID_ARGUMENT.', {
            category: 'MODEL',
            data: {
              modelId,
              originalError: getErrorMessage(error),
            },
          });

          response = await requestTokenCount(plainTextPrompt);
        } else {
          throw error;
        }
      }

      return response.totalTokens || 0;
    },
    httpOptions: contentHttpOptions,
  });
};
