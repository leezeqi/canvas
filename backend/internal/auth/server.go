package auth

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/mail"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

const sessionCookieName = "canvas_session"

var dummyPasswordHash, _ = bcrypt.GenerateFromPassword([]byte("canvas-invalid-password"), 12)

type Server struct {
	cfg        Config
	db         *pgxpool.Pool
	httpClient *http.Client
	presence   *presenceTracker
}

type userResponse struct {
	ID          string `json:"id"`
	Email       string `json:"email"`
	DisplayName string `json:"name"`
	AvatarURL   string `json:"avatarUrl"`
	Provider    string `json:"provider"`
}

type errorBody struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
		Details any    `json:"details,omitempty"`
	} `json:"error"`
}

func NewServer(cfg Config, db *pgxpool.Pool) http.Handler {
	s := &Server{cfg: cfg, db: db, httpClient: &http.Client{Timeout: 5 * time.Second}, presence: newPresenceTracker(onlineWindow, time.Now)}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/health", s.health)
	mux.HandleFunc("POST /api/auth/register", s.register)
	mux.HandleFunc("POST /api/auth/login", s.login)
	mux.HandleFunc("POST /api/auth/logout", s.logout)
	mux.HandleFunc("GET /api/auth/session", s.session)
	mux.HandleFunc("POST /api/auth/hajimi/exchange", s.exchangeHajimi)
	mux.HandleFunc("POST /api/presence/heartbeat", s.presenceHeartbeat)
	mux.HandleFunc("GET /api/sync/state", s.syncState)
	mux.HandleFunc("GET /api/sync/domains/{domain}", s.syncDomain)
	mux.HandleFunc("PUT /api/sync/domains/{domain}", s.putSyncDomain)
	mux.HandleFunc("GET /api/sync/files/{storageKey...}", s.getSyncFile)
	mux.HandleFunc("PUT /api/sync/files/{storageKey...}", s.putSyncFile)
	mux.HandleFunc("DELETE /api/sync/files/{storageKey...}", s.deleteSyncFile)
	return s.middleware(mux)
}

func (s *Server) middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Referrer-Policy", "no-referrer")
		origin := r.Header.Get("Origin")
		if origin == s.cfg.AppOrigin {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			if origin != s.cfg.AppOrigin {
				writeError(w, http.StatusForbidden, "ORIGIN_FORBIDDEN", "请求来源不受信任")
				return
			}
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.WriteHeader(http.StatusNoContent)
			return
		}
		if r.Method != http.MethodGet && origin != "" && origin != s.cfg.AppOrigin {
			writeError(w, http.StatusForbidden, "ORIGIN_FORBIDDEN", "请求来源不受信任")
			return
		}
		if strings.HasPrefix(r.URL.Path, "/api/sync/files/") && (strings.Contains(r.URL.Path, "/../") || strings.Contains(r.URL.Path, "\\")) {
			writeError(w, http.StatusBadRequest, "INVALID_STORAGE_KEY", "文件路径无效")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	if err := s.db.Ping(r.Context()); err != nil {
		writeError(w, http.StatusServiceUnavailable, "DATABASE_UNAVAILABLE", "数据库暂不可用")
		return
	}
	writeData(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Name     string `json:"name"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	email, ok := validateEmail(req.Email)
	if !ok || utf8.RuneCountInString(req.Name) > 100 || utf8.RuneCountInString(req.Password) < 8 || len([]byte(req.Password)) > 72 {
		writeError(w, http.StatusBadRequest, "INVALID_REGISTRATION", "请输入有效邮箱，密码至少 8 个字符且不超过 72 字节")
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "注册失败")
		return
	}
	userID, err := newUUID()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "注册失败")
		return
	}
	tx, err := s.db.Begin(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "注册失败")
		return
	}
	defer tx.Rollback(r.Context())
	_, err = tx.Exec(r.Context(), `INSERT INTO users (id, email, display_name) VALUES ($1, $2, $3)`, userID, email, strings.TrimSpace(req.Name))
	if err == nil {
		_, err = tx.Exec(r.Context(), `INSERT INTO password_credentials (user_id, email_normalized, password_hash) VALUES ($1, $2, $3)`, userID, email, string(hash))
	}
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			writeError(w, http.StatusConflict, "EMAIL_ALREADY_EXISTS", "该邮箱已注册")
			return
		}
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "注册失败")
		return
	}
	if err := tx.Commit(r.Context()); err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "注册失败")
		return
	}
	user := userResponse{ID: userID, Email: email, DisplayName: strings.TrimSpace(req.Name), Provider: "email"}
	if err := s.createSession(w, r.Context(), userID); err != nil {
		writeError(w, http.StatusInternalServerError, "SESSION_CREATE_FAILED", "账号已创建，请重新登录")
		return
	}
	writeData(w, http.StatusCreated, user)
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	email, ok := validateEmail(req.Email)
	if !ok || req.Password == "" {
		writeError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "邮箱或密码错误")
		return
	}
	var user userResponse
	var hash string
	queryErr := s.db.QueryRow(r.Context(), `
		SELECT u.id, u.email, u.display_name, u.avatar_url, p.password_hash
		FROM password_credentials p JOIN users u ON u.id = p.user_id
		WHERE p.email_normalized = $1`, email,
	).Scan(&user.ID, &user.Email, &user.DisplayName, &user.AvatarURL, &hash)
	if errors.Is(queryErr, pgx.ErrNoRows) {
		hash = string(dummyPasswordHash)
	}
	passwordErr := bcrypt.CompareHashAndPassword([]byte(hash), []byte(req.Password))
	if queryErr != nil && !errors.Is(queryErr, pgx.ErrNoRows) {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "登录失败")
		return
	}
	if errors.Is(queryErr, pgx.ErrNoRows) || passwordErr != nil {
		writeError(w, http.StatusUnauthorized, "INVALID_CREDENTIALS", "邮箱或密码错误")
		return
	}
	user.Provider = "email"
	if err := s.createSession(w, r.Context(), user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "SESSION_CREATE_FAILED", "登录失败")
		return
	}
	writeData(w, http.StatusOK, user)
}

func (s *Server) logout(w http.ResponseWriter, r *http.Request) {
	if cookie, err := r.Cookie(sessionCookieName); err == nil {
		if token, ok := decodeSessionToken(cookie.Value); ok {
			_, _ = s.db.Exec(r.Context(), `DELETE FROM sessions WHERE token_hash = $1`, tokenHash(token))
		}
	}
	s.clearSessionCookie(w)
	writeData(w, http.StatusOK, nil)
}

func (s *Server) session(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "UNAUTHENTICATED", "请先登录")
		return
	}
	token, ok := decodeSessionToken(cookie.Value)
	if !ok {
		s.clearSessionCookie(w)
		writeError(w, http.StatusUnauthorized, "UNAUTHENTICATED", "登录状态无效")
		return
	}
	var user userResponse
	err = s.db.QueryRow(r.Context(), `
		SELECT u.id, u.email, u.display_name, u.avatar_url,
		       CASE WHEN p.user_id IS NOT NULL THEN 'email' ELSE COALESCE(e.provider, 'hajimi') END
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		LEFT JOIN password_credentials p ON p.user_id = u.id
		LEFT JOIN LATERAL (SELECT provider FROM external_identities WHERE user_id = u.id ORDER BY id LIMIT 1) e ON true
		WHERE s.token_hash = $1 AND s.expires_at > NOW()`, tokenHash(token),
	).Scan(&user.ID, &user.Email, &user.DisplayName, &user.AvatarURL, &user.Provider)
	if errors.Is(err, pgx.ErrNoRows) {
		s.clearSessionCookie(w)
		writeError(w, http.StatusUnauthorized, "UNAUTHENTICATED", "登录状态已过期")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "INTERNAL_ERROR", "读取登录状态失败")
		return
	}
	writeData(w, http.StatusOK, user)
}

type hajimiIdentity struct {
	Subject       string `json:"sub"`
	Email         string `json:"email"`
	EmailVerified bool   `json:"email_verified"`
	Name          string `json:"name"`
	Avatar        string `json:"avatar"`
}

func (s *Server) exchangeHajimi(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Ticket string `json:"ticket"`
	}
	if !decodeJSON(w, r, &req) {
		return
	}
	if s.cfg.HajimiBaseURL == "" || s.cfg.HajimiSSOClientSecret == "" {
		writeError(w, http.StatusServiceUnavailable, "HAJIMI_SSO_UNAVAILABLE", "Hajimi 登录尚未配置")
		return
	}
	identity, err := s.exchangeTicket(r.Context(), strings.TrimSpace(req.Ticket))
	if err != nil {
		writeError(w, http.StatusUnauthorized, "HAJIMI_TICKET_INVALID", "Hajimi 登录票据无效或已过期")
		return
	}
	user, err := s.findOrCreateHajimiUser(r.Context(), identity)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "HAJIMI_ACCOUNT_FAILED", "无法创建 Canvas 账号")
		return
	}
	if err := s.createSession(w, r.Context(), user.ID); err != nil {
		writeError(w, http.StatusInternalServerError, "SESSION_CREATE_FAILED", "登录失败")
		return
	}
	writeData(w, http.StatusOK, user)
}

func (s *Server) exchangeTicket(ctx context.Context, ticket string) (hajimiIdentity, error) {
	if decoded, err := base64.RawURLEncoding.DecodeString(ticket); err != nil || len(decoded) != 32 {
		return hajimiIdentity{}, errors.New("invalid ticket")
	}
	body, _ := json.Marshal(map[string]string{"ticket": ticket})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, s.cfg.HajimiBaseURL+"/api/v1/auth/canvas-sso/exchange", bytes.NewReader(body))
	if err != nil {
		return hajimiIdentity{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+s.cfg.HajimiSSOClientSecret)
	resp, err := s.httpClient.Do(req)
	if err != nil {
		return hajimiIdentity{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return hajimiIdentity{}, fmt.Errorf("hajimi exchange returned %d", resp.StatusCode)
	}
	var envelope struct {
		Code int `json:"code"`
		Data struct {
			Identity hajimiIdentity `json:"identity"`
		} `json:"data"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 256<<10)).Decode(&envelope); err != nil || envelope.Code != 0 || envelope.Data.Identity.Subject == "" {
		return hajimiIdentity{}, errors.New("invalid hajimi response")
	}
	return envelope.Data.Identity, nil
}

func (s *Server) findOrCreateHajimiUser(ctx context.Context, identity hajimiIdentity) (userResponse, error) {
	var user userResponse
	err := s.db.QueryRow(ctx, `
		SELECT u.id, u.email, u.display_name, u.avatar_url
		FROM external_identities e JOIN users u ON u.id = e.user_id
		WHERE e.provider = 'hajimi' AND e.provider_subject = $1`, identity.Subject,
	).Scan(&user.ID, &user.Email, &user.DisplayName, &user.AvatarURL)
	if err == nil {
		user.Provider = "hajimi"
		return user, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return userResponse{}, err
	}
	userID, err := newUUID()
	if err != nil {
		return userResponse{}, err
	}
	tx, err := s.db.Begin(ctx)
	if err != nil {
		return userResponse{}, err
	}
	defer tx.Rollback(ctx)
	_, err = tx.Exec(ctx, `INSERT INTO users (id, email, display_name, avatar_url) VALUES ($1, $2, $3, $4)`, userID, identity.Email, identity.Name, identity.Avatar)
	if err == nil {
		_, err = tx.Exec(ctx, `INSERT INTO external_identities (user_id, provider, provider_subject, email_at_provider) VALUES ($1, 'hajimi', $2, $3)`, userID, identity.Subject, identity.Email)
	}
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			_ = tx.Rollback(ctx)
			return s.findOrCreateHajimiUser(ctx, identity)
		}
		return userResponse{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return userResponse{}, err
	}
	return userResponse{ID: userID, Email: identity.Email, DisplayName: identity.Name, AvatarURL: identity.Avatar, Provider: "hajimi"}, nil
}

func (s *Server) createSession(w http.ResponseWriter, ctx context.Context, userID string) error {
	token := make([]byte, 32)
	if _, err := rand.Read(token); err != nil {
		return err
	}
	expiresAt := time.Now().UTC().Add(s.cfg.SessionTTL)
	if _, err := s.db.Exec(ctx, `INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)`, tokenHash(token), userID, expiresAt); err != nil {
		return err
	}
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookieName, Value: base64.RawURLEncoding.EncodeToString(token), Path: "/",
		HttpOnly: true, Secure: s.cfg.CookieSecure, SameSite: http.SameSiteLaxMode,
		Expires: expiresAt, MaxAge: int(s.cfg.SessionTTL.Seconds()),
	})
	return nil
}

func (s *Server) clearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name: sessionCookieName, Value: "", Path: "/", HttpOnly: true,
		Secure: s.cfg.CookieSecure, SameSite: http.SameSiteLaxMode,
		Expires: time.Unix(1, 0), MaxAge: -1,
	})
}

func decodeSessionToken(value string) ([]byte, bool) {
	token, err := base64.RawURLEncoding.DecodeString(value)
	return token, err == nil && len(token) == 32
}

func tokenHash(token []byte) []byte {
	sum := sha256.Sum256(token)
	return sum[:]
}

func validateEmail(raw string) (string, bool) {
	email := strings.ToLower(strings.TrimSpace(raw))
	parsed, err := mail.ParseAddress(email)
	return email, err == nil && parsed.Address == email && len(email) <= 320
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	if !strings.HasPrefix(strings.ToLower(r.Header.Get("Content-Type")), "application/json") {
		writeError(w, http.StatusUnsupportedMediaType, "JSON_REQUIRED", "请求必须使用 JSON")
		return false
	}
	r.Body = http.MaxBytesReader(w, r.Body, 16<<10)
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

func writeData(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{"data": data})
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	writeErrorDetails(w, status, code, message, nil)
}

func writeErrorDetails(w http.ResponseWriter, status int, code, message string, details any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	body := errorBody{}
	body.Error.Code = code
	body.Error.Message = message
	body.Error.Details = details
	_ = json.NewEncoder(w).Encode(body)
}
