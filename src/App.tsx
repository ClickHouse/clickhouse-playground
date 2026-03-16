import * as React from 'react';
import { NavigateFunction, useNavigate } from 'react-router-dom';
import Box from '@mui/material/Box';
import {
  Client, GetQueryRunResponse, GetTagsResponse, RunQueryResponse,
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

type State = {
  tags: string[];
  selectedVersion: string;
  selectedFormat: string;
  input: string;
  initialInput: string;
  requestIsRunning: boolean;
  output: string;
  timeElapsed?: string;
};

interface AppProps {
  navigate: NavigateFunction;
}

class App extends React.Component<AppProps, State> {
  client: Client;

  navigate: NavigateFunction;

  constructor(props: AppProps) {
    super(props);
    this.navigate = props.navigate;
    this.client = new Client(apiUrl);

    this.state = {
      tags: ['latest'],
      selectedVersion: 'latest',
      selectedFormat: localStorage.getItem(localStorageFormatKey) || 'TabSeparated',
      input: '',
      initialInput: '',
      requestIsRunning: false,
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
  }

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

  private runQuery = () => {
    this.setState({
      requestIsRunning: true,
      output: '',
      timeElapsed: undefined,
    });

    const { input, selectedVersion, selectedFormat } = this.state;

    this.client
      .runQuery(input, selectedVersion, selectedFormat)
      .then((result: RunQueryResponse) => {
        this.setState({
          output: result.output,
          timeElapsed: result.timeElapsed,
        });

        const path = `/${result.queryRunId}`;
        if (this.navigate != null) {
          this.navigate(path);
        }
      })
      .catch((error) => {
        console.log(error);
        this.setState({
          output: error.message,
        });
      })
      .finally(() => this.setState({
        requestIsRunning: false,
      }));
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
          selectedVersion={this.state.selectedVersion}
          selectedFormat={this.state.selectedFormat}
          outputFormats={outputFormats}
          requestIsRunning={this.state.requestIsRunning}
          isFormatSelectionDisabled={formatDisabled}
          githubRepoUrl={githubRepoUrl}
          onVersionChange={this.handleSelectedVersionChange}
          onFormatChange={this.handleSelectedFormatChange}
          onRunClick={this.handleRunButtonClick}
        />
        <EditorPanel
          initialInput={this.state.initialInput}
          output={this.state.output}
          timeElapsed={this.state.timeElapsed}
          requestIsRunning={this.state.requestIsRunning}
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
