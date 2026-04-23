import { prisma } from './lib/prisma';
import { CONFIG } from './config';
import { Mappers } from './utils/mappers';
import { PactoAPI } from './services/pacto.api';

export async function syncPlanos() {
  console.log("🚀 Iniciando extração de planos...");
  try {
    const unidades = await prisma.unidade.findMany();

    for (const unidade of unidades) {
      const token = CONFIG.TOKENS[unidade.chave];
      if (!token) {
        console.log(`[PULADO] ${unidade.nome}: Token não configurado.`);
        continue;
      }

      // Lógica de Checkpoint (20h)
      const agora = new Date();
      if (unidade.planosSyncStatus === 'SUCESSO' && unidade.planosSyncLastAt) {
        const horas = (agora.getTime() - unidade.planosSyncLastAt.getTime()) / (1000 * 60 * 60);
        if (horas < 20) {
          console.log(`[CHECKPOINT] ${unidade.nome}: Planos já sincronizados.`);
          continue;
        }
      }

      // Início do Processamento
      await prisma.unidade.update({ 
        where: { chave: unidade.chave }, 
        data: { planosSyncStatus: 'PROCESSANDO', planosSyncLastAt: agora } 
      });

      console.log(`[REQ] ${unidade.nome}: Buscando planos...`);
      let page = 0;
      let hasMore = true;
      let falhou = false;

      while (hasMore) {
        const data = await PactoAPI.getPlanos(token, page);
        if (!data || !data.content) {
          falhou = true;
          await prisma.unidade.update({
            where: { chave: unidade.chave },
            data: { planosSyncStatus: 'ERRO', planosSyncMessage: `Falha na pág ${page}` }
          });
          break;
        }

        for (const item of data.content) {
          if (!item.codigo) continue;
          const mapped = Mappers.plano(item);
          await prisma.plano.upsert({
            where: { unidadeChave_codigo: { unidadeChave: unidade.chave, codigo: mapped.codigo } },
            update: mapped,
            create: { ...mapped, unidadeChave: unidade.chave }
          });
        }

        if (data.content.length < 10) hasMore = false;
        else page++;
      }

      if (!falhou) {
        await prisma.unidade.update({
          where: { chave: unidade.chave },
          data: { planosSyncStatus: 'SUCESSO', planosSyncLastAt: new Date(), planosSyncMessage: null }
        });
      }
    }
    console.log("✅ Finalizado: Sincronismo de planos.");
  } catch (error: any) {
    console.error("❌ Erro em syncPlanos:", error.message);
  }
}

if (require.main === module) {
  syncPlanos().finally(() => prisma.$disconnect());
}
