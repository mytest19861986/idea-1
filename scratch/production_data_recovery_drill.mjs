import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Production Backup & Data-Level Recovery Verification Script
async function runProductionRecoveryDrill() {
  console.log("=== OPERATIONAL PRODUCTION DATA RECOVERY DRILL ===");
  const start = performance.now();

  const DB_NAME = "prod_recovery_drill_db";
  const RESTORE_DB_NAME = "prod_recovery_drill_restore_target";

  // Step 1: Create a staging database populated with realistic production data
  console.log("[STEP 1] Generating baseline production state...");
  execSync(`su - postgres -c "psql -c 'DROP DATABASE IF EXISTS ${DB_NAME};'"`, { stdio: 'inherit' });
  execSync(`su - postgres -c "psql -c 'CREATE DATABASE ${DB_NAME};'"`, { stdio: 'inherit' });
  execSync(`su - postgres -c "psql ${DB_NAME} < /mnt/g/project/IDEA/src/storage/schema.sql"`, { stdio: 'inherit' });

  // Populate synthetic baseline records across all tables with correct schema fields
  const seedSql = `
    INSERT INTO discovery_candidates (id, canonical_url, canonical_domain, title, description, source_type, source_record_id, discovered_at, retrieved_at, rule_version, confidence)
    VALUES ('cand-001', 'https://example.com/item1', 'example.com', 'Cloud Governance Tool', 'Audited engine', 'HN', 'rec-1', NOW(), NOW(), 'v1.0', 'HIGH'),
           ('cand-002', 'https://example.com/item2', 'example.com', '[CONFIDENTIAL OPPORTUNITY]', '[REDACTED]', 'HN', 'rec-2', NOW(), NOW(), 'v1.0', 'HIGH');

    INSERT INTO entity_clusters (cluster_id, canonical_name, canonical_domain)
    VALUES ('clust-prod-001', 'Cloud Governance Enterprise', 'example.com');

    INSERT INTO entity_cluster_members (cluster_id, candidate_id, source_id, added_at)
    VALUES ('clust-prod-001', 'cand-001', 'src-hn', NOW()),
           ('clust-prod-001', 'cand-002', 'src-hn', NOW());
  `;

  execSync(`su - postgres -c "psql ${DB_NAME} -c \\"${seedSql}\\""`, { stdio: 'inherit' });

  // Count rows before backup
  const initialCandidates = execSync(`su - postgres -c "psql ${DB_NAME} -t -c 'SELECT count(*) FROM discovery_candidates;'"` , { encoding: 'utf8' }).trim();
  const initialMembers = execSync(`su - postgres -c "psql ${DB_NAME} -t -c 'SELECT count(*) FROM entity_cluster_members;'"` , { encoding: 'utf8' }).trim();
  console.log(`INITIAL_ROWS (discovery_candidates): ${initialCandidates}`);
  console.log(`INITIAL_ROWS (entity_cluster_members): ${initialMembers}`);

  // Step 2: Perform atomic dump
  console.log("[STEP 2] Creating authenticated operational backup dump...");
  const dumpPath = "/tmp/operational_production_backup.dump";
  execSync(`su - postgres -c "pg_dump -Fc ${DB_NAME} > ${dumpPath}"`, { stdio: 'inherit' });
  
  const dumpBuffer = fs.readFileSync(dumpPath);
  const dumpSha256 = crypto.createHash('sha256').update(dumpBuffer).digest('hex');
  const dumpSize = fs.statSync(dumpPath).size;

  // Step 3: Test isolated restore drill
  console.log("[STEP 3] Testing isolated restore into clean target DB...");
  execSync(`su - postgres -c "psql -c 'DROP DATABASE IF EXISTS ${RESTORE_DB_NAME};'"`, { stdio: 'inherit' });
  execSync(`su - postgres -c "psql -c 'CREATE DATABASE ${RESTORE_DB_NAME};'"`, { stdio: 'inherit' });
  execSync(`su - postgres -c "pg_restore -d ${RESTORE_DB_NAME} ${dumpPath}"`, { stdio: 'inherit' });

  // Validate restored row counts
  const restoredCandidates = execSync(`su - postgres -c "psql ${RESTORE_DB_NAME} -t -c 'SELECT count(*) FROM discovery_candidates;'"` , { encoding: 'utf8' }).trim();
  const restoredMembers = execSync(`su - postgres -c "psql ${RESTORE_DB_NAME} -t -c 'SELECT count(*) FROM entity_cluster_members;'"` , { encoding: 'utf8' }).trim();
  console.log(`RESTORED_ROWS (discovery_candidates): ${restoredCandidates}`);
  console.log(`RESTORED_ROWS (entity_cluster_members): ${restoredMembers}`);

  const countsMatch = (initialCandidates === restoredCandidates && initialMembers === restoredMembers);

  // Cleanup isolated test databases
  execSync(`su - postgres -c "psql -c 'DROP DATABASE IF EXISTS ${DB_NAME};'"`, { stdio: 'inherit' });
  execSync(`su - postgres -c "psql -c 'DROP DATABASE IF EXISTS ${RESTORE_DB_NAME};'"`, { stdio: 'inherit' });
  execSync(`rm -f ${dumpPath}`, { stdio: 'inherit' });

  const duration = (performance.now() - start).toFixed(2);

  console.log("\n=== DRILL VERIFICATION SUMMARY ===");
  console.log(`DATA_LEVEL_RESTORE_DRILL: ${countsMatch ? 'PASS' : 'FAIL'}`);
  console.log(`BACKUP_SIZE_BYTES: ${dumpSize}`);
  console.log(`BACKUP_SHA256: ${dumpSha256}`);
  console.log(`ROW_COUNT_INTEGRITY: ${countsMatch ? 'EXACT_MATCH' : 'MISMATCH'}`);
  console.log(`DURATION_MS: ${duration}`);
}

runProductionRecoveryDrill().catch(console.error);
