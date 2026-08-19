import * as React from 'react';
import { useEffect, useMemo, useRef } from 'react';
import CodeMirror, { Prec, ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { EditorView, keymap } from '@codemirror/view';
import { autocompletion } from '@codemirror/autocomplete';
import Box from '@mui/material/Box';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import {
  Panel,
  PanelGroup,
  PanelResizeHandle,
} from 'react-resizable-panels';
import { xcodeLight, xcodeLightPatch } from '../CodeMirrorTheme';

interface EditorPanelProps {
  initialInput: string;
  output: string;
  timeElapsed?: string;
  requestIsRunning: boolean;
  followOutput: boolean;
  onInputChange: (value: string) => void;
  onRun: () => void;
}

function EditorPanel({
  initialInput,
  output,
  timeElapsed,
  requestIsRunning,
  followOutput,
  onInputChange,
  onRun,
}: EditorPanelProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  const panelDirection = isMobile ? 'vertical' : 'horizontal';

  // Prec.highest overrides the default Cmd-Enter binding (insertBlankLine).
  const runKeymap = useMemo(() => Prec.highest(keymap.of([
    { mac: 'Cmd-Enter', run: () => { onRun(); return true; } },
  ])), [onRun]);

  // While streaming build logs, keep the output scrolled to the latest line.
  const outputRef = useRef<ReactCodeMirrorRef>(null);
  useEffect(() => {
    if (!followOutput) {
      return;
    }
    const { view } = outputRef.current ?? {};
    if (view) {
      view.scrollDOM.scrollTop = view.scrollDOM.scrollHeight;
    }
  }, [output, followOutput]);

  useEffect(() => {
    const style = document.createElement('style');
    style.textContent = `
      .cm-editor-container .cm-editor {
        height: 100% !important;
        width: 100% !important;
        flex-grow: 1;
      }
      .cm-editor-container .cm-scroller {
        width: 100% !important;
        height: 100% !important;
      }
      .cm-editor-container .cm-content {
        width: 100% !important;
        min-height: 100%;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  const resizeHandleStyle: React.CSSProperties = isMobile
    ? {
      height: '10px',
      background: '#ddd',
      cursor: 'row-resize',
      width: '100%',
      margin: '5px 0',
      borderRadius: '3px',
    }
    : {
      width: '6px',
      background: '#eee',
      cursor: 'col-resize',
      height: '100%',
      flexShrink: 0,
    };

  return (
    <Box
      component="div"
      sx={{
        my: 1,
        mt: 2,
        border: '1px solid #ccc',
        display: 'flex',
        overflow: 'hidden',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        width: isMobile ? '95%' : '100%',
        maxWidth: isMobile ? '95%' : '100%',
        mx: isMobile ? 'auto' : 0,
      }}
    >
      <PanelGroup
        direction={panelDirection}
        style={{
          height: '100%',
          width: '100%',
          minHeight: 0,
          maxWidth: '100%',
          flex: 1,
        }}
      >
        <Panel
          defaultSize={isMobile ? 40 : 50}
          minSize={20}
          style={{
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            minHeight: 0,
            width: '100%',
            maxWidth: '100%',
          }}
        >
          <CodeMirror
            autoFocus
            theme={xcodeLight}
            value={initialInput}
            placeholder="Enter SQL queries..."
            style={{
              height: '100%',
              width: '100%',
              flexGrow: 1,
              overflow: 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}
            className="cm-editor-container"
            editable={!requestIsRunning}
            extensions={[
              runKeymap,
              xcodeLightPatch,
              EditorView.lineWrapping,
              autocompletion({
                icons: false,
              }),
              sql({
                upperCaseKeywords: true,
              }),
            ]}
            basicSetup={{
              lineNumbers: true,
              foldGutter: false,
              indentOnInput: false,
              autocompletion: true,
              highlightActiveLine: false,
            }}
            onChange={onInputChange}
          />
        </Panel>
        <PanelResizeHandle style={resizeHandleStyle} />
        <Panel
          defaultSize={isMobile ? 60 : 50}
          minSize={20}
          style={{
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            height: '100%',
            minHeight: 0,
            width: '100%',
            maxWidth: '100%',
            position: 'relative',
          }}
        >
          <CodeMirror
            ref={outputRef}
            theme={xcodeLight}
            value={output}
            basicSetup={{
              lineNumbers: false,
              foldGutter: false,
              dropCursor: true,
              indentOnInput: false,
              highlightActiveLine: false,
            }}
            style={{
              height: '100%',
              width: '100%',
              flexGrow: 1,
              overflow: 'auto',
              display: 'flex',
              flexDirection: 'column',
            }}
            className="cm-editor-container"
            extensions={[
              xcodeLightPatch,
              EditorView.lineWrapping,
            ]}
            readOnly
          />
          {timeElapsed && (
            <Box
              sx={{
                position: 'absolute',
                bottom: 0,
                right: 0,
                p: '2px 8px',
                m: 1,
                borderRadius: '4px',
                backgroundColor: 'rgba(245, 245, 245, 0.9)',
                fontSize: '0.75rem',
                fontWeight: 'bold',
                color: '#666',
                boxShadow: '0 0 2px rgba(0,0,0,0.1)',
                zIndex: 10,
              }}
            >
              {timeElapsed}
            </Box>
          )}
        </Panel>
      </PanelGroup>
    </Box>
  );
}

EditorPanel.defaultProps = {
  timeElapsed: undefined,
};

export default EditorPanel;
