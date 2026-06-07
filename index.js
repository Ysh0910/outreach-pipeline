import 'dotenv/config';
import readline from 'readline';
import { searchLookalikeDomains } from './stages/ocean.js';
import { findDecisionMakers } from './stages/prospeo.js';
import { resolveEmails } from './stages/eazyreach.js';
import { sendEmails } from './stages/brevo.js';

const MAX_DOMAINS = 3;
const MAX_CONTACTS_PER_DOMAIN = 3;

// ── helpers ──────────────────────────────────────────────────────────────────

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

function printSeparator() {
  console.log('─'.repeat(60));
}

function printTable(contacts) {
  printSeparator();
  console.log(
    'Name'.padEnd(24) +
    'Title'.padEnd(30) +
    'Company'.padEnd(18) +
    'Email'
  );
  printSeparator();
  for (const c of contacts) {
    console.log(
      (c.name ?? '').slice(0, 23).padEnd(24) +
      (c.title ?? '').slice(0, 29).padEnd(30) +
      (c.company ?? '').slice(0, 17).padEnd(18) +
      (c.email ?? '')
    );
  }
  printSeparator();
}

function printEmailPreview(contact) {
  const senderEmail = process.env.BREVO_SENDER_EMAIL ?? 'yash@yshu.me';
  const firstName = contact.name?.trim().split(/\s+/)[0] ?? 'there';
  console.log(`\nEmail template preview (using first contact as example):`);
  printSeparator();
  console.log(`Subject : Quick question about ${contact.company}`);
  console.log(`To      : ${contact.name} <${contact.email}>`);
  console.log(`\nHi ${firstName},\n`);
  console.log(`${contact.company} is doing interesting work — noticed you're ${contact.title} there.\n`);
  console.log(`I'm building automated outreach tooling that helps teams find and reach decision makers without manual effort. Thought it might be worth a quick conversation.\n`);
  console.log(`Open for 15 minutes this week?\n`);
  console.log(`Yashwanth`);
  console.log(senderEmail);
  printSeparator();
}

// ── main ─────────────────────────────────────────────────────────────────────

const seedDomain = process.argv[2];

if (!seedDomain) {
  console.log('Usage: node index.js <seed-domain>');
  console.log('Example: node index.js stripe.com');
  process.exit(1);
}

console.log(`\n🚀 Starting outreach pipeline for: ${seedDomain}\n`);

// ── Stage 1 ──────────────────────────────────────────────────────────────────

console.log(`[Stage 1/4] Finding lookalike companies for "${seedDomain}"...`);
const allDomains = await searchLookalikeDomains(seedDomain, 10);

if (!allDomains.length) {
  console.error('[Stage 1/4] No lookalike domains found. Exiting.');
  process.exit(1);
}

const domains = allDomains.slice(0, MAX_DOMAINS);
console.log(`[Stage 1/4] Using ${domains.length} domains: ${domains.join(', ')}\n`);

// ── Stage 2 ──────────────────────────────────────────────────────────────────

console.log(`[Stage 2/4] Finding decision makers across ${domains.length} domains...`);
const allProspects = await findDecisionMakers(domains);

if (!allProspects.length) {
  console.error('[Stage 2/4] No decision makers found. Exiting.');
  process.exit(1);
}

// Cap to MAX_CONTACTS_PER_DOMAIN per domain
const prospectsByDomain = {};
const prospects = [];
for (const p of allProspects) {
  const count = prospectsByDomain[p.domain] ?? 0;
  if (count < MAX_CONTACTS_PER_DOMAIN) {
    prospects.push(p);
    prospectsByDomain[p.domain] = count + 1;
  }
}

console.log(`[Stage 2/4] Found ${prospects.length} decision makers (capped at ${MAX_CONTACTS_PER_DOMAIN}/domain)\n`);

// ── Stage 3 ──────────────────────────────────────────────────────────────────

console.log(`[Stage 3/4] Resolving emails for ${prospects.length} prospects...`);
const contacts = await resolveEmails(prospects);

if (!contacts.length) {
  console.error('[Stage 3/4] No emails resolved. Exiting.');
  process.exit(1);
}

console.log(`[Stage 3/4] Resolved ${contacts.length}/${prospects.length} emails\n`);

// ── Safety checkpoint ─────────────────────────────────────────────────────────

console.log(`\n📋 Summary — ${contacts.length} contacts ready to email:`);
printTable(contacts);
printEmailPreview(contacts[0]);

const answer = await ask(`\nSend emails to ${contacts.length} contact(s)? (yes/no): `);

if (answer !== 'yes' && answer !== 'y') {
  console.log('\nAborted. No emails sent.');
  process.exit(0);
}

// ── Stage 4 ──────────────────────────────────────────────────────────────────

console.log(`\n[Stage 4/4] Sending emails via Brevo...`);
const result = await sendEmails(contacts);

// ── Final report ──────────────────────────────────────────────────────────────

console.log('\n✅ Pipeline complete.');
printSeparator();
console.log(`Total contacts : ${result.total}`);
console.log(`Sent           : ${result.sent}`);
console.log(`Failed         : ${result.failed}`);
printSeparator();
