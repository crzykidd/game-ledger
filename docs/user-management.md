# User management & auth

> Captures the account model: roles, permissions, groups, invites, signup, passwords,
> resets, sessions. Ties into the player/guest model in `docs/spec.md` (a "guest" here is the
> no-login named player defined there). Items marked **(decision)** are open.

## Goals

- Self-hosted, invite-only. No open public signup.
- Simple enough for a friend-group homelab app, but with real auth hygiene (hashed
  passwords, expiring tokens, brute-force protection).
- **Phase 1 needs no email server** — invites and password resets are copy-paste links.
  Email is a Phase 2 convenience.

## Roles (tiered)

Five tiers, highest to lowest. The line between tiers is **who can manage accounts at or
above a given level**.

| Role | Login? | Capabilities |
|---|---|---|
| **Super Admin** | yes | Everything. **The only role that can add/remove Admins.** The **first user** (created by the install wizard) is Super Admin. Cannot be deleted/disabled while sole Super Admin. |
| **Admin** | yes | Small, trusted class. All management (global settings, modules, users, invites, resets). Cannot manage **Admin** accounts (that's Super Admin only). |
| **Manager** | yes | The workhorse management role — can do **everything except control Admin/Super-Admin accounts**: user management for Players, invites, resets, etc. |
| **Player** | yes | Start new games; configure *their own* games (incl. module scoring variants — see below); invite (toggleable); view their own history + stats. |
| **Guest** | **no** | A named player entry in a game (per `docs/spec.md`). Can be **invited** to become a Player. No access until they accept. |

- **Account-management rule of thumb:** you can only manage accounts **below** your tier.
  Super Admin manages Admins; Admin/Manager manage Players (and Managers?); nobody but Super
  Admin touches Admins. **(decision)** Confirm whether Admins can manage Managers, and whether
  there can be >1 Super Admin (recommend: allow promoting a second Super Admin, but always
  keep ≥1).
- **"Modified scoring rules" for a Player's own games** — this is choosing a module
  **variant / config** (target score, house-rule toggles), *not* editing module code. Bound
  the scope of what a Player can change per module.

## Permissions model (recommendation)

You're mixing **roles** (Admin/Player) with **per-user / per-group toggles** (invite rights,
reset rights). Cleanest way to reconcile:

- **Permissions are the atomic unit.** Roles are named bundles of defaults.
- **A user's effective permissions = role defaults, overridden by group, overridden by
  per-user setting.** (e.g. Player role grants `invite` by default → put a user in the
  "No-Invite" group to deny it, or toggle it off on the user directly.)
- Keep it shallow — for a homelab app, **role default + a few per-user toggles** is enough;
  groups are a convenience for applying a toggle to many people at once. Don't build a full
  policy engine.

### Permission catalog (starting set)

| Permission | Default for | Notes |
|---|---|---|
| `create_game` | Player, Admin | kick off a new game |
| `configure_own_game` | Player, Admin | set variant/scoring config on games they host |
| `invite_users` | Player, Admin | **toggleable** — default on for Players, can be disabled |
| `send_password_reset` | Admin (+ grantable) | issue a reset link for another user |
| `manage_users` | Admin | the user-management section |
| `manage_groups_roles` | Admin | define groups, assign roles |
| `manage_global_settings` | Admin | instance-wide settings |
| `manage_game_modules` | Admin | add/update game modules (separate from playing) |
| `view_all` | Admin | see all users/games/stats |

## Groups

- A **group** carries permission grants/denials you can apply in bulk; move a user into a
  group to change their effective perms (e.g. a **"No-Invite"** group, or a **"Can-Reset"**
  group of trusted helpers who can send reset links).
- **(decision)** Are groups *only* permission buckets, or also **social circles** (isolating
  who sees whom / who can be added to whose games)? Recommend **permission-only for v1**;
  social grouping is a bigger feature — flag separately.

## Invites

The guest→Player promotion path (history must carry over per `docs/spec.md`).

- **Who can invite:** Admin always; Player if `invite_users` is on (default on, disable via
  toggle or "No-Invite" group).
- **Mechanism:** generates a **copy-paste link** (no email needed) the inviter sends via
  text/Signal/whatever. Link carries a high-entropy token.
- **Bound to a guest (recommended):** an invite is tied to a **specific guest record**, so on
  accept, that guest's past `participation` rows re-link to the new account (history carries
  over). An invite not tied to a guest just creates a fresh Player.
- **Expiry:** **24 hours**, single-use. Show the inviter the expiry; allow **regenerate**
  (invalidates the old link) and **revoke**.
- **Token security:** store only a **hash** of the token; compare on redeem. Token is random
  (≥128-bit). Rate-limit invite creation.
- **(decision)** What if the invited person's email already has an account? What if a pending
  invite already exists for that guest? Need collision handling (block / merge / replace).

## Signup (on accepting an invite)

1. Link opens a signup form **pre-filled with the guest's current name** (becomes their
   **nickname** by default).
2. User sets **full name, nickname, email, password** (+ password confirm).
3. On submit: create the Player account, **link the originating guest** (re-point history),
   consume the invite token.
4. **Login is by email** (resolved). The **email must be unique**.
5. **Email already in use:** if signup (or a future open path) hits an existing email, show
   *"That email is already in use — did you forget your password?"* with a link to the reset
   flow. Don't silently fail or leak whether random emails exist beyond this invite context.

## Password policy

- **Rules (as specified):** ≥10 chars, at least one uppercase, one lowercase, and one
  number/special. **(decision)** confirm exact rule (e.g. 10+ with upper+lower+digit; special
  optional).
- **Recommended additions:** check against a breached-password list / zxcvbn strength meter
  (length matters more than composition per current NIST guidance); show a strength indicator;
  show/hide toggle (mobile UX); never cap length low.
- **Storage:** **argon2id or bcrypt**, never plaintext, never reversible. (Hard requirement.)

## Password reset

- **Phase 1 (no email):** an Admin (or anyone with `send_password_reset`) generates a
  **copy-paste reset link** for a user, sent out-of-band. **This is the only recovery path in
  Phase 1** — without it a user who forgets their password is locked out, so it must ship in
  Phase 1, not Phase 2.
- **Phase 2 (email):** self-service "forgot password" emails the link. Requires SMTP setup.
- **Reset links:** **24-hour** expiry, **single-use**, token **hashed** at rest, invalidated
  on use or on a newer reset request. Reuse the same token mechanism as invites (typed tokens:
  `invite` vs `password_reset`).
- `send_password_reset` is grantable at user/group level so a few trusted non-admins can help.

## Sessions & login security

- **Sessions:** server-side sessions via **httpOnly, Secure, SameSite cookies** (simplest/safest
  behind the nginx proxy). "Stay logged in" on mobile matters — long-lived refresh + logout
  (incl. **log out all devices**).
- **CSRF protection** for cookie-based auth.
- **Brute-force protection:** rate-limit + lockout/backoff on repeated failed logins; same for
  token redemption endpoints.
- **TLS:** terminated by the **external front-end (Traefik)** for now (per `docs/spec.md`
  topology) — the app does not handle SSL itself in v1. `Secure` cookies rely on TLS being
  present at the edge. **App-local SSL is a Phase 2+ consideration.**
- **(decision)** session lifetime / remember-me duration.

## Account lifecycle & states

- **States:** `invited (pending)` → `active` → `disabled`.
- **Delete == disable (resolved).** There is **no hard delete**. Because history is
  participant-based (`docs/spec.md`), wiping a user would destroy other players' game records,
  so "delete" is just **disable**: login revoked, account hidden from default lists, **all
  history kept**. This deliberately avoids the anonymize/tombstone work.
- **Admin-only** — disabling (= "deleting") an account is an Admin/Manager action, not
  self-service.
- **Admin user list has a "show disabled" toggle** (default: hide disabled accounts).
- **(decision)** Email change — Phase 2, may need re-verify.

## Display name & visibility

- **Nickname is the primary reference everywhere** — players are shown/referenced by
  **nickname**, not full name or email. (Guest name seeds the nickname at signup.)
- **Email is not shown to other Players.** Don't expose full emails across accounts. If a
  contact handle is ever needed, prefer nickname; a masked form (`name@…`) is a maybe, but the
  default is **nickname-only**.
- **(decision)** Nickname uniqueness — globally unique, or just unique within a playgroup?
  (Two "Bob"s; see playgroups in `docs/spec.md`.)

## Admin: user-management section

- **Users list/search** — state, role, group, permissions, last login, # games. **"Show
  disabled" toggle** (default hides disabled/"deleted" accounts).
- **User actions:** invite, disable/enable (disable = "delete"), change role, move group,
  toggle permissions, **generate a reset link**.
- **Invites view** — list all invites: invitee (guest/email), who sent it, created/expiry,
  and **status (pending / claimed / expired / revoked)**, mapping the claim to the resulting
  account/email. Revoke/regenerate from here.
- **Resets view** — list all password-reset links: target user/email, who issued it,
  created/expiry, and **whether it was claimed**.
- **Audit log (recommended):** who invited/reset/disabled whom, role/perm changes,
  global-setting changes. Pairs with the Admin "see everything" goal; the Invites/Resets views
  are effectively scoped slices of it.

## Bootstrapping — install wizard (resolved)

- On first launch with an empty DB, the app shows a **new-install wizard** that creates the
  **first user as Super Admin** (full name, nickname, email, password) and any required global
  settings.
- The wizard is **one-time**: once a Super Admin exists, it's disabled (route returns to normal
  login). Guard against re-running it on a populated DB.

## Phasing

- **Phase 1:** roles (Admin/Player/Guest), permission toggles, invite links, signup +
  guest-linking, password policy + hashing, **admin/permitted reset links**, sessions +
  brute-force protection, admin user-management + audit log, first-admin bootstrap.
- **Phase 2:** email-driven self-service password reset (SMTP), email change w/ verification,
  possibly self-service "forgot password."

## Out of scope (v1) / future

- 2FA / TOTP, OAuth/OIDC SSO, social login.
- Social-circle groups (isolation of who-sees-whom).
- GDPR-style data export/erasure (homelab; revisit if it ever goes multi-tenant/public).

## Resolved

- ✅ **Delete == disable** (no hard delete; history always kept; admin "show disabled" toggle).
- ✅ **Login by email**; email unique.
- ✅ **Phase-1 reset link** ships in Phase 1 (sole recovery path until email in Phase 2).
- ✅ **Passwords hashed** (argon2id/bcrypt).
- ✅ **Role tiers:** Super Admin (first user) → Admin → Manager → Player → Guest; only Super
  Admin manages Admins.
- ✅ **Install wizard** creates the first Super Admin; one-time.
- ✅ **Email-already-in-use → "forgot password?"** on signup.
- ✅ **Admin Invites & Resets views** (claimed status, email mapping).
- ✅ **Nickname is the primary reference**; emails not shown to other Players.
- ✅ **TLS at the Traefik front-end** for now; app-local SSL is Phase 2+.

## Open questions (rollup)

- [ ] Can Admins manage Managers? Allow >1 Super Admin? (always keep ≥1).
- [ ] Nickname uniqueness — global vs. per-playgroup.
- [ ] Invite/email collision handling beyond signup (duplicate pending invite for a guest).
- [ ] Exact password rule (10+ / upper+lower+digit?); add breach-list/strength check?
- [ ] Session lifetime / remember-me duration.
- [ ] Permission model depth: role-default + per-user toggle vs. full group override matrix.
- [ ] Groups = permissions only, or also social isolation? (vs. **playgroups** in `spec.md`,
      which are the social/stats grouping.)
