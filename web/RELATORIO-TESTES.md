# Relatório de Testes Automatizados — Briza Tattoo

> Gerado em: **20/06/2026** — suite completa para validação pré-produção

## Resultado geral

**✅ APROVADO — 122/122 testes passando**

| Camada | Comando | Testes | Status |
|--------|---------|--------|--------|
| Unitários (Jest) | `npm run test:unit` | 100 | ✅ Passou |
| Integração E2E (Playwright) | `npm run test:e2e` | 22 | ✅ Passou |
| **Total** | `npm run test` | **122** | **✅ Passou** |

---

## 1. Áreas críticas cobertas

### 1.1 Memória de fluxo (retomada de contexto)

| Teste | Tipo | O que valida |
|-------|------|--------------|
| `flow-context.test.js` | Unit | Detecta 8 estados: menu, catálogo, pós-orçamento, nome, telefone, horário, PIX, FAQ |
| `flow-interaction-store.test.js` | Unit | Persistência TTL 24h, hidratação de Maps após restart |
| `flow-memory.spec.js` | E2E | `pendingSchedule`, `pendingInteraction`, mensagem confusa mantém step |

**Correção aplicada durante os testes:** números puros (`"2"`) não são mais confundidos com typo de `"um"` em `matchesMenuOption` — bug real que impedia escolha correta de horário.

### 1.2 Comprovante PIX (reconhecimento e valores)

| Teste | Tipo | O que valida |
|-------|------|--------------|
| `pix-proof-parser.test.js` | Unit | OCR Nubank/Itaú: valor R$ 200, recebedor, ID E2E |
| `pix-proof-pipeline.test.js` | Unit | Merge OCR + Gemini, prioridade de valor, anti-quota |
| `pix-key.test.js` | Unit | Validação titular PIX (match local + Gemini) |
| `message-media.test.js` | Unit | Detecção imagem/PDF no WhatsApp |
| `pix-proof.spec.js` | E2E | Fluxo PIX ativo no banco, valor manual, imagem sem 500, anti-duplicata |

**Cobertura de código:** `pix-proof-parser.js` 94% linhas · `pix-key.js` 100% linhas

### 1.3 Agendamento de horário

| Teste | Tipo | O que valida |
|-------|------|--------------|
| `slot-filters.test.js` | Unit | Filtro sexta/semana que vem, paginação 8 slots |
| `conversation-intent.test.js` | Unit | Escolha numérica e por ordinal ("segundo") |
| `flow-store.test.js` | Unit | `pendingSchedule` / `pendingPayment` |
| `scheduling.spec.js` | E2E | Coleta nome → avanço, seleção slot, filtro "sexta" |

### 1.4 Cadastro de número + QR Code (Evolution)

| Teste | Tipo | O que valida |
|-------|------|--------------|
| `evolution-qrcode.test.js` | Unit | `phoneFromInstanceName`, QR base64/code, `fetchConnectWithQr` mockado |
| `evolution-qrcode.spec.js` | E2E | Validação 400, contrato JSON, webhook URL |

> **Nota:** testes E2E de sucesso com Evolution real dependem de rede Docker/host. A lógica de QR está 97% coberta nos unitários. Use `e2e/mock-evolution-server.cjs` + `host.docker.internal:9999` se Next.js rodar em container.

### 1.5 Fluxo webhook completo

| Teste | Tipo | O que valida |
|-------|------|--------------|
| `webhook-flow.spec.js` | E2E | Boas-vindas → menu → persistência no banco isolado (`TEST_DB_FILE`) |

---

## 2. Cobertura de código (módulos críticos)

```
File                        | % Lines
----------------------------|--------
pix-key.js                  | 100%
slot-filters.js             | 100%
currency.js                 | 100%
evolution-qrcode.js         | 97.6%
pix-proof-parser.js         | 94.9%
conversation-intent.js      | 85.3%
flow-context.js             | 82.5%
```

Módulos com OCR/Tesseract/Gemini (`pix-proof-pipeline.js`) têm cobertura parcial — dependem de mídia real e API externa. Lógica pura (`mergeProofResults`) está 100% testada.

---

## 3. Infraestrutura de testes criada

```
web/
├── jest.config.mjs              # Unitários com alias @/
├── playwright.config.mjs        # E2E com banco isolado
├── __tests__/
│   ├── setup.js                 # Mock Gemini, sem Postgres
│   ├── helpers/
│   │   ├── fixtures.js          # Payload webhook + reset DB
│   │   └── mock-data.js           # Slots e comprovantes sample
│   └── unit/                    # 11 suites, 100 testes
├── e2e/                         # 5 specs, 22 testes
│   └── mock-evolution-server.cjs
└── scripts/generate-test-report.js
```

### Scripts disponíveis

```bash
cd web
npm run test              # unit + e2e + relatório
npm run test:unit         # Jest (100 testes)
npm run test:unit:coverage
npm run test:e2e          # Playwright (22 testes)
npm run test:report       # Regenera este relatório
```

### Variáveis de ambiente para testes

| Variável | Uso |
|----------|-----|
| `TEST_DB_FILE` | Banco JSON isolado (automático no Playwright) |
| `DATABASE_URL=""` | Força fallback JSON nos testes |
| `GEMINI_API_KEY=""` | Desabilita chamadas Gemini nos unitários |

---

## 4. Checklist pré-produção

- [x] 100 testes unitários passando
- [x] 22 testes E2E passando
- [x] Bug de escolha numérica corrigido (`conversation-intent.js`)
- [x] Banco de teste isolado (`TEST_DB_FILE`)
- [ ] `GEMINI_API_KEY` configurada em produção
- [ ] `EVOLUTION_GLOBAL_API_KEY` e `EVOLUTION_BASE_URL` configurados
- [ ] `DATABASE_URL` apontando para Postgres em produção
- [ ] `WEBHOOK_PUBLIC_URL` acessível pela Evolution API
- [ ] Google Calendar OAuth conectado no painel
- [ ] Chave PIX e titular configurados no painel
- [ ] Smoke test manual: `npm run test:flow` com número real

---

## 5. Detalhamento E2E (22 testes)

| Spec | Testes | Status |
|------|--------|--------|
| `evolution-qrcode.spec.js` | 5 | ✅ |
| `flow-memory.spec.js` | 5 | ✅ |
| `pix-proof.spec.js` | 5 | ✅ |
| `scheduling.spec.js` | 3 | ✅ |
| `webhook-flow.spec.js` | 4 | ✅ |

---

## 6. Detalhamento unitário (100 testes)

| Suite | Testes | Status |
|-------|--------|--------|
| `pix-proof-parser.test.js` | 9 | ✅ |
| `pix-proof-pipeline.test.js` | 8 | ✅ |
| `pix-key.test.js` | 10 | ✅ |
| `flow-context.test.js` | 10 | ✅ |
| `flow-interaction-store.test.js` | 8 | ✅ |
| `slot-filters.test.js` | 11 | ✅ |
| `conversation-intent.test.js` | 12 | ✅ |
| `evolution-qrcode.test.js` | 11 | ✅ |
| `flow-store.test.js` | 7 | ✅ |
| `message-media.test.js` | 9 | ✅ |
| `currency.test.js` | 5 | ✅ |

---

## 7. Recomendações pós-teste

1. **CI/CD:** adicionar `npm run test` no pipeline antes do deploy
2. **Docker Compose:** usar `EVOLUTION_BASE_URL=http://evolution-api:8080` e rodar `test:flow` contra stack completa
3. **Monitoramento:** logs `[pix-proof]` e `[webhook]` em produção para comprovantes rejeitados
4. **Regressão:** rodar `npm run test` a cada PR

---

*Relatório gerado pela suite automatizada Briza Tattoo — Jest + Playwright*
