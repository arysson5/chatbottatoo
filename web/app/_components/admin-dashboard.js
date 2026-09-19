"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { formatManagedNumberLabel, normalizeManagedNumbersList } from "@/lib/managed-numbers";

function formatLeadOrigin(item) {
  if (item?.originNumberName) {
    const num = item.originNumber || "";
    return num ? `${item.originNumberName} (${num})` : item.originNumberName;
  }
  return item?.originNumber || "—";
}

const EMPTY_SETTINGS = {
  managedNumbers: [],
  secretaryNumbers: [],
  handoffNumber: "",
  welcomeMessage: "",
  projectPrompt: "",
  catalogPrompt: "",
  pixFixedAmount: "R$ 200,00",
  pixKey: "",
  pixHolderName: "",
  pixInstructions: "",
  scheduling: {
    slotDurationMinutes: 120,
    daysAhead: 14,
    workingHours: [
      { day: 1, start: "10:00", end: "19:00" },
      { day: 2, start: "10:00", end: "19:00" },
      { day: 3, start: "10:00", end: "19:00" },
      { day: 4, start: "10:00", end: "19:00" },
      { day: 5, start: "10:00", end: "19:00" },
      { day: 6, start: "10:00", end: "19:00" },
    ],
  },
  googleCalendar: {
    calendarId: "primary",
    connectedAt: "",
  },
};

const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

export default function AdminDashboard() {
  const router = useRouter();
  const [settings, setSettings] = useState(EMPTY_SETTINGS);
  const [pricing, setPricing] = useState([]);
  const [leads, setLeads] = useState([]);
  const [status, setStatus] = useState("Carregando...");
  const [saving, setSaving] = useState(false);
  const [newManagedNumber, setNewManagedNumber] = useState("");
  const [newManagedNumberName, setNewManagedNumberName] = useState("");
  const [newSecretaryNumber, setNewSecretaryNumber] = useState("");
  const [connectNumber, setConnectNumber] = useState("");
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState("");
  const [connectionStatus, setConnectionStatus] = useState("");
  const [connectionInstance, setConnectionInstance] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [pairingCode, setPairingCode] = useState("");
  const [calendarConnected, setCalendarConnected] = useState(false);

  useEffect(() => {
    const load = async () => {
      const [configRes, leadsRes] = await Promise.all([fetch("/api/admin/config"), fetch("/api/admin/leads")]);

      if (configRes.status === 401 || leadsRes.status === 401) {
        router.replace("/login");
        return;
      }

      const configData = await configRes.json();
      const leadsData = await leadsRes.json();
      setSettings({
        ...EMPTY_SETTINGS,
        ...(configData.settings || {}),
        managedNumbers: normalizeManagedNumbersList(configData.settings?.managedNumbers),
        scheduling: {
          ...EMPTY_SETTINGS.scheduling,
          ...(configData.settings?.scheduling || {}),
        },
        googleCalendar: {
          ...EMPTY_SETTINGS.googleCalendar,
          ...(configData.settings?.googleCalendar || {}),
        },
      });
      setCalendarConnected(Boolean(configData.calendarConnected));
      setPricing(Array.isArray(configData.pricing) ? configData.pricing : []);
      setLeads(Array.isArray(leadsData.leads) ? leadsData.leads : []);
      setStatus("");
    };
    load();
  }, [router]);

  const leadCount = useMemo(
    () => leads.filter((lead) => lead.status === "pending_handoff").length,
    [leads],
  );

  const managedNumbersList = useMemo(
    () => normalizeManagedNumbersList(settings.managedNumbers),
    [settings.managedNumbers],
  );

  function updatePrice(area, field, value) {
    setPricing((current) =>
      current.map((row) => (row.area === area ? { ...row, [field]: value } : row)),
    );
  }

  function addNextPricingArea() {
    setPricing((current) => {
      const list = Array.isArray(current) ? [...current] : [];
      const maxArea = list.reduce((max, row) => Math.max(max, Number(row?.area) || 0), 0);
      const nextArea = maxArea + 1;
      if (list.some((row) => Number(row?.area) === nextArea)) return list;
      return [
        ...list,
        { area: nextArea, areaLabel: "", tattooNova: "", complemento: "", reforma: "" },
      ].sort((a, b) => a.area - b.area);
    });
  }

  function removePricingArea(area) {
    setPricing((current) => current.filter((row) => row.area !== area));
  }

  function digitsOnly(value) {
    return String(value || "").replace(/\D/g, "");
  }

  function addManagedNumber() {
    const next = digitsOnly(newManagedNumber);
    if (!next) return;
    const name = newManagedNumberName.trim();
    setSettings((current) => {
      const list = normalizeManagedNumbersList(current.managedNumbers);
      if (list.some((item) => item.number === next)) return current;
      return { ...current, managedNumbers: [...list, { number: next, name }] };
    });
    setNewManagedNumber("");
    setNewManagedNumberName("");
  }

  function updateManagedNumberName(number, name) {
    setSettings((current) => ({
      ...current,
      managedNumbers: normalizeManagedNumbersList(current.managedNumbers).map((item) =>
        item.number === number ? { ...item, name: name.trim() } : item,
      ),
    }));
  }

  function removeManagedNumber(number) {
    setSettings((current) => ({
      ...current,
      managedNumbers: normalizeManagedNumbersList(current.managedNumbers).filter(
        (item) => item.number !== number,
      ),
    }));
  }

  function addSecretaryNumber() {
    const next = digitsOnly(newSecretaryNumber);
    if (!next) return;
    setSettings((current) => {
      const currentList = Array.isArray(current.secretaryNumbers) ? current.secretaryNumbers : [];
      if (currentList.includes(next)) return current;
      return { ...current, secretaryNumbers: [...currentList, next] };
    });
    setNewSecretaryNumber("");
  }

  function removeSecretaryNumber(number) {
    setSettings((current) => ({
      ...current,
      secretaryNumbers: (current.secretaryNumbers || []).filter((item) => item !== number),
    }));
  }

  function parsePixAmount(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (!digits) return 0;
    return Number(digits) / 100;
  }

  function instanceFromNumber(number) {
    const digits = digitsOnly(number);
    return digits ? `briza-${digits}` : "";
  }

  async function parseJsonSafe(res) {
    try {
      return await res.json();
    } catch {
      return {};
    }
  }

  async function checkConnectionState(instanceName) {
    const res = await fetch("/api/evolution/connection-state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceName }),
    });
    const data = await res.json();
    if (data?.connected === true) return "open";
    const state = String(
      data?.instance?.state || data?.state || data?.connectionStatus || "desconhecido",
    ).toLowerCase();
    if (state === "open" || state === "connected") return "open";
    return state;
  }

  async function handleGenerateQr() {
    const number = digitsOnly(connectNumber);
    if (!number) {
      setStatus("Digite um número válido para conectar.");
      return;
    }
    const instanceName = instanceFromNumber(number);
    setConnecting(true);
    setStatus("");
    setConnectionStatus("criando instância...");
    setConnectionInstance(instanceName);
    setQrCodeDataUrl("");
    setPairingCode("");

    const createRes = await fetch("/api/evolution/create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceName }),
    });
    const createData = await parseJsonSafe(createRes);

    if (!createRes.ok) {
      const text = String(createData?.error || "").toLowerCase();
      const alreadyExists = text.includes("already") || text.includes("exist");
      if (!alreadyExists) {
        setStatus(createData?.error || "Não foi possível criar a instância.");
        setConnecting(false);
        return;
      }
    }

    const connectRes = await fetch("/api/evolution/connect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instanceName }),
    });
    const connectData = await parseJsonSafe(connectRes);
    if (!connectRes.ok) {
      setStatus(connectData?.error || "Não foi possível gerar QR Code.");
      setConnecting(false);
      return;
    }

    const qr = connectData?.qrcodeDataUrl || "";
    const code = connectData?.pairingCode || "";
    setQrCodeDataUrl(qr);
    setPairingCode(code);
    if (qr || code) {
      setConnectionStatus("aguardando leitura do QR Code...");
    } else {
      setConnectionStatus("QR não gerado pela Evolution");
      setStatus(
        connectData?.error ||
          "A API não devolveu QR. Abra http://localhost:8080/manager, apague instâncias antigas (briz, etc.) e tente de novo.",
      );
    }
    addManagedNumberFromValue(number);
    setConnecting(false);
  }

  function addManagedNumberFromValue(number, name = "") {
    const digits = digitsOnly(number);
    if (!digits) return;
    setSettings((current) => {
      const list = normalizeManagedNumbersList(current.managedNumbers);
      if (list.some((item) => item.number === digits)) return current;
      return {
        ...current,
        managedNumbers: [...list, { number: digits, name: String(name || "").trim() }],
      };
    });
  }

  const managedNumbersKey = useMemo(
    () => managedNumbersList.map((i) => i.number).join(","),
    [managedNumbersList],
  );

  useEffect(() => {
    if (!connectionInstance) return;
    const interval = setInterval(async () => {
      try {
        const state = await checkConnectionState(connectionInstance);
        if (state === "open") {
          setConnectionStatus("conectado ✅");
          setQrCodeDataUrl("");
          setPairingCode("");
          clearInterval(interval);
        }
      } catch {
        // Mantém polling silencioso.
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [connectionInstance]);

  useEffect(() => {
    let cancelled = false;
    async function refreshManagedStatuses() {
      const list = normalizeManagedNumbersList(settings.managedNumbers);
      if (!list.length) return;
      const updates = await Promise.all(
        list.map(async (item) => {
          const instanceName = instanceFromNumber(item.number);
          try {
            const state = await checkConnectionState(instanceName);
            return {
              number: item.number,
              connectionStatus: state,
              needsQr: state !== "open",
            };
          } catch {
            return {
              number: item.number,
              connectionStatus: item.connectionStatus || "desconhecido",
              needsQr: item.needsQr ?? true,
            };
          }
        }),
      );
      if (cancelled) return;
      setSettings((current) => ({
        ...current,
        managedNumbers: normalizeManagedNumbersList(current.managedNumbers).map((item) => {
          const hit = updates.find((u) => u.number === item.number);
          if (!hit) return item;
          return {
            ...item,
            connectionStatus: hit.connectionStatus,
            needsQr: hit.needsQr,
          };
        }),
      }));
    }
    refreshManagedStatuses();
    const interval = setInterval(refreshManagedStatuses, 30_000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [managedNumbersKey]);

  async function handleReconnectNumber(number) {
    const digits = digitsOnly(number);
    const instanceName = instanceFromNumber(digits);
    if (!instanceName) return;
    setConnectNumber(digits);
    setConnectionInstance(instanceName);
    setConnecting(true);
    setStatus("Reconectando...");
    setConnectionStatus("reconectando...");
    try {
      const createRes = await fetch("/api/evolution/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceName }),
      });
      const createData = await parseJsonSafe(createRes);
      if (!createRes.ok) {
        const text = String(createData?.error || "").toLowerCase();
        const alreadyExists = text.includes("already") || text.includes("exist");
        if (!alreadyExists) {
          setStatus(createData?.error || "Falha ao preparar reconexão.");
          setConnecting(false);
          return;
        }
      }
      const connectRes = await fetch("/api/evolution/connect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instanceName }),
      });
      const connectData = await parseJsonSafe(connectRes);
      if (!connectRes.ok) {
        setStatus(connectData?.error || "Não foi possível reconectar.");
        setConnecting(false);
        return;
      }
      const qr = connectData?.qrcodeDataUrl || "";
      const code = connectData?.pairingCode || "";
      setQrCodeDataUrl(qr);
      setPairingCode(code);
      setConnectionStatus(qr || code ? "aguardando leitura do QR Code..." : "reconectando...");
      setStatus(qr || code ? "Escaneie o QR para reconectar." : "Tentativa de reconexão enviada.");
      setSettings((current) => ({
        ...current,
        managedNumbers: normalizeManagedNumbersList(current.managedNumbers).map((item) =>
          item.number === digits
            ? { ...item, needsQr: Boolean(qr || code), connectionStatus: "connecting" }
            : item,
        ),
      }));
    } finally {
      setConnecting(false);
    }
  }

  async function saveAll() {
    const pixKey = String(settings.pixKey || "").trim();
    const pixAmount = parsePixAmount(settings.pixFixedAmount);
    if (!pixKey || pixAmount <= 0) {
      setStatus("Chave PIX e valor do sinal são obrigatórios para agendamento online.");
      return;
    }

    setSaving(true);
    setStatus("");
    const res = await fetch("/api/admin/config", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings, pricing }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || "Erro ao salvar.");
      setSaving(false);
      return;
    }
    setStatus("Salvo com sucesso.");
    setSaving(false);
  }

  function updateScheduling(field, value) {
    setSettings((current) => ({
      ...current,
      scheduling: { ...(current.scheduling || EMPTY_SETTINGS.scheduling), [field]: value },
    }));
  }

  function updateWorkingHour(day, field, value) {
    setSettings((current) => {
      const hours = [...(current.scheduling?.workingHours || EMPTY_SETTINGS.scheduling.workingHours)];
      const idx = hours.findIndex((h) => h.day === day);
      if (idx >= 0) {
        hours[idx] = { ...hours[idx], [field]: value };
      } else {
        hours.push({ day, start: "10:00", end: "19:00", [field]: value });
      }
      return {
        ...current,
        scheduling: { ...(current.scheduling || {}), workingHours: hours.sort((a, b) => a.day - b.day) },
      };
    });
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <main className="mx-auto max-w-6xl px-4 py-8 space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Painel Briza Tattoo</h1>
            <p className="text-sm text-zinc-400">Configure fluxo, números e tabela de precificação.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={saveAll}
              disabled={saving}
              className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-400 disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar alterações"}
            </button>
            <button
              onClick={handleLogout}
              className="rounded-md border border-zinc-700 px-4 py-2 text-sm hover:bg-zinc-800"
            >
              Sair
            </button>
          </div>
        </header>

        {status ? (
          <p className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm">{status}</p>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="text-lg font-medium">Configuração de números</h2>
            <div className="mt-3 space-y-3">
              <div>
                <span className="mb-1 block text-sm text-zinc-300">Números de atendimento</span>
                <p className="text-xs text-zinc-500">
                  Cada linha pode ter um nome (ex.: Estúdio Centro) para identificar a origem nos leads.
                </p>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                  <input
                    className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                    value={newManagedNumberName}
                    onChange={(e) => setNewManagedNumberName(e.target.value)}
                    placeholder="Nome da linha (opcional)"
                  />
                  <input
                    className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                    value={newManagedNumber}
                    onChange={(e) => setNewManagedNumber(e.target.value)}
                    placeholder="5511999999999"
                  />
                  <button
                    type="button"
                    onClick={addManagedNumber}
                    className="rounded-md border border-zinc-700 px-3 py-2 text-sm hover:bg-zinc-800 sm:shrink-0"
                  >
                    Adicionar
                  </button>
                </div>
                <div className="mt-3 space-y-2">
                  {managedNumbersList.length === 0 ? (
                    <p className="text-xs text-zinc-500">Nenhum número cadastrado.</p>
                  ) : (
                    managedNumbersList.map((item) => (
                      <div
                        key={item.number}
                        className="flex flex-col gap-2 rounded-lg border border-zinc-700 bg-zinc-950 p-3 sm:flex-row sm:items-center"
                      >
                        <div className="min-w-0 flex-1">
                          <input
                            className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm"
                            value={item.name}
                            onChange={(e) => updateManagedNumberName(item.number, e.target.value)}
                            placeholder="Nome da linha"
                          />
                          <p className="mt-1 text-xs text-zinc-500">
                            {formatManagedNumberLabel(item)}
                          </p>
                          <div className="mt-2 flex flex-wrap items-center gap-2">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                                item.connectionStatus === "open"
                                  ? "bg-emerald-900/60 text-emerald-300"
                                  : item.needsQr
                                    ? "bg-amber-900/60 text-amber-300"
                                    : "bg-zinc-800 text-zinc-400"
                              }`}
                            >
                              {item.connectionStatus === "open"
                                ? "conectado"
                                : item.needsQr
                                  ? "precisa QR"
                                  : item.connectionStatus || "offline"}
                            </span>
                          </div>
                        </div>
                        <div className="flex gap-2 sm:shrink-0">
                          {(item.needsQr || item.connectionStatus !== "open") && (
                            <button
                              type="button"
                              onClick={() => handleReconnectNumber(item.number)}
                              disabled={connecting}
                              className="rounded-md border border-emerald-800 px-3 py-2 text-xs text-emerald-300 hover:bg-emerald-950 disabled:opacity-50"
                            >
                              Reconectar
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => removeManagedNumber(item.number)}
                            className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-400 hover:border-red-800 hover:text-red-400"
                            aria-label={`Remover ${item.number}`}
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <label className="block">
                <span className="mb-1 block text-sm text-zinc-300">
                  Números da secretaria (recebem resumo do cliente e horário)
                </span>
                <div className="flex gap-2">
                  <input
                    className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                    value={newSecretaryNumber}
                    onChange={(e) => setNewSecretaryNumber(e.target.value)}
                    placeholder="5511888888888"
                  />
                  <button
                    type="button"
                    onClick={addSecretaryNumber}
                    className="rounded-md bg-zinc-700 px-3 py-2 text-sm hover:bg-zinc-600"
                  >
                    Adicionar
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(settings.secretaryNumbers || []).length === 0 ? (
                    <p className="text-xs text-zinc-500">
                      Nenhum número cadastrado. Use o legado abaixo ou adicione aqui.
                    </p>
                  ) : (
                    (settings.secretaryNumbers || []).map((number) => (
                      <span
                        key={number}
                        className="inline-flex items-center gap-2 rounded-full border border-zinc-700 bg-zinc-950 px-3 py-1 text-xs"
                      >
                        {number}
                        <button
                          type="button"
                          onClick={() => removeSecretaryNumber(number)}
                          className="text-zinc-400 hover:text-red-400"
                          aria-label={`Remover secretaria ${number}`}
                        >
                          x
                        </button>
                      </span>
                    ))
                  )}
                </div>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm text-zinc-400">
                  Número legado para handoff (fallback se a lista acima estiver vazia)
                </span>
                <input
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  value={settings.handoffNumber || ""}
                  onChange={(e) =>
                    setSettings((current) => ({ ...current, handoffNumber: e.target.value }))
                  }
                  placeholder="5511888888888"
                />
              </label>
            </div>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
            <h2 className="text-lg font-medium">Leads para repasse</h2>
            <p className="mt-1 text-sm text-zinc-400">Pendentes: {leadCount}</p>
            <div className="mt-3 max-h-40 space-y-2 overflow-auto">
              {leads.length === 0 ? (
                <p className="text-sm text-zinc-500">Nenhum lead registrado.</p>
              ) : (
                leads.map((lead) => (
                  <div
                    key={`${lead.number}-${lead.createdAt}`}
                    className="rounded-md border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                  >
                    <p>{lead.number}</p>
                    <p className="text-zinc-400">
                      {lead.projectType} · {lead.status}
                    </p>
                    <p className="text-xs text-zinc-500">Origem: {formatLeadOrigin(lead)}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-lg font-medium">Conectar número com QR Code</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Digite o número, gere o QR Code e escaneie com o WhatsApp para deixar online.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              className="w-full max-w-xs rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              value={connectNumber}
              onChange={(e) => setConnectNumber(e.target.value)}
              placeholder="5511999999999"
            />
            <button
              type="button"
              onClick={handleGenerateQr}
              disabled={connecting}
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-60"
            >
              {connecting ? "Gerando..." : "Gerar QR Code"}
            </button>
          </div>
          {connectionStatus ? <p className="mt-3 text-sm text-zinc-300">Status: {connectionStatus}</p> : null}
          {connectionInstance ? (
            <p className="mt-1 text-xs text-zinc-500">Instância: {connectionInstance}</p>
          ) : null}
          {pairingCode ? (
            <p className="mt-3 text-sm text-amber-300">
              Código de pareamento:{" "}
              <span className="font-mono font-semibold">{pairingCode}</span>
            </p>
          ) : null}
          {qrCodeDataUrl ? (
            <div className="mt-4 rounded-lg border border-zinc-800 bg-white p-3 inline-block">
              <Image
                src={qrCodeDataUrl}
                alt="QR Code da conexão"
                width={224}
                height={224}
                unoptimized
              />
            </div>
          ) : null}
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <h2 className="text-lg font-medium">Análise estratégica de leads</h2>
          <p className="mt-1 text-sm text-zinc-400">
            Visualize os leads que não agendaram e as áreas mais escolhidas em dashboards visuais.
          </p>
          <Link
            href="/gestao/leads"
            className="mt-3 inline-flex items-center justify-center rounded-md bg-indigo-500 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-400"
          >
            Abrir dashboard estratégico
          </Link>
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
            <h2 className="text-lg font-medium">PIX — sinal de agendamento</h2>
            <p className="text-sm text-amber-300/90">
              Chave PIX e valor do sinal são obrigatórios para liberar agendamento online e validação
              do comprovante.
            </p>
            <p className="text-xs text-zinc-500">
              Tipos de chave: CPF, e-mail, telefone (+55…) ou chave aleatória. O bot compara chave e
              valor no comprovante enviado pelo cliente.
            </p>
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">Valor fixo do sinal *</span>
              <input
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                value={settings.pixFixedAmount || ""}
                onChange={(e) => setSettings((c) => ({ ...c, pixFixedAmount: e.target.value }))}
                placeholder="R$ 200,00"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">Chave PIX *</span>
              <input
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                value={settings.pixKey || ""}
                onChange={(e) => setSettings((c) => ({ ...c, pixKey: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">Nome do recebedor</span>
              <input
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                value={settings.pixHolderName || ""}
                onChange={(e) => setSettings((c) => ({ ...c, pixHolderName: e.target.value }))}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">Instruções extras</span>
              <textarea
                rows={2}
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                value={settings.pixInstructions || ""}
                onChange={(e) => setSettings((c) => ({ ...c, pixInstructions: e.target.value }))}
              />
            </label>
          </div>

          <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
            <h2 className="text-lg font-medium">Google Calendar</h2>
            <p className="text-sm text-zinc-400">
              Status: {calendarConnected ? "Conectado ✅" : "Não conectado"}
              {settings.googleCalendar?.connectedAt
                ? ` · desde ${new Date(settings.googleCalendar.connectedAt).toLocaleDateString("pt-BR")}`
                : ""}
            </p>
            <label className="block">
              <span className="mb-1 block text-sm text-zinc-300">ID do calendário</span>
              <input
                className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                value={settings.googleCalendar?.calendarId || "primary"}
                onChange={(e) =>
                  setSettings((c) => ({
                    ...c,
                    googleCalendar: { ...(c.googleCalendar || {}), calendarId: e.target.value },
                  }))
                }
                placeholder="primary"
              />
            </label>
            <a
              href="/api/admin/google-calendar/auth"
              className="inline-flex rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
            >
              Conectar Google Calendar
            </a>
            <div className="grid grid-cols-2 gap-2 pt-2">
              <label className="block">
                <span className="mb-1 block text-xs text-zinc-400">Duração sessão (min)</span>
                <input
                  type="number"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  value={settings.scheduling?.slotDurationMinutes || 120}
                  onChange={(e) => updateScheduling("slotDurationMinutes", Number(e.target.value))}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-zinc-400">Dias à frente</span>
                <input
                  type="number"
                  className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                  value={settings.scheduling?.daysAhead || 14}
                  onChange={(e) => updateScheduling("daysAhead", Number(e.target.value))}
                />
              </label>
            </div>
            <div className="space-y-2">
              <span className="block text-sm text-zinc-300">Horários de atendimento</span>
              {(settings.scheduling?.workingHours || EMPTY_SETTINGS.scheduling.workingHours).map(
                (wh) => (
                  <div key={wh.day} className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="w-10 text-zinc-400">{DAY_LABELS[wh.day]}</span>
                    <input
                      type="time"
                      className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1"
                      value={wh.start}
                      onChange={(e) => updateWorkingHour(wh.day, "start", e.target.value)}
                    />
                    <span className="text-zinc-500">até</span>
                    <input
                      type="time"
                      className="rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1"
                      value={wh.end}
                      onChange={(e) => updateWorkingHour(wh.day, "end", e.target.value)}
                    />
                  </div>
                ),
              )}
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 space-y-3">
          <h2 className="text-lg font-medium">Mensagens do fluxo</h2>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Mensagem de boas-vindas</span>
            <textarea
              rows={3}
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              value={settings.welcomeMessage || ""}
              onChange={(e) =>
                setSettings((current) => ({ ...current, welcomeMessage: e.target.value }))
              }
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Pergunta do projeto</span>
            <input
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              value={settings.projectPrompt || ""}
              onChange={(e) =>
                setSettings((current) => ({ ...current, projectPrompt: e.target.value }))
              }
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-zinc-300">Prompt após envio do catálogo</span>
            <input
              className="w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              value={settings.catalogPrompt || ""}
              onChange={(e) =>
                setSettings((current) => ({ ...current, catalogPrompt: e.target.value }))
              }
            />
          </label>
        </section>

        <section className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-medium">Precificação por área</h2>
              <p className="mt-1 text-sm text-zinc-400">
                Os números devem corresponder aos números da imagem do catálogo.
              </p>
            </div>
            <button
              type="button"
              onClick={addNextPricingArea}
              className="rounded-md bg-emerald-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-emerald-400"
            >
              Adicionar próxima área
            </button>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="px-2 py-2">Número Área</th>
                  <th className="px-2 py-2">Nome da área</th>
                  <th className="px-2 py-2">Tattoo Nova</th>
                  <th className="px-2 py-2">Complemento</th>
                  <th className="px-2 py-2">Reforma</th>
                  <th className="px-2 py-2">Ações</th>
                </tr>
              </thead>
              <tbody>
                {pricing.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-4 text-center text-zinc-500">
                      Nenhuma área cadastrada. Clique em &quot;Adicionar próxima área&quot;.
                    </td>
                  </tr>
                ) : (
                  pricing.map((row) => (
                    <tr key={row.area} className="border-b border-zinc-900">
                      <td className="px-2 py-2">{row.area}</td>
                      <td className="px-2 py-2">
                        <input
                          className="w-36 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1"
                          value={row.areaLabel || ""}
                          onChange={(e) => updatePrice(row.area, "areaLabel", e.target.value)}
                          placeholder="Ex: Antebraço direito"
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          className="w-40 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1"
                          value={row.tattooNova || ""}
                          onChange={(e) => updatePrice(row.area, "tattooNova", e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          className="w-40 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1"
                          value={row.complemento || ""}
                          onChange={(e) => updatePrice(row.area, "complemento", e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <input
                          className="w-40 rounded-md border border-zinc-700 bg-zinc-950 px-2 py-1"
                          value={row.reforma || ""}
                          onChange={(e) => updatePrice(row.area, "reforma", e.target.value)}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <button
                          type="button"
                          onClick={() => removePricingArea(row.area)}
                          className="rounded-md border border-red-800/80 px-3 py-1 text-xs text-red-300 hover:bg-red-950"
                        >
                          Remover
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

