# LingoHub: Multilingual Customer Support Hubs

Matches international SaaS platforms with native European and Asian language agents for 24/7 tier-1 support.
Stack: **MongoDB, Express, React (Vite), Node 20+**.

## What it does
| Role | Can do |
|---|---|
| **Client** (SaaS company) | Create Support Hubs for languages, skills, channels, tier and weekly coverage. Review verified, explainably ranked agents, invite candidates, manage accepted teams, coverage and billing. |
| **Agent** | Set languages, proficiency, skills, experience, supported channels, rate and weekly availability. Review Hub invitations and accept or decline before hours are committed. |
| **Admin** | Verify agents (only verified agents are matchable), platform stats, and SLA attainment. |

Core logic (all in `server/src/lib`, unit-tested):
- **Timezone-correct scheduling**: weeks are stored as 336 UTC half-hour slots, so India (+5:30) etc. work exactly.
- **Matching**: hard-filters verification, language/proficiency, required skills, channels, tier, rate cap and schedule overlap; scores language (35%), availability (25%), skills (20%), experience (10%) and timezone (10%). A greedy set-cover avoids recommending overlapping paid hours.
- **Routing**: a ticket goes to an agent engaged by that client for that language who is *on shift right now* and least loaded (max 5 open). Otherwise it queues, and a sweep every 20 s assigns it when a matching shift starts.
- **SLA**: first-response deadline per ticket (urgent ½, high ¾, low 2×), states ok / at risk / breached / met.
- Differentiators: AI-assisted editable requirement drafting, transparent per-hour pricing, deterministic explainable matching, agent-consent invitations, and a live coverage heatmap.

## Run it (step by step)
1. **Install Node 20+ and MongoDB** (local, or a free MongoDB Atlas cluster).
2. **Backend**
   ```bash
   cd server
   cp .env.example .env        # set MONGO_URI and a long random JWT_SECRET
   # Optional AI drafts: set OPENAI_API_KEY in server/.env (never in client/.env)
   npm install
   # For a real deployment: set BOOTSTRAP_ADMIN_EMAIL/PASSWORD in .env, then run npm run admin:create
   npm run dev                 # API on http://localhost:4000
   ```
3. **Frontend** (new terminal)
   ```bash
   cd client
   npm install
   npm run dev                 # http://localhost:5173 (proxies /api to :4000)
   ```
4. **Create real accounts**: company portal `/company/register`, agent portal `/agent/register`; log in at `/company/login` and `/agent/login`. Admins sign in at `/admin/login` after one-time bootstrap.
5. **Try the flow**: company → *Support Hubs* → create a requirement (optionally draft it with AI) → review/edit the fields → *Run matching* → inspect factor-level scores → *Invite agents* → agent accepts in *Clients & earnings* → view team and coverage. Invitations expire after seven days; hours are committed only after acceptance. Without `OPENAI_API_KEY`, Hub requirements can still be entered manually.

For real accounts, do not run a seed command. Client and agent accounts are created through their separate registration portals. Admins are created once with `npm run admin:create` using the credentials set in `server/.env`.

The application does not create demo users or sample agents. Companies and agents register through their portals; the one-time admin bootstrap uses credentials you provide. Test-only accounts are created and isolated by the automated API test.

Matching eligibility is deterministic: agents must be verified and satisfy language/proficiency, required skills, selected channels, tier, rate cap, and schedule overlap. Eligible agents receive an explainable score weighted by language (35%), availability (25%), skills (20%), experience (10%), and timezone (10%). AI drafts requirements only; it never selects or approves agents.

### One-command deploy
```bash
JWT_SECRET=$(openssl rand -hex 32) docker compose up --build   # app + MongoDB on :4000
docker compose exec app npm run admin:create                    # after providing BOOTSTRAP_ADMIN_EMAIL/PASSWORD
```

### Tests
```bash
cd server && npm test                                                  # unit tests (no DB needed)
TEST_MONGO_URI=mongodb://127.0.0.1:27017/lingohub_test npm test        # + isolated end-to-end API flow (drops that DB!)
```

### Public API (push tickets from your own product)
```bash
curl -X POST http://localhost:4000/api/v1/tickets -H "x-api-key: <key from Integration page>" \
  -H "Content-Type: application/json" \
  -d '{"customerName":"Hans","language":"de","subject":"Rechnung","message":"Ich habe keine Rechnung erhalten."}'
```

## Security & privacy
- **Passwords:** bcrypt (cost 12), 10–72 chars, common-password and email-name checks; login does the same work for unknown emails (no timing leak).
- **JWT:** HS256 pinned, issuer/audience checked, 12 h expiry, role always read from the database, revocable (`tokenVersion`) via password change / "Sign out everywhere" / account deletion. Production refuses to start without a 32+ char `JWT_SECRET`.
- **Abuse limits:** 300 API requests / min / IP, 10 failed logins per IP+email / 15 min, 10 registrations / hour / IP, 100 auth requests / 15 min / IP, 10 AI drafts / 15 min / IP, and 120 intake calls / min. Set `TRUST_PROXY` correctly behind a proxy. The default limiter store is per-process; use a shared store when running multiple API instances.
- **Headers:** strict CSP (no inline scripts), no-store on API responses, no `X-Powered-By`, frame embedding denied. Serve over HTTPS.
- **GDPR basics:** consent recorded at sign-up, in-app Privacy Notice, data export (`GET /api/auth/export`), account erasure (`DELETE /api/auth/me`). The Privacy Notice describes what the software does; **have counsel review it and add your legal entity/contact**. Clients' ticket data belongs to them, so sign a DPA with them.
- Not covered yet: email verification, password reset by email, MFA, API-key hashing, audit log, HttpOnly-cookie sessions.

## Known limitations (MVP)
- Shifts are stored using the UTC offset at save time; around daylight-saving changes, local hours shift by an hour until the agent re-saves.
- Billing shows weekly/monthly cost from contracted hours; there is no payment gateway (e.g. Stripe) yet.
- Live updates use short polling (4–20 s), not WebSockets. Fine for MVP; swap in Socket.IO if you need sub-second.
- No email/notification delivery; agents see tickets in the app.
