import { execSync } from "node:child_process";

export function createPostgresCliClient({ database = "discovery_test", user = "test_user", password = "test_password", host = "127.0.0.1" } = {}) {
  const isLinux = process.platform === "linux";

  return {
    async query(sql, params = []) {
      let populatedSql = sql;
      if (params && params.length > 0) {
        // Replace in reverse index order to avoid replacing $1 in $10..$15
        for (let i = params.length - 1; i >= 0; i--) {
          const val = params[i];
          let literal;
          if (val === null || val === undefined) {
            literal = "NULL";
          } else if (typeof val === "number" || typeof val === "boolean") {
            literal = String(val);
          } else {
            literal = `'${String(val).replace(/'/g, "''")}'`;
          }
          const regex = new RegExp(`\\$${i + 1}\\b`, "g");
          populatedSql = populatedSql.replace(regex, literal);
        }
      }

      const cleanSql = populatedSql.trim();
      const psqlCmd = isLinux
        ? `export PGPASSWORD='${password}'; psql -v ON_ERROR_STOP=1 -U ${user} -d ${database} -h ${host} -t -A`
        : `wsl -d Ubuntu-24.04 -u root -- bash -c "export PGPASSWORD='${password}'; psql -v ON_ERROR_STOP=1 -U ${user} -d ${database} -h ${host} -t -A"`;

      try {
        const stdout = execSync(psqlCmd, { input: cleanSql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] });
        const trimmed = stdout.trim();
        if (!trimmed) {
          return { rows: [] };
        }
        const lines = trimmed.split("\n").map(l => l.trim()).filter(Boolean);
        // Filter out non-data outputs
        const dataLines = lines.filter(l => l !== "BEGIN" && l !== "COMMIT" && !l.startsWith("INSERT 0") && !l.startsWith("DELETE"));
        const rows = dataLines.map(line => {
          const parts = line.split("|");
          return {
            id: parts[0],
            count: parts[0],
            canonical_url: parts.length > 1 ? parts[1] : parts[0],
            parts
          };
        });
        return { rows };
      } catch (err) {
        throw new Error(`POSTGRES_QUERY_ERROR: ${err.stderr || err.stdout || err.message}`);
      }
    }
  };
}
