import fs from "node:fs";
import { createReadApiServer } from "./src/api/server.mjs";
import { LiveDiscoveryController, DiscoveryMode } from "./src/discovery/live-discovery-control.mjs";
import { DurableCandidateStoreAdapter } from "./src/storage/durable-candidate-store-adapter.mjs";
import { createPostgresCliClient } from "./src/storage/postgres-cli-client.mjs";

const PORT = parseInt(process.env.PORT || "8081", 10);
const HOST = "0.0.0.0";

async function startServer() {
  let candidateStore = null;
  try {
    const client = createPostgresCliClient({ database: "discovery_test" });
    candidateStore = new DurableCandidateStoreAdapter({ client });
  } catch (err) {
    console.warn("⚠️ Warning: PostgreSQL adapter init failed, using in-memory mode:", err.message);
  }

  const discoveryController = new LiveDiscoveryController({
    mode: DiscoveryMode.AUTO,
    candidateStore
  });

  const mockProvider = {
    list: async () => ({ items: [], nextCursor: null }),
    getBySlug: async () => null
  };

  const app = createReadApiServer({
    provider: mockProvider,
    discoveryController,
    logger: false
  });

  // Serve the dashboard HTML and client assets
  app.get("/", async (req, reply) => {
    reply.type("text/html; charset=utf-8").send(fs.readFileSync("./src/web/index.html", "utf8"));
  });

  app.get("/client-i18n.js", async (req, reply) => {
    reply.type("application/javascript; charset=utf-8").send(fs.readFileSync("./src/web/client-i18n.js", "utf8"));
  });

  try {
    const address = await app.listen({ port: PORT, host: HOST });
    console.log(`\n==================================================`);
    console.log(`🚀 سامانه هوشمند تحلیل فرصت‌ها با موفقیت راه‌اندازی شد!`);
    console.log(`🌐 آدرس دسترسی در مرورگر: http://localhost:${PORT}`);
    console.log(`⚡ کنترل لایو و دکمه اجرای آنی فعال است.`);
    console.log(`==================================================\n`);
  } catch (err) {
    console.error("❌ خطا در راه‌اندازی سرور:", err);
    process.exit(1);
  }
}

startServer();
