import fs from 'fs';
import path from 'path';

function parseFrangolandia(filePath: string) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n').filter(line => line.trim() !== '');

  console.log(`Lendo ${lines.length} linhas...`);

  const parsed = lines.map(line => {
    const parts = line.split(';');
    if (parts.length < 6) return null;

    const loja = parts[0].trim();
    const dataStr = parts[1].trim();
    const plu = parseInt(parts[2].trim());
    const produto = parts[3].trim();
    const qtd = parseFloat(parts[4].replace(',', '.'));
    const venda = parseFloat(parts[5].replace(',', '.'));

    const [day, month, year] = dataStr.split('/');
    const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day), 12, 0, 0);

    return { loja, date, plu, produto, qtd, venda };
  }).filter(item => item !== null);

  console.log("Amostra das 3 primeiras linhas lidas:");
  console.log(parsed.slice(0, 3));
  console.log(`Total validas: ${parsed.length}`);
}

parseFrangolandia(path.join(__dirname, '../arquivo_venda_243396.txt'));
