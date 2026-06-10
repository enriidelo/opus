// api/write.js
// Scrive un singolo movimento (transaction o quickSpend) su Notion
// POST /api/write
// Body: { collection: 'tx'|'qs'|'tag', action: 'create'|'update'|'delete', data: {...} }

import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_KEY });

const DB_TX   = process.env.NOTION_DB_TRANSACTIONS;
const DB_QS   = process.env.NOTION_DB_QUICKSPENDS;
const DB_TAGS = process.env.NOTION_DB_TAGS;

// ── Costruisce il titolo leggibile per la pagina Notion ──
function txTitle(data) {
  const sign  = data.type === 'in' ? '+' : '−';
  const label = data.type === 'in' ? 'Entrata' : data.type === 'out' ? 'Uscita' : 'Prelievo';
  const tag   = data.tag ? ` · ${data.tag}` : '';
  return `${sign}€${parseFloat(data.amount).toFixed(2)} ${label}${tag}`;
}
function qsTitle(data) {
  return `−€${parseFloat(data.amount).toFixed(2)} ${data.source === 'carta' ? '💳' : '💵'}${data.note ? ' · ' + data.note : ''}`;
}

// ── Properties per transactions ──
function txProps(data) {
  const props = {
    'Name':   { title:  [{ text: { content: txTitle(data) } }] },
    'Type':   { select: { name: data.type } },
    'Amount': { number: parseFloat(data.amount) },
    'Note':   { rich_text: [{ text: { content: data.note || '' } }] },
    'Timestamp': { number: data.ts || Date.now() },
    'date:Date:start': new Date(data.ts || Date.now()).toISOString().split('T')[0],
  };
  if (data.tag)  props['Tag']  = { rich_text: [{ text: { content: data.tag } }] };
  if (data.dest) props['Dest'] = { select: { name: data.dest } };
  return props;
}

// ── Properties per quickSpends ──
function qsProps(data) {
  return {
    'Name':   { title:  [{ text: { content: qsTitle(data) } }] },
    'Amount': { number: parseFloat(data.amount) },
    'Source': { select: { name: data.source } },
    'Note':   { rich_text: [{ text: { content: data.note || '' } }] },
    'Timestamp': { number: data.ts || Date.now() },
    'date:Date:start': new Date(data.ts || Date.now()).toISOString().split('T')[0],
  };
}

// ── Properties per tags ──
function tagProps(data) {
  return {
    'Name':  { title: [{ text: { content: data.name } }] },
    'Color': { rich_text: [{ text: { content: data.color || '#c8a84b' } }] },
  };
}

// ── Trova la pagina Notion dal Timestamp (usato come ID locale) ──
async function findNotionPage(dbId, timestamp) {
  const res = await notion.databases.query({
    database_id: dbId,
    filter: {
      property: 'Timestamp',
      number: { equals: timestamp },
    },
    page_size: 1,
  });
  return res.results[0] || null;
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

  const { collection, action, data } = body;

  if (!collection || !action) {
    return res.status(400).json({ ok: false, error: 'Missing collection or action' });
  }

  try {
    // ── SELECT DB ──
    const dbId = collection === 'tx' ? DB_TX : collection === 'qs' ? DB_QS : DB_TAGS;
    const buildProps = collection === 'tx' ? txProps : collection === 'qs' ? qsProps : tagProps;

    // ── CREATE ──
    if (action === 'create') {
      const page = await notion.pages.create({
        parent: { database_id: dbId },
        properties: buildProps(data),
      });
      return res.status(200).json({ ok: true, notionId: page.id });
    }

    // ── UPDATE ──
    if (action === 'update') {
      // Cerca la pagina tramite notionId se disponibile, altrimenti via Timestamp
      let pageId = data.notionId;
      if (!pageId && data.ts) {
        const page = await findNotionPage(dbId, data.ts);
        if (!page) return res.status(404).json({ ok: false, error: 'Record not found' });
        pageId = page.id;
      }
      await notion.pages.update({
        page_id: pageId,
        properties: buildProps(data),
      });
      return res.status(200).json({ ok: true });
    }

    // ── DELETE ──
    if (action === 'delete') {
      let pageId = data.notionId;
      if (!pageId && data.ts) {
        const page = await findNotionPage(dbId, data.ts);
        if (!page) return res.status(404).json({ ok: false, error: 'Record not found' });
        pageId = page.id;
      }
      // In Notion non si elimina davvero, si archivia
      await notion.pages.update({ page_id: pageId, archived: true });
      return res.status(200).json({ ok: true });
    }

    return res.status(400).json({ ok: false, error: 'Unknown action' });

  } catch (err) {
    console.error('[write]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
