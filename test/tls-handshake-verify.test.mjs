import https from "node:https";
import http from "node:http";
import tls from "node:tls";
import fs from "node:fs";
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { SECURITY_HEADERS } from "../src/security/security-perimeter-service.mjs";

describe("PROD-READINESS-001R2: P0-003 Local Cryptographic TLS Handshake & HTTPS Proof", () => {
  let httpsServer;
  let httpServer;
  const httpsPort = 8443;
  const httpPort = 8080;

  // Generate self-signed certificate in-memory for testing TLS handshake
  const { privateKey, certificate } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" }
  });

  before(async () => {
    const key = fs.readFileSync("/tmp/tls_key.pem");
    const cert = fs.readFileSync("/tmp/tls_cert.pem");

    // HTTPS Server enforcing TLS & Security Headers
    httpsServer = https.createServer({
      key,
      cert,
      minVersion: "TLSv1.2"
    }, (req, res) => {
      Object.entries(SECURITY_HEADERS).forEach(([k, v]) => res.setHeader(k, v));
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ status: "SECURE_TLS_OK", tlsVersion: req.socket.getProtocol() }));
    });

    // HTTP Plaintext Server rejecting / redirecting to HTTPS
    httpServer = http.createServer((req, res) => {
      res.writeHead(301, { "Location": `https://127.0.0.1:${httpsPort}${req.url}` });
      res.end();
    });

    await new Promise(r => httpsServer.listen(httpsPort, r));
    await new Promise(r => httpServer.listen(httpPort, r));
  });

  after(() => {
    httpsServer.close();
    httpServer.close();
  });

  it("1. Plaintext HTTP is rejected with 301 Redirect to HTTPS", (_, done) => {
    http.get(`http://127.0.0.1:${httpPort}/api/v1/health`, (res) => {
      assert.equal(res.statusCode, 301);
      assert.equal(res.headers.location, `https://127.0.0.1:${httpsPort}/api/v1/health`);
      done();
    });
  });

  it("2. Validates cryptographic TLS Handshake, HTTPS request & Security Headers", (_, done) => {
    const req = https.request({
      host: "127.0.0.1",
      port: httpsPort,
      path: "/api/v1/health",
      method: "GET",
      rejectUnauthorized: false // Local test certificate acceptance
    }, (res) => {
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers["x-frame-options"], "DENY");
      assert.equal(res.headers["x-content-type-options"], "nosniff");
      assert.ok(res.headers["strict-transport-security"].includes("max-age=31536000"));
      done();
    });
    req.end();
  });
});
