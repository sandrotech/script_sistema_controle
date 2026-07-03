import { Client } from 'pg';

const client = new Client({
  connectionString: 'postgresql://postgres:root@localhost:5434/b2b_dashboard'
});

async function main() {
  await client.connect();
  
  // Total overall
  const total = await client.query(`SELECT COUNT(*) as count, SUM(venda) as total_venda FROM vendas`);
  console.log('Total overall:', total.rows[0]);
  
  const res = await client.query(`SELECT COUNT(*) as count, SUM(venda) as total_venda FROM vendas WHERE data >= '2026-06-20' AND data <= '2026-06-26'`);
  console.log('Result 20-26 Jun:', res.rows[0]);
  
  const byDate = await client.query(`SELECT DATE(data) as d, COUNT(*) as count, SUM(venda) as total_venda FROM vendas WHERE data >= '2026-06-20' AND data <= '2026-06-26' GROUP BY DATE(data) ORDER BY DATE(data)`);
  console.log('By date:', byDate.rows);
  
  await client.end();
}

main().catch(console.error);
