/* ==========================================================================
   relatorios.js — Relatórios de vendas, produtos e clientes
   ========================================================================== */

const Relatorios = {
  periodoIni: null,
  periodoFim: null,

  setPeriodoPadrao(dias = 30) {
    const fim = new Date();
    const ini = new Date();
    ini.setDate(ini.getDate() - (dias - 1));
    this.periodoIni = ini.toISOString().slice(0, 10);
    this.periodoFim = fim.toISOString().slice(0, 10);
    document.getElementById('rel-data-ini').value = this.periodoIni;
    document.getElementById('rel-data-fim').value = this.periodoFim;
  },

  async vendasNoPeriodo() {
    const vendas = Utils.vendasValidas(await DB.getAll('vendas'));
    return vendas.filter((v) => {
      const d = Analise.dataLocal(v.data);
      return d >= this.periodoIni && d <= this.periodoFim;
    });
  },

  async render() {
    this.periodoIni = document.getElementById('rel-data-ini').value || this.periodoIni;
    this.periodoFim = document.getElementById('rel-data-fim').value || this.periodoFim;

    const vendas = await this.vendasNoPeriodo();
    const faturamento = vendas.reduce((s, v) => s + v.total, 0);
    const numVendas = vendas.length;
    const ticketMedio = numVendas ? faturamento / numVendas : 0;

    // lucro estimado: precisa custo de cada produto no momento; usamos custo atual do cadastro
    const produtos = await Produtos.carregar();
    const produtosPorId = {};
    produtos.forEach((p) => { produtosPorId[p.id] = p; });
    const lucroEstimado = vendas.reduce((s, v) => s + Analise.lucroVenda(v, produtosPorId), 0);
    const margem = faturamento > 0 ? (lucroEstimado / faturamento) * 100 : 0;
    this.ultimoPeriodo = { vendas, produtosPorId };
    this.renderABC(vendas, produtosPorId);

    document.getElementById('rel-cards').innerHTML = `
      <div class="stat-card stat-card--primary">
        <div class="stat-card__label">Faturamento</div>
        <div class="stat-card__value">${Utils.formatMoney(faturamento)}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">Vendas realizadas</div>
        <div class="stat-card__value">${numVendas}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">Ticket médio</div>
        <div class="stat-card__value">${Utils.formatMoney(ticketMedio)}</div>
      </div>
      <div class="stat-card stat-card--success">
        <div class="stat-card__label">Lucro estimado</div>
        <div class="stat-card__value">${Utils.formatMoney(lucroEstimado)}</div>
        <div class="stat-card__hint">Margem média de ${margem.toFixed(0)}%</div>
      </div>
    `;

    // Faturamento por dia
    const porDia = {};
    vendas.forEach((v) => {
      const d = v.data.slice(0, 10);
      porDia[d] = (porDia[d] || 0) + v.total;
    });
    const dias = Object.keys(porDia).sort();
    const chartData = dias.slice(-14).map((d) => ({ label: d.slice(8, 10) + '/' + d.slice(5, 7), value: porDia[d] }));
    document.getElementById('rel-chart').innerHTML = Utils.renderBarsChart(chartData, (v) => 'R$' + v.toFixed(0));

    // Top produtos
    const vendidosPorProduto = {};
    vendas.forEach((v) => v.itens.forEach((i) => {
      vendidosPorProduto[i.nome] = (vendidosPorProduto[i.nome] || 0) + i.quantidade;
    }));
    const topProdutos = Object.entries(vendidosPorProduto)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    document.getElementById('rel-top-products').innerHTML = Utils.renderTopList(topProdutos, (v) => v + ' un.');

    // Formas de pagamento (soma corretamente vendas com pagamento dividido)
    const porPagamento = {};
    vendas.forEach((v) => {
      Utils.linhasPagamento(v).forEach((p) => {
        porPagamento[p.metodo] = (porPagamento[p.metodo] || 0) + p.valor;
      });
    });
    const pagamentoData = Object.entries(porPagamento).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
    document.getElementById('rel-payment-breakdown').innerHTML = Utils.renderBarsChart(pagamentoData, (v) => 'R$' + v.toFixed(0));

    // Top clientes
    const porCliente = {};
    vendas.forEach((v) => {
      const nome = v.clienteNome || 'Venda avulsa';
      porCliente[nome] = (porCliente[nome] || 0) + v.total;
    });
    const topClientes = Object.entries(porCliente)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 8);
    document.getElementById('rel-top-clientes').innerHTML = Utils.renderTopList(topClientes, (v) => Utils.formatMoney(v));
  },

  // Curva ABC: quais produtos respondem pela maior parte do faturamento
  renderABC(vendas, produtosPorId) {
    const porProduto = {};
    vendas.forEach((v) => {
      const fator = v.subtotal > 0 ? v.total / v.subtotal : 1; // distribui desconto/acréscimo da venda
      (v.itens || []).forEach((i) => {
        const chave = i.tipo === 'combo' ? 'combo-' + i.comboId : 'p-' + i.produtoId;
        const g = porProduto[chave] || (porProduto[chave] = { nome: (i.nome || '').replace(/^◆\s*/, ''), qtd: 0, receita: 0, custo: 0 });
        g.qtd += i.quantidade;
        g.receita += (i.subtotal || 0) * fator;
        if (i.tipo === 'combo' && i.componentes) {
          i.componentes.forEach((c) => { const p = produtosPorId[c.produtoId]; g.custo += (p ? p.precoCusto || 0 : 0) * c.quantidade * i.quantidade; });
        } else {
          const p = produtosPorId[i.produtoId]; g.custo += (p ? p.precoCusto || 0 : 0) * i.quantidade;
        }
      });
    });
    const lista = Object.values(porProduto).sort((a, b) => b.receita - a.receita);
    const total = lista.reduce((s, g) => s + g.receita, 0) || 1;
    let acum = 0;
    lista.forEach((g) => { acum += g.receita; g.acum = acum / total; g.classe = g.acum <= 0.8 ? 'A' : (g.acum <= 0.95 ? 'B' : 'C'); g.lucro = g.receita - g.custo; });
    // o primeiro produto que "cruza" os 80% também é A
    const primeiroB = lista.find((g) => g.classe !== 'A');
    if (primeiroB && lista.filter((g) => g.classe === 'A').length === 0) primeiroB.classe = 'A';
    this.abc = lista;
    const tbody = document.getElementById('rel-abc-body');
    if (!tbody) return;
    const tom = { A: 'success', B: 'amber', C: 'muted' };
    tbody.innerHTML = lista.length ? lista.map((g) => `<tr>
      <td><span class="badge badge--${tom[g.classe]}">${g.classe}</span></td>
      <td>${Utils.escapeHtml(g.nome)}</td>
      <td class="text-right">${g.qtd}</td>
      <td class="text-right">${Utils.formatMoney(g.receita)}</td>
      <td class="text-right">${Utils.formatMoney(g.lucro)}</td>
      <td class="text-right">${g.receita > 0 ? ((g.lucro / g.receita) * 100).toFixed(0) + '%' : '—'}</td>
      <td class="text-right">${((g.receita / total) * 100).toFixed(1).replace('.', ',')}%</td>
    </tr>`).join('') : '<tr class="empty-row"><td colspan="7">Sem vendas no período</td></tr>';
    const a = lista.filter((g) => g.classe === 'A');
    const resumo = document.getElementById('rel-abc-resumo');
    if (resumo) resumo.textContent = lista.length
      ? `${a.length} de ${lista.length} produto(s) fazem cerca de 80% do seu faturamento. Nunca deixe faltar os da classe A.`
      : '';
  },

  exportarVendas() {
    const { vendas } = this.ultimoPeriodo || { vendas: [] };
    const linhas = [['Venda', 'Data', 'Hora', 'Cliente', 'Operador', 'Forma de pagamento', 'Itens', 'Desconto', 'Acréscimo', 'Total', 'Status']];
    vendas.slice().sort((a, b) => new Date(a.data) - new Date(b.data)).forEach((v) => {
      const d = new Date(v.data);
      linhas.push([v.id, d.toLocaleDateString('pt-BR'), d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), v.clienteNome || 'Venda avulsa', v.operadorNome || '',
        Utils.linhasPagamento(v).map((p) => p.metodo + ' ' + Utils.num(p.valor)).join(' + '),
        (v.itens || []).map((i) => i.quantidade + 'x ' + i.nome).join(', '), Utils.num(v.desconto), Utils.num(v.acrescimo), Utils.num(v.total), v.statusPagamento === 'fiado' ? 'Fiado' : 'Pago']);
    });
    Utils.baixarCSV(`vendas-${this.periodoIni}-a-${this.periodoFim}.csv`, linhas);
  },

  exportarABC() {
    const linhas = [['Classe', 'Produto', 'Quantidade', 'Faturamento', 'Lucro estimado', 'Margem %', 'Participação %']];
    (this.abc || []).forEach((g) => linhas.push([g.classe, g.nome, g.qtd, Utils.num(g.receita), Utils.num(g.lucro), g.receita > 0 ? Utils.num((g.lucro / g.receita) * 100, 1) : '', Utils.num(g.acum * 100, 1)]));
    Utils.baixarCSV(`curva-abc-${this.periodoIni}-a-${this.periodoFim}.csv`, linhas);
  },

  init() {
    document.getElementById('btn-rel-exportar-vendas').addEventListener('click', () => this.exportarVendas());
    document.getElementById('btn-rel-exportar-abc').addEventListener('click', () => this.exportarABC());
    this.setPeriodoPadrao(30);
    document.getElementById('rel-aplicar').addEventListener('click', () => this.render());
    document.querySelectorAll('#view-relatorios .filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#view-relatorios .filter-chip').forEach((c) => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        this.setPeriodoPadrao(parseInt(chip.dataset.periodo, 10));
        this.render();
      });
    });
  },
};
