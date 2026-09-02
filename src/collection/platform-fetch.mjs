import { get } from "node:https";

export function createPlatformFetch() {
  return function platformFetch(url, options = {}) {
    return new Promise((resolve, reject) => {
      try {
        const parsed = new URL(url);
        const headers = options.headers || {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
        };
        const req = get(
          {
            hostname: parsed.hostname,
            path: parsed.pathname + parsed.search,
            headers,
            timeout: options.timeout || 8000
          },
          (res) => {
            let data = "";
            res.on("data", (chunk) => {
              if (data.length < 500000) data += chunk;
            });
            res.on("end", () => {
              resolve({
                ok: res.statusCode >= 200 && res.statusCode < 300,
                status: res.statusCode,
                headers: res.headers,
                async json() {
                  return JSON.parse(data);
                },
                async text() {
                  return data;
                }
              });
            });
          }
        );

        req.on("error", reject);
        req.on("timeout", () => {
          req.destroy();
          reject(new Error(`HTTPS timeout connecting to ${url}`));
        });
      } catch (err) {
        reject(err);
      }
    });
  };
}
