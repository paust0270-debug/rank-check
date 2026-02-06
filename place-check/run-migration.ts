#!/usr/bin/env npx tsx
/** slot_rank_place_history에 visitor_review_count, blog_review_count 컬럼 추가 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(process.cwd(), '.env') });
import pg from 'pg';
import * as fs from 'fs';
import * as path from 'path';

const { Client } = pg;

async function main() {
  const dbUrl = process.env.DATABASE_URL || process.env.DIRECT_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL 또는 DIRECT_URL 환경 변수가 필요합니다.');
    process.exit(1);
  }

  const sqlPath = path.join(process.cwd(), 'docs', 'migrations', 'add_place_review_columns.sql');
  const sql = fs.readFileSync(sqlPath, 'utf8');

  const client = new Client({ connectionString: dbUrl });
  try {
    await client.connect();
    for (const stmt of sql.split(';').map((s) => s.trim()).filter(Boolean)) {
      if (stmt.startsWith('--')) continue;
      await client.query(stmt);
      console.log('✅ 실행:', stmt.slice(0, 60) + '...');
    }
    console.log('\n✅ 마이그레이션 완료');
  } catch (e: any) {
    console.error('❌ 마이그레이션 실패:', e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
