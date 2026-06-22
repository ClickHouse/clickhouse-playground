package clickhousebuilds

import "testing"

func TestFindResultNested(t *testing.T) {
	report := &Report{
		Results: []Result{
			{Name: "top"},
			{Name: "parent", Results: []Result{
				{Name: "child", Status: "success"},
			}},
		},
	}

	if _, ok := report.FindResult("top"); !ok {
		t.Error("expected to find top-level result")
	}

	child, ok := report.FindResult("child")
	if !ok {
		t.Fatal("expected to find nested result")
	}
	if child.Status != "success" {
		t.Errorf("child.Status = %q", child.Status)
	}

	if _, ok := report.FindResult("missing"); ok {
		t.Error("did not expect to find a missing result")
	}
}

func TestAMDBuildJob(t *testing.T) {
	report := &Report{
		Results: []Result{
			{Name: "Build (amd_release)", Status: "OK"},
			{Name: "Build (amd_debug)", Status: "success"}, // older "success" status
			{Name: "Build (amd_asan_ubsan)", Status: "OK"}, // newer "OK" status
			{Name: "Build (amd_tsan)", Status: "failure"},
			{Name: "Build (arm_msan)", Status: "OK"},
		},
	}

	cases := map[string]struct {
		wantName string
		wantOK   bool
	}{
		"debug": {"Build (amd_debug)", true},
		"asan":  {"Build (amd_asan_ubsan)", true}, // combined job matches by token
		"ubsan": {"Build (amd_asan_ubsan)", true},
		"tsan":  {"", false}, // present but failed
		"msan":  {"", false}, // only arm built
	}

	for variant, want := range cases {
		job, ok := report.AMDBuildJob(variant)
		if ok != want.wantOK {
			t.Errorf("AMDBuildJob(%q) ok = %v, want %v", variant, ok, want.wantOK)
			continue
		}
		if ok && job.Name != want.wantName {
			t.Errorf("AMDBuildJob(%q) = %q, want %q", variant, job.Name, want.wantName)
		}
	}
}
