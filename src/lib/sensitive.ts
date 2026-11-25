/**
 * Decides whether a page looks private (health, money, sign-in, personal forms).
 * On such pages Lumen uses on-device AI only, unless the user allows the cloud.
 * This is a guess from the page's address, title, main heading and form fields.
 * It runs in the page itself, with no AI and no network call. It can miss private
 * pages, so "Only on my device" is there for people who want certainty.
 */
import { isHidden, nameOf } from './names';

export interface Sensitivity { sensitive: boolean; reasons: string[] }

/** Site-name beginnings and endings: "healthline", "mybank", "cityhospital". */
const HOST_PART = /^(bank|health|medic|hospital|clinic|pharma|patient|therap|insur|mychart)|(bank|banking|health|healthcare|medical|hospital|clinic|pharmacy|insurance|doctors?)$/;
const HOST_EXACT = new Set(['nhs', 'nih', 'webmail', 'mail', 'outlook', 'gmail', 'paypal', 'irs', 'hmrc', 'login', 'signin', 'accounts', 'account', 'auth', 'sso', 'portal', 'intranet']);

const PATH_WORDS = new Set([
  'login', 'signin', 'logon', 'account', 'accounts', 'myaccount', 'checkout', 'billing', 'payment', 'payments', 'inbox', 'statement', 'statements',
  'bank', 'banking', 'loan', 'loans', 'mortgage', 'debt', 'tax', 'taxes', 'benefits', 'welfare', 'pension', 'immigration', 'visa', 'asylum', 'legal',
  'health', 'medical', 'patient', 'patients', 'prescription', 'prescriptions', 'symptoms', 'diagnosis', 'conditions', 'treatment', 'appointments', 'results',
  'hiv', 'cancer', 'pregnancy', 'abortion', 'depression', 'suicide', 'addiction',
]);
/** Too common on ordinary sites to count alone ("match results", "terms and conditions"). */
const WEAK = new Set(['results', 'conditions', 'legal', 'treatment', 'benefits', 'accounts', 'statement', 'statements']);

const HEADING = /\b(sign in|log in|your account|account balance|bank statement|checkout|payment details|card details|test results?|lab results?|medical (?:record|history)|health record|prescriptions?|diagnosis|symptoms|mental health|your appointments?|patient|tax return|benefit claim|domestic (?:abuse|violence)|sexual health|self-harm|suicide|HIV|pregnancy|abortion|addiction|immigration status|asylum)\b/i;

const FIELD = /\b(passport|social security|ssn|national insurance|nhs number|date of birth|card number|cvv|cvc|sort code|account number|iban|medical|medication|diagnosis|symptoms?|allerg(?:y|ies)|disability|ethnicity|religion|salary|income)\b/i;

function privateNetwork(host: string): boolean {
  return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || /\.(local|internal|intranet|corp|lan)$/.test(host);
}

/** Reasons from the address alone. */
export function reasonsFromUrl(url: string): string[] {
  let u: URL;
  try { u = new URL(url); } catch { return []; }
  if (u.protocol === 'file:') return ['it is a file on your computer'];
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  const reasons: string[] = [];
  if (privateNetwork(host)) reasons.push('it is on a private network');
  const hit = host.split(/[.-]/).find((p) => HOST_EXACT.has(p) || HOST_PART.test(p));
  if (hit) reasons.push(`the site name includes "${hit}"`);
  const path = u.pathname.toLowerCase().split(/[^a-z]+/).filter(Boolean);
  const word = path.find((w) => PATH_WORDS.has(w) && !WEAK.has(w))
    ?? /sign-?in\b|log-?in\b|log-?on\b|test-?results|mental-?health|medical-?record/.exec(u.pathname.toLowerCase())?.[0];
  if (word && !hit) reasons.push(`the address includes "${word}"`);
  const weak = [...new Set(path.filter((w) => WEAK.has(w)))];
  if (!word && !hit && weak.length >= 2) reasons.push(`the address includes "${weak.slice(0, 2).join('" and "')}"`);
  return reasons;
}

/** Reasons from what is on the page. */
export function reasonsFromPage(doc: Document): string[] {
  const reasons: string[] = [];
  const visible = (el: Element) => !isHidden(el);
  if ([...doc.querySelectorAll('input[type="password"]')].some(visible)) reasons.push('it has a password field');
  if ([...doc.querySelectorAll('input[autocomplete^="cc-"], input[autocomplete*=" cc-"]')].some(visible)) reasons.push('it asks for card details');
  const field = [...doc.querySelectorAll('input:not([type="hidden"]), textarea, select')]
    .filter(visible)
    .map((el) => FIELD.exec(`${nameOf(el)} ${(el.getAttribute('name') ?? '').replace(/[_-]/g, ' ')}`)?.[0])
    .find(Boolean);
  if (field) reasons.push(`a form asks about "${field.toLowerCase()}"`);
  const heads = [doc.title, ...[...doc.querySelectorAll('h1')].filter(visible).map((h) => h.textContent ?? '')].join(' \n ');
  const topic = HEADING.exec(heads)?.[0];
  if (topic) reasons.push(`its title or main heading says "${topic.toLowerCase()}"`);
  return reasons;
}

export function checkSensitive(doc: Document, url: string): Sensitivity {
  const reasons = [...reasonsFromUrl(url), ...reasonsFromPage(doc)];
  return { sensitive: reasons.length > 0, reasons };
}
