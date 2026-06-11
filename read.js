// api/read.js
// Legge transactions, quickSpends e tags da Notion
// GET /api/read

import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_KEY });

const DB_TX = process.env.NOTION_DB_TRANSACTIONS;
const DB_QS = process.env.NOTION_DB_QUICKSPENDS;
const DB_TAGS = process.env.NOTION_DB_TAGS;

// ── helpers per estrarre valori dalle properties Notion ──
function getProp(page, name) {
  const prop = page.properties[name];
  if (!prop) return null;
  switch (prop.type) {
    case 'title':       return prop.title?.[0]?.plain_text ?? null;
    case 'rich_text':   return prop.rich_text?.[0]?.plain_text ?? null;
    case 'number':      return prop.number ?? null;
    case 'select':      return prop.select?.name ?? null;
    case 'date':        return prop.date?.start ?? null;
    case 'checkbox':    return prop.checkbox ?? false;
    case 'last_edited_time': return prop.last_edited_time ?? null;
    case 'created_time':     return prop.created_time ?? null;
    default:            return null;
  }
}

// Paginazione automatica — recupera tutti i record
async function queryAll(dbId, filter = undefined) {
  const pages = [];
  let cursor = undefined;
  do {
    const res = await notion.databases.query({
      database_id: dbId,
      filter,
      start_cursor: cursor,
      page_size: 100,
    });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return pages;
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Leggi in parallelo tutti e 3 i database
    const [txPages, qsPages, tagPages] = await Promise.all([
      queryAll(DB_TX),
      queryAll(DB_QS),
      queryAll(DB_TAGS),
    ]);

    // Mappa transactions
    const transactions = txPages.map(p => ({
      id:     getProp(p, 'Timestamp') ?? new Date(p.created_time).getTime(),
      notionId: p.id,
      type:   getProp(p, 'Type'),
      amount: getProp(p, 'Amount') ?? 0,
      tag:    getProp(p, 'Tag') || null,
      note:   getProp(p, 'Note') || '',
      dest:   getProp(p, 'Dest') || null,
      ts:     getProp(p, 'Timestamp') ?? new Date(p.created_time).getTime(),
    })).filter(t => t.type && t.amount > 0)
      .sort((a, b) => a.ts - b.ts);

    // Mappa quickSpends
    const quickSpends = qsPages.map(p => ({
      id:     getProp(p, 'Timestamp') ?? new Date(p.created_time).getTime(),
      notionId: p.id,
      amount: getProp(p, 'Amount') ?? 0,
      source: getProp(p, 'Source'),
      note:   getProp(p, 'Note') || '',
      ts:     getProp(p, 'Timestamp') ?? new Date(p.created_time).getTime(),
    })).filter(q => q.source && q.amount > 0)
      .sort((a, b) => a.ts - b.ts);

    // Mappa tags e colori
    const tags = tagPages.map(p => ({
      name:  getProp(p, 'Name'),
      color: getProp(p, 'Color') || '#c8a84b',
      notionId: p.id,
    })).filter(t => t.name);

    // Ricostruisci tColors
    const tColors = {};
    tags.forEach(t => { tColors[t.name] = t.color; });

    return res.status(200).json({
      ok: true,
      data: {
        transactions,
        quickSpends,
        tags: tags.map(t => t.name),
        tColors,
      },
      lastSync: new Date().toISOString(),
    });

  } catch (err) {
    console.error('[read]', err);
    return res.status(500).json({ ok: false, error: err.message });
  }
}
