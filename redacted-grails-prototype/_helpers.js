// Shared pure utilities for route modules. No side effects on import.

export function recencyScore(createdAt) {
  if (!createdAt) return 0.5;
  const t = new Date(createdAt).getTime();
  if (isNaN(t)) return 0.5;
  const daysOld = (Date.now() - t) / 86400000;
  if (daysOld < 0) return 1.0;
  return Math.max(0.3, 1.0 - daysOld / 60);  // 0d=1.0, 30d=0.5, 60d+=0.3 floor
}

export function jaccardScore(a, b) {
  const sa = new Set(a || []), sb = new Set(b || []);
  if (!sa.size || !sb.size) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}

export function entityMatchScore(query, row) {
  if (!query) return 0;
  const q = query.toLowerCase();
  let hits = 0;
  for (const field of ['author_name', 'author_handle', 'source_domain']) {
    const v = (row[field] || '').toLowerCase();
    if (v && v.length >= 3 && q.includes(v)) hits++;
  }
  return Math.min(1.0, hits / 2);  // 2 entity hits = full score
}

export function titleHasQueryToken(query, title) {
  if (!query || !title) return false;
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 3);
  if (!tokens.length) return false;
  const lt = title.toLowerCase();
  for (const tok of tokens) {
    const idx = lt.indexOf(tok);
    if (idx === -1) continue;
    const before = idx === 0 ? '' : lt[idx - 1];
    const after = idx + tok.length >= lt.length ? '' : lt[idx + tok.length];
    const isBoundary = (c) => !c || /[^a-z0-9]/.test(c);
    if (isBoundary(before) && isBoundary(after)) return true;
  }
  return false;
}

export function titleMatchScore(query, row) {
  // Fraction of query tokens (>=3 chars) that hit the row title at word
  // boundaries. Boosts named-entity recall (AVBLOX, Jeremy England) and
  // long-page recall (dramedy formula) where pure cosine is dominated by
  // body vocabulary. Returns [0, 1].
  if (!query || !row?.title) return 0;
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter(t => t.length >= 3);
  if (!tokens.length) return 0;
  const title = row.title.toLowerCase();
  let hits = 0;
  for (const tok of tokens) {
    // Word-boundary substring match: tok must be flanked by non-alphanumeric
    // chars (or string ends) in the title. Avoids 'avb' matching 'avblox'
    // partial; requires whole-word title hits.
    const idx = title.indexOf(tok);
    if (idx === -1) continue;
    const before = idx === 0 ? '' : title[idx - 1];
    const after = idx + tok.length >= title.length ? '' : title[idx + tok.length];
    const isBoundary = (c) => !c || /[^a-z0-9]/.test(c);
    if (isBoundary(before) && isBoundary(after)) hits++;
  }
  return hits / tokens.length;
}

export function extractUrls(text) {
  const urlRegex = /https?:\/\/[^\s)>"]+/g;
  return [...new Set(text.match(urlRegex) || [])];
}

export function detectCharacterPopulateIntent(message) {
  const msg = message.toLowerCase();
  const populateKeywords = ['populate', 'fill in', 'character sheet', 'what do we have on', 'what\'s on', 'pull up', 'pull the'];
  const hasPopulateKeyword = populateKeywords.some(k => msg.includes(k));
  if (!hasPopulateKeyword) return null;

  const charPatterns = [
    { key: 'zach', name: 'Zach', patterns: ['zach'] },
    { key: 'togg', name: 'Togg', patterns: ['togg', 'gregg'] },
    { key: 'jw', name: 'Jae-Wook', patterns: ['jae-wook', 'jae wook', 'jaewook', 'jae', ' jw ', "'jw'", '"jw"'] },
    { key: 'elizabeth', name: 'Elizabeth', patterns: ['elizabeth', ' zab', "'zab'"] },
    { key: 'hye-jin', name: 'Hye-Jin', patterns: ['hye-jin', 'hye jin', 'hyejin', 'hye'] },
    { key: 'deja', name: 'Deja', patterns: ['deja', 'déja'] },
  ];

  for (const char of charPatterns) {
    if (char.patterns.some(p => msg.includes(p))) {
      return { charKey: char.key, charName: char.name };
    }
  }
  return null;
}

export function escapeRegex(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

export function cosineSimilarity(a, b) {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-10);
}

export function canonicalizeUrl(input) {
  try {
    const u = new URL(input);
    const dropExact = ['s', 't', 'ref', 'src', 'source', 'fbclid', 'gclid', 'mc_cid', 'mc_eid'];
    const dropPrefixes = ['utm_'];
    const params = u.searchParams;
    const toDelete = [];
    for (const k of params.keys()) {
      const lk = k.toLowerCase();
      if (dropExact.includes(lk) || dropPrefixes.some(p => lk.startsWith(p))) toDelete.push(k);
    }
    for (const k of toDelete) params.delete(k);
    u.hash = '';  // strip fragment — same content, different scroll target
    return u.toString();
  } catch {
    return input;
  }
}
