# Production Secret Rotation Runbook (PROD-READINESS-001R2)

## 1. Secret Delivery Boundary
- **STORAGE**: Zero secrets or private keys in Git repository or hardcoded in source.
- **DELIVERY_MODEL**: Injected strictly via environment variables at runtime (`AUTH_TOKEN_SECRET`, `PGPASSWORD`, `API_CREDENTIALS`).

---

## 2. Rolling Secret Rotation Procedure
1. **Authentication Signing Key Rotation**:
   - Step 1: Deploy new token secret to `AUTH_TOKEN_SECRET_NEW` while keeping current in `AUTH_TOKEN_SECRET_PRIMARY`.
   - Step 2: System signs new tokens with `NEW` key and verifies against both `PRIMARY` and `NEW`.
   - Step 3: After 24 hours (token expiration lifecycle), promote `NEW` to `PRIMARY` and remove old secret.

2. **PostgreSQL Database Password Rotation**:
   - Step 1: Create secondary database user credentials in PostgreSQL.
   - Step 2: Update application runtime environment with new connection credentials.
   - Step 3: Verify successful connection pool re-attachment.
   - Step 4: Drop old user credentials from PostgreSQL.
