import { type ScenarioCategory } from '@/types';
import { Code, Sparkles, Briefcase, GraduationCap, Heart, Shield, MessageSquare, Brain } from 'lucide-react';

export const CATEGORY_META = {
  coding: {
    icon: Code,
    labelKey: 'scenariosCategoryCoding',
  },
  creative: {
    icon: Sparkles,
    labelKey: 'scenariosCategoryCreative',
  },
  workplace: {
    icon: Briefcase,
    labelKey: 'scenariosCategoryWorkplace',
  },
  academic: {
    icon: GraduationCap,
    labelKey: 'scenariosCategoryAcademic',
  },
  roleplay: {
    icon: Heart,
    labelKey: 'scenariosCategoryRoleplay',
  },
  system: {
    icon: Shield,
    labelKey: 'scenariosCategorySystem',
  },
  custom: {
    icon: MessageSquare,
    labelKey: 'scenariosCategoryCustom',
  },
  assistant: {
    icon: Brain,
    labelKey: 'scenariosCategoryAssistant',
  },
};

export const DEFAULT_CATEGORY: ScenarioCategory = 'custom';

export const getCategory = (category?: ScenarioCategory): ScenarioCategory => {
  if (!category) return DEFAULT_CATEGORY;
  if (category === 'assistant') return 'workplace';
  return category;
};

export const CATEGORY_ORDER: ScenarioCategory[] = [
  'coding',
  'creative',
  'workplace',
  'academic',
  'roleplay',
  'system',
  'custom',
];
