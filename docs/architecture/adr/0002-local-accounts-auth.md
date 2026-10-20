# 0002 Local accounts for authentication

Status: accepted

## Decision
Email or username plus password, hashed with argon2id, server-side sessions in an HttpOnly, SameSite cookie. The first user becomes the instance owner. Household invites are explicit.

## Requirements
- Rate limiting and lockout backoff on login.
- CSRF protection for cookie-authenticated mutations.
- Authorization is platform-owned and independent of how identity is established, so OIDC can be added as another identity adapter later.

## Consequences
No password reset by email unless SMTP is configured. MVP provides an owner-run CLI reset command instead.
