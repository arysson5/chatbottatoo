#!/usr/bin/env node
/**
 * Gera RELATORIO-TESTES.md com resultados de Jest e Playwright.
 * Uso: node scripts/generate-test-report.js
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.join(__dirname, "..");
const reportPath = path.join(webRoot, "RELATORIO-TESTES.md");

function runCommand(command, args, cwd) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(command, args, {
      cwd,
      shell: true,
      env: { ...process.env, FORCE_COLOR: "0", CI: "1" },
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (code) => {
      resolve({
        code: code ?? 1,
        stdout,
        stderr,
        durationMs: Date.now() - started,
      });
    });
  });
}

function parseJestOutput(output) {
  const passMatch = output.match(/Tests:\s+(.*?)(\n|$)/);
  const suitesMatch = output.match(/Test Suites:\s+(.*?)(\n|$)/);
  const passed = (output.match(/(\d+) passed/) || [])[1] || "0";
  const failed = (output.match(/(\d+) failed/) || [])[1] || "0";
  const total = (output.match(/(\d+) total/) || [])[1] || passed;

  return {
    summary: passMatch?.[1]?.trim() || suitesMatch?.[1]?.trim() || "N/A",
    passed: Number(passed),
    failed: Number(failed),
    total: Number(total),
  };
}

async function readPlaywrightJson() {
  const jsonPath = path.join(webRoot, "playwright-report", "results.json");
  try {
    const raw = await fs.readFile(jsonPath, "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function buildMarkdown({ jestResult, jestStats, pwResult, pwJson, generatedAt }) {
  const jestOk = jestResult.code === 0;
  const pwOk = pwResult.code === 0;

  let pwSection = "| Spec | Teste | Status |\n|------|-------|--------|\n";
  if (pwJson?.suites) {
    for (const suite of pwJson.suites) {
      for (const spec of suite.specs || []) {
        for (const test of spec.tests || []) {
          const status = test.results?.[0]?.status || "unknown";
          const icon = status === "passed" ? "✅" : status === "failed" ? "❌" : "⚠️";
          pwSection += `| ${suite.title || spec.file} | ${spec.title} | ${icon} ${status} |\n`;
        }
      }
    }
  } else {
    pwSection += "| — | Playwright não gerou JSON | ⚠️ |\n";
  }

  const overall = jestOk && pwOk ? "✅ APROVADO PARA PRODUÇÃO" : "❌ REPROVADO — corrigir falhas antes do deploy";

  return `# Relatório de Testes Automatizados — Briza Tattoo

> Gerado em: **${generatedAt}**

## Resultado geral

**${overall}**

| Camada | Comando | Status | Duração |
|--------|---------|--------|---------|
| Unitários (Jest) | \`npm run test:unit\` | ${jestOk ? "✅ Passou" : "❌ Falhou"} | ${(jestResult.durationMs / 1000).toFixed(1)}s |
| Integração E2E (Playwright) | \`npm run test:e2e\` | ${pwOk ? "✅ Passou" : "❌ Falhou"} | ${(pwResult.durationMs / 1000).toFixed(1)}s |

---

## 1. Testes unitários (Jest)

**Resumo:** ${jestStats.passed}/${jestStats.total} passaram, ${jestStats.failed} falharam

### Módulos cobertos

| Área | Arquivo de teste | O que valida |
|------|------------------|--------------|
| Comprovante PIX | \`pix-proof-parser.test.js\` | Extração de valor, recebedor, ID E2E |
| Pipeline PIX | \`pix-proof-pipeline.test.js\` | Merge OCR + Gemini |
| Validação recebedor | \`pix-key.test.js\` | Match de nome do titular PIX |
| Memória de fluxo | \`flow-context.test.js\` | Detecção de estado + lembretes |
| Persistência interações | \`flow-interaction-store.test.js\` | Hidratação Maps, TTL 24h |
| Horários | \`slot-filters.test.js\` | Filtro, paginação, parse local |
| Intenção do usuário | \`conversation-intent.test.js\` | Menu, agendar, escolha de slot |
| QR Code Evolution | \`evolution-qrcode.test.js\` | Instância, QR, conexão |
| Estado agendamento | \`flow-store.test.js\` | pendingSchedule/Payment |
| Mídia WhatsApp | \`message-media.test.js\` | Detecção imagem/PDF comprovante |
| Moeda | \`currency.test.js\` | Parse e formatação BRL |

<details>
<summary>Log Jest (últimas linhas)</summary>

\`\`\`
${(jestResult.stdout + jestResult.stderr).trim().split("\n").slice(-40).join("\n")}
\`\`\`

</details>

---

## 2. Testes E2E (Playwright)

### Cenários críticos

| Fluxo | Spec | Validação |
|-------|------|-----------|
| Conversa inicial | \`webhook-flow.spec.js\` | Boas-vindas → menu → persistência |
| Memória de contexto | \`flow-memory.spec.js\` | Retomada após restart, TTL, PIX ativo |
| Agendamento | \`scheduling.spec.js\` | Nome → horário → avanço para PIX |
| Comprovante PIX | \`pix-proof.spec.js\` | Imagem/valor manual, anti-duplicata |
| QR Code / número | \`evolution-qrcode.spec.js\` | Create, connect, validação |

${pwSection}

<details>
<summary>Log Playwright (últimas linhas)</summary>

\`\`\`
${(pwResult.stdout + pwResult.stderr).trim().split("\n").slice(-50).join("\n")}
\`\`\`

</details>

---

## 3. Checklist pré-produção

- [${jestOk ? "x" : " "}] Testes unitários passando
- [${pwOk ? "x" : " "}] Testes E2E passando
- [ ] \`GEMINI_API_KEY\` configurada em produção
- [ ] \`EVOLUTION_GLOBAL_API_KEY\` e \`EVOLUTION_BASE_URL\` configurados
- [ ] \`DATABASE_URL\` apontando para Postgres
- [ ] \`WEBHOOK_PUBLIC_URL\` acessível pela Evolution API
- [ ] Google Calendar OAuth conectado no painel
- [ ] Chave PIX e titular configurados no painel

---

## 4. Como executar

\`\`\`bash
cd web
npm run test              # unitários + e2e + relatório
npm run test:unit         # só Jest
npm run test:e2e          # só Playwright
npm run test:report       # gera este relatório
\`\`\`

---

*Relatório gerado automaticamente por \`scripts/generate-test-report.js\`*
`;
}

async function main() {
  console.log("Executando testes unitários (Jest)...");
  const jestResult = await runCommand("npx", ["jest", "--ci", "--coverage", "--coverageReporters=text-summary"], webRoot);
  const jestStats = parseJestOutput(jestResult.stdout + jestResult.stderr);

  console.log("Executando testes E2E (Playwright)...");
  const pwResult = await runCommand(
    "npx",
    ["playwright", "test", "--config=playwright.config.mjs"],
    webRoot,
  );

  const pwJson = await readPlaywrightJson();
  const generatedAt = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  const markdown = buildMarkdown({ jestResult, jestStats, pwResult, pwJson, generatedAt });

  await fs.writeFile(reportPath, markdown, "utf-8");
  console.log(`\nRelatório salvo em: ${reportPath}`);

  const exitCode = jestResult.code === 0 && pwResult.code === 0 ? 0 : 1;
  if (exitCode !== 0) {
    console.error("Alguns testes falharam. Veja RELATORIO-TESTES.md para detalhes.");
  }
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
