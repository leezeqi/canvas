package auth

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

var syncDomains = map[string]struct{}{
	"canvas": {}, "assets": {}, "image-workbench": {}, "video-workbench": {},
	"config": {}, "prompt-sources": {}, "plugins": {}, "theme": {},
}

const (
	maxSyncJSONBytes = 8 << 20
	maxSyncFileBytes = 25 << 20
	encPrefix        = "enc:v1:"
)

func isSyncDomain(domain string) bool { _, ok := syncDomains[domain]; return ok }

func (s *Server) syncUserID(r *http.Request) (string, bool) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil || s.db == nil {
		return "", false
	}
	token, ok := decodeSessionToken(cookie.Value)
	if !ok {
		return "", false
	}
	var userID string
	err = s.db.QueryRow(r.Context(), `SELECT user_id FROM sessions WHERE token_hash = $1 AND expires_at > NOW()`, tokenHash(token)).Scan(&userID)
	return userID, err == nil
}

// syncDocument is the wire shape for one allowlisted domain.
type syncDocument struct {
	Version   int64          `json:"version"`
	Data      map[string]any `json:"data"`
	UpdatedAt time.Time      `json:"updatedAt"`
	Files     []syncFileMeta `json:"files,omitempty"`
}

type syncFileMeta struct {
	StorageKey  string    `json:"storageKey"`
	ContentType string    `json:"contentType"`
	Size        int64     `json:"size"`
	SHA256      string    `json:"sha256"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// syncStatePayload is returned by GET /api/sync/state; files are account-scoped metadata.
type syncStatePayload struct {
	Version int64                     `json:"version"`
	Domains map[string]syncDocument   `json:"domains"`
	Files   []syncFileMeta             `json:"files"`
}

func (s *Server) loadSyncState(r *http.Request, userID string) (syncStatePayload, error) {
	state := syncStatePayload{Domains: map[string]syncDocument{}, Files: []syncFileMeta{}}
	rows, err := s.db.Query(r.Context(), `SELECT domain, version, data, updated_at FROM account_documents WHERE user_id = $1`, userID)
	if err != nil {
		return state, err
	}
	defer rows.Close()
	enc, err := newDataEncryptor(s.cfg.DataEncryptionKey)
	if err != nil {
		return state, err
	}
	for rows.Next() {
		var domain string
		var version int64
		var raw []byte
		var updated time.Time
		if err := rows.Scan(&domain, &version, &raw, &updated); err != nil {
			return state, err
		}
		var sealed any
		if err := json.Unmarshal(raw, &sealed); err != nil {
			return state, err
		}
		opened, err := enc.openJSON(sealed)
		if err != nil {
			return state, err
		}
		data, _ := opened.(map[string]any)
		if data == nil {
			data = map[string]any{}
		}
		state.Domains[domain] = syncDocument{Version: version, Data: data, UpdatedAt: updated}
		if version > state.Version {
			state.Version = version
		}
	}
	if err := rows.Err(); err != nil {
		return state, err
	}
	rows, err = s.db.Query(r.Context(), `SELECT storage_key, content_type, size_bytes, sha256, updated_at FROM account_files WHERE user_id = $1 ORDER BY storage_key`, userID)
	if err != nil {
		return state, err
	}
	defer rows.Close()
	for rows.Next() {
		var key, contentType string
		var size int64
		var digest []byte
		var updated time.Time
		if err := rows.Scan(&key, &contentType, &size, &digest, &updated); err != nil {
			return state, err
		}
		state.Files = append(state.Files, syncFileMeta{StorageKey: key, ContentType: contentType, Size: size, SHA256: hex.EncodeToString(digest), UpdatedAt: updated})
	}
	for domain, document := range state.Domains {
		document.Files = state.Files
		state.Domains[domain] = document
	}
	return state, rows.Err()
}

func (s *Server) loadSyncFiles(r *http.Request, userID string) ([]syncFileMeta, error) {
	rows, err := s.db.Query(r.Context(), `SELECT storage_key, content_type, size_bytes, sha256, updated_at FROM account_files WHERE user_id = $1 ORDER BY storage_key`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	files := make([]syncFileMeta, 0)
	for rows.Next() {
		var key, contentType string
		var size int64
		var digest []byte
		var updated time.Time
		if err := rows.Scan(&key, &contentType, &size, &digest, &updated); err != nil {
			return nil, err
		}
		files = append(files, syncFileMeta{StorageKey: key, ContentType: contentType, Size: size, SHA256: hex.EncodeToString(digest), UpdatedAt: updated})
	}
	return files, rows.Err()
}

func (s *Server) syncState(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.syncUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHENTICATED", "请先登录")
		return
	}
	state, err := s.loadSyncState(r, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "SYNC_READ_FAILED", "读取同步状态失败")
		return
	}
	writeData(w, http.StatusOK, state)
}

func (s *Server) syncDomain(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.syncUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHENTICATED", "请先登录")
		return
	}
	domain := r.PathValue("domain")
	if !isSyncDomain(domain) {
		writeError(w, http.StatusNotFound, "SYNC_DOMAIN_NOT_FOUND", "同步域不存在")
		return
	}
	var version int64
	var raw []byte
	var updated time.Time
	err := s.db.QueryRow(r.Context(), `SELECT version, data, updated_at FROM account_documents WHERE user_id = $1 AND domain = $2`, userID, domain).Scan(&version, &raw, &updated)
	if errors.Is(err, pgx.ErrNoRows) {
		writeData(w, http.StatusOK, syncDocument{Version: 0, Data: map[string]any{}, UpdatedAt: time.Time{}, Files: []syncFileMeta{}})
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "SYNC_READ_FAILED", "读取同步状态失败")
		return
	}
	enc, err := newDataEncryptor(s.cfg.DataEncryptionKey)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "SYNC_READ_FAILED", "读取同步状态失败")
		return
	}
	var sealed any
	if json.Unmarshal(raw, &sealed) != nil {
		writeError(w, http.StatusInternalServerError, "SYNC_READ_FAILED", "读取同步状态失败")
		return
	}
	opened, err := enc.openJSON(sealed)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "SYNC_READ_FAILED", "读取同步状态失败")
		return
	}
	data, _ := opened.(map[string]any)
	files, err := s.loadSyncFiles(r, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "SYNC_READ_FAILED", "读取同步状态失败")
		return
	}
	writeData(w, http.StatusOK, syncDocument{Version: version, Data: data, UpdatedAt: updated, Files: files})
}

func (s *Server) putSyncDomain(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.syncUserID(r)
	if !ok {
		writeError(w, http.StatusUnauthorized, "UNAUTHENTICATED", "请先登录")
		return
	}
	domain := r.PathValue("domain")
	if !isSyncDomain(domain) {
		writeError(w, http.StatusNotFound, "SYNC_DOMAIN_NOT_FOUND", "同步域不存在")
		return
	}
	var req struct {
		BaseVersion int64          `json:"baseVersion"`
		Data        map[string]any `json:"data"`
	}
	if !decodeSyncJSON(w, r, &req) || req.BaseVersion < 0 || req.Data == nil {
		if req.BaseVersion < 0 || req.Data == nil {
			writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "同步数据格式无效")
		}
		return
	}
	enc, err := newDataEncryptor(s.cfg.DataEncryptionKey)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "SYNC_WRITE_FAILED", "保存同步状态失败")
		return
	}
	sealed, err := enc.sealJSON(req.Data)
	if err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "同步数据格式无效")
		return
	}
	payload, _ := json.Marshal(sealed)
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "SYNC_WRITE_FAILED", "保存同步状态失败")
		return
	}
	defer tx.Rollback(r.Context())
	var current int64
	var remoteRaw []byte
	var remoteUpdated time.Time
	err = tx.QueryRow(r.Context(), `SELECT version, data, updated_at FROM account_documents WHERE user_id = $1 AND domain = $2 FOR UPDATE`, userID, domain).Scan(&current, &remoteRaw, &remoteUpdated)
	if errors.Is(err, pgx.ErrNoRows) {
		current = 0
	}
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "SYNC_WRITE_FAILED", "保存同步状态失败")
		return
	}
	if current != req.BaseVersion {
		_ = tx.Rollback(r.Context())
		state, stateErr := s.loadSyncState(r, userID)
		if stateErr != nil {
			writeError(w, http.StatusConflict, "SYNC_CONFLICT", "同步版本冲突")
			return
		}
		remote := state.Domains[domain]
		writeErrorDetails(w, http.StatusConflict, "SYNC_CONFLICT", "同步版本冲突", map[string]any{
			"version": remote.Version,
			"data":    remote.Data,
			"files":   state.Files,
		})
		return
	}
	next := current + 1
	_, err = tx.Exec(r.Context(), `INSERT INTO account_documents (user_id, domain, version, data) VALUES ($1,$2,$3,$4) ON CONFLICT (user_id,domain) DO UPDATE SET version=EXCLUDED.version, data=EXCLUDED.data, updated_at=NOW()`, userID, domain, next, payload)
	if err != nil || tx.Commit(r.Context()) != nil {
		writeError(w, http.StatusInternalServerError, "SYNC_WRITE_FAILED", "保存同步状态失败")
		return
	}
	files, err := s.loadSyncFiles(r, userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "SYNC_WRITE_FAILED", "保存同步状态失败")
		return
	}
	writeData(w, http.StatusOK, syncDocument{Version: next, Data: req.Data, UpdatedAt: time.Now().UTC(), Files: files})
}

func decodeSyncJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	if !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		writeError(w, http.StatusUnsupportedMediaType, "JSON_REQUIRED", "请求必须使用 JSON")
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxSyncJSONBytes)
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "请求格式无效")
		return false
	}
	var extra any
	if decoder.Decode(&extra) != io.EOF {
		writeError(w, http.StatusBadRequest, "INVALID_REQUEST", "请求格式无效")
		return false
	}
	return true
}

func safeStoragePath(root, key string) (string, error) {
	key = strings.TrimSpace(key)
	if key == "" || filepath.IsAbs(key) || strings.ContainsRune(key, '\x00') || strings.ContainsRune(key, '\\') {
		return "", errors.New("invalid storage key")
	}
	clean := filepath.Clean(filepath.FromSlash(key))
	if clean == "." || clean == ".." || strings.HasPrefix(clean, ".."+string(os.PathSeparator)) {
		return "", errors.New("invalid storage key")
	}
	rootAbs, err := filepath.Abs(root)
	if err != nil {
		return "", err
	}
	path := filepath.Join(rootAbs, clean)
	if rel, err := filepath.Rel(rootAbs, path); err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) {
		return "", errors.New("invalid storage key")
	}
	return path, nil
}

func validContentType(value string) bool {
	value = strings.ToLower(strings.TrimSpace(value))
	return value != "" && (strings.HasPrefix(value, "image/") || strings.HasPrefix(value, "video/") || strings.HasPrefix(value, "audio/") || value == "text/plain" || value == "application/json" || value == "application/octet-stream")
}

func (s *Server) putSyncFile(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.syncUserID(r)
	if !ok { writeError(w, http.StatusUnauthorized, "UNAUTHENTICATED", "请先登录"); return }
	storageKey := r.PathValue("storageKey")
	if _, err := safeStoragePath(s.cfg.FileStoragePath, storageKey); err != nil { writeError(w, http.StatusBadRequest, "INVALID_STORAGE_KEY", "文件路径无效"); return }
	path, err := safeStoragePath(s.cfg.FileStoragePath, filepath.ToSlash(filepath.Join(userID, storageKey))); if err != nil { writeError(w, http.StatusBadRequest, "INVALID_STORAGE_KEY", "文件路径无效"); return }
	contentType := r.Header.Get("Content-Type"); if !validContentType(contentType) { writeError(w, http.StatusUnsupportedMediaType, "INVALID_MIME_TYPE", "文件类型不支持"); return }
	reader := io.LimitReader(r.Body, maxSyncFileBytes+1)
	if err := os.MkdirAll(s.cfg.FileStoragePath, 0o750); err != nil { writeError(w, http.StatusInternalServerError, "SYNC_FILE_WRITE_FAILED", "保存文件失败"); return }
	tmp, err := os.CreateTemp(s.cfg.FileStoragePath, ".upload-"); if err != nil { writeError(w, http.StatusInternalServerError, "SYNC_FILE_WRITE_FAILED", "保存文件失败"); return }
	tmpName := tmp.Name(); defer os.Remove(tmpName)
	hash := sha256.New(); size, err := io.Copy(io.MultiWriter(tmp, hash), reader); tmp.Close(); if err != nil { writeError(w, http.StatusInternalServerError, "SYNC_FILE_WRITE_FAILED", "保存文件失败"); return }
	if size > maxSyncFileBytes { writeError(w, http.StatusRequestEntityTooLarge, "FILE_TOO_LARGE", "文件过大"); return }
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil || os.Rename(tmpName, path) != nil { writeError(w, http.StatusInternalServerError, "SYNC_FILE_WRITE_FAILED", "保存文件失败"); return }
	digest := hash.Sum(nil)
	_, err = s.db.Exec(r.Context(), `INSERT INTO account_files (user_id, storage_key, content_type, size_bytes, sha256) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (user_id,storage_key) DO UPDATE SET content_type=EXCLUDED.content_type,size_bytes=EXCLUDED.size_bytes,sha256=EXCLUDED.sha256,updated_at=NOW()`, userID, storageKey, contentType, size, digest)
	if err != nil { writeError(w, http.StatusInternalServerError, "SYNC_FILE_WRITE_FAILED", "保存文件失败"); return }
	writeData(w, http.StatusCreated, syncFileMeta{StorageKey:storageKey, ContentType:contentType, Size:size, SHA256:hex.EncodeToString(digest), UpdatedAt:time.Now().UTC()})
}

func (s *Server) getSyncFile(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.syncUserID(r); if !ok { writeError(w, http.StatusUnauthorized, "UNAUTHENTICATED", "请先登录"); return }
	storageKey := r.PathValue("storageKey")
	if _, err := safeStoragePath(s.cfg.FileStoragePath, storageKey); err != nil { writeError(w, http.StatusBadRequest, "INVALID_STORAGE_KEY", "文件路径无效"); return }
	path, err := safeStoragePath(s.cfg.FileStoragePath, filepath.ToSlash(filepath.Join(userID, storageKey))); if err != nil { writeError(w, http.StatusBadRequest, "INVALID_STORAGE_KEY", "文件路径无效"); return }
	var contentType string
	err = s.db.QueryRow(r.Context(), `SELECT content_type FROM account_files WHERE user_id=$1 AND storage_key=$2`, userID, storageKey).Scan(&contentType)
	if errors.Is(err, pgx.ErrNoRows) { writeError(w, http.StatusNotFound, "FILE_NOT_FOUND", "文件不存在"); return }
	if err != nil { writeError(w, http.StatusInternalServerError, "SYNC_FILE_READ_FAILED", "读取文件失败"); return }
	w.Header().Set("Content-Type", contentType); http.ServeFile(w, r, path)
}

func (s *Server) deleteSyncFile(w http.ResponseWriter, r *http.Request) {
	userID, ok := s.syncUserID(r); if !ok { writeError(w, http.StatusUnauthorized, "UNAUTHENTICATED", "请先登录"); return }
	storageKey := r.PathValue("storageKey")
	if _, err := safeStoragePath(s.cfg.FileStoragePath, storageKey); err != nil { writeError(w, http.StatusBadRequest, "INVALID_STORAGE_KEY", "文件路径无效"); return }
	path, err := safeStoragePath(s.cfg.FileStoragePath, filepath.ToSlash(filepath.Join(userID, storageKey))); if err != nil { writeError(w, http.StatusBadRequest, "INVALID_STORAGE_KEY", "文件路径无效"); return }
	_, err = s.db.Exec(r.Context(), `DELETE FROM account_files WHERE user_id=$1 AND storage_key=$2`, userID, storageKey); if err != nil { writeError(w, http.StatusInternalServerError, "SYNC_FILE_DELETE_FAILED", "删除文件失败"); return }
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) { writeError(w, http.StatusInternalServerError, "SYNC_FILE_DELETE_FAILED", "删除文件失败"); return }
	writeData(w, http.StatusOK, nil)
}

type dataEncryptor struct { aead cipher.AEAD }

func newDataEncryptor(secret string) (*dataEncryptor, error) {
	if len(strings.TrimSpace(secret)) < 16 { return nil, errors.New("DATA_ENCRYPTION_KEY is required") }
	hash := sha256.Sum256([]byte(secret)); block, err := aes.NewCipher(hash[:]); if err != nil { return nil, err }
	aead, err := cipher.NewGCM(block); if err != nil { return nil, err }
	return &dataEncryptor{aead:aead}, nil
}

func (e *dataEncryptor) sealJSON(value any) (any, error) {
	switch v := value.(type) {
	case map[string]any:
		out := make(map[string]any, len(v)); for k, child := range v { var sealed any; var err error; if isSensitiveKey(k) { if text, ok := child.(string); ok { sealed, err = e.encrypt(text) } else { sealed, err = e.sealJSON(child) } } else { sealed, err = e.sealJSON(child) }; if err != nil { return nil, err }; out[k] = sealed }; return out, nil
	case []any:
		out := make([]any, len(v)); for i, child := range v { sealed, err := e.sealJSON(child); if err != nil { return nil, err }; out[i] = sealed }; return out, nil
	default: return value, nil
	}
}

func (e *dataEncryptor) openJSON(value any) (any, error) {
	switch v := value.(type) {
	case map[string]any:
		out := make(map[string]any, len(v))
		for k, child := range v {
			var opened any
			var err error
			if isSensitiveKey(k) {
				if text, ok := child.(string); ok && strings.HasPrefix(text, encPrefix) {
					opened, err = e.decrypt(text)
				} else {
					opened, err = e.openJSON(child)
				}
			} else {
				opened, err = e.openJSON(child)
			}
			if err != nil { return nil, err }
			out[k] = opened
		}
		return out, nil
	case []any:
		out := make([]any, len(v)); for i, child := range v { opened, err := e.openJSON(child); if err != nil { return nil, err }; out[i] = opened }; return out, nil
	case string:
		return v, nil
	default: return value, nil
	}
}

func isSensitiveKey(key string) bool { key = strings.ToLower(strings.ReplaceAll(key, "-", "_")); return strings.Contains(key, "apikey") || strings.Contains(key, "api_key") || strings.Contains(key, "token") || strings.Contains(key, "secret") || strings.Contains(key, "password") }

func (e *dataEncryptor) encrypt(value string) (string, error) { nonce := make([]byte, e.aead.NonceSize()); if _, err := rand.Read(nonce); err != nil { return "", err }; sealed := e.aead.Seal(nonce, nonce, []byte(value), nil); return encPrefix + base64.RawStdEncoding.EncodeToString(sealed), nil }
func (e *dataEncryptor) decrypt(value string) (string, error) { raw, err := base64.RawStdEncoding.DecodeString(strings.TrimPrefix(value, encPrefix)); if err != nil || len(raw) < e.aead.NonceSize() { return "", errors.New("invalid encrypted value") }; nonce, ciphertext := raw[:e.aead.NonceSize()], raw[e.aead.NonceSize():]; plain, err := e.aead.Open(nil, nonce, ciphertext, nil); if err != nil { return "", fmt.Errorf("decrypt value: %w", err) }; return string(plain), nil }
