import * as React from 'react';
import AppBar from '@mui/material/AppBar';
import Toolbar from '@mui/material/Toolbar';
import Button from '@mui/material/Button';
import IconButton from '@mui/material/IconButton';
import Box from '@mui/material/Box';
import { PlayArrow } from '@mui/icons-material';
import GitHubIcon from '@mui/icons-material/GitHub';
import SelectDropdown from './SelectDropdown';

interface HeaderProps {
  tags: string[];
  selectedVersion: string;
  selectedFormat: string;
  outputFormats: string[];
  requestIsRunning: boolean;
  isFormatSelectionDisabled: boolean;
  githubRepoUrl: string;
  onVersionChange: (newValue: string) => void;
  onFormatChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onRunClick: (event: React.FormEvent) => void;
}

function Header({
  tags,
  selectedVersion,
  selectedFormat,
  outputFormats,
  requestIsRunning,
  isFormatSelectionDisabled,
  githubRepoUrl,
  onVersionChange,
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
