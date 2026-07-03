const { Client } = require('pg');
require('dotenv').config({ path: '../.env' }); // try root env first

const connString1 = process.env.DATABASE_URL;
const connString2 = 'postgres://postgres:lyrkoWCfId7DTrojd67YpG8TtWY8IqNzq93rpaZDzVhUU8cRAErFOIITyLEJ3Bj7@ftp4u735ks08jblj3dsjh93c:5432/postgres';

async function tryConnect(connStr, label) {
    if (!connStr) {
        console.log(`[${label}] URL de conexão não disponível.`);
        return null;
    }
    console.log(`[${label}] Tentando conectar a ${connStr.split('@')[1]}...`);
    const client = new Client({ connectionString: connStr, connectionTimeoutMillis: 5000 });
    try {
        await client.connect();
        console.log(`[${label}] ✅ Conectado com sucesso!`);
        return client;
    } catch (e) {
        console.error(`[${label}] ❌ Falha na conexão:`, e.message);
        return null;
    }
}

async function main() {
    let client = await tryConnect(connString1, 'Root ENV DATABASE_URL');
    if (!client) {
        client = await tryConnect(connString2, 'Sequilhos Script DATABASE_URL');
    }
    
    if (!client) {
        console.error("❌ Não foi possível conectar a nenhuma das bases de dados.");
        process.exit(1);
    }
    
    try {
        console.log("Iniciando limpeza das vendas incorretas de Junho/2026...");
        
        // Vamos ver quantas vendas existem de FRANGOLANDIA_EMAIL em Junho/2026
        const checkRes = await client.query(`
            SELECT COUNT(*)::text as count, SUM(venda)::numeric as total 
            FROM vendas 
            WHERE origem = 'FRANGOLANDIA_EMAIL' 
              AND data >= '2026-06-01' 
              AND data <= '2026-06-30 23:59:59'
        `);
        console.log(`Antes da limpeza: Encontradas ${checkRes.rows[0].count} vendas no valor total de R$ ${parseFloat(checkRes.rows[0].total || 0).toFixed(2)}`);
        
        // Deletar as vendas de e-mail de Junho
        const deleteRes = await client.query(`
            DELETE FROM vendas 
            WHERE origem = 'FRANGOLANDIA_EMAIL' 
              AND data >= '2026-06-01' 
              AND data <= '2026-06-30 23:59:59'
        `);
        console.log(`✅ Remoção concluída! Deletados ${deleteRes.rowCount} registros do banco.`);
        
    } catch (e) {
        console.error("Erro durante a execução:", e.message);
    } finally {
        await client.end();
    }
}

main();
