#!/bin/sh
set -e

# Executed automatically by the official nginx image entrypoint through /docker-entrypoint.d/*.sh before nginx starts.
# Generate runtime config.js from environment variables. Unset values remain disabled.

# GA4 and Baidu IDs contain only letters, numbers, and hyphens. Remove other characters
# so quotes and similar values cannot break the JavaScript strings in config.js as a defense-in-depth measure.
sanitize_id() {
    printf '%s' "$1" | tr -cd 'A-Za-z0-9-'
}

# Keep standard URL characters and remove quotes, whitespace, and control characters before embedding the value in JavaScript.
sanitize_url() {
    printf '%s' "$1" | tr -cd 'A-Za-z0-9:/?&=._%#+~@-'
}

GA4_ID=$(sanitize_id "${ANALYTICS_GA4_ID:-}")
BAIDU_ID=$(sanitize_id "${ANALYTICS_BAIDU_ID:-}")
HAJIMI_URL=$(sanitize_url "${HAJIMI_LOGIN_URL:-}")

cat > /usr/share/nginx/html/config.js <<EOF
window.__RUNTIME_CONFIG__ = {
  ANALYTICS_GA4_ID: "${GA4_ID}",
  ANALYTICS_BAIDU_ID: "${BAIDU_ID}",
  HAJIMI_LOGIN_URL: "${HAJIMI_URL}"
};
EOF
