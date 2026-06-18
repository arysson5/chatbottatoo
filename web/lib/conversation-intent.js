import { parseUserIntent, isGeminiConfigured } from "@/lib/gemini";

const WORD_TO_NUMBER = {
  um: 1,
  uma: 1,
  primeiro: 1,
  primeira: 1,
  dois: 2,
  duas: 2,
  segundo: 2,
  segunda: 2,
  tres: 3,
  três: 3,
  terceiro: 3,
  terceira: 3,
  quatro: 4,
  quarto: 4,
  quarta: 4,
  cinco: 5,
  quinto: 5,
  quinta: 5,
  seis: 6,
  sexto: 6,
  sete: 7,
  setimo: 7,
  oito: 8,
  nono: 9,
  dez: 10,
};

/**
 * @param {string} text
 * @returns {number | null}
 */
function wordToNumber(text) {
  const normalized = String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (WORD_TO_NUMBER[normalized] !== undefined) return WORD_TO_NUMBER[normalized];
  const digit = normalized.match(/^(\d+)/);
  if (digit) return Number(digit[1]);
  return null;
}

/**
 * @param {string} text
 * @param {RegExp[]} patterns
 * @returns {boolean}
 */
export function matchesAnyPattern(text, patterns) {
  const normalized = String(text || "").trim().toLowerCase();
  return patterns.some((p) => p.test(normalized));
}

/**
 * @param {string} text
 * @param {number} optionId
 * @returns {boolean}
 */
export function matchesMenuOption(text, optionId) {
  const normalized = String(text || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  const patternsByOption = {
    1: [/^(1|1\.|agendar|quero agendar|nova tattoo|nova|novo)$/, /^(um|uma|primeiro|primeira)$/],
    2: [/^(2|2\.|tirar duvida|duvida|dúvida|reformar|reforma)$/, /^(dois|duas|segundo|segunda)$/],
    3: [/^(3|3\.|complementar|complemento)$/, /^(tres|três|terceiro|terceira)$/],
  };

  const patterns = patternsByOption[optionId] || [];
  if (matchesAnyPattern(normalized, patterns)) return true;

  const wordNum = wordToNumber(normalized);
  return wordNum === optionId;
}

/**
 * @param {string} state
 * @param {string} normalized
 * @param {{ id: number }[]} options
 * @returns {number | null}
 */
function matchLooseByState(state, normalized, options) {
  const hasOption = (id) => options.some((o) => o.id === id);

  if (state === "pos_orcamento" || state === "pos_orcamento_expirado" || state === "faq_pos_orcamento") {
    if (
      hasOption(1) &&
      /\b(agendar|marcar|reservar|confirmar\s+horario|confirmar\s+horário)\b/.test(normalized) &&
      !/\b(duvida|dúvida|pergunta)\b/.test(normalized)
    ) {
      return 1;
    }
    if (hasOption(2) && /\b(duvida|dúvida|pergunta|tirar\s+d)\b/.test(normalized)) {
      return 2;
    }
  }

  if (state === "menu_principal") {
    if (hasOption(1) && /\b(nova|novo|nova tattoo|primeira tattoo)\b/.test(normalized)) return 1;
    if (hasOption(2) && /\b(reformar|reforma|cover|cobrir)\b/.test(normalized)) return 2;
    if (hasOption(3) && /\b(complementar|complemento|completar)\b/.test(normalized)) return 3;
  }

  return null;
}

/**
 * @param {object} params
 * @param {string} params.state
 * @param {{ id: number, label: string }[]} params.options
 * @param {string} params.userMessage
 * @returns {Promise<number | null>}
 */
export async function resolveOptionChoice({ state, options, userMessage }) {
  const text = String(userMessage || "").trim();
  if (!text) return null;

  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  for (const opt of options) {
    if (matchesMenuOption(text, opt.id)) return opt.id;
  }

  const loose = matchLooseByState(state, normalized, options);
  if (loose !== null) return loose;

  const wordNum = wordToNumber(text);
  if (wordNum !== null && options.some((o) => o.id === wordNum)) return wordNum;

  if (!isGeminiConfigured()) return null;

  const intent = await parseUserIntent(
    {
      state,
      step: state,
      description: `Escolha entre: ${options.map((o) => `${o.id} - ${o.label}`).join(", ")}`,
      options,
    },
    text,
  );
  if (
    intent &&
    intent.action === "select_option" &&
    typeof intent.optionId === "number" &&
    intent.confidence >= 0.6 &&
    options.some((o) => o.id === intent.optionId)
  ) {
    return intent.optionId;
  }

  return null;
}

/**
 * @param {string} text
 * @param {{ id: number }[]} slots
 * @returns {Promise<number | null>}
 */
export async function resolveSlotChoice(text, slots) {
  const options = slots.map((s) => ({ id: s.id, label: s.label }));
  return resolveOptionChoice({
    state: "escolha_horario",
    options,
    userMessage: text,
  });
}
