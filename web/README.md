# Briza Tattoo - Guia de inicialização

Este documento explica como subir a aplicação localmente (painel web + integração com Evolution API) e testar o fluxo do chatbot.

## 1) Pré-requisitos

- Node.js 20+ (recomendado)
- npm
- Docker e Docker Compose (para Evolution API)
- Um número WhatsApp para conectar via QR Code

## 2) Configurar variáveis de ambiente

Na pasta `web`, copie o exemplo:

```bash
cp .env.example .env.local
```

Preencha no `web/.env.local`:

- `EVOLUTION_BASE_URL`: URL da Evolution API (ex.: `http://localhost:8080`)
- `EVOLUTION_GLOBAL_API_KEY`: API key global da Evolution
- `WEBHOOK_PUBLIC_URL`: URL pública/base do web app (em dev pode ser `http://host.docker.internal:3000`)
- `EVOLUTION_MANAGER_URL`: opcional, URL do manager
- `TEST_TARGET_NUMBER`: número fixo autorizado no código (modo atual)

## 3) Instalar dependências do frontend

Dentro de `web`:

```bash
npm install
```

## 4) Subir Docker (Evolution API)

Antes de iniciar o frontend, a Evolution precisa estar online.

### Opção A: você já tem um `docker-compose.yml` da Evolution

No diretório onde está seu `docker-compose.yml` da Evolution:

```bash
docker compose up -d
```

Verificar se subiu:

```bash
docker ps
```

Você deve ver containers da Evolution (e normalmente `redis`, `postgres`, `nginx`).

### Opção B: parar e subir novamente (quando travar)

```bash
docker compose down
docker compose up -d
```

### Logs úteis

```bash
docker compose logs -f evolution-api
```

Se seu serviço tiver outro nome no compose, troque `evolution-api` pelo nome correto.

### Teste rápido da API

- Abra no navegador a URL definida em `EVOLUTION_BASE_URL` (ex.: `http://localhost`)
- Abra também `/manager` (ex.: `http://localhost/manager`) para confirmar acesso ao manager

## 5) Subir o frontend

Ainda em `web`:

```bash
npm run dev
```

A aplicação ficará em:

- `http://localhost:3000`

## 6) Primeiro acesso ao painel

1. Abra `http://localhost:3000/login`
2. Crie a senha do painel
3. Faça login
4. Você será redirecionado para a página de gestão

## 7) Conectar número no sistema (QR Code)

No painel:

1. Vá na seção **Conectar número com QR Code**
2. Informe o número no formato com DDI/DDD (ex.: `5511999999999`)
3. Clique em **Gerar QR Code**
4. Escaneie com o WhatsApp desse número
5. Aguarde o status mudar para **conectado**

## 8) Fluxo principal do bot (resumo)

- Usuário entra no fluxo
- Escolhe:
  - `1` Nova Tattoo -> recebe catálogo -> envia áreas -> recebe orçamento com validade de 7 dias
  - `2` Reforma -> recebe catálogo -> envia áreas -> (foto opcional) -> handoff para humano
  - `3` Complemento -> recebe catálogo -> envia áreas -> (foto opcional) -> handoff para humano

## 9) Dashboard de leads estratégicos

No painel de gestão, clique em:

- **Abrir dashboard estratégico** (`/gestao/leads`)

Lá você vê:

- leads que não agendaram
- leads dentro do prazo (7 dias)
- leads fora do prazo
- áreas mais escolhidas

## 10) Estrutura de dados local

A aplicação usa um banco simples em arquivo JSON:

- `web/data/app-db.json`

Ele armazena configurações, leads, resultados de lead e estados auxiliares.

## 11) Rodar lint

Para validar o código:

```bash
npm run lint
```

## 12) Observações importantes

- Hoje o webhook está com lock para responder só o número inicial configurado no código (modo de segurança atual).
- Para produção multi-número, esse lock pode ser removido depois.
- Se a Evolution API não estiver acessível, QR Code e conexão não funcionarão.
