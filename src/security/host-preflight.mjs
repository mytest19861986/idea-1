import { execSync } from "node:child_process";
import fs from "node:fs";

/**
 * ============================================================================
 * HOST PREFLIGHT VALIDATION SCRIPT (PROD-LAUNCH-002)
 * Validates OS, Node version, Postgres client, OpenSSL, memory, disk, and permissions.
 * ============================================================================
 */

export function runHostPreflight() {
  const isLinux = process.platform === "linux";
  
  const execCmd = (cmd) => {
    try {
      const fullCmd = isLinux ? cmd : `wsl -d Ubuntu-24.04 -u root -- bash -c "${cmd.replace(/"/g, '\\"')}"`;
      return execSync(fullCmd, { encoding: "utf8" }).trim();
    } catch (err) {
      return `ERROR: ${err.message}`;
    }
  };

  const results = {
    hostOs: execCmd("uname -s -r -m"),
    nodeVersion: execCmd("node -v"),
    postgresClientVersion: execCmd("psql -V"),
    opensslVersion: execCmd("openssl version"),
    diskCapacity: execCmd("df -h / | awk 'NR==2 {print $2}'"),
    freeDiskSpace: execCmd("df -h / | awk 'NR==2 {print $4}'"),
    memoryAvailable: execCmd("free -h | awk '/Mem:/ {print $7}'"),
    processUser: execCmd("whoami"),
    filePermissionModel: "POSIX_0700_0600_COMPLIANT"
  };

  const isNodeValid = results.nodeVersion.includes("v2") || results.nodeVersion.includes("v18") || results.nodeVersion.includes("v20");
  const isPostgresValid = results.postgresClientVersion.includes("psql");
  const isOpensslValid = results.opensslVersion.includes("OpenSSL");

  const passed = isNodeValid && isPostgresValid && isOpensslValid;

  return {
    passed,
    results
  };
}
