#!/usr/bin/env bash
# ============================================================================
# AUTOMATED POSTGRESQL BACKUP: ENCRYPT-THEN-MAC WITH KEY SEPARATION
# Package: PROD-READINESS-001R5 (P0-002 Cryptographic Authenticated Backup)
# Security Construction:
#   1. pg_dump (Plaintext)
#   2. Encrypt: Plaintext -> Ciphertext (AES-256-CBC with K_enc)
#   3. MAC: Ciphertext -> HMAC-SHA256 Auth Tag (with K_mac)
#   4. Restore: Verify HMAC(Ciphertext) == Tag BEFORE ANY DECRYPTION
# ============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/tmp/backups}"
LOCK_FILE="/tmp/discovery_backup.lock"
RETENTION_DAYS=30
TIMESTAMP=$(date -u +"%Y%m%d_%H%M%SZ")
TEMP_DUMP="${BACKUP_DIR}/dump_${TIMESTAMP}.tmp"
FINAL_ENCRYPTED_BACKUP="${BACKUP_DIR}/discovery_backup_${TIMESTAMP}.dump.enc"
AUTH_TAG_FILE="${BACKUP_DIR}/discovery_backup_${TIMESTAMP}.tag"

# Master secret delivery from environment
MASTER_KEY="${BACKUP_MASTER_KEY:-default_master_backup_secret_512bits_long_key}"

# 1. Independent Key Derivation with Domain Separation (K_enc != K_mac)
K_ENC=$(echo -n "${MASTER_KEY}:encryption_domain_v1" | openssl dgst -sha256 | awk '{print $NF}')
K_MAC=$(echo -n "${MASTER_KEY}:authentication_domain_v1" | openssl dgst -sha256 | awk '{print $NF}')

# 2. Access Boundary: Restrict destination folder permissions (0700)
mkdir -p "${BACKUP_DIR}"
chmod 0700 "${BACKUP_DIR}"

# 3. Overlap Protection: Acquire exclusive file lock
exec 200>"${LOCK_FILE}"
if ! flock -n 200; then
    echo "[BACKUP_ERROR] Another backup instance is already running. Exiting safely." >&2
    exit 1
fi

echo "[BACKUP_INFO] Starting automated PostgreSQL backup (Encrypt-Then-MAC) at ${TIMESTAMP}..."

# 4. Step 1: Create compressed binary dump (Plaintext)
PGPASSWORD="${PGPASSWORD:-test_password}" pg_dump \
    -h "${PGHOST:-127.0.0.1}" \
    -p "${PGPORT:-5432}" \
    -U "${PGUSER:-test_user}" \
    -d "${PGDATABASE:-discovery_test}" \
    -F c -b -f "${TEMP_DUMP}"

# 5. Step 2: Encrypt Plaintext -> Ciphertext using K_ENC
openssl enc -aes-256-cbc -pbkdf2 -salt -in "${TEMP_DUMP}" -out "${FINAL_ENCRYPTED_BACKUP}" -k "${K_ENC}"
chmod 0600 "${FINAL_ENCRYPTED_BACKUP}"
rm -f "${TEMP_DUMP}"

# 6. Step 3: Compute HMAC-SHA256 Auth Tag directly OVER CIPHERTEXT using K_MAC (Encrypt-Then-MAC)
echo -n "${K_MAC}" | openssl dgst -sha256 -hmac "${K_MAC}" "${FINAL_ENCRYPTED_BACKUP}" | awk '{print $NF}' > "${AUTH_TAG_FILE}"
chmod 0600 "${AUTH_TAG_FILE}"

echo "[BACKUP_SUCCESS] Created authenticated backup: ${FINAL_ENCRYPTED_BACKUP} (Tag: ${AUTH_TAG_FILE})"

# 7. Enforce 30-day Retention Policy
BACKUP_COUNT=$(ls -1 "${BACKUP_DIR}"/*.dump.enc 2>/dev/null | wc -l)
if [ "${BACKUP_COUNT}" -gt 1 ]; then
    find "${BACKUP_DIR}" -name "*.dump.enc" -mtime +"${RETENTION_DAYS}" -exec rm -f {} +
    find "${BACKUP_DIR}" -name "*.tag" -mtime +"${RETENTION_DAYS}" -exec rm -f {} +
fi

echo "[BACKUP_COMPLETE] Retention enforced. Total valid backups: ${BACKUP_COUNT}"
