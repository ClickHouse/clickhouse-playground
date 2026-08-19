// CodeMirror themes for the SQL editor and the output pane.
//
// The editor chrome (background, gutter, borders, autocomplete tooltip) is driven by
// Click-UI CSS variables. The syntax colors are EXACTLY the palette of the ClickHouse
// Web UI (programs/server/play.html in ClickHouse/ClickHouse), which itself mirrors
// `clickhouse-client`; they are applied to the `q-*` classes produced by the WASM-lexer
// highlighter (src/sql/highlight.ts), not to lezer tags — the lezer style list is
// deliberately empty so CodeMirror's default fallback highlighting stays off and the
// lexer is the only source of colors.

import { createTheme } from '@uiw/codemirror-themes';
import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';

type SyntaxPalette = {
  identifier: string;
  function: string;
  number: string;
  string: string;
  quotedIdentifier: string;
  comment: string;
  error: string;
  // Rainbow parentheses: one color per nesting depth, cycling.
  brackets: string[];
};

// Hex values copied verbatim from play.html. Keywords and operators are not listed:
// like in the Web UI they render in the default text color (keywords in bold).
// The light values are darker variants of the terminal palette so they read well on a
// light background; the dark values are the actual xterm 16-color values that
// `clickhouse-client` renders to in a dark terminal.
const lightPalette: SyntaxPalette = {
  identifier: '#00838F',
  function: '#875F00',
  number: '#008700',
  string: '#006400',
  quotedIdentifier: '#008B8B',
  comment: '#757575',
  error: '#B71C1C',
  brackets: ['#A31515', '#8A4B00', '#6B5D00', '#1B5E3A', '#0D3C8C', '#4A2A85', '#8A0F42'],
};

const darkPalette: SyntaxPalette = {
  identifier: '#00CDCD',
  function: '#CDCD00',
  number: '#00D700',
  string: '#00CD00',
  quotedIdentifier: '#00D7D7',
  comment: '#9E9E9E',
  error: '#FF6E40',
  brackets: ['#FF9999', '#FFD3A6', '#F7FCC0', '#9BFAB8', '#BFF3FF', '#D7C4FC', '#FFB0DE'],
};

function clickUiEditorTheme(themeName: 'light' | 'dark'): Extension {
  const palette = themeName === 'dark' ? darkPalette : lightPalette;
  // Chrome colors come from the Click-UI codeblock tokens; both mode variants
  // are defined in every theme, so we pick the one matching the app theme.
  const tokens = `--click-codeblock-${themeName}Mode-color`;

  const chrome = createTheme({
    theme: themeName,
    settings: {
      background: `var(${tokens}-background-default)`,
      foreground: `var(${tokens}-text-default)`,
      caret: `var(${tokens}-text-default)`,
      gutterBackground: `var(${tokens}-background-default)`,
      gutterForeground: `var(${tokens}-numbers-default)`,
      fontFamily: 'var(--typography-font-families-mono)',
      selection: themeName === 'dark' ? '#404859' : '#d5e2f5',
      selectionMatch: themeName === 'dark' ? '#404859' : '#d5e2f5',
      lineHighlight: themeName === 'dark' ? '#31363f' : '#eceef2',
    },
    styles: [],
  });

  // Per-token classes emitted by the WASM-lexer highlighter, same names and styles as
  // the Web UI: keywords are bold default fg, operators default fg, comments italic,
  // the un-lexable tail has a wavy error underline, and the matched bracket pair
  // around the cursor is emboldened over a faint box.
  const syntax = EditorView.theme({
    '.q-kw': { fontWeight: 'bold' },
    '.q-id': { color: palette.identifier },
    '.q-fn': { color: palette.function },
    '.q-num': { color: palette.number },
    '.q-str': { color: palette.string },
    '.q-qid': { color: palette.quotedIdentifier },
    '.q-com': { color: palette.comment, fontStyle: 'italic' },
    '.q-err': { color: palette.error, textDecoration: 'underline wavy' },
    '.q-underline': { textDecoration: 'underline' },
    '.q-br-match': {
      fontWeight: 'bold',
      backgroundColor: `color-mix(in srgb, var(${tokens}-text-default) 20%, transparent)`,
      borderRadius: '0.15rem',
    },
    ...Object.fromEntries(palette.brackets.map((color, i) => [`.q-br${i}`, { color }])),
  });

  return [chrome, syntax];
}

export const clickUiLight = clickUiEditorTheme('light');
export const clickUiDark = clickUiEditorTheme('dark');

// Borders and the autocomplete tooltip are driven by Click-UI CSS variables,
// so a single extension works for both the light and the dark themes.
export const editorChrome = EditorView.theme({
  '&': {
    fontSize: '12pt',
    border: '1px solid var(--click-global-color-stroke-default)',
    'border-radius': 'var(--click-codeblock-radii-all)',
    padding: '3px',
  },
  '&.cm-editor.cm-focused': {
    outline: 'none',
    'border-color': 'var(--click-global-color-accent-default)',
  },
  '.cm-tooltip-autocomplete': {
    border: '1px solid var(--click-global-color-stroke-default)',
    'border-radius': 'var(--click-codeblock-radii-all)',
    margin: '3px',
    padding: '3px',
    background: 'var(--click-global-color-background-default)',
    color: 'var(--click-global-color-text-default)',
  },
  '.cm-completionMatchedText': {
    'text-decoration': 'none',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    background: 'var(--click-global-color-background-muted)',
    color: 'var(--click-global-color-text-default)',
    'font-weight': 'bold',
  },
});

export function editorTheme(themeName: 'light' | 'dark'): Extension {
  return themeName === 'dark' ? clickUiDark : clickUiLight;
}
