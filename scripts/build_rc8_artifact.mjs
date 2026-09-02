import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";

console.log("=== BUILDING IMMUTABLE RC8 ARTIFACT ===");

const isLinux = process.platform === "linux";
const artifactPath = "release/product-intelligence-1.0.0-rc.8.tar.gz";

// Create tar.gz of dist/ or src/
const tarCmd = isLinux
  ? `tar -czf ${artifactPath} src/ scripts/ test/ package.json`
  : `wsl -d Ubuntu-24.04 -u root -- bash -c "cd /mnt/g/project/IDEA && tar -czf ${artifactPath} src/ scripts/ test/ package.json"`;

execSync(tarCmd, { stdio: "inherit" });

if (!existsSync(artifactPath)) {
  throw new Error(`Failed to generate artifact at ${artifactPath}`);
}

const fileBuffer = readFileSync(artifactPath);
const sha256 = createHash("sha256").update(fileBuffer).digest("hex");

console.log(`RC8_ARTIFACT_PATH=${artifactPath}`);
console.log(`RC8_ARTIFACT_SHA256=${sha256}`);
console.log(`RC8_ARTIFACT_SIZE_BYTES=${fileBuffer.length}`);
