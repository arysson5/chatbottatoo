"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [hasPassword, setHasPassword] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    const loadStatus = async () => {
      const res = await fetch("/api/auth/status");
      const data = await res.json();
      setHasPassword(Boolean(data.hasPassword));
      if (data.authenticated) {
        router.replace("/");
        return;
      }
      setLoading(false);
    };
    loadStatus();
  }, [router]);

  async function handleSetup(event) {
    event.preventDefault();
    setError("");
    const res = await fetch("/api/auth/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password, confirmPassword }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Erro ao criar senha.");
      return;
    }
    setHasPassword(true);
    setPassword("");
    setConfirmPassword("");
  }

  async function handleLogin(event) {
    event.preventDefault();
    setError("");
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || "Erro ao entrar.");
      return;
    }
    router.replace("/");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center">
        Carregando...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-xl border border-zinc-800 bg-zinc-900 p-6">
        <h1 className="text-xl font-semibold">
          {hasPassword ? "Entrar no painel" : "Criar senha do painel"}
        </h1>
        <p className="mt-2 text-sm text-zinc-400">
          {hasPassword
            ? "Use sua senha para gerenciar o fluxo, números e preços."
            : "Primeiro acesso: defina uma senha para o painel administrativo."}
        </p>
        {error ? (
          <p className="mt-3 rounded-md bg-red-950/60 px-3 py-2 text-sm text-red-300">{error}</p>
        ) : null}
        <form className="mt-5 space-y-3" onSubmit={hasPassword ? handleLogin : handleSetup}>
          <input
            type="password"
            placeholder="Senha"
            className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {!hasPassword ? (
            <input
              type="password"
              placeholder="Confirmar senha"
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-amber-500"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          ) : null}
          <button
            type="submit"
            className="w-full rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-400"
          >
            {hasPassword ? "Entrar" : "Criar senha"}
          </button>
        </form>
      </div>
    </div>
  );
}

