import { describe, expect, it } from 'vitest';
import { getDefaultModelOptions } from '@/utils/model/defaultModelOptions';
import { getModelCapabilities } from '@/utils/model/modelCapabilities';
import { createUploadedFile } from '@/test/data/factories';
import { getTranslator } from '@/i18n/translations';
import { validateMessageBeforeSend } from './sendMessageValidation';

describe('Gemini Omni model', () => {
  const modelId = 'gemini-omni-1.2-flash';
  const t = getTranslator('en');

  it('is selectable without displacing Hydrogen and exposes video-compatible permissions', () => {
    const models = getDefaultModelOptions();
    expect(models[0].id).toBe('gemini-4-hydrogen');
    expect(models.find((model) => model.id === modelId)?.name).toBe('Gemini Omni 1.2 Flash');
    const { permissions } = getModelCapabilities(modelId);
    expect(permissions).toMatchObject({
      canAcceptAttachments: true,
      requiresTextPrompt: true,
      canUseTools: false,
      canUseGoogleSearch: false,
      canUseTokenCount: false,
    });
  });

  it('accepts up to six reference images and rejects other attachments', () => {
    const image = createUploadedFile({ type: 'image/png', uploadState: 'active' });
    const validate = (files: (typeof image)[]) =>
      validateMessageBeforeSend({
        text: 'Animate this',
        files,
        permissions: getModelCapabilities(modelId).permissions,
        isContinueMode: false,
        isServerCodeExecutionEnabled: false,
        isGemini3Image: false,
        activeModelId: modelId,
        t,
      });

    expect(validate(Array(6).fill(image))).toEqual({ ok: true });
    expect(validate(Array(7).fill(image))).toEqual({ ok: false, fileError: t('omniImageLimit') });
    expect(validate([createUploadedFile({ type: 'application/pdf', uploadState: 'active' })])).toEqual({
      ok: false,
      fileError: t('omniImagesOnly'),
    });
  });
});
