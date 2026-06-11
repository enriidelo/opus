// api/sync.js
// Sync completo: carica tutto da localStorage e allinea Notion
// POST /api/sync
// Body: { transactions: [...], quickSpends: [...], tags: [...], tColors: {...} }
// Usa Timestamp come chiave di identità per evitare duplicati

import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DB_TX   = process.env.NOTION_DB_TRANSACTIONS;
const DB_QS   = process.env.NOTION_DB_QUICKSPENDS;
const DB_TAGS = process.env.NOTION_DB_TAGS;

// Fetch tutti i Timestamp già presenti in un DB (per deduplicazione)
async function fetchTimestamps(dbId) {
  const existing = new Map(); // ts -> notionPageId
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: dbId,
      start_cursor: cursor,
      page_size: 100,
      filter_properties: ['Timestamp', 'title'],
    });
    for (const page of res.results) {
      const ts = page.properties['Timestamp']?.number;
      if (ts) existing.set(ts, page.id);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return existing;
}

// Fetch tutti i nomi tag esistenti
async function fetchTagNames(dbId) {
  const existing = new Map();
  let cursor;
  do {
    const res = await notion.databases.query({ database_id: dbId, start_cursor: cursor, page_size: 100 });
    for (const page of res.results) {
      const name = page.properties['Name']?.title?.[0]?.plain_text;
      if (name) existing.set(name, page.id);
    }
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return existing;
}

async function createTx(tx) {
  const sign  = tx.type === 'in' ? '+' : '−';
  const label = tx.type === 'in' ? 'Entrata' : tx.type === 'out' ? 'Uscita' : 'Prelievo';
  const title = `${sign}€${parseFloat(tx.amount).toFixed(2)} ${label}${tx.tag ? ' · ' + tx.tag : ''}`;
  const props = {
    'Name':      { title: [{ text: { content: title } }] },
    'Type':      { select: { name: tx.type } },
    'Amount':    { number: parseFloat(tx.amount) },
    'Note':      { rich_text: [{ text: { content: tx.note || '' } }] },
    'Timestamp': { number: tx.ts },
    'Date':      { date: { start: new Date(tx.ts).toISOString().split('T')[0] } },
  };
  if (tx.tag)  props['Tag']  = { rich_text: [{ text: { content: tx.tag } }] };
  if (tx.dest) props['Dest'] = { select: { name: tx.dest } };
  return notion.pages.create({ parent: { database_id: DB_TX }, properties: props });
}

async function createQs(qs) {
  const title = `−€${parseFloat(qs.amount).toFixed(2)} ${qs.source === 'carta' ? '💳' : '💵'}${qs.note ? ' · ' + qs.note : ''}`;
  return notion.pages.create({
    parent: { database_id: DB_QS },
    properties: {
      'Name':      { title: [{ text: { content: title } }] },
      'Amount':    { number: parseFloat(qs.amount) },
      'Source':    { select: { name: qs.source } },
      'Note':      { rich_text: [{ text: { content: qs.note || '' } }] },
      'Timestamp': { number: qs.ts },
      'Date':      { date: { start: new Date(qs.ts).toISOString().split('T')[0] } },
    },
  });
}

async function createTag(name, color) {
  return notion.pages.create({
    parent: { database_id: DB_TAGS },
    properties: {
      'Name':  { title: [{ text: { content: name } }] },
      'Color': { rich_text: [{ text: { content: color || '#c8a84b' } }] },
    },
  });
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; }
  catch(e) { return res.status(400).json({ ok: false, error: 'Invalid JSON' }); }

  const { transactions = [], quickSpends = [], tags = [], tColors = {} } = body;

  try {
    // Fetch esistenti in parallelo
    const [txExisting, qsExisting, tagExisting] = await Promise.all([
      fetchTimestamps(DB_TX),
      fetchTimestamps(DB_QS),
      fetchTagNames(DB_TAGS),
    ]);

    const results = { created: 0, skipped: 0, errors: 0 };

    // Sync transactions (solo nuovi, non duplicati)
    for (const tx of transactions) {
      if (txExisting.has(tx.ts)) { results.skipped++; continue; }
      try { await createTx(tx); results.created++; }
      catch(e) { console.error('[sync tx]', e.message); results.errors++; }
    }

    // Sync quickSpends
    for (const qs of quickSpends) {
      if (qsExisting.has(qs.ts)) { results.skipped++; continue; }
      try { await createQs(qs); results.created++; }
      catch(e) { console.error('[sync qs]', e.message); results.errors++; }
    }

    // Sync tags
    for (const tagName of tags) {
      if (tagExisting.has(tagName)) { results.skipped++; continue; }
      try { await createTag(tagName, tColors[tagName]); results.created++; }
      catch(e) { console.error('[sync tag]', e.message); results.errors++; }
    }

    return res.status(200).json({ ok: true, results, syncedAt: new Date().toISOString() });

  } catch(err) {
    console.error('[sync]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
