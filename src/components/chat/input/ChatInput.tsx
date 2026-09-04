import React from 'react';
import { ChatInputArea } from './ChatInputArea';
import { ChatInputFileModals } from './ChatInputFileModals';
import { ChatInputCoreModals } from './ChatInputCoreModals';
import { useChatInputContext } from './ChatInputContext';
import { ChatInputProvider } from './ChatInputProvider';

const ChatInputContent: React.FC = () => {
  const { chatInput, inputState, capabilities, modalsState, localFileState, slashCommandState, handlers } =
    useChatInputContext();

  const chatInputContent = <ChatInputArea />;

  return (
    <>
      <ChatInputCoreModals
        showRecorder={modalsState.showRecorder}
        onAudioRecord={modalsState.handleAudioRecord}
        onRecorderCancel={() => {
          modalsState.setShowRecorder(false);
          inputState.textareaRef.current?.focus();
        }}
        showCreateTextFileEditor={modalsState.showCreateTextFileEditor}
        onConfirmCreateTextFile={localFileState.handleSaveTextFile}
        onCreateTextFileCancel={() => {
          modalsState.setShowCreateTextFileEditor(false);
          modalsState.setEditingFile(null);
          inputState.textareaRef.current?.focus();
        }}
        isHelpModalOpen={modalsState.isHelpModalOpen}
        onHelpModalClose={() => modalsState.setIsHelpModalOpen(false)}
        allCommandsForHelp={slashCommandState.allCommandsForHelp}
        isProcessingFile={chatInput.isProcessingFile}
        isLoading={chatInput.isLoading}
        initialContent={modalsState.editingFile?.textContent || ''}
        initialFilename={modalsState.editingFile?.name || ''}
        themeId={chatInput.themeId}
        isPasteRichTextAsMarkdownEnabled={chatInput.appSettings.isPasteRichTextAsMarkdownEnabled ?? true}
        showTtsContextEditor={modalsState.showTtsContextEditor}
        onCloseTtsContextEditor={() => modalsState.setShowTtsContextEditor(false)}
        ttsContext={inputState.ttsContext}
        setTtsContext={inputState.setTtsContext}
      />

      <ChatInputFileModals
        configuringFile={localFileState.configuringFile}
        setConfiguringFile={localFileState.setConfiguringFile}
        showTokenModal={localFileState.showTokenModal}
        setShowTokenModal={localFileState.setShowTokenModal}
        previewFile={localFileState.previewFile}
        onClosePreview={localFileState.closePreviewFile}
        inputText={inputState.inputText}
        selectedFiles={chatInput.selectedFiles}
        appSettings={{
          ...chatInput.appSettings,
          ...chatInput.currentChatSettings,
          modelId: chatInput.currentChatSettings.modelId,
        }}
        availableModels={chatInput.availableModels}
        currentModelId={chatInput.currentChatSettings.modelId}
        isGemini3={capabilities.isGemini3}
        isPreviewEditable={localFileState.isPreviewEditable}
        onSaveTextFile={localFileState.handleSavePreviewTextFile}
        onSaveFileConfig={handlers.handleSaveFileConfig}
        previewNavigation={{
          handlePrevImage: localFileState.handlePrevImage,
          handleNextImage: localFileState.handleNextImage,
          currentImageIndex: localFileState.currentImageIndex,
          inputImages: localFileState.inputImages,
        }}
      />

      {chatInputContent}
    </>
  );
};

const ChatInputComponent: React.FC = () => (
  <ChatInputProvider>
    <ChatInputContent />
  </ChatInputProvider>
);

export const ChatInput = React.memo(ChatInputComponent);
