// Reads a SignalDesk backup (downloaded from Settings → Usage & costs → Backups) and writes the SQL
// that puts its rows back. Nothing touches the database: you review the SQL, then paste it into the
// SQL editor of the right project, the same way as a database update.
//
//   node scripts/restore-backup.mjs daily-2026-11-18.json.gz                   what's in the backup
//   node scripts/restore-backup.mjs daily-2026-11-18.json.gz --sql restore.sql  everything
//   node scripts/restore-backup.mjs daily-2026-11-18.json.gz --sql restore.sql --table scheduled_posts --table publish_jobs
//
// Rows that still exist are left alone. To rebuild a brand-new project: run supabase/schema.sql,
// recreate the sign-in accounts (listed in the backup, without passwords), then run the SQL.
import fs from 'node:fs';
import zlib from 'node:zlib';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { restoreSql, TABLES } = require('../api/_lib/backup.js');

const args = process.argv.slice(2);
const valueOf = (flag) => args.flatMap((arg, index) => (args[index - 1] === flag ? [arg] : []));
const file = args.find((arg, index) => !arg.startsWith('--') && !['--sql', '--table'].includes(args[index - 1]));
if (!file) {
  console.log('Usage: node scripts/restore-backup.mjs <backup.json.gz> [--sql out.sql] [--table name]...');
  process.exit(1);
}
const backup = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)).toString('utf8'));
const tables = valueOf('--table');
const [out] = valueOf('--sql');

console.log(`Backup made ${backup.createdAt}: ${backup.users.length} sign-in accounts.`);
for (const table of Object.keys(TABLES)) if (backup.tables[table]?.length) console.log(`  ${table}: ${backup.tables[table].length}`);
if (args.includes('--sql')) {
  if (!out) {
    console.log('Name the file to write after --sql.');
    process.exit(1);
  }
  fs.writeFileSync(out, restoreSql(backup, tables.length ? { tables } : {}));
  console.log(`Wrote ${out}${tables.length ? ` for ${tables.join(', ')}` : ''}. Review it, then run it in the SQL editor.`);
}
