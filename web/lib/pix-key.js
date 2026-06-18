/**
 * @param {string} name
 * @returns {string}
 */
function normalizePersonName(name) {
  return String(name || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * @param {string} expectedName
 * @param {string} foundName
 * @returns {boolean}
 */
export function recipientNamesMatch(expectedName, foundName) {
  const expected = normalizePersonName(expectedName);
  const found = normalizePersonName(foundName);
  if (!expected || !found) return false;
  if (expected === found) return true;
  if (found.includes(expected) || expected.includes(found)) return true;

  const partsExpected = expected.split(" ").filter((part) => part.length > 2);
  const partsFound = found.split(" ").filter((part) => part.length > 2);
  if (!partsExpected.length || !partsFound.length) return false;

  const matched = partsExpected.filter((part) =>
    partsFound.some((other) => other.includes(part) || part.includes(other)),
  );
  return matched.length >= Math.min(2, partsExpected.length);
}

/**
 * Valida se o nome do recebedor no comprovante confere com o cadastrado.
 * Não valida chave PIX (bancos raramente exibem no comprovante).
 * @param {object} proof
 * @param {object} settings
 * @returns {{ verified: boolean, method: string }}
 */
export function verifyPixProofRecipient(proof, settings) {
  const expectedName = settings?.pixHolderName?.trim() || "";

  if (!expectedName) {
    return { verified: true, method: "no_name_configured" };
  }

  if (proof?.nameMatchesExpected && (proof?.nameMatchConfidence ?? 0) >= 0.6) {
    return { verified: true, method: "gemini_name_match" };
  }

  if (proof?.recipientName && recipientNamesMatch(expectedName, proof.recipientName)) {
    return { verified: true, method: "local_name_match" };
  }

  return { verified: false, method: "none" };
}
