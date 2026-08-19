// SQL syntax highlighting driven by ClickHouse's own lexer (compiled to WASM), as a
// CodeMirror extension. The token classification, the rainbow parentheses, the
// matched-bracket emphasis, the matching-identifier underline and the digit-group
// underline are ported from the ClickHouse Web UI (programs/server/play.html in
// ClickHouse/ClickHouse); the class names (`q-kw`, `q-id`, ...) are the same, and the
// colors behind them (see CodeMirrorTheme.tsx) are the Web UI palette.

import {
  Decoration, DecorationSet, EditorView, ViewPlugin, ViewUpdate,
} from '@codemirror/view';
import { Extension, RangeSetBuilder, StateEffect } from '@codemirror/state';
import {
  lexerIsReady, loadLexer, Token, tokenizeSync, TT,
} from './lexer';

// SQL keywords recognized for highlighting. The lexer reports them as BareWord, so we
// disambiguate identifiers from keywords here. Comparisons are case-insensitive.
// Kept in sync with play.html.
const SQL_KEYWORDS = new Set([
  'ADD', 'AFTER', 'ALL', 'ALTER', 'AND', 'ANTI', 'ANY', 'ARRAY', 'AS', 'ASC', 'ASCENDING',
  'ASOF', 'AST', 'ASYNC', 'ATTACH', 'BACKUP', 'BEGIN', 'BETWEEN', 'BOTH', 'BY',
  'CACHE', 'CASCADE', 'CASE', 'CAST', 'CHANGE', 'CHANGED', 'CHECK', 'CLEAR', 'CLUSTER',
  'CODEC', 'COLLATE', 'COLUMN', 'COLUMNS', 'COMMENT', 'COMMIT', 'CONSTRAINT', 'CREATE',
  'CROSS', 'CUBE', 'CURRENT',
  'DATABASE', 'DATABASES', 'DAY', 'DEDUPLICATE', 'DEFAULT', 'DELETE', 'DESC', 'DESCENDING',
  'DESCRIBE', 'DETACH', 'DICTIONARIES', 'DICTIONARY', 'DISK', 'DISTINCT', 'DISTRIBUTED',
  'DROP', 'ELSE', 'END', 'ENGINE', 'ESTIMATE', 'EVENTS', 'EXCEPT', 'EXCHANGE', 'EXISTS',
  'EXPLAIN', 'EXPRESSION', 'EXTENDED', 'EXTRACT',
  'FALSE', 'FETCH', 'FETCHES', 'FILE', 'FILESYSTEM', 'FINAL', 'FIRST', 'FLUSH', 'FOLLOWING',
  'FOR', 'FOREIGN', 'FORMAT', 'FREEZE', 'FROM', 'FULL', 'FUNCTION',
  'GLOBAL', 'GRANT', 'GROUP', 'GROUPS', 'HAVING', 'HIERARCHICAL', 'HOUR',
  'ID', 'IDENTIFIED', 'IF', 'ILIKE', 'IN', 'INDEX', 'INF', 'INHERIT', 'INJECTIVE',
  'INNER', 'INSERT', 'INTERSECT', 'INTERVAL', 'INTO', 'INVISIBLE', 'IS', 'IS_OBJECT_ID',
  'JOIN', 'KEY', 'KEYED', 'KILL',
  'LAST', 'LATERAL', 'LAYOUT', 'LEADING', 'LEFT', 'LIFETIME', 'LIKE', 'LIMIT', 'LIMITS',
  'LIVE', 'LOCAL', 'LOGS',
  'MATERIALIZE', 'MATERIALIZED', 'MAX', 'MERGES', 'MICROSECOND', 'MILLISECOND', 'MIN',
  'MINUTE', 'MODIFY', 'MONTH', 'MOVE', 'MUTATION',
  'NAN_SQL', 'NEXT', 'NO', 'NONE', 'NOT', 'NULL', 'NULLS',
  'OFFSET', 'ON', 'ONLY', 'OPTIMIZE', 'OPTION', 'OR', 'ORDER', 'OUTER', 'OUTFILE', 'OVER',
  'PARTITION', 'PASTE', 'PERMANENTLY', 'PLAN', 'POPULATE', 'PRECEDING', 'PRECISION',
  'PREWHERE', 'PRIMARY', 'PROFILE', 'PROJECTION', 'QUARTER', 'QUERY', 'QUOTA',
  'RANDOMIZED', 'RANGE', 'RECURSIVE', 'REFRESH', 'REGEXP', 'RELOAD', 'REMOTE', 'RENAME',
  'REPLACE', 'REPLICA', 'REPLICAS', 'RESET', 'RESTORE', 'RESTRICT', 'RESTRICTIVE',
  'RETURNS', 'REVOKE', 'RIGHT', 'ROLE', 'ROLLBACK', 'ROLLUP', 'ROW', 'ROWS',
  'SAMPLE', 'SECOND', 'SELECT', 'SEMI', 'SENDS', 'SET', 'SETS', 'SETTINGS', 'SHARD',
  'SHOW', 'SIGNED', 'SOURCE', 'SQL_SECURITY', 'START', 'STEP', 'STORAGE', 'STRICT',
  'STRICTLY_ASCENDING', 'SUBPARTITION', 'SUBSTRING', 'SUSPEND', 'SYNC', 'SYNTAX', 'SYSTEM',
  'TABLE', 'TABLES', 'TEMPORARY', 'TEST', 'THEN', 'TIES', 'TIMESTAMP', 'TO', 'TOP',
  'TOTALS', 'TRACKING', 'TRAILING', 'TRANSACTION', 'TRIGGER', 'TRIM', 'TRUE', 'TRUNCATE',
  'TYPE',
  'UNBOUNDED', 'UNFREEZE', 'UNION', 'UNIQUE', 'UNSIGNED', 'UPDATE', 'USE', 'USING',
  'UUID', 'VALUES', 'VARYING', 'VIEW', 'VIRTUAL', 'VISIBLE',
  'WATCH', 'WEEK', 'WHEN', 'WHERE', 'WINDOW', 'WITH', 'WORK', 'WRITABLE',
  'XOR', 'YEAR', 'ZKPATH',
]);

// Bracket token types, grouped by kind. Used for rainbow parentheses (coloring by
// nesting depth) and matched-bracket highlighting.
const OPENING_BRACKETS = new Set<number>([
  TT.OpeningRoundBracket, TT.OpeningSquareBracket, TT.OpeningCurlyBrace,
]);
const CLOSING_BRACKETS = new Set<number>([
  TT.ClosingRoundBracket, TT.ClosingSquareBracket, TT.ClosingCurlyBrace,
]);
// The closing type that matches each opening type.
const BRACKET_PAIR: Record<number, number> = {
  [TT.OpeningRoundBracket]: TT.ClosingRoundBracket,
  [TT.OpeningSquareBracket]: TT.ClosingSquareBracket,
  [TT.OpeningCurlyBrace]: TT.ClosingCurlyBrace,
};
// Number of distinct rainbow colors before the cycle repeats (the --syntax-bracket-*
// variables of the Web UI, see CodeMirrorTheme.tsx).
const RAINBOW_BRACKET_COUNT = 7;

// Map a single token to a CSS class. For BareWords we also peek at the next
// non-whitespace, non-comment token to distinguish a function call (`foo(`) from a
// plain identifier — the lexer alone cannot tell them apart. Skipping comments as well
// as whitespace matches `highlightWithLexer` in `src/Client/ClientBaseHelpers.cpp`, so
// `sum/*c*/(x)` is a function name here too.
function tokenClass(tokens: Token[], i: number): string {
  const elem = tokens[i];
  switch (elem.type) {
    case TT.Comment: return 'q-com';
    case TT.Number: return 'q-num';
    case TT.StringLiteral:
    case TT.HereDoc: return 'q-str';
    case TT.QuotedIdentifier: return 'q-qid';
    case TT.BareWord: {
      if (SQL_KEYWORDS.has(elem.token.toUpperCase())) return 'q-kw';
      for (let j = i + 1; j < tokens.length; j += 1) {
        if (tokens[j].type !== TT.Whitespace && tokens[j].type !== TT.Comment) {
          return tokens[j].type === TT.OpeningRoundBracket ? 'q-fn' : 'q-id';
        }
      }
      return 'q-id';
    }
    case TT.Asterisk: case TT.Plus: case TT.Minus: case TT.Slash: case TT.Percent:
    case TT.Arrow: case TT.QuestionMark: case TT.Colon: case TT.DoubleColon: case TT.Caret:
    case TT.Equals: case TT.NotEquals:
    case TT.Less: case TT.Greater: case TT.LessOrEquals: case TT.GreaterOrEquals:
    case TT.Spaceship: case TT.PipeMark: case TT.Concatenation:
    case TT.At: case TT.DoubleAt: case TT.DollarSign:
      return 'q-op';
    default:
      return '';
  }
}

// A token is a matchable identifier if it renders as a plain identifier (`q-id`) or a
// quoted identifier (`q-qid`) — i.e. not a keyword, function name, number, etc.
function isMatchableIdentifier(tokens: Token[], i: number): boolean {
  const cls = tokenClass(tokens, i);
  return cls === 'q-id' || cls === 'q-qid';
}

interface BracketInfo {
  depth: number[];
  bold: Set<number>;
}

// Compute, for every token, its rainbow-bracket depth (-1 for non-brackets and for
// unmatched brackets) and the set of bracket tokens to embolden as the matched pair
// around the cursor.
//
// Depth is assigned with a type-aware stack, but only once a bracket has a real mate:
// the matching opening and closing brackets both take the pair's nesting depth so they
// share a color. A bracket without a counterpart is left at depth -1 so it keeps the
// default color, mirroring `clickhouse-client`. Once the nesting is broken (a closer
// that does not match the innermost opener), the outstanding openers are discarded so a
// later closer cannot reach over the break — e.g. `SELECT ([)]` colors nothing.
function computeBracketInfo(tokens: Token[], cursor: number, focused: boolean): BracketInfo {
  const depth = new Array(tokens.length).fill(-1);
  const matchOf = new Array(tokens.length).fill(-1);
  const starts = new Array(tokens.length).fill(0);

  const stack: number[] = [];
  let offset = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    starts[i] = offset;
    offset += tokens[i].token.length;
    const { type } = tokens[i];
    if (OPENING_BRACKETS.has(type)) {
      stack.push(i);
    } else if (CLOSING_BRACKETS.has(type)) {
      const top = stack.length ? stack[stack.length - 1] : -1;
      if (top >= 0 && BRACKET_PAIR[tokens[top].type] === type) {
        stack.pop();
        matchOf[i] = top;
        matchOf[top] = i;
        depth[i] = stack.length;
        depth[top] = stack.length;
      } else if (top >= 0) {
        stack.length = 0;
      }
    }
  }

  // The matched pair is the bracket adjacent to the cursor (preferring the one
  // immediately before the caret, as most editors do) together with its counterpart.
  const bold = new Set<number>();
  if (focused) {
    let found = -1;
    for (let i = 0; i < tokens.length && found < 0; i += 1) {
      const { type } = tokens[i];
      if ((OPENING_BRACKETS.has(type) || CLOSING_BRACKETS.has(type))
        && starts[i] + tokens[i].token.length === cursor) {
        found = i;
      }
    }
    for (let i = 0; i < tokens.length && found < 0; i += 1) {
      const { type } = tokens[i];
      if ((OPENING_BRACKETS.has(type) || CLOSING_BRACKETS.has(type)) && starts[i] === cursor) {
        found = i;
      }
    }
    if (found >= 0 && matchOf[found] >= 0) {
      bold.add(found);
      bold.add(matchOf[found]);
    }
  }

  return { depth, bold };
}

// If the cursor is inside an identifier, return the set of token indices of every
// identifier with the same text, so they can be underlined together (as
// `clickhouse-client` does).
function computeMatchingIdentifiers(
  tokens: Token[],
  cursor: number,
  focused: boolean,
): Set<number> {
  const result = new Set<number>();
  if (!focused) return result;

  let offset = 0;
  let target = -1;
  for (let i = 0; i < tokens.length && target < 0; i += 1) {
    const start = offset;
    offset += tokens[i].token.length;
    // The caret must be strictly inside the token (`start <= cursor < end`), matching
    // the CLI: sitting right after an identifier does not trigger the highlight.
    if (start <= cursor && cursor < offset && isMatchableIdentifier(tokens, i)) {
      target = i;
    }
  }
  if (target < 0) return result;

  const text = tokens[target].token;
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i].token === text && isMatchableIdentifier(tokens, i)) result.add(i);
  }
  return result;
}

// For a plain decimal number token, return the sorted character indices to underline as
// digit-group separators. Mirrors `clickhouse-client`: only the integer part of a
// regular base-10 number (no exponent, hex/bin prefix, or `_` separators) is
// considered, and only when it has at least 5 digits; then one digit is underlined at
// each group-of-three boundary counting from the right (before the decimal point).
function digitGroupUnderlines(token: string): number[] {
  const result: number[] = [];
  let finished = false; // Passed the decimal point.
  let first = -1;
  let last = -1;

  for (let i = 0; i < token.length; i += 1) {
    const c = token[i];
    if (c >= '0' && c <= '9') {
      if (!finished) {
        if (first < 0) first = i;
        last = i;
      }
    } else if (c === '.') {
      finished = true;
    } else if (c !== '-') {
      // Exponent, hex/bin, or `_` separators: not a plain number, do not highlight.
      return [];
    }
  }

  if (first >= 0 && last >= 0) {
    const length = 1 + last - first;
    if (length >= 5) {
      for (let off = length - 4; off >= 0; off -= 3) result.push(first + off);
    }
  }
  return result.sort((a, b) => a - b);
}

// Signals the highlighter to recompute once the WASM module finishes instantiating.
const lexerReady = StateEffect.define<null>();

function buildDecorations(view: EditorView): DecorationSet {
  if (!lexerIsReady()) return Decoration.none;

  const text = view.state.doc.toString();
  if (!text) return Decoration.none;

  let tokens: Token[];
  try {
    tokens = tokenizeSync(text);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.error('SQL tokenization failed, leaving the text unstyled:', e);
    return Decoration.none;
  }
  if (tokens.length === 0) return Decoration.none;

  const cursor = view.state.selection.main.head;
  const focused = view.hasFocus;
  const { depth, bold } = computeBracketInfo(tokens, cursor, focused);
  const matchingIdentifiers = computeMatchingIdentifiers(tokens, cursor, focused);

  const builder = new RangeSetBuilder<Decoration>();
  let offset = 0;
  for (let i = 0; i < tokens.length; i += 1) {
    const tokStart = offset;
    const tokEnd = offset + tokens[i].token.length;
    offset = tokEnd;

    // Brackets are colored by nesting depth (rainbow) rather than by the generic token
    // class; the matched pair around the cursor is additionally emboldened.
    let cls = depth[i] >= 0 ? `q-br${depth[i] % RAINBOW_BRACKET_COUNT}` : tokenClass(tokens, i);
    if (bold.has(i)) {
      cls = cls ? `${cls} q-br-match` : 'q-br-match';
    }
    // Every occurrence of the identifier under the cursor is underlined.
    if (matchingIdentifiers.has(i)) {
      cls = cls ? `${cls} q-underline` : 'q-underline';
    }
    if (cls) {
      builder.add(tokStart, tokEnd, Decoration.mark({ class: cls }));
    }

    // Numbers get per-digit-group underlines.
    if (tokens[i].type === TT.Number) {
      digitGroupUnderlines(tokens[i].token).forEach((idx) => {
        builder.add(tokStart + idx, tokStart + idx + 1, Decoration.mark({ class: 'q-underline' }));
      });
    }
  }

  // Any tail not covered by tokens (the lexer hit an error) is shown with the error style.
  if (offset < text.length) {
    builder.add(offset, text.length, Decoration.mark({ class: 'q-err' }));
  }

  return builder.finish();
}

const highlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    destroyed = false;

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
      if (!lexerIsReady()) {
        loadLexer().then(
          () => {
            if (!this.destroyed) view.dispatch({ effects: lexerReady.of(null) });
          },
          (e) => {
            // No WebAssembly (or a failed instantiation): the editor stays unstyled,
            // the same fallback as the Web UI.
            // eslint-disable-next-line no-console
            console.error('Failed to load the ClickHouse SQL lexer:', e);
          },
        );
      }
    }

    update(update: ViewUpdate) {
      const ready = update.transactions.some((tr) => tr.effects.some((e) => e.is(lexerReady)));
      // The decorations depend on the cursor (matched brackets, identifier matching)
      // and on the focus (both are shown only while the editor is focused), not only
      // on the text.
      if (update.docChanged || update.selectionSet || update.focusChanged || ready) {
        this.decorations = buildDecorations(update.view);
      }
    }

    destroy() {
      this.destroyed = true;
    }
  },
  { decorations: (v) => v.decorations },
);

// Syntax highlighting for SQL with ClickHouse's own lexer, exactly as the ClickHouse
// Web UI does it. The colors live in CodeMirrorTheme.tsx.
export default function clickhouseSqlHighlight(): Extension {
  return highlighter;
}
