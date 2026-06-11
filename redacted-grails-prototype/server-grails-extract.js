// GRAILS server-side code extracted from redacted/app/server.js (prototype, 2026-06-11)
// --- table schemas ---
// watcher process holds the lock -> 500s returned as JSON (not logged)
// -> bulk UI shows '0 ok, N failed'. Found 2026-06-10 live.
db.pragma('busy_timeout = 5000');

// Ensure schema exists
db.exec(`
CREATE TABLE IF NOT EXISTS grails_character_index (
  char_key    TEXT PRIMARY KEY,
  char_name   TEXT NOT NULL,
  content     TEXT NOT NULL,
  indexed_at  TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS grails_beat_index (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  beat_n      INTEGER NOT NULL,
  content     TEXT NOT NULL,
  metadata    TEXT,
  indexed_at  TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS redacted_quests (
  id            TEXT PRIMARY KEY,
  title         TEXT NOT NULL,
// --- BEATS_JSON_PATH + /api/grails-edit + character index ---
  res.json({ saved: true, filename });
});

// ── Grails Beats JSON API ─────────────────────────────────────
const BEATS_JSON_PATH = join(__dirname, 'public', 'grails-beats.json');

// GET /api/beats — serve the beats JSON
app.get('/api/beats', (req, res) => {
  try {
    const data = fs.readFileSync(BEATS_JSON_PATH, 'utf-8');
    res.json(JSON.parse(data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/beats/:id — update a single beat by id slug
app.post('/api/beats/:id', (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ error: 'request body must be a JSON object of fields to update' });
    }
    const data = JSON.parse(fs.readFileSync(BEATS_JSON_PATH, 'utf-8'));
    const idx = data.findIndex(b => b.id === id);
    if (idx === -1) return res.status(404).json({ error: `Beat not found: ${id}` });
    // Merge updates — only allow known fields, never overwrite id/position
    const ALLOWED = ['title','sequence','act','connector','connector_type','loc','chars',
      'plot_goal','char_goal','act_desc','opposition','stakes','zen','entertainment',
      'story_spine','fountain_file','comingsoon'];
    ALLOWED.forEach(field => {
      if (updates[field] !== undefined) data[idx][field] = updates[field];
    });
    fs.writeFileSync(BEATS_JSON_PATH, JSON.stringify(data, null, 2));
    res.json({ updated: true, beat: data[idx] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Grails Beat Edit Endpoint ─────────────────────────────────
// Takes current beat data + user note, returns JSON field edits
app.post('/api/grails-edit', async (req, res) => {
  const { note, beat } = req.body;
  if (!note || !beat) return res.status(400).json({ error: 'note and beat required' });

  const systemPrompt = `You are Coywolf, a collaborative screenwriter working on GRAILS — a sports memorabilia heist film.
The user will describe a change they want made to the current beat. You must respond with ONLY a valid JSON object (no markdown, no explanation) containing the fields to update.

Available fields: loc, chars, pg, cg, act_desc, opp, stakes
Only include fields that should change. Values are plain text strings.

Example response:
{"opp":"Zach's hands shake as he sets the box down — he knows this is the last clean thing he'll ever touch.","pg":"Get out before Kevin sees what he's done."}`;

  const userPrompt = `Current beat:
BEAT ${beat.n} — ${beat.title}
Location: ${beat.loc}
Characters: ${beat.chars}
Plot Goal: ${beat.pg}
Character Goal: ${beat.cg}
The Action: ${beat.act_desc}
The Opposition: ${beat.opp}
Stakes: ${beat.stakes}

User's note / requested change:
${note}

Respond with only the JSON of field(s) to update.`;

  try {
    const gwRes = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GATEWAY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.redacted_CHAT_MODEL || 'opus',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: false,
        user: 'redacted-grails-edit'
      })
    });
    const data = await gwRes.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    // Strip any markdown code fences if model wraps it
    const cleaned = raw.replace(/^```json?\s*/i,'').replace(/\s*```$/,'').trim();
    let edits;
    try { edits = JSON.parse(cleaned); } catch { edits = {}; }
    res.json({ edits });
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Character Edit Endpoint ───────────────────────────────────────────────

app.post('/api/character-edit', async (req, res) => {
  const { character, tag, note, doc, charKey } = req.body;
  if (!note || !doc) return res.status(400).json({ error: 'note and doc required' });

  const systemPrompt = `You are Coywolf, a collaborative screenwriter working on GRAILS.
The user will give you notes about a character. You must return a JSON object with two keys:
1. "updates": an object of field keys → new prose values (only include fields that should change)
2. "reply": a short 1-2 sentence response acknowledging what you changed and why

Available field keys: name, tag, vibe, visual, world, flaw, backstory, show_journey, identity, hustle, question, philosophy,
and PRIEPIOTS fields: prio_P, prio_R, prio_I, prio_E, prio_P2, prio_I2, prio_O, prio_T, prio_S

Write prose in the style of a prestige TV character description — vivid, specific, economical. No bullet points.
Respond with ONLY valid JSON (no markdown, no explanation).

Example: {"updates":{"backstory":"Zach grew up in the shadow of his father's shop..."},"reply":"Added backstory grounding Zach in the shop's history."}`;

  const userPrompt = `Character: ${character} — ${tag}

Current document:
${doc}

User's notes / requested change:
${note}

Return JSON with "updates" and "reply".`;

  try {
    const gwRes = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GATEWAY_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: process.env.redacted_CHAT_MODEL || 'opus',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        stream: false,
        user: 'redacted-character-edit'
      })
    });
    const data = await gwRes.json();
    const raw = data.choices?.[0]?.message?.content || '{}';
    const cleaned = raw.replace(/^```json?\s*/i,'').replace(/\s*```$/,'').trim();
    let result;
    try { result = JSON.parse(cleaned); } catch { result = { updates: {}, reply: 'Could not parse response.' }; }

    // Write back to coywolffuturist/scripts + update SQLite cache
    if (result.updates && Object.keys(result.updates).length > 0 && charKey && CHAR_KEY_TO_FILE[charKey]) {
      try {
        const { content: currentMd } = await getGitHubFileSha(CHAR_KEY_TO_FILE[charKey]);
        const updatedMd = applyUpdatesToMarkdown(currentMd, result.updates);
        await commitCharacterToGitHub(charKey, character, updatedMd);
        // Refresh SQLite cache
        db.prepare(`INSERT OR REPLACE INTO grails_character_index (char_key, char_name, content, indexed_at)
                    VALUES (?, ?, ?, datetime('now'))`).run(charKey, character, updatedMd);
        result.committed = true;
      } catch (commitErr) {
        console.error('Character write-back failed:', commitErr.message);
        result.committed = false;
        result.commitError = commitErr.message;
      }
    }

    res.json(result);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Overview Edit Endpoint ────────────────────────────────────────────────

app.post('/api/overview-edit', async (req, res) => {
  const { note, doc } = req.body;
  if (!note || !doc) return res.status(400).json({ error: 'note and doc required' });

  const systemPrompt = `You are Coywolf, a collaborative screenwriter working on GRAILS — a prestige TV series pitch.
The user will give you notes about the series overview document. Return a JSON object with:
1. "updates": an object of field keys → new prose values (only include fields that should change)
2. "reply": a short 1-2 sentence response

Available field keys: title, logline, world, tone, theme, promise, audience, format, notes

Write in the voice of a compelling prestige TV pitch — vivid, specific, confident. Like the Dynamic pitch provided as a model: punchy paragraphs, comparables that do real work, a clear promise to the audience.
Respond with ONLY valid JSON. No markdown, no explanation.`;

  const userPrompt = `Current overview document:\n${doc}\n\nUser's notes:\n${note}\n\nReturn JSON with "updates" and "reply".`;

  try {
    const gwRes = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${GATEWAY_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.redacted_CHAT_MODEL || 'opus',
        messages: [
          { role: 'system', content: systemPrompt },
// --- character index get + /api/grails/* ---
  });
  if (!res.ok) throw new Error(`GitHub fetch failed for ${filePath}: ${res.status}`);
  const data = await res.json();
  if (!data.content) throw new Error(`No content in GitHub response for ${filePath}`);
  return Buffer.from(data.content, 'base64').toString('utf-8');
}

// POST /api/characters/index — fetch from GitHub and store in SQLite
app.post('/api/characters/index', async (req, res) => {
  const results = [];
  for (const char of CHARACTER_FILES) {
    try {
      const content = await fetchCharacterFile(char.file);
      db.prepare(`INSERT OR REPLACE INTO grails_character_index (char_key, char_name, content, indexed_at)
                  VALUES (?, ?, ?, datetime('now'))`).run(char.charKey, char.charName, content);
      results.push({ charKey: char.charKey, charName: char.charName, indexed: true, contentLength: content.length });
      console.log(`Indexed character: ${char.charName}`);
    } catch (e) {
      results.push({ charKey: char.charKey, charName: char.charName, indexed: false, error: e.message });
      console.error(`Error indexing character ${char.charName}:`, e.message);
    }
    await new Promise(r => setTimeout(r, 500));
  }
  const indexed = results.filter(r => r.indexed).length;
  const failed = results.filter(r => !r.indexed).length;
  if (indexed > 0) setImmediate(() => gitCommit(`characters: re-index ${indexed} files`));
  res.json({ success: true, indexed, failed, results });
});

// POST /api/characters/search — text search over character index (SQLite)
app.post('/api/characters/search', (req, res) => {
  const { query, charKey } = req.body;
  if (!query) return res.status(400).json({ error: 'query required' });
  try {
    let rows;
    if (charKey) {
      rows = db.prepare('SELECT char_key, char_name, content FROM grails_character_index WHERE char_key = ?').all(charKey);
    } else {
      rows = db.prepare('SELECT char_key, char_name, content FROM grails_character_index').all();
    }
    const hits = rows.map(row => ({
      charKey: row.char_key,
      charName: row.char_name,
      score: 1.0,
      contentSnippet: row.content.slice(0, 500),
      content: row.content
    }));
    res.json({ results: hits, query });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── GRAILS Semantic Search ────────────────────────────────────

// Helper: embed text with Gemini
async function geminiEmbed(text) {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'models/gemini-embedding-001',
      content: { parts: [{ text }] }
    })
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini embed error: ${err}`);
  }
  const data = await res.json();
  return data.embedding.values; // 768-dim array
}

// GET /api/grails/beats — returns parsed BEATS array as JSON (from JSON file)
app.get('/api/grails/beats', (req, res) => {
  try {
    const data = fs.readFileSync(BEATS_JSON_PATH, 'utf-8');
    res.json(JSON.parse(data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/grails/index — index all beats into SQLite
app.post('/api/grails/index', (req, res) => {
  try {
    const beatsRaw = JSON.parse(fs.readFileSync(BEATS_JSON_PATH, 'utf-8'));
    const beats = beatsRaw.map(b => ({
      n: b.position, seq: b.sequence, actLabel: b.act,
      title: b.title, loc: b.loc, chars: b.chars,
      pg: b.plot_goal, cg: b.char_goal, act_desc: b.act_desc, opp: b.opposition, stakes: b.stakes,
      comingsoon: b.comingsoon || false
    }));

    db.prepare('DELETE FROM grails_beat_index').run();
    const insert = db.prepare(`INSERT INTO grails_beat_index (beat_n, content, metadata, indexed_at) VALUES (?, ?, ?, datetime('now'))`);
    const results = [];
    const insertAll = db.transaction(() => {
      for (const beat of beats) {
        if (beat.comingsoon) { results.push({ beatN: beat.n, skipped: true }); continue; }
        const textBlob = [
          `Beat ${beat.n}: ${beat.title}`, `Seq: ${beat.seq}`, `Act: ${beat.actLabel}`,
          `Location: ${beat.loc}`, `Characters: ${beat.chars}`,
          `Plot Goal: ${beat.pg}`, `Character Goal: ${beat.cg}`,
          `The Action: ${beat.act_desc}`, `The Opposition: ${beat.opp}`, `Stakes: ${beat.stakes}`
        ].join('\n');
        insert.run(beat.n, textBlob, JSON.stringify({ title: beat.title, seq: beat.seq, actLabel: beat.actLabel, chars: beat.chars }));
        results.push({ beatN: beat.n, title: beat.title, indexed: true });
      }
    });
    insertAll();
    const indexed = results.filter(r => r.indexed).length;
    const skipped = results.filter(r => r.skipped).length;
    setImmediate(() => gitCommit(`beats: re-index ${indexed} beats`));
    res.json({ success: true, indexed, skipped, failed: 0, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/grails/search — text search over indexed beats (SQLite)
app.post('/api/grails/search', (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'query required' });
  try {
    const rows = db.prepare('SELECT beat_n, content, metadata FROM grails_beat_index').all();
    const q = query.toLowerCase();
    const scored = rows
      .map(row => {
        const meta = row.metadata ? JSON.parse(row.metadata) : {};
        const score = (row.content.toLowerCase().match(new RegExp(q.split(' ').join('|'), 'g')) || []).length;
        return { beatN: row.beat_n, title: meta.title||'', seq: meta.seq||'', actLabel: meta.actLabel||'', score, content: row.content };
      })
      .filter(r => r.score > 0)
      .sort((a,b) => b.score - a.score)
      .slice(0, 3);
    res.json({ results: scored, query });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/goals/:id/ka — toggle Ka123n mode on/off
app.post('/api/goals/:id/ka', (req, res) => {
  try {
    const row = db.prepare(
      `UPDATE redacted_goals SET ka123n_on = CASE WHEN COALESCE(ka123n_on, 0) = 0 THEN 1 ELSE 0 END WHERE id = ? RETURNING id, ka123n_on`
    ).get(req.params.id);
    if (!row) return res.status(404).json({ error: 'Goal not found' });
    res.json({ id: row.id, ka123n_on: !!row.ka123n_on });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// PATCH /api/goals/:id
app.patch('/api/goals/:id', (req, res) => {
  const { status, outcome } = req.body;
  if (!['active','complete','discarded'].includes(status)) return res.status(400).json({ error: 'status must be active, complete, or discarded' });
  try {
    const current = db.prepare('SELECT * FROM redacted_goals WHERE id=?').get(req.params.id);
    if (!current) return res.status(404).json({ error: 'Goal not found' });
    const completed_at = (status === 'complete' || status === 'discarded') ? new Date().toISOString() : null;
// --- grails status count ---
  });
}

export { app };

async function autoIndexCharacters() {
  try {
    const row = db.prepare('SELECT COUNT(*) as cnt, MAX(indexed_at) as last_indexed FROM grails_character_index').get();
    const cnt = parseInt(row?.cnt || '0', 10);
    const lastIndexed = row?.last_indexed;
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (cnt === 0 || !lastIndexed || new Date(lastIndexed) < oneDayAgo) {
      console.log('🐺 Auto-indexing character files…');
      const res = await fetch(`http://localhost:${PORT}/api/characters/index`, { method: 'POST' });
      const data = await res.json();
      console.log(`🐺 Character index complete: ${data.indexed} indexed, ${data.failed} failed`);
