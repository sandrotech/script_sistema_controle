import { prisma } from './lib/prisma';
import { CONFIG } from './config';
import { Mappers } from './utils/mappers';
import { PactoAPI } from './services/pacto.api';

export async function syncUnidades() {
  console.log("🚀 Iniciando extração de unidades...");
  try {
    // Usamos o token da Maraponga para listar as unidades (conforme padrão atual)
    const token = CONFIG.TOKENS["a00731088b65cf657c64e9aef32bdd01"];
    if (!token) throw new Error("Token base (Maraponga) não encontrado no .env");

    const data = await PactoAPI.getUnidades(token);
    const unidadesData = data?.return;

    if (!unidadesData || !Array.isArray(unidadesData)) {
      throw new Error("Falha ao obter unidades ou formato inválido.");
    }

    console.log(`📦 Encontradas ${unidadesData.length} unidades. Processando...`);

    for (const item of unidadesData) {
      if (!item.chave) continue;
      const mapped = Mappers.unidade(item);

      await prisma.unidade.upsert({
        where: { chave: mapped.chave },
        update: mapped,
        create: mapped
      });
    }

    console.log(`✅ Sucesso: Unidades sincronizadas.`);
  } catch (error: any) {
    console.error("❌ Erro em syncUnidades:", error.message);
  }
}

if (require.main === module) {
  syncUnidades().finally(() => prisma.$disconnect());
}
