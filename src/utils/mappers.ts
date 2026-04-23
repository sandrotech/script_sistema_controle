export const Mappers = {
  unidade: (data: any) => ({
    chave: data.chave,
    codigo: data.codigo,
    nome: data.nome,
    cidade: data.cidade ?? "",
    estado: data.estado ?? "",
    cep: data.cep ?? "",
    endereco: data.endereco ?? "",
    telefone: data.telefone ?? "",
    email: data.email ?? "",
    complemento: data.complemento ?? "",
    longitude: data.longitude ?? "",
    latitude: data.latitude ?? "",
    usarSistemaInternacional: !!data.usarSistemaInternacional
  }),

  plano: (data: any) => {
    let mensalidade = null;
    let fidelidade = null;

    if (Array.isArray(data.duracoes) && data.duracoes.length > 0) {
      mensalidade = data.duracoes[0].valorDesejadoMensal ?? data.duracoes[0].valorDesejado ?? null;
      fidelidade = data.duracoes[0].numeroMeses ?? null;
    } else if (Array.isArray(data.excecoes) && data.excecoes.length > 0) {
      mensalidade = data.excecoes[0].valor ?? null;
      fidelidade = data.excecoes[0].duracao ?? null;
    }

    let horario = null;
    if (Array.isArray(data.horarios) && data.horarios.length > 0) {
      horario = data.horarios[0].horario?.descricao ?? null;
    }

    let adesao = null;
    let anuidade = null;
    if (Array.isArray(data.produtosSugeridos)) {
      for (const prod of data.produtosSugeridos) {
        if (prod.produto?.tipoProduto === "MA") {
          adesao = prod.valorProduto ?? prod.produto?.valorFinal ?? 0;
        }
        if (prod.produto?.tipoProduto === "TA" || prod.produto?.tipoProduto === "AN") {
          anuidade = prod.valorProduto ?? prod.produto?.valorFinal ?? 0;
        }
      }
    }

    return {
      codigo: data.codigo,
      nome: data.descricao || `Plano ${data.codigo}`,
      mensalidade,
      fidelidade,
      horario,
      adesao,
      anuidade,
    };
  },

  aluno: (data: any) => ({
    matricula: data.matriculaZW ?? data.id,
    codigoAluno: data.id,
    codigoCliente: data.codigoCliente ?? null,
    codigoPessoa: data.codigoPessoa ?? null,
    codigoExterno: data.codigoExterno ? String(data.codigoExterno) : null,
    codAcesso: data.codAcesso ? String(data.codAcesso) : null,
    nome: data.nome,
    situacaoAluno: data.situacaoAluno ?? "ATIVO",
    dataNascimento: data.dataNascimento ? new Date(data.dataNascimento) : null,
    idade: data.idade ?? null,
    sexo: data.sexo ?? null,
    email: Array.isArray(data.emails) && data.emails.length > 0 ? data.emails[0] : null,
    telefone: Array.isArray(data.fones) && data.fones.length > 0 ? data.fones[0].numero : null,
    planoNome: data.planoZW ? data.planoZW.nome : null,
    contratoVencimento: data.contratoZW && data.contratoZW.vencimento ? new Date(data.contratoZW.vencimento) : null,
    contratoTipo: data.contratoZW ? data.contratoZW.tipo : null,
    situacaoContrato: data.situacaoContratoZW ?? null,
    pressaoApresentar: data.pressaoApresentar ?? null,
    fcApresentar: data.fcApresentar ?? null,
    listaObjetivos: data.listaObjetivos ? JSON.stringify(data.listaObjetivos) : null,
    parqStatus: data.parq_status ?? false,
    usarApp: data.usarApp ?? false,
    confirmado: data.confirmado ?? false,
    autorizado: data.autorizado ?? false,
    programas: data.programas ? JSON.stringify(data.programas) : null,
  })
};
