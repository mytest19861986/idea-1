import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import { EventEmitter } from "node:events";

/**
 * ============================================================================
 * REAL PROCESS SUPERVISOR & DAEMON RUNNER (PROD-READINESS-002R)
 * Provides:
 * 1. Long-lived Parent Supervisor managing detached/supervised child application
 * 2. Child crash injection & real OS-level child process restart
 * 3. Out-of-process HTTP Alert Sink Adapter (real network socket transmission)
 * ============================================================================
 */

export class OSProcessSupervisor extends EventEmitter {
  constructor({ command = "node", args = [], env = {}, maxRestarts = 5 } = {}) {
    super();
    this.command = command;
    this.args = args;
    this.env = env;
    this.maxRestarts = maxRestarts;
    this.child = null;
    this.restartCount = 0;
    this.isShuttingDown = false;
  }

  startChild() {
    this.child = spawn(this.command, this.args, {
      env: { ...process.env, ...this.env },
      stdio: ["pipe", "pipe", "pipe"]
    });

    this.child.on("exit", (code, signal) => {
      this.emit("child_exit", { code, signal });
      if (!this.isShuttingDown && this.restartCount < this.maxRestarts) {
        this.restartCount += 1;
        this.emit("child_restarting", { attempt: this.restartCount });
        this.startChild();
      }
    });

    return this.child;
  }

  killChild(signal = "SIGKILL") {
    if (this.child) {
      this.child.kill(signal);
    }
  }

  shutdown() {
    this.isShuttingDown = true;
    if (this.child) {
      this.child.kill("SIGTERM");
    }
  }
}

export class HttpAlertSinkAdapter {
  constructor({ endpointUrl = "http://127.0.0.1:9999/alerts" } = {}) {
    this.endpointUrl = new URL(endpointUrl);
  }

  async sendAlert(alert) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify(alert);
      const req = http.request({
        hostname: this.endpointUrl.hostname,
        port: this.endpointUrl.port,
        path: this.endpointUrl.pathname,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(payload)
        }
      }, (res) => {
        let body = "";
        res.on("data", chunk => body += chunk);
        res.on("end", () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true, statusCode: res.statusCode, body });
          } else {
            reject(new Error(`ALERT_SINK_HTTP_${res.statusCode}`));
          }
        });
      });

      req.on("error", reject);
      req.write(payload);
      req.end();
    });
  }
}
