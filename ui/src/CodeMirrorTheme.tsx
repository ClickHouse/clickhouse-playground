// CodeMirror themes for the SQL editor and the output pane, matching the
// Click-UI design system.
//
// The syntax palette mirrors the Click-UI CodeBlock component
// (@clickhouse/click-ui, components/CodeBlock/useColorStyle.ts), which keeps
// the editor consistent with code rendering in ClickHouse products. The
// editor chrome (background, gutter, borders, autocomplete tooltip) is driven
// by Click-UI CSS variables.

import { tags as t } from '@lezer/highlight';
import { createTheme } from '@uiw/codemirror-themes';
import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';

type SyntaxPalette = {
  comment: string;
  keyword: string;
  attribute: string;
  type: string;
  string: string;
  punctuation: string;
};

// Hex values copied from Click-UI's CodeBlock highlighting (useColorStyle).
const lightPalette: SyntaxPalette = {
  comment: '#656e77',
  keyword: '#015692',
  attribute: '#803378',
  type: '#b75501',
  string: '#54790d',
  punctuation: '#535a60',
};

const darkPalette: SyntaxPalette = {
  comment: '#999999',
  keyword: '#88aece',
  attribute: '#c59bc1',
  type: '#f08d49',
  string: '#b5bd68',
  punctuation: '#cccccc',
};

function clickUiEditorTheme(themeName: 'light' | 'dark'): Extension {
  const palette = themeName === 'dark' ? darkPalette : lightPalette;
  // Chrome colors come from the Click-UI codeblock tokens; both mode variants
  // are defined in every theme, so we pick the one matching the app theme.
  const tokens = `--click-codeblock-${themeName}Mode-color`;

  return createTheme({
    theme: themeName,
    settings: {
      background: `var(${tokens}-background-default)`,
      foreground: `var(${tokens}-text-default)`,
      caret: `var(${tokens}-text-default)`,
      gutterBackground: `var(${tokens}-background-default)`,
      gutterForeground: `var(${tokens}-numbers-default)`,
      // Not the Click-UI mono stack: its first choice, Inconsolata, is loaded
      // from Google Fonts as subsets whose unicode-range lacks box drawing
      // (U+2500..U+259F), so the frames of Pretty* output formats would render
      // from a metric-incompatible fallback font and misalign. This is the
      // same stack the ClickHouse Play UI uses; every font in it covers box
      // drawing.
      fontFamily: "'DejaVu Sans Mono', 'Liberation Mono', MonoLisa, Consolas, monospace",
      selection: themeName === 'dark' ? '#404859' : '#d5e2f5',
      selectionMatch: themeName === 'dark' ? '#404859' : '#d5e2f5',
      lineHighlight: themeName === 'dark' ? '#31363f' : '#eceef2',
    },
    styles: [
      { tag: [t.comment, t.quote], color: palette.comment },
      { tag: [t.keyword, t.meta, t.operatorKeyword], color: palette.keyword, fontWeight: 'bold' },
      { tag: [t.attributeName, t.namespace], color: palette.attribute },
      {
        tag: [t.typeName, t.typeOperator, t.number, t.bool, t.standard(t.name)],
        color: palette.type,
      },
      { tag: [t.string, t.special(t.string), t.regexp, t.link], color: palette.string },
      { tag: [t.punctuation, t.operator], color: palette.punctuation },
    ],
  });
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
  // CodeMirror defaults to line-height 1.4, which leaves gaps between the
  // vertical lines of box-drawing glyphs on consecutive rows. The fonts above
  // draw those glyphs to fill exactly their normal line box, so with 'normal'
  // the frames of Pretty* formats tile seamlessly (as in the Play UI).
  '.cm-scroller': {
    lineHeight: 'normal',
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
