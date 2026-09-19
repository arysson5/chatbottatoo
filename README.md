# Chatbot Tattoo — Briza

Chatbot de WhatsApp para estúdio de tattoo com orçamento, agendamento, PIX e painel administrativo. Integra **Evolution API** (WhatsApp), **Next.js** (painel e webhook), **OmniRoute** (linguagem natural e leitura de comprovantes via free tiers) e **Google Calendar**.

## Funcionalidades

- Atendimento automático via WhatsApp (menu, orçamento por áreas, FAQ)
- Agendamento com horários livres e Google Calendar
- Confirmação de sinal PIX (OCR + OmniRoute + validação de recebedor)
- Painel de gestão (`/gestao`) — configuração, números de atendimento, leads
- Repasse para secretaria humana e dashboard estratégico de leads
- Múltiplos números de atendimento (instâncias Evolution)

## Estrutura do projeto

```
.
├── compose.yml          # Evolution API + Postgres + Redis + OmniRoute + Next.js
├── .env.example         # Variáveis da Evolution API (copiar para .env)
└── web/                 # Aplicação Next.js
    ├── .env.example     # Variáveis do painel/webhook
    ├── data/
    │   └── app-db.example.json   # Modelo do banco JSON local
    └── app/             # Rotas e API
```

## Pré-requisitos

- [Docker](https://www.docker.com/) e Docker Compose
- Node.js 20+ (desenvolvimento local sem Docker)
- Conta Google Cloud (Calendar OAuth, opcional)

## Instalação rápida (Docker)

1. Clone o repositório:

```bash
git clone https://github.com/arysson5/chatbottatoo.git
cd chatbottatoo
```

2. Configure as variáveis de ambiente:

```bash
cp .env.example .env
cp web/.env.example web/.env.local
```

Edite os arquivos e **substitua todas as chaves e senhas** por valores fortes de produção.

3. Inicialize o banco de dados local (fallback JSON):

```bash
cp web/data/app-db.example.json web/data/app-db.json
```

4. Suba os serviços (cria `briza_app`, roda migrations Prisma e sobe o Next):

```bash
docker compose up -d
```

5. Acesse:

| Serviço | URL |
|---------|-----|
| Painel Next.js | http://localhost:3000 |
| Evolution API | http://localhost:8080/manager |
| OmniRoute (IA) | http://localhost:20128 |
| Login gestão | http://localhost:3000/login |

Na primeira execução, crie a senha do painel em `/login`.

## Desenvolvimento local (sem Docker no Next)

```bash
# Terminal 1 — infraestrutura
docker compose up -d postgres redis evolution-api omniroute

# Terminal 2 — Next.js
cd web
npm install
cp .env.example .env.local
cp data/app-db.example.json data/app-db.json
# Opcional: Postgres local
# DATABASE_URL=postgresql://evolution:evolution@localhost:5432/briza_app
npm run db:provision && npm run db:migrate
npm run dev
```
## Variáveis de ambiente

### Raiz (`.env`) — Evolution API

| Variável | Descrição |
|----------|-----------|
| `AUTHENTICATION_API_KEY` | Chave da API Evolution (mesma usada no painel) |
| `DATABASE_CONNECTION_URI` | PostgreSQL da Evolution |
| `SERVER_URL` | URL pública da Evolution |

### `web/.env.local` — Next.js

| Variável | Descrição |
|----------|-----------|
| `EVOLUTION_BASE_URL` | URL da Evolution (`http://localhost:8080`) |
| `EVOLUTION_GLOBAL_API_KEY` | Mesma chave `AUTHENTICATION_API_KEY` |
| `WEBHOOK_PUBLIC_URL` | URL que a Evolution usa para chamar o webhook |
| `AI_BASE_URL` | OmniRoute OpenAI-compatible (`http://localhost:20128/v1`) |
| `AI_MODEL` | Modelo OmniRoute (padrão: `auto`) |
| `AI_API_KEY` | Bearer opcional do dashboard OmniRoute |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth Calendar (opcional) |
| `APP_PUBLIC_URL` | URL pública do painel |
| `DATABASE_URL` | PostgreSQL `briza_app` (automático no Docker; omitir = fallback JSON) |

## Atualizar produção sem perder dados

A config do painel (preços, números, leads, senha) fica no **PostgreSQL** (`briza_app`). O arquivo `web/data/app-db.json` é um **espelho/backup** no disco do host (não vai no Git).

```bash
# Update seguro
git pull
docker compose up -d
```

**Nunca** em produção:

```bash
docker compose down -v   # apaga volumes = zera painel e sessões WhatsApp
```

Backup manual do banco:

```bash
docker compose exec postgres pg_dump -U evolution briza_app > backup-briza_app.sql
```

Se o painel zerou após um update e o JSON ainda tem a config antiga:

```bash
docker compose exec web npm run db:seed
```

## Banco de dados (PostgreSQL)

O painel usa o banco **`briza_app`** no mesmo PostgreSQL da Evolution (container `postgres`). No boot, se o Postgres estiver vazio e `web/data/app-db.json` tiver configuração, o `db:seed` importa automaticamente. Cada save no painel também espelha o JSON como backup no host.

| Comando | Descrição |
|---------|-----------|
| `npm run db:provision` | Cria o banco `briza_app` se não existir |
| `npm run db:migrate` | Aplica migrations Prisma |
| `npm run db:seed` | Importa `app-db.json` para o Postgres (use `--force` para sobrescrever) |

Schema e migrations em [`web/prisma/`](web/prisma/).

## Segurança

**Nunca commite arquivos com segredos.** O `.gitignore` já exclui:

- `.env`, `.env.local` e variantes
- `web/data/app-db.json` (senha do painel, tokens OAuth, leads reais)

Antes de colocar em produção:

1. Gere uma `AUTHENTICATION_API_KEY` longa e aleatória
2. Altere a senha do PostgreSQL no `compose.yml` e no `.env`
3. Configure senha forte no painel (`/login`)
4. Use HTTPS na URL pública do webhook
5. Rotacione chaves se alguma tiver sido exposta

## Conectar WhatsApp

1. Acesse o painel em `/` (gestão)
2. Em **Números de atendimento**, adicione o número e conecte via QR Code (Evolution)
3. Configure mensagens, PIX, secretaria e horários de agendamento
4. Salve a configuração

## Licença

Uso privado do projeto Briza Tattoo.
