# Finance Hub — Vercel + Notion

## Deploy su Vercel

1. Carica questa cartella su GitHub
2. Collega il repo a Vercel
3. Aggiungi le variabili d'ambiente (vedi sotto)
4. Deploy

## Variabili d'ambiente Vercel

| Variabile | Valore |
|---|---|
| `NOTION_API_KEY` | La tua Integration Key da notion.so/my-integrations |
| `NOTION_DB_TRANSACTIONS` | `966cf4dbd41d46b98d1cac5cc3e277a1` |
| `NOTION_DB_QUICKSPENDS` | `8f9e911112604540b4a0eee1a673fe74` |
| `NOTION_DB_TAGS` | `7e6ba81d60be405aa7d229be16e5a903` |

## Notion Integration Setup

1. Vai su https://www.notion.so/my-integrations
2. Crea una nuova Integration: "Finance Hub"
3. Copia la **Internal Integration Secret** → è il tuo `NOTION_API_KEY`
4. Apri ogni database su Notion → "..." → "Connessioni" → aggiungi "Finance Hub"
   - FH · Transactions
   - FH · QuickSpends  
   - FH · Tags

## API Endpoints

| Endpoint | Metodo | Descrizione |
|---|---|---|
| `/api/read` | GET | Scarica tutti i dati da Notion |
| `/api/write` | POST | Scrive/aggiorna/elimina un singolo record |
| `/api/sync` | POST | Bulk sync: carica tutto localStorage su Notion |

## Shortcut iOS (#add mode)

URL da usare nello Shortcut: `https://tuosito.vercel.app/#add`
