package dockerengine

import "strings"

// maxSanitizerReportLines caps how many lines of a sanitizer report are forwarded to the client.
const maxSanitizerReportLines = 400

// sanitizerReportHeader prefixes a forwarded sanitizer report in the query output.
const sanitizerReportHeader = "=== Sanitizer report ==="

// sanitizerMarkers identify the start of a sanitizer report in a process's stderr. They match
// AddressSanitizer/ThreadSanitizer/MemorySanitizer/UndefinedBehaviorSanitizer reports (the
// "...Sanitizer:" marker appears in their ERROR/WARNING/SUMMARY lines) and UBSan's inline
// "runtime error:" lines.
var sanitizerMarkers = []string{"Sanitizer:", "runtime error:"}

func containsSanitizerMarker(line string) bool {
	for _, marker := range sanitizerMarkers {
		if strings.Contains(line, marker) {
			return true
		}
	}

	return false
}

// extractSanitizerReport returns the sanitizer report found in a process's stderr, starting at
// the first sanitizer marker, or "" if the stderr contains no sanitizer output. The result is
// capped to maxSanitizerReportLines lines and prefixed with a header.
func extractSanitizerReport(stderr string) string {
	if stderr == "" {
		return ""
	}

	lines := strings.Split(stderr, "\n")

	var start *int
	for i, line := range lines {
		if containsSanitizerMarker(line) {
			start = &i
			break
		}
	}
	if start == nil {
		return ""
	}

	report := lines[*start:]
	if len(report) > maxSanitizerReportLines {
		report = report[:maxSanitizerReportLines]
	}

	return sanitizerReportHeader + "\n" + strings.Join(report, "\n")
}
