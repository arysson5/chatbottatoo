import fs from "node:fs";
import path from "node:path";

let cachedBase64 = "";

export function getCatalogoImagePath() {
  return path.join(process.cwd(), "assets", "catalogo.jpeg");
}

export function getCatalogoBase64() {
  if (cachedBase64) return cachedBase64;
  const imagePath = getCatalogoImagePath();
  const buffer = fs.readFileSync(imagePath);
  cachedBase64 = buffer.toString("base64");
  return cachedBase64;
}
