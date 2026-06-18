export const TRIBAL_FAQ_ENTRIES = [
  {
    id: "dor",
    keywords: ["dor", "doer", "machuca", "sensivel", "sensível"],
    answer:
      "Neo Tribal costuma ser intenso em áreas com pouca gordura (costelas, tornozele), mais suave em braço/coxa. Usamos técnica gradual — você pode pedir pausa quando quiser. 💪",
  },
  {
    id: "cicatrizacao",
    keywords: ["cicatriz", "cicatriza", "demora", "curar", "sarar"],
    answer:
      "A pele leva cerca de 2–4 semanas para cicatrizar superficialmente; o processo completo leva até 2 meses. Evite sol, piscina e roçar roupa nas primeiras semanas. ☀️🚫",
  },
  {
    id: "cuidados",
    keywords: ["cuidado", "pos", "pós", "depois", "higiene", "lavar"],
    answer:
      "Nas primeiras 24h lave com sabonete neutro, seque com papel toalha e passe pomada indicada. Não coce, não arranque casquinha e mantenha hidratado. 🧴",
  },
  {
    id: "estilo",
    keywords: ["tribal", "neo tribal", "estilo", "referencia", "referência", "geométrico"],
    answer:
      "Neo Tribal combina formas tribais clássicas com linhas geométricas modernas. Envie referências que você curte — adaptamos ao seu corpo e fluxo muscular. 🔥",
  },
  {
    id: "sessao",
    keywords: ["sessao", "sessão", "tempo", "horas", "duracao", "duração", "quanto tempo"],
    answer:
      "Depende do tamanho e detalhe. Projetos médios costumam 3–6h por sessão; peças grandes podem ser divididas em mais de um dia. ⏱️",
  },
  {
    id: "retoque",
    keywords: ["retoque", "refazer", "consertar", "mancha"],
    answer:
      "Retoque leve de acabamento (até 30 dias, conforme avaliação) pode ser combinado no pós. Alterações grandes entram como nova sessão. ✅",
  },
  {
    id: "preparo",
    keywords: ["preparar", "preparação", "preparacao", "antes", "jejuar", "beber"],
    answer:
      "Durma bem, alimente-se antes, evite álcool 24h antes e use roupa confortável que libere a área. Hidrate a pele nos dias anteriores. 💧",
  },
];

export function matchLocalFaqAnswer(text) {
  const normalized = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  for (const entry of TRIBAL_FAQ_ENTRIES) {
    if (entry.keywords.some((kw) => normalized.includes(kw))) {
      return entry.answer;
    }
  }
  return null;
}

export const FAQ_MENU_TEXT =
  "Estou aqui para tirar suas dúvidas sobre tattoo tribal! 🖤\n\nPode perguntar sobre dor, cicatrização, cuidados, estilo Neo Tribal ou tempo de sessão.\n\nOu digite:\n1 - Agendar agora 📅\n2 - Fazer outra pergunta 💬";
