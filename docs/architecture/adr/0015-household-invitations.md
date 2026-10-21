# 0015 Household invitations

Status: accepted

## Context

A person could only join a household if their account already existed, and with registration closed (the default) that meant the operator ran `orbit create-user` on the server and passed a password around by hand. That is the main onboarding step for a family, and it needed shell access. ADR 0007 and 0010 both named an invitation flow as the replacement.

## Decision

An owner creates an invitation for a household and a role. The invitee opens the link, chooses their own username and password, and is added to the household. No operator access and no pre-existing account are needed.

- **Secret.** A 256-bit random token from the same generator as session tokens. Only its SHA-256 is stored. The token is returned once, in the response that creates the invitation, and can never be shown again. Lost link: revoke and create a new one.
- **Where the token travels.** Links are `/join#<token>`. A URL fragment is never sent to the server, so the secret stays out of access logs, reverse proxies and `Referer`. The page then sends the token in a JSON body (`POST /invitations/preview` and `POST /invitations/accept`), never in a URL, for the same reason.
- **Lifetime and use.** Seven days by default, 1 to 30 on request. Single use. Owners can revoke. Expiry is checked at use time, so nothing has to run for an invitation to lapse.
- **Roles.** The invitation carries `owner` or `member`. Only owners can create, list and revoke (`household:manage-members`, no new permission). #15 may add roles later. The invitation stores the role as a plain value, so it follows whatever role set exists.
- **Single use is decided in the database.** `claim` is one conditional `UPDATE` (still pending, not revoked, not expired). Of two simultaneous uses, exactly one wins. The invitation is claimed before the account is created. If the username is taken or anything fails afterwards, the claim is handed back so the invitee can retry with the same link.
- **No oracle.** An unknown, expired, revoked and used token all answer the same 404. A revoke of another household's invitation id answers 404 identical to a missing id (the id is looked up inside the household the caller owns).
- **Registration policy.** Accepting an invitation creates the account regardless of `ORBIT_REGISTRATION`. The owner's invitation is the permission. Open registration stays an explicit opt-in for private networks.
- **Abuse limits.** The two public endpoints share the login rate limit. Tokens are unguessable, so the limit protects the server rather than the secret.
- **Kept.** `orbit create-user` stays for operators and recovery, and adding an existing account by username still works.

## Alternatives

- **Token in the path or query.** Simpler to build but leaks into access logs and proxies. Rejected.
- **Short human-typed codes.** Easy to read aloud, but low entropy makes online guessing a real risk. Rejected for now. The link can be sent through any messenger.
- **Invite by email.** Needs outbound mail, which a self-hosted household box usually does not have. Out of scope. The owner shares the link themselves.
- **Account first, then accept.** Fits someone who already has an account elsewhere on the server, but doubles the flows. They can be added by username today.

## Consequences

- Invitation rows are kept after use as a small history (who joined, when). They are not listed. A purge job can be added if the table ever matters.
- An invitation outlives its creator's membership. If an owner is removed, their open invitations still work until revoked or expired. Owners can see and revoke every open invitation of the household.
- The household isolation kit and the HTTP isolation suite cover create, list and revoke. A dedicated test covers revoking through another household.
