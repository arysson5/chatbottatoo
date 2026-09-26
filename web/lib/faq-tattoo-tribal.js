/**
 * Base de dúvidas do nicho tattoo (seed do painel / IA).
 * O estúdio edita answer e aiContext em /gestao.
 */

export const DEFAULT_FAQ_ENTRIES = [
  {
    id: "dor",
    question: "A tatuagem dói?",
    keywords: ["dor", "doer", "machuca", "sensivel", "sensível", "doi"],
    answer:
      "Neo Tribal costuma ser intenso em áreas com pouca gordura (costelas, tornozelo), mais suave em braço/coxa. Usamos técnica gradual — você pode pedir pausa quando quiser. 💪",
    aiContext: "Não minimize dor; diga que varia por pessoa e área. Ofereça pausas.",
    enabled: true,
  },
  {
    id: "sessao",
    question: "Quanto tempo dura uma sessão?",
    keywords: ["sessao", "sessão", "tempo", "horas", "duracao", "duração", "quanto tempo"],
    answer:
      "Depende do tamanho e detalhe. Projetos médios costumam 3–6h por sessão; peças grandes podem ser divididas em mais de um dia. ⏱️",
    aiContext: "Não prometa horário exato sem ver o projeto. Sessões longas incluem pausas.",
    enabled: true,
  },
  {
    id: "quantidade_sessoes",
    question: "Quantas sessões vou precisar?",
    keywords: ["quantas sessoes", "quantas sessões", "varias sessoes", "mais de uma", "divid"],
    answer:
      "Projetos menores costumam fechar em 1 sessão. Peças grandes ou muito detalhadas podem precisar de 2 ou mais — avaliamos no orçamento e no desenho. 📐",
    aiContext: "Só estime faixa ampla; o artista confirma após ver referência e área.",
    enabled: true,
  },
  {
    id: "cicatrizacao",
    question: "Como é a cicatrização?",
    keywords: ["cicatriz", "cicatriza", "demora", "curar", "sarar"],
    answer:
      "A pele leva cerca de 2–4 semanas para cicatrizar superficialmente; o processo completo leva até 2 meses. Evite sol, piscina e roçar roupa nas primeiras semanas. ☀️🚫",
    aiContext: "Enfatize seguir orientações pós. Não dê diagnóstico médico.",
    enabled: true,
  },
  {
    id: "cuidados",
    question: "Quais cuidados depois da tattoo?",
    keywords: ["cuidado", "pos", "pós", "depois", "higiene", "lavar", "pomada"],
    answer:
      "Nas primeiras 24h lave com sabonete neutro, seque com papel toalha e passe a pomada indicada. Não coce, não arranque casquinha e mantenha hidratado. 🧴",
    aiContext: "Reforce higiene e não coçar. Produtos específicos o artista indica no dia.",
    enabled: true,
  },
  {
    id: "preparo",
    question: "Como me preparar no dia?",
    keywords: ["preparar", "preparação", "preparacao", "antes", "jejuar", "beber", "alcool", "álcool"],
    answer:
      "Durma bem, alimente-se antes, evite álcool 24h antes e use roupa confortável que libere a área. Hidrate a pele nos dias anteriores. 💧",
    aiContext: "Álcool e jejum prejudicam a sessão. Roupa que libere a área tatuada.",
    enabled: true,
  },
  {
    id: "retoque",
    question: "Tem retoque incluso?",
    keywords: ["retoque", "refazer", "consertar", "mancha"],
    answer:
      "Retoque leve de acabamento (até 30 dias, conforme avaliação) pode ser combinado no pós. Alterações grandes entram como nova sessão. ✅",
    aiContext: "Prazo e regras finais são do estúdio; não invente política diferente.",
    enabled: true,
  },
  {
    id: "estilo",
    question: "O que é o estilo Neo Tribal / Geométrico?",
    keywords: ["tribal", "neo tribal", "estilo", "referencia", "referência", "geométrico", "geometrico"],
    answer:
      "Neo Tribal combina formas tribais clássicas com linhas geométricas modernas. Envie referências que você curte — adaptamos ao seu corpo e fluxo muscular. 🔥",
    aiContext: "Estúdio foca Neo Tribal/Geométrico; outros estilos conforme disponibilidade.",
    enabled: true,
  },
  {
    id: "orcamento",
    question: "Como funciona o orçamento?",
    keywords: ["orcamento", "orçamento", "preco", "preço", "valor", "quanto custa", "tabela"],
    answer:
      "O orçamento é montado pelas áreas do catálogo e tem validade informada na conversa. No atendimento final ajustamos tamanho, detalhes e encaixe da arte. 💰",
    aiContext: "Não invente preços fora da tabela/orçamento já enviado ao cliente.",
    enabled: true,
  },
  {
    id: "sinal_pix",
    question: "O que é o sinal (PIX) e ele é abatido?",
    keywords: ["sinal", "pix", "entrada", "adiantamento", "reserva"],
    answer:
      "O sinal via PIX reserva o horário na agenda e é abatido do valor final conforme a política do estúdio. Após pagar, envie o comprovante por aqui. 📲",
    aiContext: "Valor do sinal vem das configs do painel. Não invente outro valor.",
    enabled: true,
  },
  {
    id: "remarcar",
    question: "Posso remarcar ou cancelar?",
    keywords: ["remarcar", "cancelar", "desmarcar", "adiar", "reagendar"],
    answer:
      "Remarcação e cancelamento seguem a política do estúdio (avise com antecedência). Se precisar, peça para falar com um atendente. 🗓️",
    aiContext: "Se a regra não estiver clara, oriente handoff humano.",
    enabled: true,
  },
  {
    id: "idade",
    question: "Qual a idade mínima?",
    keywords: ["idade", "menor", "anos", "adolescente", "autorizacao", "autorização"],
    answer:
      "Atendemos maiores de idade. Menores só com autorização e acompanhamento conforme a lei e a política do estúdio — confirme com o atendente. 🪪",
    aiContext: "Não autorize menores sozinho; encaminhe para humano se for o caso.",
    enabled: true,
  },
  {
    id: "gravidez",
    question: "Posso tatuar grávida ou amamentando?",
    keywords: ["gravida", "grávida", "amament", "gestante", "gestacao", "gestação"],
    answer:
      "Em geral não recomendamos tatuar na gestação ou amamentação sem orientação médica. Fale com um atendente para orientações do estúdio. 🤰",
    aiContext: "Assunto sensível: prefira handoff se o cliente insistir em detalhes clínicos.",
    enabled: true,
  },
  {
    id: "cover",
    question: "Dá para cobrir / reformar tattoo antiga?",
    keywords: ["cover", "cobrir", "reformar", "reforma", "cobertura", "tattoo antiga"],
    answer:
      "Sim — trabalhamos com reforma e cover-up. Envie fotos da tattoo atual e da referência desejada para avaliarmos o melhor caminho. ♻️",
    aiContext: "Cover depende de cor, tamanho e localização; não garanta resultado sem avaliar foto.",
    enabled: true,
  },
  {
    id: "anestesia",
    question: "Usam anestesia ou pomada?",
    keywords: ["anestesia", "anestesico", "anestésico", "pomada num", "dorme"],
    answer:
      "Podemos orientar sobre pomadas tópicas conforme o caso. O uso exato depende da área e da avaliação no dia da sessão. 🩺",
    aiContext: "Não prometa anestesia total. Não indique medicamentos sem respaldo do estúdio.",
    enabled: true,
  },
  {
    id: "pele_sensivel",
    question: "Pele sensível / alergia — posso tatuar?",
    keywords: ["alergia", "alergico", "alérgico", "pele sensivel", "pele sensível", "dermatite"],
    answer:
      "Pele sensível ou histórico de alergia precisa de avaliação. Se tiver dúvida médica, consulte um dermatologista antes e avise o estúdio. 🩹",
    aiContext: "Não dê diagnóstico. Em dúvida clínica, ofereça atendente humano.",
    enabled: true,
  },
  {
    id: "horario",
    question: "Posso escolher o horário?",
    keywords: ["horario", "horário", "agenda", "disponivel", "disponível", "escolher dia"],
    answer:
      "Sim — depois do orçamento você escolhe entre os horários livres que a agenda mostrar. Se preferir outro dia/período, diga que ajustamos a busca. 📅",
    aiContext: "Não invente slots; o fluxo de agendamento lista horários reais.",
    enabled: true,
  },
  {
    id: "levar",
    question: "O que levar no dia da sessão?",
    keywords: ["levar", "trazer", "documento", "referencia", "referência", "o que preciso"],
    answer:
      "Leve documento com foto, referências (se tiver) e use roupa confortável que libere a área. Alimente-se antes e chegue no horário combinado. 🎒",
    aiContext: "Reforce pontualidade e alimentação.",
    enabled: true,
  },
  {
    id: "sol_praia",
    question: "Posso tomar sol / ir à praia depois?",
    keywords: ["sol", "praia", "piscina", "mar", "bronze"],
    answer:
      "Evite sol forte, praia e piscina enquanto a pele cicatriza (em geral as primeiras semanas). Depois use protetor na área. 🏖️🚫",
    aiContext: "Alinhe com o prazo de cicatrização da resposta de cuidados.",
    enabled: true,
  },
  {
    id: "outros_estilos",
    question: "Fine Line / Blackwork também fazem?",
    keywords: ["fine line", "fineline", "blackwork", "black work", "outro estilo", "realism"],
    answer:
      "O foco é Neo Tribal e Geométrico, mas também trabalhamos Fine Line, Blackwork e outros estilos conforme disponibilidade. Conte o que você busca! ✏️",
    aiContext: "Não confirme agenda de estilo sem passar pelo fluxo/orçamento.",
    enabled: true,
  },
];

/** @deprecated Use DEFAULT_FAQ_ENTRIES */
export const TRIBAL_FAQ_ENTRIES = DEFAULT_FAQ_ENTRIES;

/**
 * @param {unknown} entries
 * @returns {Array<{id:string,question:string,keywords:string[],answer:string,aiContext:string,enabled:boolean}>}
 */
export function normalizeFaqEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) {
    return DEFAULT_FAQ_ENTRIES.map((e) => ({ ...e, keywords: [...e.keywords] }));
  }

  return entries
    .map((item, index) => {
      const id =
        typeof item?.id === "string" && item.id.trim()
          ? item.id.trim()
          : `faq_${index + 1}_${Date.now()}`;
      const keywords = Array.isArray(item?.keywords)
        ? item.keywords.map((k) => String(k || "").trim()).filter(Boolean)
        : [];
      return {
        id,
        question: String(item?.question || "").trim(),
        keywords,
        answer: String(item?.answer || "").trim(),
        aiContext: String(item?.aiContext || "").trim(),
        enabled: item?.enabled !== false,
      };
    })
    .filter((e) => e.question || e.answer || e.keywords.length);
}

/**
 * @param {string} text
 * @param {unknown} [faqEntries]
 * @returns {string | null}
 */
export function matchLocalFaqAnswer(text, faqEntries) {
  const normalized = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const entries = normalizeFaqEntries(faqEntries).filter((e) => e.enabled && e.answer);

  for (const entry of entries) {
    const kws = entry.keywords.length
      ? entry.keywords
      : String(entry.question || "")
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .split(/\s+/)
          .filter((w) => w.length > 3);
    if (kws.some((kw) => normalized.includes(kw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")))) {
      return entry.answer;
    }
  }
  return null;
}

/**
 * Formata KB para prompt da IA (apenas enabled com conteúdo útil).
 * @param {unknown} faqEntries
 * @returns {string}
 */
export function formatFaqKnowledgeForPrompt(faqEntries) {
  const entries = normalizeFaqEntries(faqEntries).filter(
    (e) => e.enabled && (e.answer || e.aiContext),
  );
  if (!entries.length) return "(Nenhuma dúvida cadastrada no painel.)";

  return entries
    .map(
      (e, i) =>
        `${i + 1}. Q: ${e.question}\n   Resposta oficial: ${e.answer || "(vazia)"}\n   Contexto IA: ${e.aiContext || "(nenhum)"}`,
    )
    .join("\n");
}

export const FAQ_MENU_TEXT =
  "Estou aqui para tirar suas dúvidas sobre tattoo! 🖤\n\nPode perguntar sobre dor, sessão, cicatrização, cuidados, estilo, sinal PIX e mais.\n\nOu digite:\n1 - Agendar agora 📅\n2 - Fazer outra pergunta 💬";
