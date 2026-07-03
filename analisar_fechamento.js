const xlsx = require('xlsx');

const wb = xlsx.readFile('Fechamento Frangolandia Junho 2026.xlsx');
const sheet = wb.Sheets[wb.SheetNames[0]];
const data = xlsx.utils.sheet_to_json(sheet);

const porData = {};

data.forEach(row => {
    let dateStr = row.DATA;
    if (typeof dateStr === 'number') {
        const dateObj = new Date((dateStr - 25569) * 86400 * 1000);
        const dd = String(dateObj.getUTCDate()).padStart(2, '0');
        const mm = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
        const yyyy = dateObj.getUTCFullYear();
        dateStr = `${yyyy}-${mm}-${dd}`;
    }
    
    if (!porData[dateStr]) {
        porData[dateStr] = { count: 0, sum: 0 };
    }
    porData[dateStr].count++;
    porData[dateStr].sum += parseFloat(row.VENDA);
});

console.log("Valores no Fechamento Oficial por data:");
Object.entries(porData).sort().forEach(([date, info]) => {
    console.log(`- ${date}: ${info.count} vendas, Total R$ ${info.sum.toFixed(2)}`);
});
