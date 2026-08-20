import * as React from 'react';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const bytesPerRow = 16;
const rowHeight = 24;
const overscanRows = 5;

export type OutputRange = {
  from: number;
  to: number;
};

type ByteSelection = {
  byteFrom: number;
  byteTo: number;
  outputRange?: OutputRange;
};

interface HexViewerProps {
  output: string;
  rawOutput: Uint8Array | undefined;
  onHighlightRanges: (ranges: OutputRange[]) => void;
}

function byteToAscii(value: number): string {
  return value >= 0x20 && value <= 0x7e ? String.fromCharCode(value) : '.';
}

function isContinuationByte(value: number): boolean {
  return value >= 0x80 && value <= 0xbf;
}

// Return the complete UTF-8 code point length at offset, or zero for an
// invalid byte. Invalid bytes have no stable position in the JSON text field.
function utf8CodePointLength(bytes: Uint8Array, offset: number): number {
  const first = bytes[offset];
  const second = bytes[offset + 1];
  const third = bytes[offset + 2];
  const fourth = bytes[offset + 3];

  if (first <= 0x7f) {
    return 1;
  }
  if (first >= 0xc2 && first <= 0xdf && isContinuationByte(second)) {
    return 2;
  }
  if (first === 0xe0 && second >= 0xa0 && second <= 0xbf && isContinuationByte(third)) {
    return 3;
  }
  if (
    ((first >= 0xe1 && first <= 0xec) || (first >= 0xee && first <= 0xef))
    && isContinuationByte(second)
    && isContinuationByte(third)
  ) {
    return 3;
  }
  if (first === 0xed && second >= 0x80 && second <= 0x9f && isContinuationByte(third)) {
    return 3;
  }
  if (
    first === 0xf0
    && second >= 0x90
    && second <= 0xbf
    && isContinuationByte(third)
    && isContinuationByte(fourth)
  ) {
    return 4;
  }
  if (
    first >= 0xf1
    && first <= 0xf3
    && isContinuationByte(second)
    && isContinuationByte(third)
    && isContinuationByte(fourth)
  ) {
    return 4;
  }
  if (
    first === 0xf4
    && second >= 0x80
    && second <= 0x8f
    && isContinuationByte(third)
    && isContinuationByte(fourth)
  ) {
    return 4;
  }

  return 0;
}

function bytesMatch(bytes: Uint8Array, offset: number, encoded: Uint8Array): boolean {
  if (offset + encoded.length > bytes.length) return false;
  for (let index = 0; index < encoded.length; index += 1) {
    if (bytes[offset + index] !== encoded[index]) return false;
  }
  return true;
}

// CodeMirror uses UTF-16 offsets. Valid UTF-8 code points map directly to the
// rendered text. Bytes that JSON replaced with U+FFFD deliberately have no
// output range, so hovering them never highlights the wrong output character.
function byteSelections(output: string, bytes: Uint8Array): ByteSelection[] {
  const selections: ByteSelection[] = new Array(bytes.length);
  const encoder = new TextEncoder();
  let byteOffset = 0;
  let outputOffset = 0;

  while (byteOffset < bytes.length) {
    const length = utf8CodePointLength(bytes, byteOffset);
    if (length === 0) {
      selections[byteOffset] = { byteFrom: byteOffset, byteTo: byteOffset + 1 };
      byteOffset += 1;
      if (output.codePointAt(outputOffset) === 0xfffd) outputOffset += 1;
    } else {
      const selection: ByteSelection = {
        byteFrom: byteOffset,
        byteTo: byteOffset + length,
      };
      const codePoint = output.codePointAt(outputOffset);
      const outputEnd = outputOffset + (codePoint !== undefined && codePoint > 0xffff ? 2 : 1);
      const encoded = encoder.encode(output.slice(outputOffset, outputEnd));
      if (encoded.length === length && bytesMatch(bytes, byteOffset, encoded)) {
        selection.outputRange = { from: outputOffset, to: outputEnd };
        outputOffset = outputEnd;
      }

      for (let index = 0; index < length; index += 1) {
        selections[byteOffset + index] = selection;
      }

      byteOffset += length;
    }
  }

  return selections;
}

function HexViewer({ output, rawOutput, onHighlightRanges }: HexViewerProps) {
  const bytes = useMemo(() => rawOutput || new TextEncoder().encode(output), [output, rawOutput]);
  const selections = useMemo(() => byteSelections(output, bytes), [output, bytes]);
  const contentRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const [hoveredSelection, setHoveredSelection] = useState<ByteSelection>();
  const [pinnedSelections, setPinnedSelections] = useState<ByteSelection[]>([]);
  const rowCount = Math.ceil(bytes.length / bytesPerRow);

  const publishHighlights = (pinned: ByteSelection[], hovered?: ByteSelection) => {
    const outputRanges = [...pinned, ...(hovered ? [hovered] : [])]
      .flatMap((selection) => (selection.outputRange ? [selection.outputRange] : []));
    onHighlightRanges(outputRanges);
  };

  const previewSelection = (selection: ByteSelection | undefined) => {
    setHoveredSelection(selection);
    publishHighlights(pinnedSelections, selection);
  };

  const togglePinnedSelection = (selection: ByteSelection) => {
    const isAlreadyPinned = pinnedSelections.some((pinned) => (
      pinned.byteFrom === selection.byteFrom && pinned.byteTo === selection.byteTo
    ));
    const nextSelections = isAlreadyPinned
      ? pinnedSelections.filter((pinned) => (
        pinned.byteFrom !== selection.byteFrom || pinned.byteTo !== selection.byteTo
      ))
      : [...pinnedSelections, selection];
    setPinnedSelections(nextSelections);
    setHoveredSelection(undefined);
    publishHighlights(nextSelections);
  };

  const clearPinnedSelections = () => {
    setPinnedSelections([]);
    setHoveredSelection(undefined);
    onHighlightRanges([]);
  };

  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element) return undefined;

    const updateViewport = () => setViewportHeight(element.clientHeight);
    updateViewport();
    const observer = new ResizeObserver(updateViewport);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const element = contentRef.current;
    if (element) {
      element.scrollTop = 0;
    }
    setScrollTop(0);
  }, [bytes]);

  useEffect(() => {
    clearPinnedSelections();
  }, [bytes]);

  const isHoveredByte = (offset: number) => hoveredSelection !== undefined
    && offset >= hoveredSelection.byteFrom
    && offset < hoveredSelection.byteTo;
  const isPinnedByte = (offset: number) => pinnedSelections.some((selection) => (
    offset >= selection.byteFrom && offset < selection.byteTo
  ));
  const isPinnedSegmentStart = (offset: number) => isPinnedByte(offset)
    && (offset % bytesPerRow === 0 || !isPinnedByte(offset - 1));
  const isPinnedSegmentEnd = (offset: number) => isPinnedByte(offset)
    && (
      (offset + 1) % bytesPerRow === 0
      || offset + 1 === bytes.length
      || !isPinnedByte(offset + 1)
    );

  const selectionClassNames = (baseClass: string, offset: number) => [
    baseClass,
    isHoveredByte(offset) ? `${baseClass}-active` : '',
    isPinnedByte(offset) ? `${baseClass}-pinned` : '',
    isPinnedSegmentStart(offset) ? `${baseClass}-pinned-start` : '',
    isPinnedSegmentEnd(offset) ? `${baseClass}-pinned-end` : '',
  ].filter(Boolean).join(' ');

  const firstRow = Math.max(0, Math.floor(scrollTop / rowHeight) - overscanRows);
  const lastRow = Math.min(
    rowCount,
    Math.ceil((scrollTop + viewportHeight) / rowHeight) + overscanRows,
  );
  const visibleRows: number[] = [];
  for (let row = firstRow; row < lastRow; row += 1) visibleRows.push(row);

  return (
    <div
      className="hex-viewer"
      onMouseLeave={() => previewSelection(undefined)}
    >
      <div className="hex-viewer-title">
        <span>Hex output</span>
        <span className="hex-viewer-hint">Hover to preview · click to pin · Esc to clear</span>
      </div>
      <div
        ref={contentRef}
        className="hex-viewer-content"
        role="grid"
        tabIndex={0}
        aria-label="Output hexadecimal bytes"
        aria-rowcount={rowCount}
        onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') clearPinnedSelections();
        }}
      >
        {rowCount === 0 && <div className="hex-viewer-empty">No output bytes</div>}
        {rowCount > 0 && (
          <div className="hex-viewer-virtual-space" style={{ height: rowCount * rowHeight }}>
            {visibleRows.map((rowIndex) => {
              const offset = rowIndex * bytesPerRow;
              const rowBytes = bytes.subarray(offset, Math.min(offset + bytesPerRow, bytes.length));
              return (
                <div className="hex-viewer-row" role="row" key={offset} style={{ top: rowIndex * rowHeight }}>
                  <span className="hex-viewer-offset">{offset.toString(16).padStart(8, '0')}</span>
                  <span className="hex-viewer-bytes">
                    {Array.from(rowBytes, (value, index) => {
                      const byteOffset = offset + index;
                      const selection = selections[byteOffset];
                      return (
                        <button
                          className={selectionClassNames('hex-viewer-byte', byteOffset)}
                          type="button"
                          key={byteOffset}
                          onMouseEnter={() => previewSelection(selection)}
                          onFocus={() => previewSelection(selection)}
                          onBlur={() => previewSelection(undefined)}
                          onClick={() => togglePinnedSelection(selection)}
                          aria-label={`Byte ${byteOffset}: ${value.toString(16).padStart(2, '0')}`}
                          aria-pressed={isPinnedByte(byteOffset)}
                        >
                          {value.toString(16).padStart(2, '0')}
                        </button>
                      );
                    })}
                  </span>
                  <span className="hex-viewer-ascii">
                    {Array.from(rowBytes, (value, index) => {
                      const byteOffset = offset + index;
                      const selection = selections[byteOffset];
                      return (
                        <button
                          className={selectionClassNames('hex-viewer-ascii-byte', byteOffset)}
                          type="button"
                          key={byteOffset}
                          onMouseEnter={() => previewSelection(selection)}
                          onFocus={() => previewSelection(selection)}
                          onBlur={() => previewSelection(undefined)}
                          onClick={() => togglePinnedSelection(selection)}
                          aria-label={`ASCII byte ${byteOffset}: ${byteToAscii(value)}`}
                          aria-pressed={isPinnedByte(byteOffset)}
                        >
                          {byteToAscii(value)}
                        </button>
                      );
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default HexViewer;
