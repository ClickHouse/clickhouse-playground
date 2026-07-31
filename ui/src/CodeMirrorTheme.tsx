// This file is a patched version of the XCode theme:
// https://github.com/uiwjs/react-codemirror/blob/master/themes/xcode/src/index.ts

/**
 * @name Xcode
 */
import { tags as t } from '@lezer/highlight';
import { createTheme, CreateThemeOptions } from '@uiw/codemirror-themes';
import { EditorView } from '@codemirror/view';

export const defaultSettingsXcodeLight: CreateThemeOptions['settings'] = {
  background: '#fff',
  foreground: '#3D3D3D',
  selection: '#BBDFFF',
  selectionMatch: '#BBDFFF',
  gutterBackground: '#fff',
  gutterForeground: '#AFAFAF',
  lineHighlight: '#EDF4FF',
};

export function xcodeLightInit(options?: Partial<CreateThemeOptions>) {
  const { theme = 'light', settings = {}, styles = [] } = options || {};
  return createTheme({
    theme,
    settings: {
      ...defaultSettingsXcodeLight,
      ...settings,
    },
    styles: [
      { tag: [t.comment, t.quote], color: '#707F8D' },
      { tag: [t.typeName, t.typeOperator], color: '#aa0d91' },
      { tag: [t.keyword], color: '#aa0d91', fontWeight: 'bold' },
      { tag: [t.string, t.meta], color: '#D23423' },
      { tag: [t.name], color: '#032f62' },
      { tag: [t.typeName], color: '#522BB2' },
      { tag: [t.variableName], color: '#23575C' },
      { tag: [t.definition(t.variableName)], color: '#327A9E' },
      { tag: [t.regexp, t.link], color: '#0e0eff' },
      ...styles,
    ],
  });
}

export const xcodeLight = xcodeLightInit();

export const xcodeLightPatch = EditorView.theme({
  '&': {
    fontSize: '12pt',
    border: '1px solid #556cd6',
    'border-radius': '3px',
    padding: '3px',
  },
  '&.cm-editor.cm-focused': {
    outline: 'none',
    'border-width': '2px',
    'border-color': '#fcd004',
  },
  '.cm-tooltip-autocomplete': {
    border: '1px solid #556cd6',
    'border-radius': '3px',
    margin: '3px',
    padding: '3px',
    background: 'white',
    color: 'black',
  },
  '.cm-completionMatchedText': {
    'text-decoration': 'none',
  },
  '.cm-tooltip-autocomplete ul li[aria-selected]': {
    background: 'white',
    color: 'black',
    'font-weight': 'bold',
  },
});
