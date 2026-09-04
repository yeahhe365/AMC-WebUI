import {
  academicPaperPolisherScenario,
  annaScenario,
  audioDossierScenario,
  codebaseAuditorScenario,
  dataAnalystScenario,
  diagramArchitectScenario,
  eniManualPasteScenario,
  fopScenario,
  formalScenario,
  interactiveAppScenario,
  liveOralCoachScenario,
  longformEssayistScenario,
  pyriteScenario,
  reasonerScenario,
  resumeOptimizerScenario,
  shortVideoScriptScenario,
  socraticScenario,
  spatialRoboticsScenario,
  succinctScenario,
  unrestrictedScenario,
  videoModerationScenario,
  viralHeadlineArchitectScenario,
  visualPromptScenario,
  voxelScenario,
  xiaohongshuCopywriterScenario,
} from '@/constants/defaultScenarios';
import { type SavedScenario } from '@/types';

type ScenarioSeedStorage = Pick<Storage, 'getItem' | 'setItem'>;

interface ScenarioImportPayload {
  type: 'AllModelChat-Scenarios';
  version: 1;
  scenarios: SavedScenario[];
}

interface UserScenarioSeed {
  flag: string;
  scenarios: SavedScenario[];
}

interface InitializeScenarioStateResult {
  userScenarios: SavedScenario[];
  savedScenarios: SavedScenario[];
  didChange: boolean;
}

const DEPRECATED_SCENARIO_IDS = ['cyberpunk-rpg-scenario'];

const SYSTEM_SCENARIOS: SavedScenario[] = [reasonerScenario, succinctScenario, socraticScenario, formalScenario];

const USER_SCENARIO_SEEDS: UserScenarioSeed[] = [
  {
    flag: 'hasSeededFirstTierPresets_v3',
    scenarios: [
      dataAnalystScenario,
      diagramArchitectScenario,
      interactiveAppScenario,
      codebaseAuditorScenario,
      audioDossierScenario,
      spatialRoboticsScenario,
      liveOralCoachScenario,
      visualPromptScenario,
    ],
  },
  {
    flag: 'hasSeededPlayablePresets_v3',
    scenarios: [voxelScenario],
  },
  {
    flag: 'hasSeededJailbreakPresets_v3',
    scenarios: [fopScenario, unrestrictedScenario, pyriteScenario, annaScenario, eniManualPasteScenario],
  },
  {
    flag: 'hasSeededContentAcademicPresets_v2',
    scenarios: [
      academicPaperPolisherScenario,
      resumeOptimizerScenario,
      xiaohongshuCopywriterScenario,
      longformEssayistScenario,
      shortVideoScriptScenario,
      viralHeadlineArchitectScenario,
    ],
  },
  {
    flag: 'hasSeededVideoModerationPresets_v1',
    scenarios: [videoModerationScenario],
  },
];

export const SYSTEM_SCENARIO_IDS = SYSTEM_SCENARIOS.map((scenario) => scenario.id);

/**
 * Every scenario shipped with the app: read-only system presets plus the
 * seeded user presets (roleplay / creative). Used to separate "built-in" from
 * truly user-authored scenarios in the library UI.
 */
export const BUILT_IN_SCENARIO_IDS: string[] = [
  ...SYSTEM_SCENARIO_IDS,
  ...USER_SCENARIO_SEEDS.flatMap((seed) => seed.scenarios.map((scenario) => scenario.id)),
];

const RESERVED_SCENARIO_IDS = new Set([...SYSTEM_SCENARIO_IDS, ...DEPRECATED_SCENARIO_IDS]);

const getScenarioFingerprint = (scenario: SavedScenario): string =>
  JSON.stringify({
    title: scenario.title.trim(),
    systemInstruction: scenario.systemInstruction?.trim() ?? '',
    messages: scenario.messages.map(({ role, content }: { role: 'user' | 'model'; content: string }) => ({
      role,
      content,
    })),
  });

export const getExportableUserScenarios = (scenarios: SavedScenario[]): SavedScenario[] =>
  scenarios.filter((scenario) => !RESERVED_SCENARIO_IDS.has(scenario.id));

export const buildScenarioExportPayload = (scenarios: SavedScenario[]): ScenarioImportPayload => ({
  type: 'AllModelChat-Scenarios',
  version: 1,
  scenarios: getExportableUserScenarios(scenarios),
});

export const buildSavedScenarios = (userScenarios: SavedScenario[]): SavedScenario[] => [
  ...SYSTEM_SCENARIOS,
  ...getExportableUserScenarios(userScenarios),
];

export const initializeScenarioState = (
  storedScenarios: SavedScenario[],
  storage: ScenarioSeedStorage,
): InitializeScenarioStateResult => {
  let userScenarios = getExportableUserScenarios(storedScenarios);
  let didChange = userScenarios.length !== storedScenarios.length;

  for (const seed of USER_SCENARIO_SEEDS) {
    if (storage.getItem(seed.flag)) {
      continue;
    }

    const existingIndexMap = new Map(userScenarios.map((scenario, index) => [scenario.id, index]));
    const newScenarios: SavedScenario[] = [];

    for (const seedScenario of seed.scenarios) {
      const existingIdx = existingIndexMap.get(seedScenario.id);
      if (existingIdx !== undefined) {
        const existing = userScenarios[existingIdx];
        const shouldUpdateTitle =
          (existing.messages.length === 0 || existing.id === eniManualPasteScenario.id) &&
          existing.title !== seedScenario.title &&
          seedScenario.title.endsWith(existing.title);
        const shouldUpdateCategory =
          existing.messages.length === 0 &&
          seedScenario.category !== undefined &&
          existing.category !== seedScenario.category;

        if (shouldUpdateTitle || shouldUpdateCategory) {
          userScenarios[existingIdx] = {
            ...existing,
            ...(shouldUpdateTitle ? { title: seedScenario.title } : {}),
            ...(shouldUpdateCategory ? { category: seedScenario.category } : {}),
          };
          didChange = true;
        }
      } else {
        newScenarios.push(seedScenario);
      }
    }

    if (newScenarios.length > 0) {
      userScenarios = [...userScenarios, ...newScenarios];
      didChange = true;
    }

    storage.setItem(seed.flag, 'true');
  }

  return {
    userScenarios,
    savedScenarios: buildSavedScenarios(userScenarios),
    didChange,
  };
};

export const mergeImportedScenarios = ({
  existingScenarios,
  importedScenarios,
  createId,
}: {
  existingScenarios: SavedScenario[];
  importedScenarios: SavedScenario[];
  createId: () => string;
}): SavedScenario[] => {
  const merged = [...getExportableUserScenarios(existingScenarios)];
  const existingIds = new Set(merged.map((scenario) => scenario.id));
  const existingFingerprints = new Set(merged.map(getScenarioFingerprint));

  for (const importedScenario of importedScenarios) {
    if (RESERVED_SCENARIO_IDS.has(importedScenario.id)) {
      continue;
    }

    const fingerprint = getScenarioFingerprint(importedScenario);
    if (existingFingerprints.has(fingerprint)) {
      continue;
    }

    const nextScenario: SavedScenario = {
      ...importedScenario,
      id:
        !importedScenario.id || existingIds.has(importedScenario.id) || RESERVED_SCENARIO_IDS.has(importedScenario.id)
          ? createId()
          : importedScenario.id,
    };

    merged.push(nextScenario);
    existingIds.add(nextScenario.id);
    existingFingerprints.add(fingerprint);
  }

  return merged;
};
