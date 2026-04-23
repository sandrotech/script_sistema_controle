import { prisma } from './lib/prisma';
import { CONFIG } from './config';
import { Mappers } from './utils/mappers';
import { PactoAPI } from './services/pacto.api';

export async function syncAlunos() {
  console.log("🚀 Iniciando extração de alunos (AT e IN)...");
  try {
    const unidades = await prisma.unidade.findMany();

    for (const unidade of unidades) {
      const token = CONFIG.TOKENS[unidade.chave];
      if (!token) {
        console.log(`[PULADO] ${unidade.nome}: Token não configurado.`);
        continue;
      }

      // Checkpoint de 20h
      const agora = new Date();
      const horas = unidade.alunosSyncLastAt 
        ? (agora.getTime() - unidade.alunosSyncLastAt.getTime()) / (1000 * 60 * 60)
        : 999;

      if (unidade.alunosSyncStatus === 'SUCESSO' && horas < 20) {
        console.log(`[CHECKPOINT] ${unidade.nome}: Alunos já sincronizados.`);
        continue;
      }

      await prisma.unidade.update({
        where: { chave: unidade.chave },
        data: { alunosSyncStatus: 'PROCESSANDO', alunosSyncLastAt: agora }
      });

      let falhaGeral = false;
      for (const situacao of ["AT", "IN"]) {
        console.log(`[REQ] ${unidade.nome} (${situacao}): Buscando alunos...`);
        let page = 0;
        let hasMore = true;

        while (hasMore) {
          const data = await PactoAPI.getAlunos(token, situacao, page);
          if (!data || !data.content) {
            falhaGeral = true;
            break;
          }

          for (const item of data.content) {
            const mapped = Mappers.aluno(item);
            if (!mapped.matricula) continue;
            await prisma.aluno.upsert({
              where: { unidadeChave_matricula: { unidadeChave: unidade.chave, matricula: mapped.matricula } },
              update: mapped,
              create: { ...mapped, unidadeChave: unidade.chave }
            });
          }

          if (data.content.length < 100) hasMore = false;
          else page++;
        }
        if (falhaGeral) break;
      }

      if (falhaGeral) {
        await prisma.unidade.update({
          where: { chave: unidade.chave },
          data: { alunosSyncStatus: 'ERRO', alunosSyncMessage: "Falha durante o loop de páginas" }
        });
      } else {
        await prisma.unidade.update({
          where: { chave: unidade.chave },
          data: { alunosSyncStatus: 'SUCESSO', alunosSyncLastAt: new Date(), alunosSyncMessage: null }
        });
      }
    }
    console.log("✅ Finalizado: Sincronismo de alunos.");
  } catch (error: any) {
    console.error("❌ Erro em syncAlunos:", error.message);
  }
}

if (require.main === module) {
  syncAlunos().finally(() => prisma.$disconnect());
}
