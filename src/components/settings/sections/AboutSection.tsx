import { Github, Star, ExternalLink } from 'lucide-react';
import React, { useEffect, useState } from 'react';

import { useI18n } from '@/contexts/I18nContext';
import { SETTINGS_OUTLINE_BUTTON_CLASS } from '@/constants/buttonClasses';
import { logService } from '@/services/logService';
import { useSettingsStore } from '@/stores/settingsStore';
import { isDarkThemeId } from '@/utils/themeMode';

import packageJson from '../../../../package.json';

const compareVersions = (v1: string, v2: string) => {
  const parts1 = v1.replace(/^v/, '').split('.').map(Number);
  const parts2 = v2.replace(/^v/, '').split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }
  return 0;
};

export const AboutSection: React.FC = () => {
  const { t, language } = useI18n();
  const themeId = useSettingsStore((state) => state.currentTheme.id);
  const currentVersion = packageJson.version;
  const [stars, setStars] = useState<number | null>(null);
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasReleaseData, setHasReleaseData] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    const fetchData = async () => {
      try {
        const [repoRes, releaseRes] = await Promise.allSettled([
          fetch('https://api.github.com/repos/yeahhe365/AMC-WebUI'),
          fetch('https://api.github.com/repos/yeahhe365/AMC-WebUI/releases/latest'),
        ]);

        if (isCancelled) {
          return;
        }

        if (repoRes.status === 'fulfilled' && repoRes.value.ok) {
          const repoData = await repoRes.value.json();
          if (typeof repoData.stargazers_count === 'number') {
            setStars(repoData.stargazers_count);
          } else {
            setStars(null);
          }
        }

        if (releaseRes.status === 'fulfilled' && releaseRes.value.ok) {
          const releaseData = await releaseRes.value.json();
          if (typeof releaseData.tag_name === 'string' && releaseData.tag_name.length > 0) {
            setLatestVersion(releaseData.tag_name);
            setHasReleaseData(true);
          } else {
            setLatestVersion(null);
            setHasReleaseData(false);
          }
        } else {
          setHasReleaseData(false);
        }
      } catch (releaseError) {
        if (!isCancelled) {
          logService.error('Failed to fetch about info', releaseError);
          setHasReleaseData(false);
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isCancelled = true;
    };
  }, []);

  const comparison = latestVersion ? compareVersions(latestVersion, currentVersion) : 0;
  const isUpdateAvailable = comparison === 1;
  const isBeta = comparison === -1;
  const isReleaseStatusUnavailable = !isLoading && !hasReleaseData;
  const statusSeparator = language === 'zh' ? '：' : ': ';
  const versionTooltip =
    isUpdateAvailable && latestVersion ? `${t('aboutUpdateAvailable')}${statusSeparator}${latestVersion}` : undefined;

  const getStatusColor = () => {
    if (isLoading) return 'bg-[var(--theme-text-info)]';
    if (isUpdateAvailable) return 'bg-[var(--theme-text-warning)]';
    if (isBeta) return 'bg-[var(--theme-text-info)]';
    if (isReleaseStatusUnavailable) return 'bg-[var(--theme-text-tertiary)]';
    return 'bg-[var(--theme-text-success)]';
  };

  const getStatusText = () => {
    if (isLoading) return t('aboutVersionChecking');
    if (isUpdateAvailable) return t('aboutUpdateAvailable');
    if (isBeta) return t('aboutBeta');
    if (isReleaseStatusUnavailable) return t('aboutUnavailable');
    return t('aboutLatestVersion');
  };

  const starCountLabel = stars !== null ? stars.toLocaleString() : t(isLoading ? 'loading' : 'aboutUnavailable');

  return (
    <div data-settings-item="about-root" className="flex min-h-full flex-col items-center px-4 py-6 text-center">
      <img
        src={isDarkThemeId(themeId) ? '/app-logo-dark.png' : '/app-logo.png'}
        alt={t('aboutLogoAlt')}
        className="h-auto w-24 sm:w-28"
      />

      <a
        href="https://github.com/yeahhe365/AMC-WebUI/releases"
        target="_blank"
        rel="noopener noreferrer"
        title={versionTooltip}
        className="mt-4 inline-flex items-center gap-2 rounded-lg px-2 py-1 text-sm transition-colors hover:bg-[var(--theme-bg-tertiary)]/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-border-focus)]"
      >
        <span className="font-mono tabular-nums text-[var(--theme-text-primary)]">v{currentVersion}</span>
        <span className={`h-1.5 w-1.5 rounded-full ${getStatusColor()}`} />
        <span className="text-xs text-[var(--theme-text-secondary)]">
          {getStatusText()}
          {isUpdateAvailable && latestVersion ? ` (${latestVersion})` : null}
        </span>
        <ExternalLink size={12} className="text-[var(--theme-text-secondary)]" />
      </a>

      <p className="mt-3 max-w-md text-sm leading-6 text-[var(--theme-text-secondary)]">{t('aboutDescription')}</p>

      <div className="mt-5 flex w-full flex-col items-stretch justify-center gap-2 sm:w-auto sm:flex-row sm:items-center">
        <a
          href="https://github.com/yeahhe365/AMC-WebUI"
          target="_blank"
          rel="noopener noreferrer"
          data-settings-item="about-github"
          className={`${SETTINGS_OUTLINE_BUTTON_CLASS} w-full sm:w-auto`}
        >
          <Github size={16} />
          <span>{t('aboutViewOnGithub')}</span>
        </a>

        <a
          href="https://github.com/yeahhe365/AMC-WebUI/stargazers"
          target="_blank"
          rel="noopener noreferrer"
          className={`${SETTINGS_OUTLINE_BUTTON_CLASS} w-full sm:w-auto`}
        >
          <Star size={16} className="text-[var(--theme-text-secondary)]" />
          <span className="tabular-nums">{starCountLabel}</span>
          <span>{t('aboutStarsLabel')}</span>
        </a>
      </div>
    </div>
  );
};
