package service

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"time"

	"github.com/tigerowo/infinite-canvas/model"
)

func JimengModels() []string {
	return []string{"jimeng_high_aes_general_v21_L", "jimeng_vgfm_t2v_l20", "jimeng_vgfm_i2v_l20", "jimeng_v30", "jimeng_v30_pro", "jimeng_ti2v_v30_pro"}
}

func JimengEndpoint(action string) string {
	return "/?Action=" + url.QueryEscape(action) + "&Version=2022-08-31"
}

func SetJimengAuthHeader(request *http.Request, channel model.ModelChannel) error {
	parts := strings.Split(channel.APIKey, "|")
	if len(parts) != 2 || strings.TrimSpace(parts[0]) == "" || strings.TrimSpace(parts[1]) == "" {
		return errors.New("即梦 API Key 格式应为 access_key|secret_key")
	}
	body, err := readRequestBody(request)
	if err != nil {
		return err
	}
	if request.Header.Get("Content-Type") == "" {
		request.Header.Set("Content-Type", "application/json")
	}
	request.Body = io.NopCloser(bytes.NewReader(body))

	accessKey, secretKey := strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1])
	now := time.Now().UTC()
	date := now.Format("20060102T150405Z")
	shortDate := now.Format("20060102")
	payloadHash := sha256Hex(body)
	request.Header.Set("Host", request.URL.Host)
	request.Header.Set("X-Date", date)
	request.Header.Set("X-Content-Sha256", payloadHash)

	query := request.URL.Query()
	keys := make([]string, 0, len(query))
	for key := range query { keys = append(keys, key) }
	sort.Strings(keys)
	queryParts := make([]string, 0)
	for _, key := range keys {
		values := append([]string(nil), query[key]...)
		sort.Strings(values)
		for _, value := range values { queryParts = append(queryParts, url.QueryEscape(key)+"="+url.QueryEscape(value)) }
	}
	canonicalHeaders := "content-type:" + strings.TrimSpace(request.Header.Get("Content-Type")) + "\n" +
		"host:" + request.URL.Host + "\n" + "x-content-sha256:" + payloadHash + "\n" + "x-date:" + date + "\n"
	signedHeaders := "content-type;host;x-content-sha256;x-date"
	canonicalRequest := strings.Join([]string{request.Method, request.URL.Path, strings.Join(queryParts, "&"), canonicalHeaders, signedHeaders, payloadHash}, "\n")
	scope := fmt.Sprintf("%s/cn-north-1/cv/request", shortDate)
	stringToSign := "HMAC-SHA256\n" + date + "\n" + scope + "\n" + sha256Hex([]byte(canonicalRequest))
	key := hmacSHA256([]byte(secretKey), []byte(shortDate))
	key = hmacSHA256(key, []byte("cn-north-1"))
	key = hmacSHA256(key, []byte("cv"))
	key = hmacSHA256(key, []byte("request"))
	signature := hex.EncodeToString(hmacSHA256(key, []byte(stringToSign)))
	request.Header.Set("Authorization", fmt.Sprintf("HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s", accessKey, scope, signedHeaders, signature))
	return nil
}

func readRequestBody(request *http.Request) ([]byte, error) {
	if request.Body == nil { return nil, nil }
	body, err := io.ReadAll(request.Body)
	if err != nil { return nil, err }
	_ = request.Body.Close()
	return body, nil
}

func sha256Hex(value []byte) string {
	sum := sha256.Sum256(value)
	return hex.EncodeToString(sum[:])
}

func hmacSHA256(key, value []byte) []byte {
	h := hmac.New(sha256.New, key)
	_, _ = h.Write(value)
	return h.Sum(nil)
}
