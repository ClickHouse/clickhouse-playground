import * as React from 'react';
import { useEffect, useRef, useState } from 'react';
import CodeMirror, { ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { EditorView, keymap } from '@codemirror/view';
import { Prec } from '@codemirror/state';
import { autocompletion } from '@codemirror/autocomplete';
import { ThemeName } from '@clickhouse/click-ui';
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels';
import { editorChrome, editorTheme } from '../CodeMirrorTheme';

// CodeMirror's default keymap binds Mod-Enter (Cmd-Enter on macOS, Ctrl-Enter
// elsewhere) to "insert blank line". Consume it here so the shortcut only
// runs the query: the event still bubbles up to the window-level listener in
// App, which triggers the run.
const swallowModEnter = Prec.highest(
  keymap.of([{ key: 'Mod-Enter', run: () => true }]),
);

// Tracks whether the viewport is narrow enough to stack the panels vertically.
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => window.matchMedia('(max-width: 600px)').matches);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 600px)');
    const onChange = (event: MediaQueryListEvent) => setIsMobile(event.matches);
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, []);

  return isMobile;
}

interface EditorPanelProps {
  initialInput: string;
  output: string;
  timeElapsed: string | undefined;
  requestIsRunning: boolean;
  followOutput: boolean;
  theme: ThemeName;
  onInputChange: (value: string) => void;
}

function EditorPanel({
  initialInput,
  output,
  timeElapsed,
  requestIsRunning,
  followOutput,
  theme,
  onInputChange,
}: EditorPanelProps) {
  const isMobile = useIsMobile();

  const panelDirection = isMobile ? 'vertical' : 'horizontal';
  const codeMirrorTheme = editorTheme(theme);

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

  const panelStyle: React.CSSProperties = {
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minHeight: 0,
    width: '100%',
    maxWidth: '100%',
  };

  const codeMirrorStyle: React.CSSProperties = {
    height: '100%',
    width: '100%',
    flexGrow: 1,
    overflow: 'auto',
    display: 'flex',
    flexDirection: 'column',
  };

  return (
    <div className="editor-area">
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
        <Panel defaultSize={isMobile ? 40 : 50} minSize={20} style={panelStyle}>
          <CodeMirror
            autoFocus
            theme={codeMirrorTheme}
            value={initialInput}
            placeholder="Enter SQL queries..."
            style={codeMirrorStyle}
            className="cm-editor-container"
            editable={!requestIsRunning}
            extensions={[
              swallowModEnter,
              editorChrome,
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
        <PanelResizeHandle className={isMobile ? 'resize-handle-vertical' : 'resize-handle-horizontal'} />
        <Panel defaultSize={isMobile ? 60 : 50} minSize={20} style={{ ...panelStyle, position: 'relative' }}>
          <CodeMirror
            ref={outputRef}
            theme={codeMirrorTheme}
            value={output}
            basicSetup={{
              lineNumbers: false,
              foldGutter: false,
              dropCursor: true,
              indentOnInput: false,
              highlightActiveLine: false,
            }}
            style={codeMirrorStyle}
            className="cm-editor-container"
            extensions={[editorChrome, EditorView.lineWrapping]}
            readOnly
          />
          {timeElapsed && <div className="time-elapsed">{timeElapsed}</div>}
        </Panel>
      </PanelGroup>
    </div>
  );
}

export default EditorPanel;
