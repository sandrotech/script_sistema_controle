const xlsx = require('xlsx');

function inspectWorkbook(filename) {
    console.log(`\n--- Inspecting ${filename} ---`);
    const wb = xlsx.readFile(filename);
    console.log("Sheet names:", wb.SheetNames);
    wb.SheetNames.forEach(sheetName => {
        const sheet = wb.Sheets[sheetName];
        const data = xlsx.utils.sheet_to_json(sheet);
        console.log(`Sheet "${sheetName}" has ${data.length} rows.`);
        if (data.length > 0) {
            console.log("First row keys:", Object.keys(data[0]));
            console.log("First row sample:", data[0]);
            
            // Try to sum up values
            let totalVenda = 0;
            let totalQtd = 0;
            data.forEach(row => {
                // Find potential value keys
                const valKey = Object.keys(row).find(k => k.toLowerCase().includes('venda') || k.toLowerCase().includes('valor') || k.toLowerCase().includes('total'));
                const qtdKey = Object.keys(row).find(k => k.toLowerCase().includes('qtd') || k.toLowerCase().includes('quant'));
                if (valKey && row[valKey]) {
                    const val = typeof row[valKey] === 'string' ? parseFloat(row[valKey].replace(',', '.')) : parseFloat(row[valKey]);
                    if (!isNaN(val)) totalVenda += val;
                }
                if (qtdKey && row[qtdKey]) {
                    const val = typeof row[qtdKey] === 'string' ? parseFloat(row[qtdKey].replace(',', '.')) : parseFloat(row[qtdKey]);
                    if (!isNaN(val)) totalQtd += val;
                }
            });
            console.log(`Sum of sales/value: ${totalVenda.toFixed(2)}`);
            console.log(`Sum of quantity: ${totalQtd.toFixed(2)}`);
        }
    });
}

inspectWorkbook('Fechamento Frangolandia Junho 2026.xlsx');
inspectWorkbook('Frangolandia_Extraido.xlsx');
