import 'dotenv/config';

const BREVO_API_URL = 'https://api.brevo.com/v3/smtp/email';
const DELAY_MS = 1000;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * @param {string} fullName
 * @returns {string}
 */
function firstName(fullName) {
  return fullName?.trim().split(/\s+/)[0] || 'there';
}

/**
 * Build personalized subject and body for a contact.
 * @param {{ name: string, title: string, company: string }} contact
 * @param {string} senderName
 * @returns {{ subject: string, htmlContent: string, textContent: string }}
 */
function buildEmail(contact, senderName, senderEmail) {
  const { name, title, company } = contact;
  const greeting = firstName(name);

  const subject = `Quick question about ${company}`;

  const textContent = `Hi ${greeting},

${company} is doing interesting work — noticed you're ${title} there.

I'm building automated outreach tooling that helps teams find and reach decision makers without manual effort. Thought it might be worth a quick conversation.

Open for 15 minutes this week?

Yashwanth
${senderEmail}`;

  const htmlContent = `<html><body>
<p>Hi ${greeting},</p>
<p>${company} is doing interesting work — noticed you're ${title} there.</p>
<p>I'm building automated outreach tooling that helps teams find and reach decision makers without manual effort. Thought it might be worth a quick conversation.</p>
<p>Open for 15 minutes this week?</p>
<p>Yashwanth<br>${senderEmail}</p>
</body></html>`;

  return { subject, htmlContent, textContent };
}

/**
 * Send a single transactional email via Brevo.
 * @param {string} apiKey
 * @param {{ name: string, email: string }} sender
 * @param {{ name: string, title: string, company: string, email: string }} contact
 * @returns {Promise<{ messageId: string }>}
 */
async function sendOneEmail(apiKey, sender, contact) {
  const { subject, htmlContent, textContent } = buildEmail(contact, sender.name, sender.email);

  const response = await fetch(BREVO_API_URL, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': apiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { name: sender.name, email: sender.email },
      to: [{ email: contact.email, name: contact.name }],
      subject,
      htmlContent,
      textContent,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (response.status !== 201) {
    const detail = data.message ?? data.code ?? `HTTP ${response.status}`;
    throw new Error(detail);
  }

  return data;
}

/**
 * Stage 4 — Brevo cold outreach email send
 * @param {{ name: string, title: string, email: string, company: string, domain: string, linkedin_url: string }[]} contacts
 * @returns {Promise<{ sent: number, failed: number, total: number }>}
 */
export async function sendEmails(contacts) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderName = process.env.BREVO_SENDER_NAME;
  const senderEmail = process.env.BREVO_SENDER_EMAIL;

  if (!apiKey || !senderName || !senderEmail) {
    console.error('[Brevo] Missing BREVO_API_KEY, BREVO_SENDER_NAME, or BREVO_SENDER_EMAIL in .env');
    return { sent: 0, failed: 0, total: contacts?.length ?? 0 };
  }

  if (!contacts?.length) {
    console.error('[Brevo] No contacts provided');
    return { sent: 0, failed: 0, total: 0 };
  }

  const sender = { name: senderName, email: senderEmail };
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < contacts.length; i++) {
    const contact = contacts[i];

    if (!contact.email) {
      failed++;
      console.error(`[Brevo] FAILED — ${contact.name ?? 'Unknown'}: no email address`);
      continue;
    }

    try {
      const result = await sendOneEmail(apiKey, sender, contact);
      sent++;
      console.log(`[Brevo] SENT — ${contact.name} <${contact.email}> (messageId: ${result.messageId})`);
    } catch (err) {
      failed++;
      console.error(`[Brevo] FAILED — ${contact.name} <${contact.email}>: ${err.message}`);
    }

    if (i < contacts.length - 1) {
      await sleep(DELAY_MS);
    }
  }

  const total = contacts.length;
  console.log(`[Brevo] Done — ${sent} sent, ${failed} failed, ${total} total`);
  return { sent, failed, total };
}

// --- Quick test: run `node stages/brevo.js` to execute this block ---
const isMain = process.argv[1].endsWith('brevo.js');
if (isMain) {
  const testContacts = [
    {
      name: 'Harshil Mathur',
      title: 'CEO & Co-Founder',
      email: 'yash59109845@gmail.com',
      company: 'Razorpay',
      domain: 'razorpay.com',
      linkedin_url: 'https://www.linkedin.com/in/harshilmathur',
    },
    {
      name: 'Sameer Nigam',
      title: 'CEO & Co-Founder',
      email: 'yash59109845@gmail.com',
      company: 'PhonePe',
      domain: 'phonepe.com',
      linkedin_url: 'https://www.linkedin.com/in/sameernigam',
    },
  ];

  console.log(`[Brevo] Testing with ${testContacts.length} contacts (both → yash59109845@gmail.com)\n`);

  const result = await sendEmails(testContacts);
  console.log('\n[Brevo] Result:', result);
}
