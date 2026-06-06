import 'dotenv/config';

const PROSPEO_API_URL = 'https://api.prospeo.io/search-person';

// Seniority levels we care about — C-suite and VP only
const TARGET_SENIORITIES = ['C-Suite', 'Vice President', 'Founder/Owner'];

// Delay helper
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Search Prospeo for decision makers at a single domain.
 * Retries once on rate limit with a longer backoff.
 * @param {string} apiKey
 * @param {string} domain
 * @param {number} page
 * @returns {Promise<{person, company}[]>}
 */
async function searchDomain(apiKey, domain, page = 1) {
  const body = {
    page,
    filters: {
      company: {
        websites: {
          include: [domain],
        },
      },
      person_seniority: {
        include: TARGET_SENIORITIES,
      },
    },
  };

  const response = await fetch(PROSPEO_API_URL, {
    method: 'POST',
    headers: {
      'X-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  // Rate limited — wait 10s and retry once
  if (response.status === 429) {
    console.warn(`[Prospeo] Rate limited on ${domain}. Waiting 10s before retry...`);
    await sleep(10000);
    return searchDomain(apiKey, domain, page);
  }

  const data = await response.json();

  if (data.error) {
    // NO_RESULTS is expected and non-fatal
    if (data.error_code === 'NO_RESULTS') return [];

    // Log the full error detail so we can debug filter issues
    const detail = data.filter_error ?? data.error_code ?? 'Unknown Prospeo error';
    throw new Error(detail);
  }

  return data.results ?? [];
}

/**
 * Stage 2 — Prospeo decision maker search
 * @param {string[]} domains - array of company domains from Stage 1
 * @returns {Promise<{name, title, linkedin_url, company, domain}[]>}
 */
export async function findDecisionMakers(domains) {
  const apiKey = process.env.PROSPEO_API_KEY;

  if (!apiKey) {
    console.error('[Prospeo] Missing PROSPEO_API_KEY in .env');
    return [];
  }

  if (!domains?.length) {
    console.error('[Prospeo] No domains provided');
    return [];
  }

  const allLeads = [];

  for (const domain of domains) {
    try {
      console.log(`[Prospeo] Searching decision makers at ${domain}...`);

      const results = await searchDomain(apiKey, domain);

      const leads = results.map(({ person, company }) => ({
        name: person.full_name ?? `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim(),
        title: person.current_job_title ?? null,
        linkedin_url: person.linkedin_url ?? null,
        company: company?.name ?? null,
        domain,
      }));

      console.log(`[Prospeo] Found ${leads.length} decision makers at ${domain}`);
      allLeads.push(...leads);

    } catch (err) {
      console.error(`[Prospeo] Failed for ${domain}: ${err.message} — skipping`);
    }

    // Polite delay between domains to avoid rate limits
    if (domains.indexOf(domain) < domains.length - 1) {
      await sleep(1000);
    }
  }

  console.log(`[Prospeo] Total decision makers found: ${allLeads.length} across ${domains.length} domains`);
  return allLeads;
}

// --- Quick test: run `node stages/prospeo.js` to execute this block ---
const isMain = process.argv[1].endsWith('prospeo.js');
if (isMain) {
  const testDomains = ['razorpay.com', 'cashfree.com'];
  console.log(`[Prospeo] Testing with domains: ${testDomains.join(', ')}\n`);

  const leads = await findDecisionMakers(testDomains);

  if (leads.length > 0) {
    console.log('\n[Prospeo] Sample results:');
    leads.forEach((lead, i) => {
      console.log(`  ${i + 1}. ${lead.name} — ${lead.title}`);
      console.log(`     Company: ${lead.company} (${lead.domain})`);
      console.log(`     LinkedIn: ${lead.linkedin_url ?? 'N/A'}`);
    });
  } else {
    console.log('[Prospeo] No leads returned — check your API key and domains.');
  }
}
