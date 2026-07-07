const http = require("node:http");

const PORT = Number(process.env.MOCK_EVOLUTION_PORT || 9999);

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = req.url || "";

  if (url === "/" || url === "/health") {
    return sendJson(res, 200, { ok: true, service: "mock-evolution" });
  }

  if (req.method === "POST" && url.includes("/instance/create")) {
    return sendJson(res, 200, {
      instance: { instanceName: "briza-5511999887766", status: "created" },
    });
  }

  if (req.method === "GET" && url.includes("/instance/connect/")) {
    return sendJson(res, 200, {
      base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      pairingCode: "ABCD-1234",
      count: 1,
    });
  }

  if (req.method === "GET" && url.includes("/instance/connectionState/")) {
    return sendJson(res, 200, { instance: { state: "open" } });
  }

  sendJson(res, 404, { error: "not_found", path: url });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-evolution] ouvindo em http://127.0.0.1:${PORT}`);
});
