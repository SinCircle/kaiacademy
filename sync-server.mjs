import http from "node:http";

const port = Number(process.env.PORT || 3001);
const clients = new Set();

function send(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

const server = http.createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(204).end();
    return;
  }

  if (request.method === "GET" && request.url === "/api/sync") {
    response.writeHead(200, {
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "Content-Type": "text/event-stream; charset=utf-8",
      "X-Accel-Buffering": "no",
    });
    clients.add(response);
    send(response, "ready", {});
    const heartbeat = setInterval(() => response.write(": keepalive\n\n"), 25_000);
    request.on("close", () => {
      clearInterval(heartbeat);
      clients.delete(response);
    });
    return;
  }

  if (request.method === "POST" && request.url === "/invalidate") {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 16_384) request.destroy();
    });
    request.on("end", () => {
      try {
        const parsed = JSON.parse(body);
        const prefixes = [...new Set(Array.isArray(parsed.prefixes) ? parsed.prefixes.filter((item) => typeof item === "string" && item.length <= 200) : [])];
        if (prefixes.length) for (const client of clients) send(client, "invalidate", { prefixes });
        response.writeHead(204).end();
      } catch {
        response.writeHead(400).end();
      }
    });
    return;
  }

  response.writeHead(404).end();
});

server.listen(port, "0.0.0.0");
