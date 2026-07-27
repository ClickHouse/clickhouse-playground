package buildtype

import "testing"

func TestParse(t *testing.T) {
	cases := []struct {
		raw     string
		want    BuildType
		wantErr bool
	}{
		{"", Release, false},
		{"release", Release, false},
		{"debug", Debug, false},
		{"ASAN", ASAN, false},
		{" tsan ", TSAN, false},
		{"msan", MSAN, false},
		{"ubsan", UBSAN, false},
		{"coverage", "", true},
		{"amd_asan", "", true},
	}

	for _, c := range cases {
		got, err := Parse(c.raw)
		if c.wantErr {
			if err == nil {
				t.Errorf("Parse(%q): expected error, got %q", c.raw, got)
			}
			continue
		}
		if err != nil {
			t.Errorf("Parse(%q): unexpected error: %v", c.raw, err)
			continue
		}
		if got != c.want {
			t.Errorf("Parse(%q) = %q, want %q", c.raw, got, c.want)
		}
	}
}

func TestIsRelease(t *testing.T) {
	if !Release.IsRelease() {
		t.Error("Release.IsRelease() = false, want true")
	}
	if !BuildType("").IsRelease() {
		t.Error(`BuildType("").IsRelease() = false, want true`)
	}
	if ASAN.IsRelease() {
		t.Error("ASAN.IsRelease() = true, want false")
	}
}

func TestAllIsCopy(t *testing.T) {
	a := All()
	a[0] = "mutated"
	if All()[0] != Release {
		t.Error("All() returned a slice backed by shared state")
	}
}
