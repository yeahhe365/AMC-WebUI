import { describe, expect, it, vi } from 'vitest';
import {
  CONTENT_AND_ACADEMIC_SCENARIOS,
  FIRST_TIER_SCENARIOS,
  annaScenario,
  eniManualPasteScenario,
  fopScenario,
  pyriteScenario,
  reasonerScenario,
  unrestrictedScenario,
  videoModerationScenario,
  voxelScenario,
} from '@/constants/defaultScenarios';
import {
  buildSavedScenarios,
  buildScenarioExportPayload,
  initializeScenarioState,
  mergeImportedScenarios,
  SYSTEM_SCENARIO_IDS,
} from './scenarioLibrary';

const createStorage = (initial: Record<string, string> = {}) => {
  const values = new Map(Object.entries(initial));

  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      values.set(key, value);
    }),
  };
};

describe('scenarioLibrary', () => {
  it('prunes reserved scenarios from storage and seeds missing built-in user presets', () => {
    const storage = createStorage({
      hasSeededJailbreaks_v1: 'true',
      hasSeededAnna_v1: 'true',
      hasSeededEniManualPaste_v1: 'true',
    });

    const result = initializeScenarioState(
      [
        reasonerScenario,
        {
          id: 'cyberpunk-rpg-scenario',
          title: 'Deprecated preset',
          messages: [],
        },
      ],
      storage,
    );

    expect(result.didChange).toBe(true);
    // cyberpunk pruned as deprecated; reasoner is a system scenario so filtered out;
    // first-tier, voxel and jailbreak scenarios seeded from their respective flags
    expect(result.userScenarios.map((s) => s.id)).toEqual([
      ...FIRST_TIER_SCENARIOS.map((s) => s.id),
      voxelScenario.id,
      fopScenario.id,
      unrestrictedScenario.id,
      pyriteScenario.id,
      annaScenario.id,
      eniManualPasteScenario.id,
      ...CONTENT_AND_ACADEMIC_SCENARIOS.map((s) => s.id),
      videoModerationScenario.id,
    ]);
    expect(result.savedScenarios.map((scenario) => scenario.id)).toEqual([
      ...SYSTEM_SCENARIO_IDS,
      ...FIRST_TIER_SCENARIOS.map((s) => s.id),
      voxelScenario.id,
      fopScenario.id,
      unrestrictedScenario.id,
      pyriteScenario.id,
      annaScenario.id,
      eniManualPasteScenario.id,
      ...CONTENT_AND_ACADEMIC_SCENARIOS.map((s) => s.id),
      videoModerationScenario.id,
    ]);
    expect(storage.setItem).toHaveBeenCalledWith('hasSeededFirstTierPresets_v3', 'true');
    expect(storage.setItem).toHaveBeenCalledWith('hasSeededPlayablePresets_v3', 'true');
    expect(storage.setItem).toHaveBeenCalledWith('hasSeededJailbreakPresets_v3', 'true');
    expect(storage.setItem).toHaveBeenCalledWith('hasSeededContentAcademicPresets_v2', 'true');
    expect(storage.setItem).toHaveBeenCalledWith('hasSeededVideoModerationPresets_v1', 'true');
  });

  it('seeds jailbreak and persona override presets by default', () => {
    const storage = createStorage();

    const result = initializeScenarioState([], storage);

    expect(result.userScenarios.map((s) => s.id)).toEqual([
      ...FIRST_TIER_SCENARIOS.map((s) => s.id),
      voxelScenario.id,
      fopScenario.id,
      unrestrictedScenario.id,
      pyriteScenario.id,
      annaScenario.id,
      eniManualPasteScenario.id,
      ...CONTENT_AND_ACADEMIC_SCENARIOS.map((s) => s.id),
      videoModerationScenario.id,
    ]);
    expect(result.savedScenarios.map((scenario) => scenario.id)).toEqual([
      ...SYSTEM_SCENARIO_IDS,
      ...FIRST_TIER_SCENARIOS.map((s) => s.id),
      voxelScenario.id,
      fopScenario.id,
      unrestrictedScenario.id,
      pyriteScenario.id,
      annaScenario.id,
      eniManualPasteScenario.id,
      ...CONTENT_AND_ACADEMIC_SCENARIOS.map((s) => s.id),
      videoModerationScenario.id,
    ]);
    expect(storage.setItem).toHaveBeenCalledWith('hasSeededFirstTierPresets_v3', 'true');
    expect(storage.setItem).toHaveBeenCalledWith('hasSeededPlayablePresets_v3', 'true');
    expect(storage.setItem).toHaveBeenCalledWith('hasSeededJailbreakPresets_v3', 'true');
    expect(storage.setItem).toHaveBeenCalledWith('hasSeededContentAcademicPresets_v2', 'true');
    expect(storage.setItem).toHaveBeenCalledWith('hasSeededVideoModerationPresets_v1', 'true');
  });

  it('preserves jailbreak presets that are no longer deprecated', () => {
    const result = initializeScenarioState(
      [
        { id: 'fop-scenario-default', title: 'FOP Mode', messages: [] },
        { id: 'unrestricted-scenario-default', title: 'Unrestricted Mode', messages: [] },
        { id: 'pyrite-scenario-default', title: 'Pyrite Mode', messages: [] },
        { id: 'anna-scenario-default', title: 'Anna (Girlfriend Mode)', messages: [] },
        { id: 'eni-manual-paste-scenario-2026-04-12', title: 'ENI', messages: [] },
        { id: 'custom-scenario', title: 'Custom Scenario', messages: [] },
      ],
      createStorage({
        hasSeededPlayablePresets_v3: 'true',
        hasSeededFirstTierPresets_v3: 'true',
        hasSeededJailbreakPresets_v3: 'true',
        hasSeededContentAcademicPresets_v2: 'true',
        hasSeededVideoModerationPresets_v1: 'true',
      }),
    );

    // None pruned — jailbreak scenarios are no longer in the deprecated list
    expect(result.didChange).toBe(false);
    expect(result.userScenarios.map((s) => s.id)).toEqual([
      'fop-scenario-default',
      'unrestricted-scenario-default',
      'pyrite-scenario-default',
      'anna-scenario-default',
      'eni-manual-paste-scenario-2026-04-12',
      'custom-scenario',
    ]);
    expect(result.savedScenarios.map((scenario) => scenario.id)).toEqual([
      ...SYSTEM_SCENARIO_IDS,
      'fop-scenario-default',
      'unrestricted-scenario-default',
      'pyrite-scenario-default',
      'anna-scenario-default',
      'eni-manual-paste-scenario-2026-04-12',
      'custom-scenario',
    ]);
  });

  it('exports only user scenarios', () => {
    const payload = buildScenarioExportPayload(
      buildSavedScenarios([
        voxelScenario,
        {
          id: 'custom-scenario',
          title: 'Custom Scenario',
          messages: [],
        },
      ]),
    );

    expect(payload).toEqual({
      type: 'AllModelChat-Scenarios',
      version: 1,
      scenarios: [
        voxelScenario,
        {
          id: 'custom-scenario',
          title: 'Custom Scenario',
          messages: [],
        },
      ],
    });
  });

  it('merges imports by skipping duplicate content and regenerating colliding ids', () => {
    const merged = mergeImportedScenarios({
      existingScenarios: [
        {
          id: 'existing-scenario',
          title: 'Custom Scenario',
          messages: [{ id: 'msg-1', role: 'user', content: 'Hello' }],
        },
      ],
      importedScenarios: [
        {
          id: 'duplicate-content',
          title: 'Custom Scenario',
          messages: [{ id: 'msg-2', role: 'user', content: 'Hello' }],
        },
        {
          id: 'existing-scenario',
          title: 'Imported Scenario',
          messages: [{ id: 'msg-3', role: 'model', content: 'Hi there' }],
        },
        reasonerScenario,
      ],
      createId: () => 'generated-scenario-id',
    });

    expect(merged).toEqual([
      {
        id: 'existing-scenario',
        title: 'Custom Scenario',
        messages: [{ id: 'msg-1', role: 'user', content: 'Hello' }],
      },
      {
        id: 'generated-scenario-id',
        title: 'Imported Scenario',
        messages: [{ id: 'msg-3', role: 'model', content: 'Hi there' }],
      },
    ]);
  });
});
