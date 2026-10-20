/* ==========================================================================
   analise.js — Cálculos compartilhados pelo Início, Estoque, Caixa e Fiado
   (venda média por dia, quanto o estoque dura, status de cada produto,
   saldo de fiado por cliente e lucro estimado das vendas).
   ========================================================================== */

const Analise = {
  DIAS_MEDIA: 30,        // janela usada para a venda média por dia
  DIAS_VENCENDO: 7,      // validade a partir da qual o produto entra em alerta
  DIAS_REPOR: 3,         // estoque que acaba em até N dias entra em "repor"
  DIAS_COBERTURA: 10,    // o pedido sugerido cobre ~N dias de venda

  isoDiasAtras(dias) {
    const d = new Date();
    d.setDate(d.getDate() - dias);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  },

  dataLocal(isoDateTime) {
    // Converte a data/hora salva (UTC) para o dia local (AAAA-MM-DD)
    const d = new Date(isoDateTime);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  },

  // Quantidade vendida por produto (inclui os produtos dentro de combos)
  quantidadesVendidas(vendas, desdeISO) {
    const mapa = {};
    Utils.vendasValidas(vendas).forEach((v) => {
      if (desdeISO && this.dataLocal(v.data) < desdeISO) return;
      (v.itens || []).forEach((i) => {
        if (i.tipo === 'combo' && i.componentes) {
          i.componentes.forEach((c) => { mapa[c.produtoId] = (mapa[c.produtoId] || 0) + c.quantidade * i.quantidade; });
        } else if (i.produtoId) {
          mapa[i.produtoId] = (mapa[i.produtoId] || 0) + i.quantidade;
        }
      });
    });
    return mapa;
  },

  // Status de cada produto ativo: vencido, vencendo, repor, parado ou ok
  produtosComStatus(produtos, vendas) {
    const desde = this.isoDiasAtras(this.DIAS_MEDIA);
    const vendidos = this.quantidadesVendidas(vendas, desde);
    return produtos.filter((p) => p.ativo !== false).map((p) => {
      const qtd30 = vendidos[p.id] || 0;
      const vendaDia = qtd30 / this.DIAS_MEDIA;
      const estoque = p.estoqueAtual || 0;
      const dura = vendaDia > 0 ? estoque / vendaDia : Infinity;
      const diasValidade = p.validade ? Utils.daysBetween(p.validade) : null;
      const abaixoMinimo = estoque <= (p.estoqueMinimo || 0);

      let status = 'ok';
      if (diasValidade !== null && diasValidade < 0 && estoque > 0) status = 'vencido';
      else if (diasValidade !== null && diasValidade <= this.DIAS_VENCENDO && estoque > 0) status = 'vencendo';
      else if (abaixoMinimo || (vendaDia > 0 && dura <= this.DIAS_REPOR)) status = 'repor';
      else if (qtd30 === 0 && estoque > 0) status = 'parado';

      return { produto: p, qtd30, vendaDia, dura, diasValidade, abaixoMinimo, status };
    });
  },

  // Quantidade sugerida para repor um produto (arredonda para caixas fechadas)
  quantidadeSugerida(info) {
    const p = info.produto;
    const alvo = Math.max(Math.ceil(info.vendaDia * this.DIAS_COBERTURA), (p.estoqueMinimo || 0) * 2, 1);
    let qtd = Math.max(0, alvo - (p.estoqueAtual || 0));
    const porCaixa = p.unidadesPorCaixa || 1;
    if (porCaixa > 1 && qtd > 0) qtd = Math.ceil(qtd / porCaixa) * porCaixa;
    return qtd;
  },

  formatarDura(dias) {
    if (dias === Infinity) return 'sem giro';
    if (dias < 1) return 'menos de 1 dia';
    const n = Math.floor(dias);
    return n > 45 ? '45+ dias' : n + (n === 1 ? ' dia' : ' dias');
  },

  // Saldo de fiado agrupado por cliente (contas a receber pendentes com cliente)
  fiadoPorCliente(contas) {
    const mapa = {};
    contas.forEach((c) => {
      if (c.tipo !== 'receber' || c.status === 'pago' || c.status === 'cancelada' || !c.clienteId) return;
      const saldo = Math.max(0, (c.valor || 0) - (c.valorPago || 0));
      if (saldo <= 0) return;
      const g = mapa[c.clienteId] || (mapa[c.clienteId] = { clienteId: c.clienteId, saldo: 0, contas: [], proxVencimento: null, vencido: false, diasAtraso: 0 });
      g.saldo += saldo;
      g.contas.push(c);
      if (c.vencimento && (!g.proxVencimento || c.vencimento < g.proxVencimento)) g.proxVencimento = c.vencimento;
      if (c.vencimento && Utils.isPast(c.vencimento)) {
        g.vencido = true;
        g.diasAtraso = Math.max(g.diasAtraso, -Utils.daysBetween(c.vencimento));
      }
    });
    Object.values(mapa).forEach((g) => g.contas.sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || '')));
    return mapa;
  },

  // Lucro estimado de uma venda com base no custo atual dos produtos
  lucroVenda(venda, produtosPorId) {
    let custo = 0;
    (venda.itens || []).forEach((i) => {
      if (i.tipo === 'combo' && i.componentes) {
        i.componentes.forEach((c) => {
          const p = produtosPorId[c.produtoId];
          custo += (p ? p.precoCusto || 0 : 0) * c.quantidade * i.quantidade;
        });
      } else {
        const p = produtosPorId[i.produtoId];
        custo += (p ? p.precoCusto || 0 : 0) * i.quantidade;
      }
    });
    return (venda.total || 0) - custo;
  },
};

window.Analise = Analise;
