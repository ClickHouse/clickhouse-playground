import * as React from 'react';
import { NavigateFunction, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import {
  Client,
  GetBuildTypesResponse,
  GetQueryRunResponse,
  GetTagsResponse,
  ImageStatusResponse,
  RunQueryResponse,
  RELEASE_BUILD_TYPE,
} from './api/PlaygroundAPI';
import Header from './components/Header';
import EditorPanel from './components/EditorPanel';
import outputFormats from './data/outputFormats'; // Import the formats

const defaultInput = `CREATE TABLE users (uid Int16, name String, age Int16) ENGINE=Memory;

INSERT INTO users VALUES (1231, 'John', 33);
INSERT INTO users VALUES (6666, 'Ksenia', 48);
INSERT INTO users VALUES (8888, 'Alice', 50);

SELECT * FROM users;`;

const apiUrl = process.env.REACT_APP_API_URL;
const githubRepoUrl = 'https://github.com/lodthe/clickhouse-playground';

const localStorageFormatKey = 'clickhouse-playground-format';
const localStorageBuildTypeKey = 'clickhouse-playground-build-type';

// How often the image build status is polled while a non-release image is being built.
const buildPollIntervalMs = 2000;

const sleep = (ms: number): Promise<void> => new Promise((resolve) => {
  window.setTimeout(resolve, ms);
});

type State = {
  tags: string[];
  buildTypes: string[];
  selectedVersion: string;
  selectedBuildType: string;
  selectedFormat: string;
  input: string;
  initialInput: string;
  requestIsRunning: boolean;
  buildStatus: string;
  buildElapsedSec: number;
  output: string;
  timeElapsed?: string;
};

interface AppProps {
  navigate: NavigateFunction;
}

class App extends React.Component<AppProps, State> {
  client: Client;

  navigate: NavigateFunction;

  // Ticking timer that shows how long the current image build has been running.
  buildTimer?: ReturnType<typeof setInterval>;

  buildStartMs = 0;

  constructor(props: AppProps) {
    super(props);
    this.navigate = props.navigate;
    this.client = new Client(apiUrl);

    this.state = {
      tags: ['latest'],
      buildTypes: [RELEASE_BUILD_TYPE],
      selectedVersion: 'latest',
      selectedBuildType: localStorage.getItem(localStorageBuildTypeKey) || RELEASE_BUILD_TYPE,
      selectedFormat: localStorage.getItem(localStorageFormatKey) || 'TabSeparated',
      input: '',
      initialInput: '',
      requestIsRunning: false,
      buildStatus: '',
      buildElapsedSec: 0,
      output: '',
      timeElapsed: undefined,
    };
  }

  componentDidMount() {
    const savedFormat = localStorage.getItem(localStorageFormatKey);
    if (
      savedFormat
      && outputFormats.includes(savedFormat)
      && this.state.selectedFormat !== savedFormat
    ) {
      this.setState({ selectedFormat: savedFormat });
    }

    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 'Enter') {
        this.runQuery();
      }
    });

    const matches = window.location.pathname.match(/\/([a-z\d-]+)/);
    if (matches) {
      this.getQueryRun(matches[1]);
    } else {
      this.setState({
        input: defaultInput,
        initialInput: defaultInput,
      });
    }

    this.client
      .getTags()
      .then((result: GetTagsResponse) => {
        this.setState({
          tags: result.tags,
        });
      })
      .catch((error) => {
        console.log(error);
      });

    this.client
      .getBuildTypes()
      .then((result: GetBuildTypesResponse) => {
        const buildTypes = result.buildTypes && result.buildTypes.length > 0
          ? result.buildTypes
          : [RELEASE_BUILD_TYPE];

        this.setState((prev) => ({
          buildTypes,
          // Reset to release if the persisted build type is no longer offered.
          selectedBuildType: buildTypes.includes(prev.selectedBuildType)
            ? prev.selectedBuildType
            : RELEASE_BUILD_TYPE,
        }));
      })
      .catch((error) => {
        console.log(error);
      });
  }

  componentWillUnmount() {
    this.stopBuildTimer();
  }

  private startBuildTimer = () => {
    this.buildStartMs = Date.now();
    this.stopBuildTimer();
    this.setState({ buildElapsedSec: 0 });
    this.buildTimer = setInterval(() => {
      this.setState({ buildElapsedSec: Math.floor((Date.now() - this.buildStartMs) / 1000) });
    }, 1000);
  };

  private stopBuildTimer = () => {
    if (this.buildTimer !== undefined) {
      clearInterval(this.buildTimer);
      this.buildTimer = undefined;
    }
  };

  private handleInputChange = (value: string) => {
    this.setState({
      input: value,
    });
  };

  private handleSelectedVersionChange = (newValue: string) => {
    this.setState({
      selectedVersion: newValue,
    });
  };

  private handleSelectedBuildTypeChange = (newValue: string) => {
    localStorage.setItem(localStorageBuildTypeKey, newValue);
    this.setState({
      selectedBuildType: newValue,
    });
  };

  private handleSelectedFormatChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const newFormat = event.target.value;
    localStorage.setItem(localStorageFormatKey, newFormat);
    this.setState({
      selectedFormat: newFormat,
    });
  };

  private handleRunButtonClick = (event: React.FormEvent) => {
    event.preventDefault();
    this.runQuery();
  };

  private getQueryRun = (id: string) => {
    this.setState({
      requestIsRunning: true,
      timeElapsed: undefined,
    });

    this.client
      .getQueryRun(id)
      .then((result: GetQueryRunResponse) => {
        this.setState({
          input: result.input,
          initialInput: result.input,
          output: result.output,
          selectedVersion: result.version,
          selectedBuildType: result.buildType,
        });
      })
      .catch((error) => {
        console.log(error);
        this.setState({
          input: '',
          output: error.message,
        });
      })
      .finally(() => this.setState({
        requestIsRunning: false,
      }));
  };

  // ensureImageReady prepares a non-release image and polls until it is built.
  // It returns true once the image is ready, or false (after setting an error output)
  // if the build failed.
  /* eslint-disable no-await-in-loop */
  private ensureImageReady = async (version: string, buildType: string): Promise<boolean> => {
    const stageText = (detail?: string) => detail || `Building ${buildType} image for ${version}`;

    // While building, the right panel mirrors the live build log; fall back to a hint.
    const applyStatus = (status: ImageStatusResponse) => {
      this.setState({
        buildStatus: stageText(status.detail),
        output: status.logs
          || `Preparing the ${buildType} build for ${version}…\n`
            + 'The first run builds the image from CI artifacts and can take several minutes.',
      });
    };

    let status = await this.client.prepareImage(version, buildType);
    applyStatus(status);

    while (status.state === 'building') {
      await sleep(buildPollIntervalMs);
      status = await this.client.getImageStatus(version, buildType);
      applyStatus(status);
    }

    if (status.state === 'failed') {
      const header = `Failed to build the ${buildType} image for ${version}: ${status.error || 'unknown error'}`;
      this.setState({
        output: status.logs ? `${header}\n\n--- build log ---\n${status.logs}` : header,
      });
      return false;
    }

    return status.state === 'ready';
  };
  /* eslint-enable no-await-in-loop */

  private runQuery = async () => {
    const {
      input, selectedFormat,
    } = this.state;
    const selectedVersion = this.state.selectedVersion.trim();
    const selectedBuildType = this.state.selectedBuildType.trim();

    this.setState({
      requestIsRunning: true,
      output: '',
      buildStatus: '',
      timeElapsed: undefined,
    });

    try {
      const isRelease = !selectedBuildType || selectedBuildType === RELEASE_BUILD_TYPE;
      if (!isRelease) {
        this.setState({
          output: `Preparing the ${selectedBuildType} build for ${selectedVersion}.\n`
            + 'The first run builds the image from CI artifacts and can take several minutes…',
        });

        this.startBuildTimer();
        const ready = await this.ensureImageReady(selectedVersion, selectedBuildType);
        if (!ready) {
          return;
        }

        // Keep the timer running through container start + query execution.
        this.setState({ buildStatus: 'Running query', output: '' });
      }

      const result: RunQueryResponse = await this.client.runQuery(
        input,
        selectedVersion,
        selectedBuildType,
        selectedFormat,
      );

      this.setState({
        output: result.output,
        timeElapsed: result.timeElapsed,
      });

      const path = `/${result.queryRunId}`;
      if (this.navigate != null) {
        this.navigate(path);
      }
    } catch (error) {
      console.log(error);
      this.setState({
        output: (error as Error).message,
      });
    } finally {
      this.stopBuildTimer();
      this.setState({
        requestIsRunning: false,
        buildStatus: '',
      });
    }
  };

  private isFormatSelectionDisabled = (): boolean => {
    const { selectedVersion } = this.state;

    if (!/^\d/.test(selectedVersion)) {
      return false;
    }

    const majorVersionMatch = selectedVersion.match(/^(\d+)/);
    if (majorVersionMatch && majorVersionMatch[1]) {
      const majorVersion = parseInt(majorVersionMatch[1], 10);
      return majorVersion < 21;
    }

    return false;
  };

  public render() {
    const formatDisabled = this.state.requestIsRunning || this.isFormatSelectionDisabled();

    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          height: '100dvh',
          width: '100%',
          maxWidth: '100%',
          px: { xs: 1, sm: 2, md: 3 },
          boxSizing: 'border-box',
          overflow: 'hidden',
        }}
      >
        <Header
          tags={this.state.tags}
          buildTypes={this.state.buildTypes}
          selectedVersion={this.state.selectedVersion}
          selectedBuildType={this.state.selectedBuildType}
          selectedFormat={this.state.selectedFormat}
          outputFormats={outputFormats}
          requestIsRunning={this.state.requestIsRunning}
          buildStatus={this.state.buildStatus}
          buildElapsedSec={this.state.buildElapsedSec}
          isFormatSelectionDisabled={formatDisabled}
          githubRepoUrl={githubRepoUrl}
          onVersionChange={this.handleSelectedVersionChange}
          onBuildTypeChange={this.handleSelectedBuildTypeChange}
          onFormatChange={this.handleSelectedFormatChange}
          onRunClick={this.handleRunButtonClick}
        />
        <EditorPanel
          initialInput={this.state.initialInput}
          output={this.state.output}
          timeElapsed={this.state.timeElapsed}
          requestIsRunning={this.state.requestIsRunning}
          followOutput={this.state.requestIsRunning && this.state.buildStatus !== ''}
          onInputChange={this.handleInputChange}
        />
      </Box>
    );
  }
}

function WrappedApp(props: Record<string, unknown>) {
  return (
    <App {...props} navigate={useNavigate()} />
  );
}

export default WrappedApp;
