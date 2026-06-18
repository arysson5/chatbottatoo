function digitsOnly(value) {
  return String(value || "").replace(/\D/g, "");
}

/**
 * @param {object} settings
 * @returns {string[]}
 */
export function getSecretaryNumbers(settings) {
  const fromArray = Array.isArray(settings?.secretaryNumbers)
    ? settings.secretaryNumbers.map(digitsOnly).filter(Boolean)
    : [];
  if (fromArray.length) return [...new Set(fromArray)];

  const legacy = digitsOnly(settings?.handoffNumber);
  return legacy ? [legacy] : [];
}

/**
 * @param {(number: string, message: string) => Promise<void>} sendText
 * @param {object} settings
 * @param {string} message
 */
export async function sendToSecretaries(sendText, settings, message) {
  const numbers = getSecretaryNumbers(settings);
  for (const secNumber of numbers) {
    await sendText(secNumber, message);
  }
}
