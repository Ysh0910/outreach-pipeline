import 'dotenv/config';

const OCEAN_API_URL = 'https://api.ocean.io/v3/search/companies';

/**
 * Stage 1 — Ocean.io lookalike search
 * @param {string} seedDomain - e.g. 'apple.com'
 * @param {number} size - number of lookalike results to fetch (default 50, max 10000)
 * @returns {Promise<string[]>} - clean array of company domains
 */
export async function searchLookalikeDomains(seedDomain, size = 50) {
  const apiKey = process.env.OCEAN_API_KEY;

  if (!apiKey) {
    console.error('[Ocean] Missing OCEAN_API_KEY in .env');
    return [];
  }

  if (!seedDomain) {
    console.error('[Ocean] No seed domain provided');
    return [];
  }

  try {
    const response = await fetch(OCEAN_API_URL, {
      method: 'POST',
      headers: {
        'x-api-token': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        size,
        companiesFilters: {
          lookalikeDomains: [seedDomain],
        },
        // only fetch what we need — saves bandwidth and credits
        fields: ['domain', 'name'],
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const detail = errorBody.detail ?? 'Unknown error';

      switch (response.status) {
        case 400:
          console.error(`[Ocean] Bad request: ${detail}`);
          break;
        case 402:
          console.error(`[Ocean] Insufficient credits — top up your Ocean.io account`);
          break;
        case 403:
          console.error(`[Ocean] Auth failed: ${detail}`);
          break;
        case 422:
          // detail is an array of validation errors in this case
          const msgs = Array.isArray(detail)
            ? detail.map((e) => `${e.loc?.join('.')} — ${e.msg}`).join('; ')
            : detail;
          console.error(`[Ocean] Validation error: ${msgs}`);
          break;
        default:
          console.error(`[Ocean] API error ${response.status}: ${detail}`);
      }

      return [];
    }

    const data = await response.json();

    // each item shape: { company: { domain, name, ... }, relevance: "A" }
    const domains = (data.companies ?? [])
      .map((item) => item.company?.domain)
      .filter(Boolean);

    console.log(`[Ocean] Found ${domains.length} lookalike domains for "${seedDomain}" (total available: ${data.total ?? '?'})`);

    if (data.missingDomains && Object.keys(data.missingDomains).length > 0) {
      console.warn(`[Ocean] Seed domain issues:`, data.missingDomains);
    }

    return domains;
  } catch (err) {
    console.error(`[Ocean] Unexpected error: ${err.message}`);
    return [];
  }
}
