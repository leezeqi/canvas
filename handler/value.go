package handler

import (
	"encoding/json"
	"strings"
)

func boolLike(value any) bool {
	switch v := value.(type) {
	case bool:
		return v
	case string:
		switch strings.ToLower(strings.TrimSpace(v)) {
		case "1", "true", "yes", "on":
			return true
		default:
			return false
		}
	case float64:
		return v != 0
	case int:
		return v != 0
	default:
		return false
	}
}

func readStringSlice(value any) []string {
	switch v := value.(type) {
	case []string:
		return v
	case []any:
		result := make([]string, 0, len(v))
		for _, item := range v {
			s := strings.TrimSpace(toStringSafe(item))
			if s != "" {
				result = append(result, s)
			}
		}
		return result
	default:
		return nil
	}
}

func toStringSafe(value any) string {
	if value == nil {
		return ""
	}
	switch v := value.(type) {
	case string:
		return v
	default:
		data, err := json.Marshal(v)
		if err != nil {
			return ""
		}
		result := strings.TrimSpace(string(data))
		result = strings.TrimPrefix(result, "\"")
		result = strings.TrimSuffix(result, "\"")
		return result
	}
}
