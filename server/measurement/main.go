package main

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const maxBytes = 16 << 20

var slots = make(chan struct{}, 8)
var authMu sync.Mutex
var tokens []string
var refreshed time.Time

func authorized(value string) bool {
	if !strings.HasPrefix(value, "Bearer ") {
		return false
	}
	token := strings.TrimPrefix(value, "Bearer ")
	if len(token) != 36 {
		return false
	}
	authMu.Lock()
	defer authMu.Unlock()
	if time.Since(refreshed) > 5*time.Second {
		tokens = nil
		files, _ := filepath.Glob("/etc/sing-box/*.json")
		for _, name := range files {
			data, err := os.ReadFile(name)
			if err != nil {
				continue
			}
			var config struct {
				Inbounds []struct {
					Users []struct {
						UUID string `json:"uuid"`
					} `json:"users"`
				} `json:"inbounds"`
			}
			if json.Unmarshal(data, &config) != nil {
				continue
			}
			for _, inbound := range config.Inbounds {
				for _, user := range inbound.Users {
					if len(user.UUID) == 36 {
						tokens = append(tokens, user.UUID)
					}
				}
			}
		}
		refreshed = time.Now()
	}
	for _, allowed := range tokens {
		if subtle.ConstantTimeCompare([]byte(token), []byte(allowed)) == 1 {
			return true
		}
	}
	return false
}

func newHandler() http.Handler {
	block := make([]byte, 64<<10)
	if _, err := rand.Read(block); err != nil {
		log.Fatal("random initialization failed")
	}
	handler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
		w.Header().Set("X-V2TT-Measure", "1")
		if !authorized(r.Header.Get("Authorization")) {
			http.Error(w, "Unauthorized", 401)
			return
		}
		select {
		case slots <- struct{}{}:
			defer func() { <-slots }()
		default:
			http.Error(w, "Busy", 429)
			return
		}
		switch r.URL.Path {
		case "/_v2tt/measure/v1/ping":
			if r.Method != "GET" {
				w.WriteHeader(405)
				return
			}
			w.WriteHeader(204)
		case "/_v2tt/measure/v1/download":
			if r.Method != "GET" {
				w.WriteHeader(405)
				return
			}
			w.Header().Set("Content-Type", "application/octet-stream")
			w.Header().Set("Content-Length", fmt.Sprint(maxBytes))
			for sent := 0; sent < maxBytes; sent += len(block) {
				if _, err := w.Write(block); err != nil {
					return
				}
			}
		case "/_v2tt/measure/v1/upload":
			if r.Method != "POST" {
				w.WriteHeader(405)
				return
			}
			if r.ContentLength < 0 || r.ContentLength > maxBytes {
				w.WriteHeader(413)
				return
			}
			n, err := io.Copy(io.Discard, http.MaxBytesReader(w, r.Body, maxBytes))
			if err != nil || n != r.ContentLength {
				http.Error(w, "Incomplete upload", 400)
				return
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]int64{"received": n})
		default:
			http.NotFound(w, r)
		}
	})
	return handler
}

func main() {
	server := &http.Server{Addr: "127.0.0.1:41917", Handler: newHandler(), ReadHeaderTimeout: 5 * time.Second, ReadTimeout: 20 * time.Second, WriteTimeout: 20 * time.Second, IdleTimeout: 15 * time.Second, MaxHeaderBytes: 8192}
	log.Fatal(server.ListenAndServe())
}
