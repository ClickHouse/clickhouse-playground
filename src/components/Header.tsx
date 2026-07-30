import * as React from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import Chip from '@mui/material/Chip';
import CircularProgress from '@mui/material/CircularProgress';
import { PlayArrow } from '@mui/icons-material';
import GitHubIcon from '@mui/icons-material/GitHub';
import SelectDropdown from './SelectDropdown';

// formatElapsed renders a seconds count as m:ss (e.g. 83 -> "1:23").
function formatElapsed(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

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
  onVersionChange: (newValue: string) => void;
  onBuildTypeChange: (newValue: string) => void;
  onFormatChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRunClick: (event: React.FormEvent) => void;
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
  onVersionChange,
  onBuildTypeChange,
  onFormatChange,
  onRunClick,
}: HeaderProps) {
  return (
    <Box sx={{ flexShrink: 0 }}>
      <AppBar position="static">
        <Toolbar sx={{ flexWrap: 'wrap', gap: 0.5 }}>
          <SelectDropdown
            id="select-clickhouse-version"
            options={tags}
            value={selectedVersion}
            onChange={onVersionChange}
            disabled={requestIsRunning || false}
            label="ClickHouse Version"
            sx={{
              my: 1,
              px: 1,
              flexGrow: 1,
              minWidth: '150px',
            }}
            disableDisplay={false}
          />

          <SelectDropdown
            id="select-build-type"
            options={buildTypes}
            value={selectedBuildType}
            onChange={onBuildTypeChange}
            disabled={requestIsRunning || buildTypes.length <= 1}
            label="Build"
            sx={{
              my: 1,
              px: 1,
              width: '160px',
              minWidth: '160px',
              flexGrow: 0,
              flexShrink: 0,
            }}
            disableDisplay={false}
          />

          <SelectDropdown
            id="select-output-format"
            options={outputFormats}
            value={selectedFormat}
            onChange={(newValue) => {
              const pseudoEvent = {
                target: { value: newValue },
              } as React.ChangeEvent<HTMLInputElement>;
              onFormatChange(pseudoEvent);
            }}
            disabled={isFormatSelectionDisabled || false}
            label="Format"
            sx={{
              my: 1,
              px: 1,
              width: '250px',
              minWidth: '250px',
              flexGrow: 0,
              flexShrink: 0,
            }}
            disableDisplay
          />

          <Button
            variant="contained"
            disabled={requestIsRunning}
            onClick={onRunClick}
            sx={{ my: 2, display: 'flex', flexGrow: 1 }}
            color="secondary"
          >
            <PlayArrow fontSize="large" />
            Run query
          </Button>

          {buildStatus && (
            <Chip
              color="secondary"
              variant="outlined"
              icon={<CircularProgress size={16} color="inherit" />}
              label={`${buildStatus} ${formatElapsed(buildElapsedSec)}`}
              sx={{ my: 2, mx: 1, maxWidth: '100%' }}
            />
          )}

          <Box sx={{ flexGrow: 5 }} />

          <IconButton
            size="large"
            edge="end"
            color="secondary"
            onClick={() => window.open(githubRepoUrl, '_blank')}
          >
            <GitHubIcon />
          </IconButton>
        </Toolbar>
      </AppBar>
    </Box>
  );
}

export default Header;
