import { mkdir, readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface Resultado<T> {
  rows: T[];
}

export interface Consulta {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<Resultado<T>>;
}

export interface Db extends Consulta {
  /** Executa fn numa transação; erro faz rollback. */
  tx<T>(fn: (q: Consulta) => Promise<T>): Promise<T>;
  exec(sql: string): Promise<void>;
  fechar(): Promise<void>;
}

// int8 e numeric viram number: valores em centavos cabem com folga (até 9e15).
const INT8 = 20;
const NUMERIC = 1700;

export async function abrirDb(opts: { databaseUrl?: string; pgliteDir?: string }): Promise<Db> {
  if (opts.databaseUrl) return abrirPostgres(opts.databaseUrl);
  return abrirPglite(opts.pgliteDir);
}

async function abrirPglite(dir?: string): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  if (dir) await mkdir(dir, { recursive: true });
  const pg = new PGlite(dir, {
    parsers: { [INT8]: (v: string) => Number(v), [NUMERIC]: (v: string) => Number(v) },
  });
  await pg.waitReady;
  // O PGlite ignora o parser de NUMERIC (o de INT8 vale): converte pelas colunas do resultado.
  const consulta = (q: { query: typeof pg.query }): Consulta => ({
    query: async <T>(sql: string, params?: unknown[]) => {
      const r = await q.query<Record<string, unknown>>(sql, params as never[]);
      const numericas = r.fields.filter((f) => f.dataTypeID === NUMERIC).map((f) => f.name);
      if (numericas.length) {
        for (const linha of r.rows) for (const c of numericas) if (typeof linha[c] === 'string') linha[c] = Number(linha[c]);
      }
      return { rows: r.rows as T[] };
    },
  });
  return {
    ...consulta(pg),
    tx: (fn) => pg.transaction((t) => fn(consulta(t as never))),
    exec: async (sql) => {
      await pg.exec(sql);
    },
    fechar: () => pg.close(),
  };
}

async function abrirPostgres(url: string): Promise<Db> {
  const pgMod = await import('pg');
  const { Pool, types } = pgMod.default;
  types.setTypeParser(INT8, (v: string) => Number(v));
  types.setTypeParser(NUMERIC, (v: string) => Number(v));
  const pool = new Pool({ connectionString: url });
  return {
    query: async <T>(sql: string, params?: unknown[]) => {
      const r = await pool.query(sql, params);
      return { rows: r.rows as T[] };
    },
    tx: async (fn) => {
      const cli = await pool.connect();
      try {
        await cli.query('begin');
        const r = await fn({
          query: async <T>(sql: string, params?: unknown[]) => ({ rows: (await cli.query(sql, params)).rows as T[] }),
        });
        await cli.query('commit');
        return r;
      } catch (e) {
        await cli.query('rollback');
        throw e;
      } finally {
        cli.release();
      }
    },
    exec: async (sql) => {
      await pool.query(sql);
    },
    fechar: () => pool.end(),
  };
}

export async function migrar(db: Db, pasta = join(import.meta.dirname, '..', 'migrations')): Promise<void> {
  await db.exec('create table if not exists _migracao (nome text primary key, aplicada_em timestamptz not null default now())');
  const feitas = new Set((await db.query<{ nome: string }>('select nome from _migracao')).rows.map((r) => r.nome));
  const arquivos = (await readdir(pasta)).filter((f) => f.endsWith('.sql')).sort();
  for (const arq of arquivos) {
    if (feitas.has(arq)) continue;
    const sql = await readFile(join(pasta, arq), 'utf8');
    await db.exec(`begin;\n${sql}\ninsert into _migracao (nome) values ('${arq.replaceAll("'", "''")}');\ncommit;`);
  }
}
