import 'dotenv/config';

const EAZYREACH_API_URL = 'https://api.superflow.run/b2b/linkedin-emails';

// Conservative delay between calls — no rate limit documented, 1.5s is safe
const DELAY_MS = 1500;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Pick the best email from the emails array.
 * Prefers 'verified' over 'probable'. Returns null if array is empty.
 * @param {{ email: string, verification: string, source: string }[]} emails
 * @returns {string|null}
 */
function pickBestEmail(emails) {
  if (!emails?.length) return null;
  const verified = emails.find((e) => e.verification === 'verified');
  const probable = emails.find((e) => e.verification === 'probable');
  return (verified ?? probable ?? emails[0]).email;
}

/**
 * Resolve work email for a single LinkedIn URL.
 * @param {string} authToken
 * @param {string} linkedinUrl
 * @returns {Promise<string|null>} - resolved email or null
 */
async function resolveEmail(authToken, linkedinUrl) {
  const response = await fetch(EAZYREACH_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({ linkedinUrl }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = body.message ?? response.statusText ?? 'Unknown error';

    // Their API returns 401 for both auth failures AND insufficient balance
    // Distinguish by checking the message content
    if (response.status === 401) {
      if (message.toLowerCase().includes('insufficient balance') || message.toLowerCase().includes('balance')) {
        throw new Error('Insufficient balance — top up your Eazyreach API wallet (separate from studio credits)');
      }
      throw new Error('Unauthorized — check your EAZYREACH_API_KEY');
    }

    switch (response.status) {
      case 400: throw new Error(`Invalid LinkedIn URL: ${message}`);
      case 402: throw new Error('Insufficient balance — top up your Eazyreach API wallet');
      case 404: throw new Error('LinkedIn profile not found');
      default:  throw new Error(`HTTP ${response.status}: ${message}`);
    }
  }

  const data = await response.json();

  // Response is { emails: ["email@domain.com", ...] } — flat string array
  // (docs say objects with verification field but actual API returns strings)
  const emails = data.emails ?? [];
  if (!emails.length) return null;

  return emails[0]; // first email is the best match
}

/**
 * Stage 3 — Eazyreach email resolution
 * @param {{ name: string, title: string, linkedin_url: string, company: string, domain: string }[]} prospects
 * @returns {Promise<{ name, title, linkedin_url, company, domain, email }[]>}
 */
export async function resolveEmails(prospects) {
  const authToken = process.env.EAZYREACH_API_KEY;

  if (!authToken) {
    console.error('[Eazyreach] Missing EAZYREACH_API_KEY in .env');
    return [];
  }

  if (!prospects?.length) {
    console.error('[Eazyreach] No prospects provided');
    return [];
  }

  const resolved = [];

  for (let i = 0; i < prospects.length; i++) {
    const prospect = prospects[i];
    const { name, linkedin_url } = prospect;

    if (!linkedin_url) {
      console.warn(`[Eazyreach] No LinkedIn URL for ${name} — skipping`);
      continue;
    }

    try {
      console.log(`[Eazyreach] (${i + 1}/${prospects.length}) Resolving email for ${name}...`);

      const email = await resolveEmail(authToken, linkedin_url);

      if (!email) {
        console.warn(`[Eazyreach] No email found for ${name} — skipping`);
        continue;
      }

      console.log(`[Eazyreach] ✓ ${name} → ${email}`);
      resolved.push({ ...prospect, email });

    } catch (err) {
      // Insufficient balance — stop and return what we have so far
      if (err.message.includes('Insufficient balance')) {
        console.warn(`[Eazyreach] Credits exhausted — resolved ${resolved.length}/${prospects.length} emails`);
        return resolved;
      }
      // Auth failure — no point continuing
      if (err.message.includes('Unauthorized')) {
        console.error(`[Eazyreach] Fatal error: ${err.message}`);
        return resolved;
      }
      console.error(`[Eazyreach] Failed for ${name}: ${err.message} — skipping`);
    }

    // Delay between calls, skip after last one
    if (i < prospects.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  console.log(`[Eazyreach] Resolved ${resolved.length}/${prospects.length} emails`);
  return resolved;
}

/**
 * Checks auth and wallet balance without spending any credits.
 * Run anytime to confirm your API key is valid.
 */
async function checkAuth() {
  const authToken = process.env.EAZYREACH_API_KEY;
  if (!authToken) {
    console.error('[Eazyreach] Missing EAZYREACH_API_KEY in .env');
    return;
  }

  console.log('[Eazyreach] Checking API key and wallet balance...');
  try {
    const res = await fetch('https://api.superflow.run/b2b/getGreenBalance', {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${authToken}` },
    });

    const data = await res.json();

    // Their balance endpoint returns 401 status even on success (API bug)
    // Check for actual auth failure by looking at the message content
    if (data.message === 'Invalid authorization token.') {
      console.error('[Eazyreach] ✗ Auth failed — API key is invalid or expired');
      return;
    }

    // amount field present means we got a real response
    const balance = data.amount ?? data.balance ?? 0;
    console.log(`[Eazyreach] ✓ Auth OK — Wallet balance: ${balance}`);
  } catch (err) {
    console.error(`[Eazyreach] ✗ Network error: ${err.message}`);
  }
}

/**
 * Dry-run mode — simulates the full resolveEmails flow with fake emails.
 * No API calls made, no credits spent. Use to verify data shape is correct.
 */
async function dryRun(prospects) {
  console.log('[Eazyreach] DRY RUN MODE — no real API calls, no credits spent\n');

  const fakeResults = prospects
    .filter((p) => p.linkedin_url)
    .map((p) => {
      const handle = p.linkedin_url.split('/in/')[1]?.replace(/\/$/, '') ?? 'unknown';
      const fakeEmail = `${handle.split('-')[0]}@${p.domain}`;
      console.log(`[Eazyreach] (mock) ${p.name} → ${fakeEmail}`);
      return { ...p, email: fakeEmail };
    });

  console.log(`\n[Eazyreach] Dry run complete — ${fakeResults.length}/${prospects.length} would resolve`);
  console.log('[Eazyreach] Output shape:');
  console.log(JSON.stringify(fakeResults[0], null, 2));
  return fakeResults;
}

// --- Test runner ---
// node stages/eazyreach.js            → checks auth + wallet balance (free, no credits)
// node stages/eazyreach.js --dry-run  → simulates full flow with mock emails
// node stages/eazyreach.js --live     → real API calls (costs credits)
const isMain = process.argv[1].endsWith('eazyreach.js');
if (isMain) {
  const mode = process.argv[2];

  const testProspects = [
    {
      name: 'Harshil Mathur',
      title: 'CEO & Co-Founder',
      linkedin_url: 'https://www.linkedin.com/in/harshilmathur',
      company: 'Razorpay',
      domain: 'razorpay.com',
    },
    {
      name: 'Vivek Agarwal',
      title: 'Vice President of Engineering',
      linkedin_url: 'https://www.linkedin.com/in/vivek-agarwal-03575711',
      company: 'Razorpay',
      domain: 'razorpay.com',
    },
  ];

  if (mode === '--dry-run') {
    await dryRun(testProspects);

  } else if (mode === '--live') {
    console.log('[Eazyreach] LIVE MODE — real API calls, credits will be spent\n');
    const results = await resolveEmails(testProspects);
    if (results.length > 0) {
      console.log('\n[Eazyreach] Results:');
      results.forEach((r, i) => {
        console.log(`  ${i + 1}. ${r.name} — ${r.email}`);
        console.log(`     Title: ${r.title}`);
        console.log(`     Company: ${r.company} (${r.domain})`);
      });
    }

  } else {
    // Default: just check auth and balance, spend nothing
    await checkAuth();
    console.log('\nTo test the full flow:');
    console.log('  node stages/eazyreach.js --dry-run   (no credits needed)');
    console.log('  node stages/eazyreach.js --live      (uses real credits)');
  }
}
