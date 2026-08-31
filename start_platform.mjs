import { createServer } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createReadApiServer } from './src/api/server.mjs';
import { createInMemoryOpportunityReadProvider } from './src/api/read-provider.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startPlatform() {
  console.log("=== STARTING GLOBAL OPPORTUNITY INTELLIGENCE PLATFORM ===");

  // Seed rich opportunity items
  const mockItems = [
    {
      id: "opp-001",
      slug: "enterprise-ai-governance-mesh",
      title: "Enterprise AI Governance & Audit Mesh",
      summary: "High-assurance cryptographic ledger and RBAC governance engine for LLM orchestrations.",
      confidence: "HIGH",
      evidenceCount: 14,
      firstDiscoveredAt: new Date(Date.now() - 86400000 * 3).toISOString(),
      lastSeenAt: new Date().toISOString(),
      sourceCount: 6,
      categories: ["AI Infrastructure", "Security", "Enterprise Software"],
      metadata: {
        score: 94.8,
        status: "INVESTIGATING",
        marketPotential: "TIER_1_ENTERPRISE"
      }
    },
    {
      id: "opp-002",
      slug: "autonomous-supply-chain-oracle",
      title: "Autonomous Logistics & Multimodal Supply Chain Oracle",
      summary: "Deterministic demand prediction and real-time inventory reconciliation terminal.",
      confidence: "HIGH",
      evidenceCount: 9,
      firstDiscoveredAt: new Date(Date.now() - 86400000 * 7).toISOString(),
      lastSeenAt: new Date().toISOString(),
      sourceCount: 4,
      categories: ["Supply Chain", "Automation"],
      metadata: {
        score: 88.2,
        status: "WATCHLIST",
        marketPotential: "TIER_2_GROWTH"
      }
    },
    {
      id: "opp-003",
      slug: "zero-knowledge-privacy-layer",
      title: "Zero-Knowledge Financial Compliance & Privacy Protocol",
      summary: "Confidential settlement and verifiable compliance proofs for institutional digital assets.",
      confidence: "HIGH",
      evidenceCount: 22,
      firstDiscoveredAt: new Date(Date.now() - 86400000 * 12).toISOString(),
      lastSeenAt: new Date().toISOString(),
      sourceCount: 8,
      categories: ["Fintech", "Cryptography", "Compliance"],
      metadata: {
        score: 96.5,
        status: "SHORTLISTED",
        marketPotential: "TIER_1_ENTERPRISE"
      }
    }
  ];

  const provider = createInMemoryOpportunityReadProvider(mockItems);
  const fastifyApp = createReadApiServer({ provider, logger: false });

  const API_PORT = 3000;
  const WEB_PORT = 8080;

  try {
    await fastifyApp.listen({ port: API_PORT, host: '0.0.0.0' });
    console.log(`[API SERVER] Live at: http://localhost:${API_PORT}`);
  } catch (err) {
    console.error("[API SERVER ERROR]", err);
  }

  const webServer = createServer((req, res) => {
    // Enable CORS for development
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    let filePath = path.join(__dirname, 'src', 'web', req.url === '/' ? 'index.html' : req.url);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(__dirname, 'src', 'web', 'index.html');
    }

    const ext = path.extname(filePath);
    const mimeTypes = {
      '.html': 'text/html',
      '.js': 'text/javascript',
      '.mjs': 'text/javascript',
      '.css': 'text/css',
      '.json': 'application/json',
      '.svg': 'image/svg+xml'
    };

    const contentType = mimeTypes[ext] || 'text/plain';
    fs.readFile(filePath, (error, content) => {
      if (error) {
        res.writeHead(500);
        res.end('Error loading dashboard');
      } else {
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });
  });

  webServer.listen(WEB_PORT, '0.0.0.0', () => {
    console.log(`======================================================================`);
    console.log(`🚀 GLOBAL OPPORTUNITY INTELLIGENCE PLATFORM IS ONLINE!`);
    console.log(`🌐 Dashboard Terminal URL: http://localhost:${WEB_PORT}`);
    console.log(`⚡ Fastify API Backend URL:  http://localhost:${API_PORT}/api/v1/opportunities`);
    console.log(`======================================================================`);
  });
}

startPlatform().catch(console.error);
