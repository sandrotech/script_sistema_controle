/**
 * migrate-schema.ts
 *
 * Script completo de migração + re-sincronização para os clientes no schema antigo.
 * Executa em sequência para cada cliente:
 *   1. Migra o banco (cria tabelas lojas, produtos_mestre, produtos_depara, adiciona colunas em vendas)
 *   2. Limpa as vendas existentes (desde 01/01/2026)
 *   3. Re-sincroniza todas as vendas via API com o novo formato
 *
 * Uso:
 *   npm run db:migrate-schema
 */
import { Pool } from 'pg';
import { clients } from './config/clients';
import { syncVendas } from './syncVendas';

// Clientes que precisam ser migrados para o novo schema MDM
const CLIENTS_TO_MIGRATE = [
  "Serra Sul Morangos",
  "Casa do Frango",
  "Costa frutas - limao",
  "Costa frutas - maracuja",
];

// Período de re-sincronização
function getTodayStr(): string {
  const d = new Date();
  return `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`;
}
const SYNC_START = "01-01-2026";
const SYNC_END   = getTodayStr();

const MIGRATION_SQL = `
-- PASSO 1: Criar tabela de Lojas
CREATE TABLE IF NOT EXISTS lojas (
  id         SERIAL PRIMARY KEY,
  nome       VARCHAR NOT NULL,
  cnpj       VARCHAR,
  rede       VARCHAR,
  "userId"   VARCHAR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PASSO 2: Criar tabela de Produtos Mestre
CREATE TABLE IF NOT EXISTS produtos_mestre (
  id         SERIAL PRIMARY KEY,
  codigo     VARCHAR NOT NULL,
  nome       VARCHAR NOT NULL,
  categoria  VARCHAR,
  "userId"   VARCHAR,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT produtos_mestre_codigo_userId_unique UNIQUE (codigo, "userId")
);

-- PASSO 3: Criar tabela De/Para
CREATE TABLE IF NOT EXISTS produtos_depara (
  id                SERIAL PRIMARY KEY,
  codigo_api        VARCHAR NOT NULL,
  loja_id           INT,
  produto_mestre_id INT NOT NULL,
  "userId"          VARCHAR,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT produtos_depara_unique UNIQUE (codigo_api, loja_id, "userId"),
  CONSTRAINT fk_produtos_depara_mestre
    FOREIGN KEY (produto_mestre_id) REFERENCES produtos_mestre(id) ON DELETE CASCADE
);

-- PASSO 4: Adicionar colunas MDM na tabela vendas
ALTER TABLE vendas
  ADD COLUMN IF NOT EXISTS loja_id           INT,
  ADD COLUMN IF NOT EXISTS produto_mestre_id INT;

-- PASSO 5: Foreign Keys (ignora se já existir)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_vendas_loja_id' AND table_name = 'vendas'
  ) THEN
    ALTER TABLE vendas
      ADD CONSTRAINT fk_vendas_loja_id FOREIGN KEY (loja_id) REFERENCES lojas(id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_vendas_produto_mestre_id' AND table_name = 'vendas'
  ) THEN
    ALTER TABLE vendas
      ADD CONSTRAINT fk_vendas_produto_mestre_id FOREIGN KEY (produto_mestre_id) REFERENCES produtos_mestre(id);
  END IF;
END $$;

-- PASSO 6: Índices de performance
CREATE INDEX IF NOT EXISTS idx_vendas_loja_id ON vendas(loja_id);
CREATE INDEX IF NOT EXISTS idx_vendas_produto_mestre_id ON vendas(produto_mestre_id);
CREATE INDEX IF NOT EXISTS idx_lojas_rede ON lojas(rede);
`;

async function migrateSchema(clientName: string, databaseUrl: string): Promise<boolean> {
  console.log(`\n  🔧 Migrando schema do banco...`);
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 10000 });
  try {
    const conn = await pool.connect();
    try {
      // Verificar se já está no novo padrão
      const check = await conn.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'vendas' AND column_name IN ('loja_id', 'produto_mestre_id')
      `);
      if (check.rows.length === 2) {
        console.log(`  ✅ Schema já está no novo padrão. Pulando criação de tabelas.`);
        return true;
      }
      await conn.query(MIGRATION_SQL);
      console.log(`  ✅ Schema migrado com sucesso! (tabelas lojas, produtos_mestre, produtos_depara criadas)`);
      return true;
    } finally {
      conn.release();
    }
  } catch (error: any) {
    console.error(`  ❌ Erro na migração do schema:`, error.message);
    return false;
  } finally {
    await pool.end();
  }
}

async function deleteOldData(clientName: string, databaseUrl: string): Promise<boolean> {
  console.log(`  🗑️  Limpando vendas antigas (desde ${SYNC_START.replace(/-/g,'/')})...`);
  const pool = new Pool({ connectionString: databaseUrl, connectionTimeoutMillis: 10000 });
  try {
    const conn = await pool.connect();
    try {
      const result = await conn.query(`DELETE FROM vendas WHERE data >= '2026-01-01 00:00:00'`);
      console.log(`  ✅ ${result.rowCount} registros removidos do banco.`);
      return true;
    } finally {
      conn.release();
    }
  } catch (error: any) {
    console.error(`  ❌ Erro ao limpar dados:`, error.message);
    return false;
  } finally {
    await pool.end();
  }
}

async function syncWithRetry(client: any, startDate: string, endDate: string, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await syncVendas(client, startDate, endDate);
    if (res.success) return res;
    if (attempt < maxRetries) {
      console.warn(`  ⚠️  Tentativa ${attempt}/${maxRetries} falhou. Aguardando 5s...`);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  return { success: false, error: 'Falha após todas as tentativas' };
}

async function main() {
  const today = new Date().toLocaleDateString('pt-BR');
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║        MIGRAÇÃO COMPLETA DE SCHEMA + RE-SINCRONIZAÇÃO     ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`📅 Período de re-sincronização: 01/01/2026 → ${today}`);
  console.log(`📋 Clientes: ${CLIENTS_TO_MIGRATE.join(' | ')}\n`);

  const targets = clients.filter(c => CLIENTS_TO_MIGRATE.includes(c.name));

  if (targets.length === 0) {
    console.error('❌ Nenhum cliente encontrado. Verifique CLIENTS_TO_MIGRATE.');
    return;
  }

  const results: { name: string; status: string; records?: number }[] = [];

  for (const client of targets) {
    console.log(`\n${'═'.repeat(62)}`);
    console.log(`🏪 CLIENTE: ${client.name}`);
    console.log('═'.repeat(62));

    // FASE 1: Migrar schema
    const schemaMigrated = await migrateSchema(client.name, client.databaseUrl);
    if (!schemaMigrated) {
      results.push({ name: client.name, status: '❌ FALHA NA MIGRAÇÃO DO SCHEMA' });
      continue;
    }

    // FASE 2: Limpar dados antigos
    const dataDeleted = await deleteOldData(client.name, client.databaseUrl);
    if (!dataDeleted) {
      results.push({ name: client.name, status: '❌ FALHA AO LIMPAR DADOS' });
      continue;
    }

    // FASE 3: Re-sincronizar
    console.log(`  🔄 Sincronizando de ${SYNC_START} até ${SYNC_END}...`);
    const syncRes = await syncWithRetry(client, SYNC_START, SYNC_END);

    if (syncRes.success) {
      console.log(`  🎉 Sincronização concluída! ${syncRes.count} registros importados.`);
      results.push({ name: client.name, status: '✅ SUCESSO', records: syncRes.count });
    } else {
      console.error(`  ❌ Erro na sincronização: ${syncRes.error}`);
      results.push({ name: client.name, status: `❌ ERRO NO SYNC: ${syncRes.error}` });
    }
  }

  // Relatório Final
  console.log(`\n${'═'.repeat(62)}`);
  console.log('📊 RELATÓRIO FINAL');
  console.log('═'.repeat(62));
  results.forEach(r => {
    const rec = r.records ? ` — ${r.records} registros` : '';
    console.log(`  ${r.status}: ${r.name}${rec}`);
  });
  console.log('═'.repeat(62));

  const ok = results.filter(r => r.status.startsWith('✅')).length;
  console.log(`\n✨ ${ok}/${targets.length} clientes migrados e sincronizados com sucesso!\n`);
}

main().catch(err => {
  console.error('💥 Erro crítico:', err);
  process.exit(1);
});
