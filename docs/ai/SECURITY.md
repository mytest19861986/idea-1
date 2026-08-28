# Security

## Current state

No credential, token, database URL, Telegram credential, AI-provider key, session store, or `.env` file is tracked. `.gitignore` excludes `.env` variants while retaining `.env.example` for a future non-secret template.

## Sensitive boundaries

- Source access rules and any collector credentials.
- Future PostgreSQL connection configuration.
- Telegram Bot API credentials and chat identifiers.
- AI-provider keys, prompts containing non-public data, and provider outputs.
- Future HTTP authentication, authorization, logs, and request bodies.

## Existing controls

- URL-taking core boundaries require HTTPS.
- Source activation and publication authorization are explicit state transitions.
- Delivery request/result contracts have no network side effect.
- Local persistence limitation is documented; it is not represented as production-safe.

## Open security work

Threat modeling, HTTP authN/authZ, secret injection, log redaction, dependency scanning, SAST, security headers, rate limiting, and production database access controls are not yet implemented or verified.
