import React from 'react';
import type { FunctionCall, Part } from '@google/genai';
import { type ChatMessage, type UploadedFile, type MessageAppSettings, type SideViewContent } from '@/types';
import type { OpenHtmlPreviewHandler } from '@/utils/html-preview/previewPrivilege';
import { MessageFiles } from './content/MessageFiles';
import { MessageThoughts } from './content/MessageThoughts';
import { McpToolCallGroup } from '@/components/mcp/McpToolCallGroup';
import { MessageText } from './content/MessageText';
import { MessageFooter } from './content/MessageFooter';
import type { LiveArtifactFollowupPayload } from '@/utils/live-artifacts/liveArtifactFollowup';
import type { UserMessageCollapseController } from './content/userMessageCollapse';

interface MessageContentProps {
  message: ChatMessage;
  onImageClick: (file: UploadedFile) => void;
  onOpenHtmlPreview: OpenHtmlPreviewHandler;
  onLiveArtifactFollowUp?: (payload: LiveArtifactFollowupPayload) => void;
  showThoughts: boolean;
  baseFontSize: number;
  expandCodeBlocksByDefault: boolean;
  isMermaidRenderingEnabled: boolean;
  isGraphvizRenderingEnabled: boolean;
  onSuggestionClick?: (suggestion: string) => void;
  onSuggestionFill?: (suggestion: string) => void;
  appSettings: MessageAppSettings;
  themeId: string;
  onOpenSidePanel: (content: SideViewContent) => void;
  onConfigureFile?: (file: UploadedFile, messageId: string) => void;
  isGemini3?: boolean;
  userMessageCollapse?: UserMessageCollapseController;
  diagramLoadMode?: 'deferred' | 'eager';
  mcpPair?: { calls: FunctionCall[]; responses: Part[] };
  isTurnActive?: boolean;
}

export const MessageContent: React.FC<MessageContentProps> = React.memo((props) => {
  const { message, onImageClick, onConfigureFile, isGemini3 } = props;

  const hasContentOrAudio = !!(message.content || message.audioSrc);

  return (
    <>
      <MessageFiles
        files={message.files || []}
        content={message.content}
        onImageClick={onImageClick}
        onConfigureFile={onConfigureFile}
        messageId={message.id}
        isGemini3={isGemini3}
        hasContentOrAudio={hasContentOrAudio}
      />

      <MessageThoughts {...props} />

      {props.mcpPair && props.mcpPair.calls.length > 0 && (
        <div className="w-full my-1">
          <McpToolCallGroup
            calls={props.mcpPair.calls}
            responses={props.mcpPair.responses}
            turnActive={props.isTurnActive ?? false}
          />
        </div>
      )}

      <MessageText {...props} />

      <MessageFooter
        message={message}
        onSuggestionClick={props.onSuggestionClick}
        onSuggestionFill={props.onSuggestionFill}
      />
    </>
  );
});
