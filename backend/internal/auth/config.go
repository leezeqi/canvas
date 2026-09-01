package auth

import (
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	Port                  string
	DatabaseURL           string
	AppOrigin             string
	CookieSecure          bool
	SessionTTL            time.Duration
	HajimiBaseURL         string
	HajimiSSOClientSecret string
	DataEncryptionKey     string
	FileStoragePath       string
}

func LoadConfig() (Config, error) {
	cfg := Config{
		Port:                  envOr("PORT", "8081"),
		DatabaseURL:           strings.TrimSpace(os.Getenv("DATABASE_URL")),
		AppOrigin:             strings.TrimRight(envOr("APP_ORIGIN", "http://localhost:3000"), "/"),
		SessionTTL:            7 * 24 * time.Hour,
		HajimiBaseURL:         strings.TrimRight(strings.TrimSpace(os.Getenv("HAJIMI_BASE_URL")), "/"),
		HajimiSSOClientSecret: strings.TrimSpace(os.Getenv("HAJIMI_SSO_CLIENT_SECRET")),
		DataEncryptionKey:     strings.TrimSpace(os.Getenv("DATA_ENCRYPTION_KEY")),
		FileStoragePath:       envOr("FILE_STORAGE_PATH", "./data/files"),
	}
	if cfg.DatabaseURL == "" {
		return Config{}, fmt.Errorf("DATABASE_URL is required")
	}
	if len(cfg.DataEncryptionKey) < 16 {
		return Config{}, fmt.Errorf("DATA_ENCRYPTION_KEY must contain at least 16 characters")
	}
	originURL, err := url.ParseRequestURI(cfg.AppOrigin)
	if err != nil || originURL.Scheme == "" || originURL.Host == "" || originURL.Path != "" || originURL.RawQuery != "" || originURL.Fragment != "" {
		return Config{}, fmt.Errorf("APP_ORIGIN must be an origin such as https://canvas.example.com")
	}
	if (cfg.HajimiBaseURL == "") != (cfg.HajimiSSOClientSecret == "") {
		return Config{}, fmt.Errorf("HAJIMI_BASE_URL and HAJIMI_SSO_CLIENT_SECRET must be configured together")
	}
	if cfg.HajimiSSOClientSecret != "" && len(cfg.HajimiSSOClientSecret) < 32 {
		return Config{}, fmt.Errorf("HAJIMI_SSO_CLIENT_SECRET must contain at least 32 characters")
	}
	if value := strings.TrimSpace(os.Getenv("COOKIE_SECURE")); value != "" {
		secure, err := strconv.ParseBool(value)
		if err != nil {
			return Config{}, fmt.Errorf("COOKIE_SECURE must be true or false")
		}
		cfg.CookieSecure = secure
	} else {
		cfg.CookieSecure = originURL.Scheme == "https"
	}
	if value := strings.TrimSpace(os.Getenv("SESSION_TTL")); value != "" {
		ttl, err := time.ParseDuration(value)
		if err != nil || ttl <= 0 {
			return Config{}, fmt.Errorf("SESSION_TTL must be a positive duration")
		}
		cfg.SessionTTL = ttl
	}
	return cfg, nil
}

func envOr(key, fallback string) string {
	if value := strings.TrimSpace(os.Getenv(key)); value != "" {
		return value
	}
	return fallback
}
