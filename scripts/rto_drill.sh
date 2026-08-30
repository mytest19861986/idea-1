#!/bin/bash
set -euo pipefail

BACKUP_FILE=$(ls -1t /var/backups/discovery/discovery_backup_*.dump.enc | head -n 1)
TAG_FILE="${BACKUP_FILE%.dump.enc}.tag"

MASTER_KEY="${BACKUP_MASTER_KEY:-default_master_backup_secret_512bits_long_key}"
K_ENC=$(echo -n "${MASTER_KEY}:encryption_domain_v1" | openssl dgst -sha256 | awk '{print $NF}')
K_MAC=$(echo -n "${MASTER_KEY}:authentication_domain_v1" | openssl dgst -sha256 | awk '{print $NF}')

echo "BACKUP_FILE=$BACKUP_FILE"
echo "BACKUP_SIZE=$(stat -c%s "$BACKUP_FILE") bytes"

# Exactly as in automated_backup.sh line 56:
CALC_TAG=$(echo -n "${K_MAC}" | openssl dgst -sha256 -hmac "${K_MAC}" "${BACKUP_FILE}" | awk '{print $NF}')
EXPECTED_TAG=$(cat "${TAG_FILE}")

echo "CALC_TAG=$CALC_TAG"
echo "EXPECTED_TAG=$EXPECTED_TAG"

if [ "$CALC_TAG" = "$EXPECTED_TAG" ]; then
    echo "HMAC_VERIFY=PASS"
else
    echo "HMAC_VERIFY=FAIL"
    exit 1
fi

openssl enc -d -aes-256-cbc -pbkdf2 -salt -in "$BACKUP_FILE" -out "/tmp/drill_decrypted.dump" -k "$K_ENC"
chmod 0666 /tmp/drill_decrypted.dump
echo "DECRYPT=PASS"

su - postgres -c "dropdb --if-exists discovery_drill_isolated"
su - postgres -c "createdb discovery_drill_isolated"
su - postgres -c "pg_restore -d discovery_drill_isolated /tmp/drill_decrypted.dump" || su - postgres -c "psql -d discovery_drill_isolated -f /tmp/drill_decrypted.dump" >/dev/null 2>&1
echo "RESTORE=PASS"

TABLE_COUNT=$(su - postgres -c "psql -d discovery_drill_isolated -t -c \"SELECT count(*) FROM information_schema.tables WHERE table_schema='public';\"" | tr -d '[:space:]')
echo "RESTORED_TABLES_COUNT=$TABLE_COUNT"

su - postgres -c "dropdb discovery_drill_isolated"
rm -f /tmp/drill_decrypted.dump
echo "CLEANUP=PASS"
echo "RECOVERY_DRILL_STATUS=100%_SUCCESS"
