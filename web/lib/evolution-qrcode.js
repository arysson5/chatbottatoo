import QRCode from "qrcode";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function isConnectedState(state) {
  const normalized = String(state || "").toLowerCase();
  return normalized === "open" || normalized === "connected";
}

export function phoneFromInstanceName(instanceName) {
  const match = String(instanceName || "").match(/^briza-(\d{10,15})$/);
  return match ? match[1] : "";
}

export async function qrDataUrlFromPayload(payload) {
  if (!payload || typeof payload !== "object") return null;

  const sources = [payload, payload.qrcode];
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;

    const base64 = source.base64;
    if (typeof base64 === "string" && base64.length > 0) {
      return base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
    }

    const code = source.code;
    if (typeof code === "string" && code.length > 0) {
      try {
        return await QRCode.toDataURL(code, {
          errorCorrectionLevel: "M",
          margin: 2,
          width: 280,
        });
      } catch {
        return null;
      }
    }
  }

  return null;
}

export async function fetchConnectWithQr({ baseUrl, apiKey, instanceName, fetchImpl = fetch }) {
  const base = baseUrl.replace(/\/+$/, "");
  const encodedName = encodeURIComponent(String(instanceName).trim());
  const phone = phoneFromInstanceName(instanceName);
  const numberQs = phone ? `?number=${encodeURIComponent(phone)}` : "";

  let lastPayload = { count: 0 };

  for (let attempt = 0; attempt < 15; attempt += 1) {
    const res = await fetchImpl(`${base}/instance/connect/${encodedName}${numberQs}`, {
      method: "GET",
      headers: { apikey: apiKey },
    });

    lastPayload = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg =
        lastPayload?.response?.message?.join?.(", ") ||
        lastPayload?.message ||
        lastPayload?.error ||
        `Evolution retornou ${res.status}`;
      return { ok: false, status: res.status, error: msg, data: lastPayload };
    }

    const qrcodeDataUrl = await qrDataUrlFromPayload(lastPayload);
    const pairingCode =
      typeof lastPayload.pairingCode === "string" ? lastPayload.pairingCode : null;

    if (qrcodeDataUrl || pairingCode) {
      return {
        ok: true,
        status: 200,
        data: { ...lastPayload, qrcodeDataUrl, pairingCode },
      };
    }

    if (attempt < 14) {
      await sleep(2000);
    }
  }

  return {
    ok: false,
    status: 503,
    error:
      "A Evolution API não devolveu QR Code (count: 0). Tente no Manager (localhost:8080/manager), apague instâncias antigas e gere de novo.",
    data: lastPayload,
  };
}
