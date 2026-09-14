package main

import (
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestMeasurement(t *testing.T) {
	token := "11111111-1111-4111-8111-111111111111"
	tokens = []string{token}
	refreshed = time.Now()
	h := newHandler()
	for _, tc := range []struct {
		method, path, body, auth string
		size                     int64
		status                   int
	}{
		{"GET", "ping", "", "", 0, 401},
		{"GET", "ping", "", "Bearer " + token, 0, 204},
		{"POST", "ping", "", "Bearer " + token, 0, 405},
		{"GET", "missing", "", "Bearer " + token, 0, 404},
		{"POST", "upload", "test", "Bearer " + token, 4, 200},
		{"POST", "upload", "test", "Bearer " + token, 5, 400},
		{"POST", "upload", "", "Bearer " + token, maxBytes + 1, 413},
		{"POST", "upload", "", "Bearer " + token, -1, 413},
	} {
		req := httptest.NewRequest(tc.method, "/_v2tt/measure/v1/"+tc.path, strings.NewReader(tc.body))
		req.ContentLength = tc.size
		req.Header.Set("Authorization", tc.auth)
		res := httptest.NewRecorder()
		h.ServeHTTP(res, req)
		if res.Code != tc.status {
			t.Fatalf("%s %s: %d != %d", tc.method, tc.path, res.Code, tc.status)
		}
		if res.Header().Get("X-V2TT-Measure") != "1" {
			t.Fatal("missing marker")
		}
		if tc.status == 200 && !strings.Contains(res.Body.String(), `"received":4`) {
			t.Fatal("wrong upload acknowledgement")
		}
	}
	for i := 0; i < cap(slots); i++ {
		slots <- struct{}{}
	}
	req := httptest.NewRequest("GET", "/_v2tt/measure/v1/ping", nil)
	req.Header.Set("Authorization", "Bearer "+token)
	res := httptest.NewRecorder()
	h.ServeHTTP(res, req)
	for i := 0; i < cap(slots); i++ {
		<-slots
	}
	if res.Code != 429 {
		t.Fatal("missing concurrency limit")
	}
}
