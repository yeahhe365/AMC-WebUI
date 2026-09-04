# AMC WebUI 翻译质量审查报告

审查范围：src/i18n/ 下全部 19 个翻译文件，1146 个键 × 7 种语言（en/zh/ja/ko/es/fr/de），共 8022 条字符串。

## 一、结构完整性检查（程序化验证）

| 检查项                                                 | 结果                                                                                  |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| 键覆盖（每键 7 语言齐全）                              | ✅ 1146/1146，无缺失                                                                  |
| 占位符一致性（全部 7 语言对照 en）                     | ✅ 0 处不匹配                                                                         |
| 占位符格式与 interpolate() 兼容性                      | ✅ 全部为 {word} 格式                                                                 |
| npm run i18n:check                                     | ✅ 通过                                                                               |
| 翻译相关测试（coverage/registry/interpolate 共 22 个） | ✅ 全部通过                                                                           |
| 反向覆盖（代码 t() 引用的 919 个键）                   | ✅ 全部有定义                                                                         |
| 重复键                                                 | ⚠️ 2 个（thirdPartyConnectionUnavailable、thirdPartyApiKeyMissing），值完全一致，无害 |
| 中文半角标点混用                                       | ✅ 0 处                                                                               |
| 西语疑问句缺失 ¿                                       | ✅ 1 处（见下）                                                                       |
| 法语 ?!:; 前空格                                       | ✅ 规范统一                                                                           |

## 二、源串层面的观察

### ~~字面量 "nn"/"n" 丢失换行~~（已撤回——误报）

初判认为 `settingsClearCacheConfirm` 与 `liveArtifactInteractionRetryPrompt` 含字面量字母 n。经原始字节核验，源码中是**正确的 `\n` / `\n\n` 转义序列**（单引号字符串内），TypeScript 会正常解析为换行。此前的"bug"是审查解析器剥掉反斜杠造成的假象。**无需修改。**

### 英文源串导致的翻译问题（根因在 en）

- **"Composer"**（shortcutsChatInputTitle）：ja コンポーザー / ko 작성기 / es Redactor / fr Compositeur 均不自然（fr 甚至意为"作曲家"）。建议源串改为 "Message input"，各语言改为 输入区/入力欄/메시지 입력창/Redacción/Zone de saisie。
- **settingsSearchEscHint**（en 仅 "to clear"）：UI 渲染为 `<Esc> + 提示词`，日语成 "Esc クリアするには"、韩语成 "Esc 지우려면"，SOV 语序错误。建议 ja「Esc でクリア」ko「Esc로 지우기」（或改组件结构）。

## 三、各语言高严重度问题（已逐一源头核验）

### 简体中文 (zh) —— 高 1 / 中 23 / 低 29

- **`videoSettingsFps`** [🔴 高] 现在："采样率（FPS）" → 建议："帧率（FPS）"
  - MISTRANSLATION: en "Frame Rate (FPS)" is 帧率, not 采样率 (sampling rate). Wrong technical term; users configuring video frame sampling will be confused.
- **`uploadStarting`** [🟡 中] 现在："正在开始…" → 建议："正在上传…"
  - UNNATURAL: "正在开始…" is redundant Chinese no native UI uses for an upload progress state (en "Starting...").
- **`cancelPendingUploadSendAria`** [🟡 中] 现在："取消上传后发送" → 建议："取消上传后自动发送"
  - AMBIGUOUS: readable as both 取消[上传后发送] (intended) and [取消上传]后发送. Adding 自动 removes the wrong parse (en "Cancel sending after upload"). Same text in cancelPendingUploadSendTitle.
- **`cancelPendingUploadSendTitle`** [🟡 中] 现在："取消上传后发送" → 建议："取消上传后自动发送"
  - AMBIGUOUS: see cancelPendingUploadSendAria — readable as "[cancel upload] then send".
- **`scenariosEditorAddMessageAs`** [🟡 中] 现在："添加消息身份" → 建议："以此身份添加消息"
  - UNNATURAL: "添加消息身份" is a confusing label for the en "Add Message As" role picker (User/Model); reads as if adding an identity.
- **`suggestionHtmlTitle`** [🟡 中] 现在："可视化整理" → 建议："Live Artifacts"
  - MISTRANSLATION/INCONSISTENCY: en title is the feature name "Live Artifacts", kept untranslated everywhere else (helpCmdArtifacts, liveArtifactsPromptActive/Inactive\*, settingsTabLiveArtifacts, settingsLiveArtifactsSectionTitle, suggestionHtmlDesc/Short). Translating only this card title as 可视化整理 breaks the link to the feature.
- **`ttsError`** [🟡 中] 现在："语音生成失败" → 建议："TTS 失败"
  - INCONSISTENCY family TTS: kept as "TTS" in ttsReadAloud (朗读（TTS）) and ttsDirectorNotesTitle (TTS 导演备注), but translated 语音生成 here and in messageSenderTtsErrorPrefix. Pick one form.
- **`messageSenderTtsErrorPrefix`** [🟡 中] 现在："语音生成错误" → 建议："TTS 错误"
  - INCONSISTENCY family TTS: en "TTS Error"; see ttsError — TTS is kept elsewhere (朗读（TTS）, TTS 导演备注).
- **`messageSenderImageEditHistoryMissingGeneratedImage`** [🟡 中] 现在："之前生成的图片已无法从历史记录中恢复。请重新附加这张图片，或开启新的图片编辑回合。" → 建议："之前生成的图片已无法从历史记录中恢复。请重新附加这张图片，或开启新的图片编辑轮次。"
  - INCONSISTENCY family turn: turn → 轮 everywhere else (这一轮 in messageSenderEmptyReply/WithThoughts, 上一轮 in helpCmdRetry, 上一轮/下一轮 in scrollPreviousTurn/scrollNextTurn) but 回合 here.

完整清单（53 条）见本文件末尾说明的 JSON。

### 日本語 (ja) —— 高 1 / 中 8 / 低 27

- **`settingsSearchEscHint`** [🔴 高] 现在："クリアするには" → 建议："でクリア"
  - MISTRANSLATION/UNNATURAL: Rendered in SettingsSidebar.tsx as <kbd>Esc</kbd> + this hint, producing broken word order "Esc クリアするには". English is "Esc to clear"; the fragment must read "Escでクリア".
- **`pwaUpdateRefreshPrompt`** [🟡 中] 现在："更新して、インストール済みのシェルと最新のアセットを更新します。" → 建议："再読み込みすると、インストール済みのシェルと最新のアセットが更新されます。"
  - UNNATURAL: "Refresh to update..." becomes 更新して…更新します — the same word 更新 is used for both "refresh" and "update", which is confusing. Use 再読み込み for Refresh (consistent with errorBoundaryReload / htmlPreviewReload) and 更新 only for update.
- **`settingsFontSize`** [🟡 中] 现在："読書サイズ" → 建议："本文の文字サイズ"
  - UNNATURAL: "Reading Size" controls chat message body text size (see settingsFontSizeTooltip), but 読書サイズ reads as "book-reading size" and does not convey this to Japanese users.
- **`alwaysKeepThinkingLabel`** [🟡 中] 现在："思考過程を保持" → 建议："思考をコンテキストに保持"
  - MISTRANSLATION (omitted meaning): "Keep Thinking in Context" drops "in Context". The companion setting settingsAlwaysKeepThinkingInContextLabel is 推論を常にコンテキストに保持; the chip alone can be misread as merely keeping the thinking UI visible.
- **`tts_style_informative`** [🟡 中] 现在："知的" → 建议："情報豊かな"
  - MISTRANSLATION: "Informative" (a TTS voice style) became 知的 (= intellectual). A different style, Knowledgeable, is already 物知りな; Informative should be 情報豊かな/説明的な.
- **`tts_style_easy_going`** [🟡 中] 现在："穏やかな" → 建议："マイペースな"
  - INCONSISTENCY: Easy-going and Gentle (tts_style_gentle) both map to 穏やかな, so two distinct voice styles are indistinguishable in the picker.
- **`messageSenderApiKeyNotConfigured`** [🟡 中] 现在："設定でAPIキーが構成されていません。" → 建议："設定でAPIキーが未設定です。"
  - INCONSISTENCY/UNNATURAL: "not configured" is 構成されていません here but 未設定 everywhere else (apiRuntimeKeyNotConfigured, thirdPartyApiKeyMissing, thirdPartyApiUrlMissing, settingsSystemPromptUnset). 構成されていません is also stiff for UI copy.
- **`shortcutsTogglePip`** [🟡 中] 现在："ピクチャー・イン・ピクチャーを切り替え" → 建议："ピクチャーインピクチャーを切り替え"
  - INCONSISTENCY: Only this key uses ピクチャー・イン・ピクチャー; pipEnter, pipExit, pipPlaceholderTitle and helpCmdPip all use ピクチャーインピクチャー.
- **`shortcutsChatInputTitle`** [🟡 中] 现在："コンポーザー" → 建议："入力欄"
  - UNNATURAL: Section title "Composer" (chat input shortcuts). コンポーザー is not used for a chat input area in Japanese UIs and reads as "music composer"; 入力欄/入力 is the natural term.

完整清单（36 条）见本文件末尾说明的 JSON。

### 한국어 (ko) —— 高 0 / 中 12 / 低 16

- **`settingsSearchEscHint`** [🟡 中] 现在："지우려면" → 建议："눌러서 지우기"
  - Rendered immediately after a <kbd>Esc</kbd> chip (SettingsSidebar.tsx), so the UI literally reads 'Esc 지우려면' — broken word order for '[Esc] to clear'. Natural Korean is '눌러서 지우기' (or reverse the order to '지우려면 Esc').
- **`tts_style_informative`** [🟡 中] 现在："정보 전달의" → 建议："정보 전달형"
  - Standalone voice-style label ending in the possessive/attributive '-의' is not natural Korean UI copy. All sibling TTS style labels use adjective endings (밝은, 경쾌한, 단호한, 친근한...). '정보 전달형' or '유익한' fits the series.
- **`settingsVoiceSectionTitle`** [🟡 中] 现在："음성 및 보이스" → 建议："음성 및 TTS"
  - '음성' and '보이스' are the same word (Konglish duplication); no native UI pairs them as 'X 및 X'. The section holds the TTS voice picker and speech-to-text model, so '음성 및 TTS' (or '음성 설정') reads naturally.
- **`shortcutsChatInputTitle`** [🟡 中] 现在："작성기" → 建议："메시지 입력창"
  - 'Composer' rendered as '작성기' — a coinage Korean UIs never use for the chat input area. Use '메시지 입력창' or '입력창'.
- **`settingsFontSize`** [🟡 中] 现在："읽기 크기" → 建议："본문 글자 크기"
  - Literal rendering of the unusual English 'Reading Size'; '읽기 크기' is not phrasing a native Korean UI would use. '본문 글자 크기' (or simply '글자 크기') is standard and matches the tooltip's description.
- **`headerThinkingToggleAria`** [🟡 中] 现在："사고 수준 전환" → 建议："추론 수준 전환"
  - INCONSISTENCY: 'Thinking' is split into '사고' (headerThinkingToggleAria, headerThinkingMinimalFastTitle '사고: 최소 (빠른 모드)', headerThinkingLowFastTitle, headerThinkingHighTitle '사고: 높음 (프로 모드)', helpCmdFast '빠른 사고 모드 전환', alwaysKeepThinkingLabel '컨텍스트에 사고 유지', messageSenderEmptyReplyWithThoughts '사고 수준을 낮춰') vs '추론' (thinkingText '추론 중...', thinkingTookTime, thinkingProcess '추론 과정', thinkingRawProcess '원본 추론 과정', settingsThinkingMode '추론 모드', settingsThinkingModePreset / settingsReasoningLevelTitle '추론 수준', settingsThinkingBudget '추론 예산', settingsRawModeLabel '원시 추론'). '추론' is the majority; unify on it unless Reasoning-mode and Thinking-level must remain visually distinct terms.
- **`voiceInputTranscribingAria`** [🟡 中] 现在："전사 중..." → 建议："텍스트 변환 중..."
  - INCONSISTENCY: transcription = '전사' (voiceInputTranscribingAria, transcriptionFailedWithMessage '전사에 실패했습니다', suggestionAsrDesc, suggestionAsrShort, suggestionSrtDesc) vs '변환' (chatBehaviorVoiceModelLabel '음성 텍스트 변환 모델', chatBehaviorVoiceModelTooltip '텍스트로 변환하는 데 사용되는 모델'). '전사' is linguistic jargon many users won't parse at a glance; unify on '변환' (텍스트 변환).
- **`modelPickerProviderThirdParty`** [🟡 中] 现在："서드파티" → 建议："타사"
  - INCONSISTENCY: 'Third-party' = '타사' (settingsApiModeLabel, settingsApiModeThirdParty, thirdPartyConnectionsEmpty, apiRuntimeThirdPartyConnectionMissing, apiRuntimeThirdPartyConnectionDisabled) vs '서드파티' (modelPickerProviderThirdParty). Unify on '타사'.

完整清单（28 条）见本文件末尾说明的 JSON。

### Español (es) —— 高 0 / 中 27 / 低 33

- **`helpCmdMaps`** [🟡 中] 现在："Alternar Maps grounding" → 建议："Alternar la búsqueda en Maps"
  - INCONSISTENCY: 'Maps Grounding' is translated 'Búsqueda en Maps' in mapsGroundingLabel/mapsGroundingShort ('Búsqueda profunda' pattern); this key keeps the English term 'Maps grounding'.
- **`headerThinkingToggleAria`** [🟡 中] 现在："Alternar nivel de razonamiento" → 建议："Alternar nivel de pensamiento"
  - INCONSISTENCY: 'thinking level' is 'nivel de pensamiento' elsewhere (messageSenderEmptyReplyWithThoughts; tooltips headerThinkingHighTitle/LowFastTitle/MinimalFastTitle 'Pensamiento: ...'), while 'razonamiento' is reserved for 'reasoning' (headerReasoningToggleAria).
- **`suggestionSrtDesc`** [🟡 中] 现在："Genera un archivo de subtítulos SRT estándar para el vídeo adjunto. Asegura marcas de tiempo precisas (formato: 00:00:00,000 --> 00:00:00,000) y transcribe el diálogo. Muestra ÚNICAMENTE el contenido SRT dentro de un bloque de código:" → 建议："Genera un archivo de subtítulos SRT estándar para el video adjunto. Asegura marcas de tiempo precisas (formato: 00:00:00,000 --> 00:00:00,000) y transcribe el diálogo. Muestra ÚNICAMENTE el contenido SRT dentro de un bloque de código:"
  - INCONSISTENCY: 'vídeo' vs 'video'. Dominant form in the app is 'video' without accent (attachMenuAddByUrl, liveStopVideo, tokenModalVideoEstimate, videoSettingsTipFps, aboutDescription, settingsFilesApiVideo).
- **`suggestionSrtShort`** [🟡 中] 现在："Genera subtítulos SRT a partir de vídeo." → 建议："Genera subtítulos SRT a partir de video."
  - INCONSISTENCY: 'vídeo' vs 'video'; unify on 'video' as in the rest of the UI.
- **`filePreviewYoutubePlayer`** [🟡 中] 现在："Reproductor de vídeo de YouTube" → 建议："Reproductor de video de YouTube"
  - INCONSISTENCY: 'vídeo' vs 'video'; unify on 'video'.
- **`filePreviewVideoClipped`** [🟡 中] 现在："Vídeo recortado" → 建议："Video recortado"
  - INCONSISTENCY: 'Vídeo' vs 'Video'; unify on 'video'.
- **`settingsOpenAICompatibleClearFetchedSelection`** [🟡 中] 现在："Limpiar" → 建议："Borrar"
  - INCONSISTENCY: action 'Clear' is 'Borrar' everywhere else (tokenModalClear, tokenModalClearAll, queuedSubmissionClearAll, logViewerClearButton, historySearchClearAria, scenariosClearSearch, shortcutsClear); this uses 'Limpiar'.
- **`settingsEnableLogging`** [🟡 中] 现在："Habilitar registro" → 建议："Activar registro"
  - INCONSISTENCY: Enable/Disable family is Activar/Desactivar across the app (enable='Activar', thirdPartyConnectionDisabled='Desactivado', 'Actívalo', 'Desactívalo'); this uses 'Habilitar'.

完整清单（60 条）见本文件末尾说明的 JSON。

### Français (fr) —— 高 1 / 中 16 / 低 26

- **`shortcutsChatInputTitle`** [🔴 高] 现在："Compositeur" → 建议："Zone de saisie"
  - MISTRANSLATION: EN 'Composer' here means the message-composer area (section header grouping input/composer keyboard shortcuts in ShortcutsSection.tsx). FR 'Compositeur' means a musical composer; a French UI would never label this section 'Compositeur'.
- **`appDragDropRelease`** [🟡 中] 现在："Relâchez pour importer les fichiers compatibles" → 建议："Relâchez pour téléverser les fichiers pris en charge"
  - INCONSISTENCY: 'Upload' is rendered 'importer' here while every other upload string uses 'téléverser' (attachMenuUpload, selectedFileUploading, uploadFailedWithMessage...). 'Import' must stay reserved for attachMenuImportFolder/ImportZip. Also 'fichiers compatibles' vs the standard 'fichiers pris en charge' used in uploadUnsupportedType.
- **`logViewerOverviewTab`** [🟡 中] 现在："Aperçu" → 建议："Vue d'ensemble"
  - MISTRANSLATION/INCONSISTENCY: 'Overview' (usage-statistics tab) becomes 'Aperçu', which is the established translation of 'Preview' (preview, markdownPreviewPreview, htmlPreviewTitle...). Two different concepts now share one label; 'Vue d'ensemble' is the standard French term for Overview.
- **`filePreviewRenderMarkdownAnyway`** [🟡 中] 现在："Rendre le Markdown quand même" → 建议："Effectuer le rendu du Markdown quand même"
  - UNNATURAL/MISTRANSLATION: 'Render' (computing) is translated 'Rendre', which primarily reads as 'to give back/return'. The correct UI phrasing is 'effectuer le rendu de'. Same defect in settingsEnableMermaidRenderingLabel and settingsEnableGraphvizRenderingLabel.
- **`settingsEnableMermaidRenderingLabel`** [🟡 中] 现在："Rendre les diagrammes Mermaid" → 建议："Effectuer le rendu des diagrammes Mermaid"
  - UNNATURAL/MISTRANSLATION: 'Render Mermaid Diagrams' -> 'Effectuer le rendu des diagrammes Mermaid'; 'Rendre les diagrammes' reads as 'give the diagrams back'. Related tooltip keys already use the correct 'Rend les blocs de code ... en diagrammes'.
- **`settingsEnableGraphvizRenderingLabel`** [🟡 中] 现在："Rendre les diagrammes Graphviz" → 建议："Effectuer le rendu des diagrammes Graphviz"
  - UNNATURAL/MISTRANSLATION: same 'render'->'rendre' calque as settingsEnableMermaidRenderingLabel.
- **`messageSenderFileUploadFailedBeforeSend`** [🟡 中] 现在："Échec du téléversement de la pièce jointe. Supprimez le fichier échoué ou téléversez-le à nouveau avant d'envoyer." → 建议："Échec du téléversement de la pièce jointe. Supprimez le fichier concerné ou téléversez-le à nouveau avant l'envoi."
  - UNNATURAL: 'le fichier échoué' ('the stranded/failed file') is not French; the failure applies to the upload, not the file. Use 'le fichier concerné' / 'dont le téléversement a échoué'. 'avant d'envoyer' -> 'avant l'envoi' reads better after a noun phrase.
- **`scenariosConfirmCloseMessage`** [🟡 中] 现在："Vous avez des modifications non enregistrées. Les fermer les supprimera." → 建议："Vous avez des modifications non enregistrées. Si vous fermez maintenant, elles seront perdues."
  - MISTRANSLATION/GRAMMAR: 'Les fermer' makes 'les' refer to the modifications (you cannot 'close changes'); EN means closing the dialog discards them. Reference is broken and 'supprimera' overstates.
- **`settingsGenerateQuadImagesTooltip`** [🟡 中] 现在："Lorsqu'elle est activée, les prompts de génération d'images produiront quatre variations indépendantes à la fois. Cela consommera plus de crédits API." → 建议："Lorsque cette option est activée, les prompts de génération d'images produiront quatre variations indépendantes à la fois. Cela consommera plus de crédits API."
  - GRAMMAR: dangling agreement — 'Lorsqu'elle est activée' (feminine singular) has no matching subject; the main clause subject is 'les prompts' (masculine plural). Must anchor to 'cette option'.

完整清单（43 条）见本文件末尾说明的 JSON。

### Deutsch (de) —— 高 1 / 中 53 / 低 22

- **`settingsFilesApiTooltip`** [🔴 高] 现在："Gilt für Dateien, die nach dem Ändern dieser Einstellung hinzugefügt wurden. Ein bevorzugt Files API. Aus sendet Inhalte wenn möglich inline; zu große Dateien können weiterhin Files API verwenden." → 建议："Gilt für Dateien, die nach dem Ändern dieser Einstellung hinzugefügt werden. Bei „Ein“ wird Files API bevorzugt. Bei „Aus“ werden Inhalte wenn möglich inline gesendet; zu große Dateien können weiterhin Files API verwenden."
  - MISTRANSLATION: 'On prefers Files API. Off sends content inline' was translated word-for-word so 'Ein/Aus' read as sentence subjects – nonsense German that will confuse users. Also missing comma before the infinitive/'wenn möglich' clause.
- **`liveStatusReconnectingAutomatically`** [🟡 中] 现在："Automatisch erneut verbinden" → 建议："Verbindung wird automatisch wiederhergestellt"
  - MISTRANSLATION of aspect: English status 'Reconnecting automatically' rendered as verb phrase that reads like an action/button label; sibling key liveStatusReconnectingAttempt uses noun style. Status banner needs process description.
- **`audioRecorderTitle`** [🟡 中] 现在："Stimmrekorder" → 建议："Sprachrekorder"
  - UNNATURAL + INCONSISTENCY: 'Stimmrekorder' is not established German; the app otherwise uses the 'Sprach-' family (Spracheingabe, Spracherkennung, Speech-to-Text-Modell). Voice Recorder → Sprachrekorder.
- **`tts_style_gentle`** [🟡 中] 现在："Sanftmütig" → 建议："Sanft"
  - UNNATURAL: 'sanftmütig' means meek/mild-tempered (of people/animals), not a voice quality; wrong connotation for a TTS style. Use 'Sanft' and differentiate Smooth as 'Geschmeidig'.
- **`tts_style_soft`** [🟡 中] 现在："Sanft" → 建议："Weich"
  - INCONSISTENCY: identical German 'Sanft' used for both Soft and Smooth (tts_style_smooth); users cannot distinguish the styles. Soft → 'Weich'.
- **`tts_style_smooth`** [🟡 中] 现在："Sanft" → 建议："Geschmeidig"
  - INCONSISTENCY: duplicate of tts_style_soft ('Sanft'); after Gentle='Sanft' three styles would collide. Smooth → 'Geschmeidig'.
- **`pwaUpdateRefreshPrompt`** [🟡 中] 现在："Aktualisieren, um die installierte Shell und die neuesten Ressourcen zu aktualisieren." → 建议："Neu laden, um die installierte Shell und die neuesten Ressourcen zu aktualisieren."
  - UNNATURAL: same verb twice in one sentence ('Aktualisieren … zu aktualisieren'). Refresh = 'Neu laden' elsewhere (errorBoundaryReload, htmlPreviewReload).
- **`historySidebarClose`** [🟡 中] 现在："Historie-Seitenleiste schließen" → 建议："Verlauf-Seitenleiste schließen"
  - INCONSISTENCY: History = 'Verlauf' in all other keys (historyTitle, historySearchPlaceholder, historyEmpty 'Chat-Verlauf', settingsImportHistory 'Verlauf importieren'); only this pair uses 'Historie'.
- **`historySidebarOpen`** [🟡 中] 现在："Historie-Seitenleiste öffnen" → 建议："Verlauf-Seitenleiste öffnen"
  - INCONSISTENCY: see historySidebarClose – unify on 'Verlauf'.

完整清单（76 条）见本文件末尾说明的 JSON。

## 四、跨语言术语不一致家族（按语言汇总）

- **zh**：聊天/对话/会话混用；移除 vs 删除；清空 vs 清除；TTS vs 语音生成；你(3键)/您(16键) 混用；Live Artifacts 一处译作"可视化整理"、其余保留英文。
- **ja**：文字起こし/書き起こし；権限/許可；目次/アウトライン；未設定/構成されていません；ピクチャー・イン・ピクチャー 拼写不统一；tts_style_easy_going 与 gentle 同为「穏やかな」无法区分。
- **ko**：사고/추론（Thinking）；전사/변환（转写）；타사/서드파티；PIP/Picture-in-Picture/화면 속 화면 三种写法；초기화/재설정；음성 및 보이스 同义反复。
- **es**：clave de API vs clave API；句中大写 Clave(s) de API（12 键）；video/vídeo；predeterminado/por defecto；Borrar/Limpiar；Coste（仅半岛用法）vs Costo（拉美）。
- **fr**：tokens/jetons 分裂（16 vs 10 键）；Basculer/Activer-désactiver；PiP 四种写法；téléverser/importer；讨论区 discussion/chat 混用；句中 "Clé API" 大小写不一（11 键）。
- **de**：**du/Sie 混用是最大问题**——约 39 个 Sie 形式键集中在设置/API/MCP 对话框，而聊天流程用 du；Verlauf/Historie；Schnellmodus/Denkmodus；省略号 "..."×50 vs "…"×3。

## 五、定义了但代码从未引用的死键（17 个，可选清理）

translateFailed、pdfLoadFailed（已被 …WithMessage 版本取代）、historyCopySuffix、historyDragSession（测试断言不得出现）、logViewerRequests、scenariosEditTitle、scenariosDeleteTitle（已被 scenariosEditScenarioTitle 等取代）、settingsTabChat、settingsTabGeneration、settingsTabSafety、settingsFinishModelListEdit、settingsLanguageEn/Zh/Ja/Ko/Es/Fr/De（已被 LANGUAGE_META.nativeLabel 取代）、settingsSystemAudioRecordingLabel、settingsReasoningBadgeGemini3、settingsReasoningBadgeEnabled（均被测试断言退役）。

注意：logCategory*/logLevel* 虽无字面量引用，但经 toPascal 动态拼接使用，**不是**死键。

## 六、总体结论

翻译整体质量高：无漏翻、占位符零错误、标点规范严格、品牌名处理得当。真正需要修的是：

1. ~~1 个全语言渲染 bug~~（已撤回，见第二节——`\n` 转义误报）
2. 高严重度误译（zh 采样率、de Files API 提示、de Temperature 未翻译、Composer 家族、ja/ko Esc 语序、es/fr 语法错误）→ **已修复**，见下节
3. 各语言内部术语统一（尤其 de 的 du/Sie、fr 的 tokens/jetons、zh 的聊天/对话）→ 待办

详细逐条问题（含建议译文）保存在：docs/i18n-review/issues-{zh,ja,ko,es,fr,de}.json

## 七、修复记录

### 已修复（P1，2024-08 审查后第一批）

| 文件                               | 键                                | 语言        | 修改                                                                                                                   |
| ---------------------------------- | --------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------- |
| translations/chatInput.ts          | videoSettingsFps                  | zh          | 采样率（FPS）→ **帧率（FPS）**                                                                                         |
| translations/settings/general.ts   | settingsSearchEscHint             | ja          | クリアするには → **でクリア**（配合 `<Esc>` 前缀语序）                                                                 |
| translations/settings/general.ts   | settingsSearchEscHint             | ko          | 지우려면 → **눌러서 지우기**                                                                                           |
| translations/settings/shortcuts.ts | shortcutsChatInputTitle           | ja/ko/es/fr | コンポーザー→**入力欄**；작성기→**메시지 입력창**；Redactor→**Redacción**；Compositeur→**Zone de saisie**              |
| translations/settings/model.ts     | settingsTemperature               | de          | Temperature → **Temperatur**                                                                                           |
| translations/settings/model.ts     | settingsFilesApiTooltip           | de          | "Ein bevorzugt Files API. Aus sendet…" → **„Bei „Ein“ wird Files API bevorzugt. Bei „Aus“ werden Inhalte … gesendet"** |
| translations/settings/model.ts     | settingsFilesApiTooltip           | es          | envia → **envía**                                                                                                      |
| translations/settings/model.ts     | settingsGenerateQuadImagesTooltip | es          | esta habilitado→**esté habilitado**；produciran→**producirán**                                                         |
| translations/settings/model.ts     | settingsGenerateQuadImagesTooltip | fr          | Lorsqu'**elle est activée** → Lorsqu'**ils sont activés**（与 les prompts 性数一致）                                   |

验证：`npm run i18n:check` ✅ 1146/1146 · i18n 测试 22/22 ✅ · `tsc --noEmit` ✅ · eslint ✅（prettier 警告为 i18n 目录既有状态，非本次引入）

### 已修复（P2，术语统一与自然度，第二批）

通过确定性 codemod 应用（每处替换要求原文精确唯一匹配，共 19 个文件、约 266 处字符串）：

| 语言 | 应用数 | 主要内容                                                                                                                                                                                                       |
| ---- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| zh   | 50     | 聊天/对话/会话按 chat/conversation/session 规则统一；你→您；移除/删除、清空/清除、轮/回合归一；TTS 命名统一；suggestionHtmlTitle → Live Artifacts                                                              |
| de   | 68     | **du/Sie 统一为 du**（39 键重写）；Verlauf/Historie、Schnellmodus/Denkmodus、System-Audio 等家族归一；Stimmrekorder→Sprachrekorder；liveStatusReconnectingAutomatically 改为过程描述                           |
| fr   | 38     | tokens/jetons 统一为 tokens；Rendre→Effectuer le rendu；Basculer→Activer/Désactiver 家族归一；PiP 写法统一；téléverser/importer 归一；chatBehaviorTempTooltip 手动修复（l'aléatoire → le caractère aléatoire） |
| es   | 54     | clave de API 小写统一（12 键 Title-Case 修正）；video/vídeo 统一；predeterminado 归一；Borrar/Limpiar 归一；Coste→Costo（拉美中立）；缺 ¿ 补齐                                                                 |
| ja   | 31     | pwaUpdateRefreshPrompt 重写（再読み込み vs 更新 分离）；settingsFontSize→本文の文字サイズ；TTS 音色去重（情報豊かな/マイペースな/穏やかな）；PiP 拼写统一；未設定 统一                                         |
| ko   | 25     | 사고→추론 统一；전사→변환 统一；타사/서드파티 归一；PiP 三种写法统一；fetch/import 冲突解决（불러오기）；음성 및 보이스→음성 및 TTS                                                                            |

跳过 31 处：15 处被 translationCoverage.test.ts 固定值锁定（不可改）、11 处已在 P1 修复、1 处死键、4 处需后续人工评估。

验证：parse 结构检查 ✅（missing=0 / 占位符 0 错配）· `npm run i18n:check` ✅ · i18n 测试 22/22 ✅ · `tsc --noEmit` ✅ · ESLint 19 文件 ✅

### 待办（P3 可选）

- 17 个死键清理（需同步更新 translationCoverage.test.ts 中引用的死键断言）；en 源头优化（"Composer" 措辞、"to clear" 片段结构、3 个键的省略号统一）
- 4 处 codemod 跳过的遗留项人工评估（见 /tmp/amc-i18n/codemod-result.json 中 skipped 记录）
