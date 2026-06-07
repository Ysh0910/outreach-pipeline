# Outreach Pipeline

A CLI-based automated cold outreach pipeline. Give it a seed company domain — it finds lookalike companies, pulls decision makers, resolves their work emails, and sends personalized cold emails. All in one command.
Built as a take-home assignment for Vocallabs/Subspace SDE Intern role.

```
node index.js stripe.com
```

---

## How it works

```
seed domain
    │
    ▼
[Stage 1] Ocean.io        → finds lookalike company domains
    │
    ▼
[Stage 2] Prospeo         → finds C-suite / VP decision makers at each domain
    │
    ▼
[Stage 3] Eazyreach       → resolves verified work emails from LinkedIn URLs
    │
    ▼
  confirmation prompt     → shows summary table + email preview, asks yes/no
    │
    ▼
[Stage 4] Brevo           → sends personalized cold emails
```

---

## Setup

### 1. Clone and install

```bash
git clone https://github.com/Ysh0910/outreach-pipeline.git
cd outreach-pipeline
npm install
```

### 2. Configure environment variables

Create a `.env` file in the root:

```env
OCEAN_API_KEY=your_ocean_api_token
PROSPEO_API_KEY=your_prospeo_api_key
EAZYREACH_API_KEY=your_eazyreach_jwt_token
BREVO_API_KEY=your_brevo_api_key
BREVO_SENDER_NAME=Your Name
BREVO_SENDER_EMAIL=you@yourdomain.com
```

#### Getting each key

| Key | Where to get it |
|-----|----------------|
| `OCEAN_API_KEY` | [app.ocean.io](https://app.ocean.io) → Settings → API |
| `PROSPEO_API_KEY` | [app.prospeo.io/api](https://app.prospeo.io/api) |
| `EAZYREACH_API_KEY` | See note below |
| `BREVO_API_KEY` | [app.brevo.com](https://app.brevo.com) → Settings → API Keys |

**Eazyreach auth token** — Eazyreach uses short-lived JWT tokens. Generate one with:

```bash
node -e "fetch('https://api.superflow.run/b2b/createAuthToken/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ clientId: 'YOUR_CLIENT_ID', clientSecret: 'YOUR_CLIENT_SECRET' })
}).then(r => r.json()).then(console.log)"
```

Copy the `authToken` value into `.env` as `EAZYREACH_API_KEY`. Tokens expire in ~30 days — regenerate when needed.

Also whitelist your IP at [docs.eazyreach.app/ip-whitelist](https://docs.eazyreach.app/ip-whitelist) before making API calls.

---

## Usage

```bash
node index.js <seed-domain>
```

**Example:**

```bash
node index.js razorpay.com
```

The pipeline will:
1. Find up to 3 lookalike companies similar to `razorpay.com`
2. Find up to 3 C-suite / VP contacts per company
3. Resolve work emails via LinkedIn
4. Show a summary table and email preview
5. Ask for confirmation before sending anything

---

## Testing individual stages

Each stage can be run and tested independently:

```bash
# Stage 1 — Ocean.io lookalike search
node stages/ocean.js stripe.com

# Stage 2 — Prospeo decision maker search
node stages/prospeo.js

# Stage 3 — Eazyreach email resolution
node stages/eazyreach.js            # check auth + balance (free)
node stages/eazyreach.js --dry-run  # simulate with mock emails (free)
node stages/eazyreach.js --live     # real API calls (costs credits)

# Stage 4 — Brevo email send
node stages/brevo.js
```

---

## Project structure

```
outreach-pipeline/
├── index.js              # main entry point — wires all 4 stages
├── stages/
│   ├── ocean.js          # Stage 1: lookalike company discovery
│   ├── prospeo.js        # Stage 2: decision maker search
│   ├── eazyreach.js      # Stage 3: email resolution from LinkedIn
│   └── brevo.js          # Stage 4: cold email sending
├── .env                  # API keys (not committed)
└── package.json
```

---

## APIs used

| Stage | API | Purpose |
|-------|-----|---------|
| 1 | [Ocean.io](https://app.ocean.io) | Lookalike company search |
| 2 | [Prospeo](https://prospeo.io) | B2B contact search by domain |
| 3 | [Eazyreach](https://eazyreach.app) | LinkedIn → work email resolution |
| 4 | [Brevo](https://brevo.com) | Transactional email sending |

---

## Requirements

- Node.js v24+
- Active API accounts for all 4 services
- Eazyreach API wallet with credits (separate from studio credits)
