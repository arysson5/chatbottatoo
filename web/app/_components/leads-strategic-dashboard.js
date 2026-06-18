"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

function outcomeLabel(value) {
  if (value === "question_no_schedule") return "Tirou dúvida e não agendou";
  if (value === "left_for_later") return "Deixou para depois";
  if (value === "confirmed_schedule") return "Confirmou agendamento";
  return "Sem classificação";
}

function formatLeadOrigin(item) {
  if (item?.originNumberName) {
    const num = item.originNumber || "";
    return num ? `${item.originNumberName} (${num})` : item.originNumberName;
  }
  return item?.originNumber || "—";
}

export default function LeadsStrategicDashboard() {
  const router = useRouter();
  const [leads, setLeads] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const load = async () => {
      const res = await fetch("/api/admin/leads");
      const data = await res.json();
      if (res.status === 401) {
        router.replace("/login");
        return;
      }
      if (!res.ok) {
        setError(data?.error || "Erro ao carregar dashboard.");
        setLoading(false);
        return;
      }
      setLeads(Array.isArray(data.leads) ? data.leads : []);
      setOutcomes(Array.isArray(data.outcomes) ? data.outcomes : []);
      setLoading(false);
    };
    load();
  }, [router]);

  const strategicData = useMemo(() => {
    const nonScheduled = outcomes.filter(
      (item) =>
        item?.outcome === "question_no_schedule" || item?.outcome === "left_for_later",
    );
    const confirmed = outcomes.filter((item) => item?.outcome === "confirmed_schedule").length;
    const pendingHuman = leads.filter((lead) => lead?.status === "pending_handoff").length;
    const now = Date.now();
    const withinDeadline = [];
    const expiredDeadline = [];
    const areaCountMap = new Map();
    for (const item of nonScheduled) {
      const expiresAtMs = typeof item?.quoteExpiresAt === "string"
        ? new Date(item.quoteExpiresAt).getTime()
        : NaN;
      if (Number.isFinite(expiresAtMs) && expiresAtMs < now) {
        expiredDeadline.push(item);
      } else {
        withinDeadline.push(item);
      }
      const areas = Array.isArray(item?.selectedAreas) ? item.selectedAreas : [];
      for (const area of areas) {
        const key = Number(area);
        if (!Number.isFinite(key) || key <= 0) continue;
        areaCountMap.set(key, (areaCountMap.get(key) || 0) + 1);
      }
    }
    const areaRanking = [...areaCountMap.entries()]
      .map(([area, count]) => ({ area, count }))
      .sort((a, b) => b.count - a.count);
    const maxAreaCount = areaRanking[0]?.count || 1;
    return {
      nonScheduled,
      withinDeadline,
      expiredDeadline,
      confirmed,
      pendingHuman,
      areaRanking,
      maxAreaCount,
    };
  }, [leads, outcomes]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6">
        Carregando dashboard...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="mx-auto max-w-6xl px-4 py-8 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Dashboard estratégico de leads</h1>
            <p className="text-sm text-zinc-400">
              Visão dos leads em aberto e comportamento de não agendamento.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800"
          >
            Voltar para gestão
          </Link>
        </div>

        {error ? (
          <p className="rounded-md border border-red-800 bg-red-950/30 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        ) : null}

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <p className="text-xs text-zinc-400">Leads que não agendaram</p>
            <p className="mt-1 text-2xl font-semibold">{strategicData.nonScheduled.length}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <p className="text-xs text-zinc-400">Dentro do prazo (7 dias)</p>
            <p className="mt-1 text-2xl font-semibold">{strategicData.withinDeadline.length}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <p className="text-xs text-zinc-400">Fora do prazo</p>
            <p className="mt-1 text-2xl font-semibold">{strategicData.expiredDeadline.length}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <p className="text-xs text-zinc-400">Agendamentos confirmados</p>
            <p className="mt-1 text-2xl font-semibold">{strategicData.confirmed}</p>
          </div>
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <p className="text-xs text-zinc-400">Em handoff humano</p>
            <p className="mt-1 text-2xl font-semibold">{strategicData.pendingHuman}</p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <h2 className="text-sm font-medium">Leads dentro do prazo (até 7 dias)</h2>
            <div className="mt-3 max-h-80 space-y-2 overflow-auto">
              {strategicData.withinDeadline.length === 0 ? (
                <p className="text-sm text-zinc-500">Nenhum lead dentro do prazo.</p>
              ) : (
                strategicData.withinDeadline.map((item, index) => (
                  <div
                    key={`within-${item.number}-${item.createdAt}-${index}`}
                    className="rounded-md border border-zinc-800 px-3 py-2"
                  >
                    <p className="text-sm font-medium">
                      {item.clientName || "Cliente"} · {item.number}
                    </p>
                    <p className="text-xs text-zinc-400">{outcomeLabel(item.outcome)}</p>
                    <p className="text-xs text-zinc-500">Origem: {formatLeadOrigin(item)}</p>
                    <p className="mt-1 text-xs text-zinc-300">
                      Áreas:{" "}
                      {Array.isArray(item.selectedAreas) && item.selectedAreas.length > 0
                        ? item.selectedAreas.join(", ")
                        : "não informado"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <h2 className="text-sm font-medium">Leads fora do prazo (expirados)</h2>
            <div className="mt-3 max-h-80 space-y-2 overflow-auto">
              {strategicData.expiredDeadline.length === 0 ? (
                <p className="text-sm text-zinc-500">Nenhum lead fora do prazo.</p>
              ) : (
                strategicData.expiredDeadline.map((item, index) => (
                  <div
                    key={`expired-${item.number}-${item.createdAt}-${index}`}
                    className="rounded-md border border-zinc-800 px-3 py-2"
                  >
                    <p className="text-sm font-medium">
                      {item.clientName || "Cliente"} · {item.number}
                    </p>
                    <p className="text-xs text-zinc-400">{outcomeLabel(item.outcome)}</p>
                    <p className="text-xs text-zinc-500">Origem: {formatLeadOrigin(item)}</p>
                    <p className="mt-1 text-xs text-zinc-300">
                      Áreas:{" "}
                      {Array.isArray(item.selectedAreas) && item.selectedAreas.length > 0
                        ? item.selectedAreas.join(", ")
                        : "não informado"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <h2 className="text-sm font-medium">Leads em aberto (não agendaram)</h2>
            <div className="mt-3 max-h-96 space-y-2 overflow-auto">
              {strategicData.nonScheduled.length === 0 ? (
                <p className="text-sm text-zinc-500">Nenhum lead aberto no momento.</p>
              ) : (
                strategicData.nonScheduled.map((item, index) => (
                  <div
                    key={`${item.number}-${item.createdAt}-${index}`}
                    className="rounded-md border border-zinc-800 px-3 py-2"
                  >
                    <p className="text-sm font-medium">
                      {item.clientName || "Cliente"} · {item.number}
                    </p>
                    <p className="text-xs text-zinc-400">{outcomeLabel(item.outcome)}</p>
                    <p className="text-xs text-zinc-500">Origem: {formatLeadOrigin(item)}</p>
                    <p className="mt-1 text-xs text-zinc-300">
                      Áreas:{" "}
                      {Array.isArray(item.selectedAreas) && item.selectedAreas.length > 0
                        ? item.selectedAreas.join(", ")
                        : "não informado"}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
            <h2 className="text-sm font-medium">Áreas mais escolhidas (não agendaram)</h2>
            <div className="mt-3 space-y-2">
              {strategicData.areaRanking.length === 0 ? (
                <p className="text-sm text-zinc-500">Sem dados de áreas ainda.</p>
              ) : (
                strategicData.areaRanking.slice(0, 10).map((item) => {
                  const width = Math.max(
                    12,
                    Math.round((item.count / strategicData.maxAreaCount) * 100),
                  );
                  return (
                    <div key={item.area} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span>Área {item.area}</span>
                        <span className="text-zinc-400">{item.count} lead(s)</span>
                      </div>
                      <div className="h-2 rounded bg-zinc-800">
                        <div
                          className="h-2 rounded bg-amber-500"
                          style={{ width: `${width}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

