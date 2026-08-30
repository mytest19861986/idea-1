import { execSync } from "node:child_process";

export function createPlatformFetch() {
  // If globalThis.fetch works directly:
  const isInsideWsl = process.platform === "linux";
  
  return async function platformFetch(url, options = {}) {
    // If native fetch is available and works without error:
    try {
      if (typeof globalThis.fetch === "function" && !isInsideWsl) {
        return await globalThis.fetch(url, options);
      }
    } catch (_) {}

    // In WSL environment or where direct fetch encounters socket reset, bridge via curl.exe:
    try {
      const escapedUrl = String(url).replace(/"/g, '\\"');
      const cmd = isInsideWsl
        ? `/mnt/c/Windows/System32/curl.exe -s -i "${escapedUrl}"`
        : `curl.exe -s -i "${escapedUrl}"`;
      
      const rawOutput = execSync(cmd, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
      const parts = rawOutput.split(/\r?\n\r?\n/);
      const headerPart = parts[0] || "";
      const bodyPart = parts.slice(1).join("\n\n");

      const statusLine = headerPart.split(/\r?\n/)[0] || "";
      const statusMatch = statusLine.match(/HTTP\/[\d.]+\s+(\d+)/);
      const status = statusMatch ? parseInt(statusMatch[1], 10) : 200;

      return {
        ok: status >= 200 && status < 300,
        status,
        async json() {
          return JSON.parse(bodyPart);
        },
        async text() {
          return bodyPart;
        }
      };
    } catch (err) {
      throw new Error(`Platform bridge fetch failed for ${url}: ${err.message}`);
    }
  };
}
