import * as React from 'react';
import {
  Badge, Button, IconButton, Select, ThemeName,
} from '@clickhouse/click-ui';

// formatElapsed renders a seconds count as m:ss (e.g. 83 -> "1:23").
function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

const toOptions = (values: string[]) => values.map((value) => ({ label: value, value }));

interface HeaderProps {
  tags: string[];
  buildTypes: string[];
  selectedVersion: string;
  selectedBuildType: string;
  selectedFormat: string;
  outputFormats: string[];
  requestIsRunning: boolean;
  buildStatus: string;
  buildElapsedSec: number;
  isFormatSelectionDisabled: boolean;
  githubRepoUrl: string;
  theme: ThemeName;
  showHexViewer: boolean;
  onVersionChange: (newValue: string) => void;
  onBuildTypeChange: (newValue: string) => void;
  onFormatChange: (newValue: string) => void;
  onRunClick: (event: React.FormEvent) => void;
  onThemeToggle: () => void;
  onHexViewerToggle: () => void;
}

function Header({
  tags,
  buildTypes,
  selectedVersion,
  selectedBuildType,
  selectedFormat,
  outputFormats,
  requestIsRunning,
  buildStatus,
  buildElapsedSec,
  isFormatSelectionDisabled,
  githubRepoUrl,
  theme,
  showHexViewer,
  onVersionChange,
  onBuildTypeChange,
  onFormatChange,
  onRunClick,
  onThemeToggle,
  onHexViewerToggle,
}: HeaderProps) {
  return (
    <header className="app-header">
      <div className="app-header-run">
        <Button
          type="primary"
          label="Run query"
          iconLeft="play"
          loading={requestIsRunning}
          disabled={requestIsRunning}
          onClick={onRunClick}
        />
      </div>

      <div className="app-header-select-version">
        <Select
          value={selectedVersion}
          options={toOptions(tags)}
          onSelect={onVersionChange}
          disabled={requestIsRunning}
          showSearch
        />
      </div>

      <div className="app-header-select-build">
        <Select
          value={selectedBuildType}
          options={toOptions(buildTypes)}
          onSelect={onBuildTypeChange}
          disabled={requestIsRunning || buildTypes.length <= 1}
        />
      </div>

      <div className="app-header-select-format">
        <Select
          value={selectedFormat}
          options={toOptions(outputFormats)}
          onSelect={onFormatChange}
          disabled={isFormatSelectionDisabled}
          showSearch
          useFullWidthItems
        />
      </div>

      {buildStatus && (
        <div className="app-header-status">
          <Badge state="info" icon="horizontal-loading" text={`${buildStatus} ${formatElapsed(buildElapsedSec)}`} />
        </div>
      )}

      <div className="app-header-spacer" />

      <div className="app-header-actions">
        <IconButton
          type={showHexViewer ? 'primary' : 'ghost'}
          icon="code"
          aria-pressed={showHexViewer}
          title={showHexViewer ? 'Hide hexadecimal output' : 'Show hexadecimal output'}
          onClick={onHexViewerToggle}
        />
        <IconButton
          type="ghost"
          icon={theme === 'light' ? 'moon' : 'light-bulb-on'}
          title="Toggle color theme"
          onClick={onThemeToggle}
        />
        <IconButton
          type="ghost"
          icon="github"
          title="Open the GitHub repository"
          onClick={() => window.open(githubRepoUrl, '_blank')}
        />
      </div>
    </header>
  );
}

export default Header;
