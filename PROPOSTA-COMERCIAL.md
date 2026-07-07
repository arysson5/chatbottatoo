# Proposta — Chatbot WhatsApp Briza Tattoo

Documento para o cliente entender **como funciona a contratação**, **o que está incluso** e **o que não depende do desenvolvedor**.

---

## O que é o sistema

Assistente automático no WhatsApp do estúdio, com:

- Atendimento inicial (menu, boas-vindas, FAQ)
- Orçamento por áreas do corpo
- Agendamento de horários
- Confirmação de sinal via PIX (leitura de comprovante)
- Painel de gestão web (`/gestao`) para configurar mensagens, horários e números

A solução usa **Evolution API** (WhatsApp), **servidor na nuvem (VPS)** e **Google Gemini** (inteligência artificial para linguagem natural e leitura de comprovantes).

---

## Duas formas de contratar


|                          | **Opção 1 — Instalação**                         | **Opção 2 — Gestão completa**                |
| ------------------------ | ------------------------------------------------ | -------------------------------------------- |
| **Modelo**               | Você paga a infraestrutura; eu instalo e entrego | Mensalidade fixa; eu cuido de tudo           |
| **Mensalidade comigo**   | Não há                                           | **R$ 300,00/mês**                            |
| **VPS (Hostinger)**      | Você paga (~R$ 30–60/mês)                        | Incluso na mensalidade*                      |
| **Gemini (Google AI)**   | Você paga (uso conforme consumo)                 | Incluso na mensalidade*                      |
| **Domínio**              | Você contrata (~R$ 40/ano)                       | Incluso na mensalidade*                      |
| **Investimento no sistema** | **R$ 5.000,00** (único)                        | **R$ 5.000,00** (único) + mensalidade        |
| **Instalação e entrega** | Incluso nos R$ 5.000                             | Incluso nos R$ 5.000                         |
| **Suporte contínuo**     | Não incluso                                      | Sim                                          |
| **Manutenção e updates** | Não incluso                                      | Sim                                          |


 Na Opção 2, os custos de infraestrutura estão embutidos na mensalidade de R$ 300 — você não precisa contratar Hostinger, Gemini ou domínio separadamente (salvo combinação diferente por escrito).

 Em **ambas as opções**, o investimento de **R$ 5.000,00** cobre o sistema e o acompanhamento até a entrega formal das funcionalidades acordadas.

---

## Investimento no sistema — R$ 5.000,00

Valor único referente ao **sistema completo** e ao **acompanhamento até a entrega** de todas as funcionalidades acordadas, com tudo funcionando em produção.

### O que os R$ 5.000,00 incluem

- Licença de uso e implantação do chatbot WhatsApp Briza Tattoo
- Instalação na VPS, configuração de ambiente, banco de dados e HTTPS
- Conexão do número WhatsApp (QR Code) e configuração da Evolution API
- Configuração do painel de gestão (`/gestao`) conforme o estúdio
- Integração com Google Gemini (quando o cliente fornecer a chave ou na Opção 2)
- Integração com Google Calendar (quando aplicável e credenciais fornecidas)
- Testes dos fluxos acordados: menu, orçamento, FAQ, agendamento, PIX e webhook
- Treinamento de uso do painel
- **Acompanhamento ativo** até validarmos juntos que **todas as funcionalidades combinadas** estão entregues e operando

### O que significa “acompanhamento até a entrega”

Não se encerra na “instalação técnica”. O período de entrega cobre:

- Ajustes necessários para o bot responder corretamente no dia a dia do estúdio
- Correções de comportamento dentro do escopo acordado
- Suporte à configuração de textos, horários, valores e regras de PIX no painel
- Reconexão de QR Code durante a fase de entrega, se necessário
- Validação final com o cliente antes de considerar o projeto **entregue**

> A entrega é considerada concluída quando cliente e desenvolvedor confirmam, por escrito, que as funcionalidades da proposta estão funcionando conforme combinado.

### O que os R$ 5.000,00 **não** incluem

- Mensalidade de gestão contínua (Opção 2 — R$ 300/mês)
- VPS, domínio e faturamento Gemini na Opção 1 (pagos diretamente pelo cliente)
- Funcionalidades novas fora do escopo original (orçadas à parte)
- Suporte indefinido após a entrega formal (na Opção 1)

### Forma de pagamento sugerida

| Parcela | Momento | Valor |
|---------|---------|-------|
| Entrada | Na assinatura / início do projeto | 50% — R$ 2.500,00 |
| Saldo | Na entrega e aceite final das funcionalidades | 50% — R$ 2.500,00 |

*Outras formas podem ser combinadas por escrito.*

---

# Opção 1 — Instalação (sem mensalidade)

## Como funciona

1. **Você contrata** a VPS na [Hostinger](https://www.hostinger.com.br/servidor-vps) no seu nome (CPF/CNPJ).
2. **Você contrata** (ou já possui) um domínio para o painel e o webhook (ex.: `bot.seudominio.com.br`).
3. **Você cria** a conta no [Google AI Studio](https://aistudio.google.com/apikey) e paga o uso do **Gemini** conforme o consumo.
4. **Eu instalo** o projeto na sua VPS, configuro o bot, conecto o WhatsApp (QR Code) e entrego o painel funcionando.
5. **Após a entrega**, a VPS, o domínio e o Gemini continuam **no seu cartão/conta**. Não há mensalidade comigo.

## O que você paga diretamente (estimativa)


| Item                      | Quem paga            | Valor aproximado        |
| ------------------------- | -------------------- | ----------------------- |
| VPS Hostinger (KVM 1)     | Você → Hostinger     | ~R$ 30–60/mês           |
| Domínio `.com.br`         | Você → registrador   | ~R$ 40/ano              |
| Google Gemini (API)       | Você → Google        | R$ 0–30/mês* (uso leve) |
| **Sistema + entrega**     | Você → desenvolvedor | **R$ 5.000,00** (único) |


 Uso típico de um estúdio com um número WhatsApp costuma ficar baixo ou gratuito no tier inicial; valores sobem se houver muito volume de mensagens ou muitos comprovantes PIX por dia.

## O que está incluso na Opção 1 (dentro dos R$ 5.000,00)

Tudo descrito na seção **Investimento no sistema — R$ 5.000,00**. Resumo:

- Deploy do sistema na sua VPS (Docker)
- Configuração de ambiente e banco de dados
- HTTPS (certificado SSL) no domínio
- Conexão do número WhatsApp via QR Code
- Configuração do painel de gestão
- Treinamento de uso do painel
- Acompanhamento até a entrega de todas as funcionalidades acordadas

## O que **não** está incluso na Opção 1

- Suporte mensal ou sob demanda após a entrega
- Correção de bugs ou novas funcionalidades
- Reconexão do WhatsApp se a sessão cair
- Monitoramento 24h, backups automáticos ou reinício de serviços
- Alterações de texto, fluxo ou regras de negócio depois da entrega

> Se algo parar de funcionar depois da entrega, podemos combinar **suporte avulso** (por hora ou por chamado), mas isso não faz parte desta opção.

---

## O que **eu não controlo** (Opção 1 e Opção 2)

Estes pontos valem para **qualquer** modelo de contratação. São limitações da stack e de terceiros, não falha do instalador.

### WhatsApp e Evolution API


| Situação                            | Explicação                                                                                                                                                              |
| ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Evolution API**                   | Software de terceiros que conecta ao WhatsApp Web. Atualizações, bugs ou mudanças na API podem exigir ajustes ou reconexão.                                             |
| **Desconexão do QR Code**           | WhatsApp pode deslogar a sessão (celular offline, atualização do app, inatividade, troca de aparelho). É necessário escanear o QR de novo.                              |
| **Bloqueio ou restrição do número** | Meta/WhatsApp pode limitar ou banir números por spam, denúncias ou uso em massa. **Uso comercial moderado e atendimento real reduz o risco**, mas não há garantia zero. |
| **Mudanças do WhatsApp**            | O WhatsApp altera regras e funcionamento sem aviso. Isso pode afetar bots em geral.                                                                                     |


### Infraestrutura e demanda


| Situação                                 | Explicação                                                                                                                                           |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Alta demanda / pico de mensagens**     | Muitas conversas simultâneas, campanhas em massa ou tráfego viral podem sobrecarregar a VPS ou gerar lentidão. Pode ser necessário upgrade de plano. |
| **Indisponibilidade da Hostinger**       | Quedas de datacenter, manutenção ou problemas na VPS fogem do controle do projeto.                                                                   |
| **Indisponibilidade do Google Gemini**   | Se a API Gemini estiver fora do ar ou com cota esgotada, funções de IA (intenção natural, leitura de comprovante) podem falhar temporariamente.      |
| **Indisponibilidade do Google Calendar** | Se OAuth ou Calendar estiverem mal configurados ou fora do ar, agendamento integrado pode falhar.                                                    |


### Comportamento do bot


| Situação                           | Explicação                                                                                                                                                  |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mensagens fora do fluxo**        | Clientes escrevem de formas imprevisíveis. O bot cobre os casos principais; casos muito específicos podem precisar de ajuste manual ou repasse para humano. |
| **Comprovantes PIX**               | OCR + IA podem errar em imagens borradas, cortadas ou bancos não usuais. Sempre há revisão humana recomendada para valores altos.                           |
| **Conteúdo configurado no painel** | Preços, horários, textos e regras de PIX são de responsabilidade de quem configura o painel. Erros de configuração não são bug de software.                 |


### Segurança e acesso


| Situação            | Explicação                                                                                                            |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **Senhas e chaves** | Devem ser fortes e guardadas com segurança. Vazamento de senha do painel ou da API compromete o sistema.              |
| **Acesso à VPS**    | Na Opção 1, quem não paga a manutenção precisa garantir que a VPS continue ativa e paga. VPS cancelada = bot offline. |


---

# Opção 2 — Gestão completa (R$ 300/mês)

## Como funciona

1. **Você paga R$ 5.000,00** pelo sistema e acompanhamento até a entrega (conforme seção de investimento).
2. **Você paga R$ 300,00/mês** fixos para gestão contínua após (ou a partir da) entrega.
3. **Eu cuido de tudo**: VPS, domínio (se combinado), Gemini, manutenção, updates e suporte.
4. Você **não precisa** contratar Hostinger, configurar servidor ou gerenciar API do Google.
5. Foco no seu negócio; problemas técnicos são resolvidos por mim dentro do escopo acordado.

## O que está incluso na mensalidade


| Item                                                      | Incluso |
| --------------------------------------------------------- | ------- |
| Hospedagem (VPS)                                          | Sim     |
| Domínio e HTTPS                                           | Sim*    |
| Uso do Gemini (dentro do uso normal do estúdio)           | Sim     |
| Manutenção do sistema (updates, correções)                | Sim     |
| Monitoramento básico e reinício de serviços se necessário | Sim     |
| Reconexão WhatsApp (QR) quando a sessão cair              | Sim     |
| Suporte técnico (WhatsApp/e-mail, horário comercial)      | Sim     |
| Backups periódicos do banco de dados                      | Sim     |
| Pequenos ajustes de texto/config no painel                | Sim**   |


 Domínio incluso se registrado/gestão combinada na proposta; caso o cliente já tenha domínio próprio, apontamos DNS sem custo extra de registro.

* Ajustes simples (textos, horários, valores no painel). Novas funcionalidades ou mudanças grandes de fluxo podem ser orçadas à parte.

## Prazo de resposta (Opção 2)

- **Horário comercial** (seg–sex, 9h–18h)
- **Primeira resposta:** até 24 horas úteis
- **Incidentes críticos** (bot totalmente offline): prioridade no mesmo dia útil

## O que a mensalidade **não** cobre

Mesmo na Opção 2, permanecem fora do controle do desenvolvedor:

- Banimento ou bloqueio do número pelo WhatsApp/Meta
- Campanhas de disparo em massa não autorizadas pelo cliente
- Uso abusivo que exija VPS muito maior que o plano padrão (upgrade pode ser repassado ou renegociado)
- Desenvolvimento de funcionalidades novas não previstas no escopo original
- Problemas causados por terceiros (WhatsApp, Google, Hostinger) — embora eu **aja para restaurar** o serviço, não há SLA de 100% de uptime

## Por que R$ 300/mês?

A mensalidade cobre:

- ~R$ 30–60 de VPS
- ~R$ 3–10 de domínio (rateio mensal)
- ~R$ 0–30 de Gemini (uso normal)
- Tempo de manutenção, suporte, backups e disponibilidade para resolver problemas

Você paga **um valor fixo** e não se preocupa com faturas separadas, SSH, Docker ou reconexão de QR Code.

---

## Comparativo rápido — qual escolher?


| Perfil                                              | Recomendação |
| --------------------------------------------------- | ------------ |
| Quer pagar o mínimo e se virar depois da entrega    | **Opção 1**  |
| Tem alguém técnico ou aceita chamar suporte avulso  | **Opção 1**  |
| Quer paz de espírito e alguém cuidando do bot       | **Opção 2**  |
| Não quer lidar com VPS, Gemini ou QR desconectado   | **Opção 2**  |
| Estúdio depende do WhatsApp para agendamento diário | **Opção 2**  |


---

## Escopo do projeto (ambas as opções)

**Incluso:**

- 1 número WhatsApp conectado via Evolution API
- Painel de gestão web
- Fluxos: menu, orçamento, FAQ, agendamento, PIX
- Leads e configurações no painel

**Não incluso (salvo orçamento separado):**

- Múltiplos números adicionais além do combinado
- Integrações extras (ERP, CRM, e-commerce)
- App mobile nativo
- Disparo em massa / campanhas de marketing
- Redesign completo do fluxo ou novas áreas de negócio

---

## Próximos passos

1. Escolher **Opção 1** ou **Opção 2**
2. Confirmar por escrito (WhatsApp ou e-mail)
3. Pagamento da entrada (**R$ 2.500,00** — 50% dos R$ 5.000,00)
4. Na Opção 1: contratar VPS Hostinger e domínio; na Opção 2: mensalidade inicia conforme combinado
5. Agendar instalação e conexão do WhatsApp (QR Code)
6. Acompanhamento até validação de todas as funcionalidades acordadas
7. Pagamento do saldo (**R$ 2.500,00**) e entrega formal do projeto

---

## Contato

Preencha com seus dados antes de enviar ao cliente:


|                                |                            |
| ------------------------------ | -------------------------- |
| **Desenvolvedor**              | *Arysson Menezes*          |
| **WhatsApp**                   | *(11) 98850-1368*          |
| **E-mail**                     | *Aryssonmenezes@gmail.com* |
| **Investimento no sistema**    | **R$ 5.000,00** (único)    |
| **Entrada (50%)**              | R$ 2.500,00                |
| **Saldo na entrega (50%)**     | R$ 2.500,00                |
| **Mensalidade (Opção 2)**      | R$ 300,00/mês              |


---

## Resumo financeiro

| | **Opção 1** | **Opção 2** |
|---|-------------|-------------|
| **Sistema + acompanhamento até entrega** | R$ 5.000,00 | R$ 5.000,00 |
| **VPS + domínio + Gemini** | Cliente paga direto | Incluso na mensalidade |
| **Após a entrega** | Sem mensalidade comigo | R$ 300,00/mês |
| **Custo estimado no 1º ano** | R$ 5.000 + ~R$ 400–800 infra | R$ 5.000 + R$ 3.600 mensalidade |

---

*Documento gerado para o projeto Briza Tattoo — Chatbot WhatsApp. Valores de infraestrutura (Hostinger, Gemini) são estimativas e podem variar conforme plano e uso.*