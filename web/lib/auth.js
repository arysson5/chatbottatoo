import crypto from "node:crypto";
import { cookies } from "next/headers";
import { readDb, updateDb } from "@/lib/simple-db";

const SESSION_COOKIE = "briza_session";

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

export async function hasPasswordConfigured() {
  const db = await readDb();
  return Boolean(db.auth.passwordHash);
}

export async function setupPassword(password) {
  const trimmed = String(password || "").trim();
  if (trimmed.length < 6) {
    throw new Error("A senha precisa ter ao menos 6 caracteres.");
  }

  const db = await readDb();
  if (db.auth.passwordHash) {
    throw new Error("Senha já configurada.");
  }

  await updateDb((draft) => {
    draft.auth.passwordHash = hashPassword(trimmed);
    draft.auth.sessionToken = "";
    return draft;
  });
}

export async function loginWithPassword(password) {
  const db = await readDb();
  if (!db.auth.passwordHash) {
    throw new Error("Senha ainda não configurada.");
  }

  const expected = db.auth.passwordHash;
  const actual = hashPassword(String(password || ""));
  if (actual !== expected) {
    throw new Error("Senha inválida.");
  }

  const token = crypto.randomUUID();
  await updateDb((draft) => {
    draft.auth.sessionToken = token;
    return draft;
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function logout() {
  await updateDb((draft) => {
    draft.auth.sessionToken = "";
    return draft;
  });

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
  });
}

export async function isAuthenticated() {
  const db = await readDb();
  if (!db.auth.sessionToken) return false;
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value || "";
  return token.length > 0 && token === db.auth.sessionToken;
}

