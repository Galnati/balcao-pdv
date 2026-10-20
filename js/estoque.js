/* ==========================================================================
   estoque.js — Controle de Estoque
   ========================================================================== */

const Estoque = {
  cache: [],

  async carregar() {
    this.cache = await DB.getAll('movimentacoesEstoque');
    this.cache.sort((a, b) => new Date(b.data) - new Date(a.data));
    return this.cache;
  },

  calcularDelta(tipo, quantidade) {
    if (tipo === 'entrada') return Math.abs(quantidade);
    if (tipo === 'saida') return -Math.abs(quantidade);
    return quantidade; // ajuste: já vem com sinal
  },

  /**
   * Registra uma movimentação de estoque e (opcionalmente) já ajusta o
   * estoqueAtual do produto. Use ajustarEstoque=false quando o estoque do
   * produto já foi alterado em outro lugar (ex: edição manual do cadastro).
   */
  async registrarMovimentacao(mov, ajustarEstoque = true) {
    if (ajustarEstoque) {
      // Movimentação atômica no servidor (evita condição de corrida entre
      // vendas concorrentes de dispositivos diferentes).
      const resultado = await DB.estoqueMovimentar(mov);
      await Produtos.carregar();
      await this.carregar();
      return resultado.movimentacao;
    }

    const produto = await Produtos.buscarPorId(mov.produtoId);
    if (!produto) throw new Error('Produto não encontrado');
    const delta = this.calcularDelta(mov.tipo, mov.quantidade);

    const registro = {
      produtoId: mov.produtoId,
      produtoNome: produto.nome,
      tipo: mov.tipo,
      quantidade: mov.tipo === 'ajuste' ? delta : Math.abs(mov.quantidade),
      motivo: mov.motivo || '',
      vendaId: mov.vendaId || null,
      data: Utils.nowISO(),
    };
    await DB.add('movimentacoesEstoque', registro);
    await this.carregar();
    return registro;
  },

  async produtosEstoqueBaixo() {
    const produtos = await Produtos.listarAtivos();
    return produtos.filter((p) => p.estoqueAtual <= (p.estoqueMinimo || 0));
  },

  async valorTotalEstoque() {
    const produtos = await Produtos.listarAtivos();
    return produtos.reduce((sum, p) => sum + (p.estoqueAtual * p.precoCusto), 0);
  },

  async renderCards() {
    const produtos = await Produtos.listarAtivos();
    const baixo = await this.produtosEstoqueBaixo();
    const valorTotal = await this.valorTotalEstoque();
    const totalUnidades = produtos.reduce((sum, p) => sum + (p.estoqueAtual || 0), 0);

    const cardsEl = document.getElementById('estoque-cards');
    if (!cardsEl) return;
    cardsEl.innerHTML = `
      <div class="stat-card stat-card--primary">
        <div class="stat-card__label">Produtos ativos</div>
        <div class="stat-card__value">${produtos.length}</div>
      </div>
      <div class="stat-card">
        <div class="stat-card__label">Unidades em estoque</div>
        <div class="stat-card__value">${totalUnidades}</div>
      </div>
      <div class="stat-card stat-card--danger">
        <div class="stat-card__label">Estoque baixo</div>
        <div class="stat-card__value">${baixo.length}</div>
        <div class="stat-card__hint">produtos abaixo do mínimo</div>
      </div>
      <div class="stat-card stat-card--success">
        <div class="stat-card__label">Valor em estoque (custo)</div>
        <div class="stat-card__value">${Utils.formatMoney(valorTotal)}</div>
      </div>
    `;
  },

  async renderTabela() {
    const tbody = document.getElementById('estoque-table-body');
    const filtroTipo = document.getElementById('estoque-filtro-tipo').value;
    await this.carregar();
    let lista = this.cache;
    if (filtroTipo) lista = lista.filter((m) => m.tipo === filtroTipo);
    lista = lista.slice(0, 200);

    if (!lista.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Nenhuma movimentação registrada</td></tr>';
      return;
    }

    const tipoLabel = { entrada: '<span class="badge badge--success">Entrada</span>', saida: '<span class="badge badge--danger">Saída</span>', ajuste: '<span class="badge badge--warning">Ajuste</span>' };

    tbody.innerHTML = lista.map((m) => `
      <tr>
        <td>${Utils.formatDateTime(m.data)}</td>
        <td>${Utils.escapeHtml(m.produtoNome || '')}</td>
        <td>${tipoLabel[m.tipo] || m.tipo}</td>
        <td class="text-right">${m.quantidade > 0 && m.tipo === 'ajuste' ? '+' : ''}${m.quantidade}</td>
        <td>${Utils.escapeHtml(m.motivo || '-')}</td>
      </tr>`).join('');
  },

  async renderTudo() {
    await this.renderVisaoGeral();
    await this.renderTabela();
  },

  /* ---------------- Visão geral (Balcão v2) ---------------- */
  filtroStatus: 'todos',
  sugestaoQtd: {}, // produtoId -> quantidade ajustada à mão no pedido sugerido
  tabAtiva: 'geral',

  mostrarTab(tab) {
    this.tabAtiva = tab;
    document.getElementById('estoque-tab-geral').style.display = tab === 'geral' ? '' : 'none';
    document.getElementById('estoque-tab-mov').style.display = tab === 'mov' ? '' : 'none';
    document.getElementById('estoque-tab-btn-geral').classList.toggle('is-active', tab === 'geral');
    document.getElementById('estoque-tab-btn-mov').classList.toggle('is-active', tab === 'mov');
  },

  async renderVisaoGeral() {
    const [produtos, vendas, fornecedores] = await Promise.all([Produtos.carregar(), DB.getAll('vendas'), DB.getAll('fornecedores').catch(() => [])]);
    const infos = Analise.produtosComStatus(produtos, vendas);
    this.infos = infos;
    this.fornecedoresCache = fornecedores;

    const vencendo = infos.filter((i) => i.status === 'vencendo' || i.status === 'vencido');
    const repor = infos.filter((i) => i.status === 'repor');
    const parados = infos.filter((i) => i.status === 'parado');
    const emRisco = vencendo.reduce((s, i) => s + (i.produto.estoqueAtual || 0) * (i.produto.precoVenda || 0), 0);
    const capitalParado = parados.reduce((s, i) => s + (i.produto.estoqueAtual || 0) * (i.produto.precoCusto || 0), 0);
    const icone = (v) => { const el = document.querySelector(`.nav-item[data-view="${v}"] .nav-item__icon`); return el ? el.innerHTML : ''; };

    const card = (tom, ic, titulo, desc, botao, acao) => `
      <div class="alert-card">
        <div class="alert-card__top">
          <div class="alerta__icon alerta__icon--${tom}">${icone(ic)}</div>
          <div class="alerta__body"><div class="alerta__title">${titulo}</div><div class="alerta__desc">${desc}</div></div>
        </div>
        <button class="btn btn--sm" data-estoque-acao="${acao}">${botao}</button>
      </div>`;
    document.getElementById('estoque-alertas').innerHTML =
      card(vencendo.length ? 'red' : 'gray', 'estoque', `${vencendo.length} produto(s) vencendo em ${Analise.DIAS_VENCENDO} dias`, vencendo.length ? `${Utils.formatMoney(emRisco)} em vendas em risco` : 'Nada vencendo por enquanto ✓', 'Criar combo ou promoção', 'combo') +
      card(repor.length ? 'amber' : 'gray', 'produtos', `${repor.length} produto(s) para repor`, repor.length ? 'Acabam em poucos dias ou estão abaixo do mínimo' : 'Estoque em dia ✓', 'Ver pedido sugerido', 'sugestao') +
      card('gray', 'relatorios', `${parados.length} produto(s) parados há 30+ dias`, parados.length ? `${Utils.formatMoney(capitalParado)} de capital parado` : 'Tudo girando ✓', 'Ver produtos', 'parados');

    // ---- tabela ----
    document.querySelectorAll('#estoque-filtro-status .filter-chip').forEach((c) => c.classList.toggle('is-active', c.dataset.status === this.filtroStatus));
    const ordem = { vencido: 0, vencendo: 1, repor: 2, parado: 3, ok: 4 };
    let lista = infos.slice().sort((a, b) => ordem[a.status] - ordem[b.status] || a.dura - b.dura || a.produto.nome.localeCompare(b.produto.nome));
    if (this.filtroStatus === 'repor') lista = lista.filter((i) => i.status === 'repor');
    if (this.filtroStatus === 'vencendo') lista = lista.filter((i) => i.status === 'vencendo' || i.status === 'vencido');
    if (this.filtroStatus === 'parado') lista = lista.filter((i) => i.status === 'parado');
    const badge = { vencido: ['Vencido', 'danger'], vencendo: ['Vencendo', 'danger'], repor: ['Repor', 'amber'], parado: ['Parado', 'muted'], ok: ['Ok', 'success'] };
    const tbody = document.getElementById('estoque-produtos-body');
    tbody.innerHTML = lista.length ? lista.map((i) => {
      const p = i.produto;
      const [txt, tom] = badge[i.status];
      const val = p.validade
        ? `<span class="${i.diasValidade !== null && i.diasValidade <= Analise.DIAS_VENCENDO ? 'text-danger' : 'text-muted'}" style="font-weight:${i.diasValidade !== null && i.diasValidade <= Analise.DIAS_VENCENDO ? 600 : 400}">${Utils.formatDate(p.validade + 'T12:00:00').slice(0, 5)}</span>`
        : '<span class="text-muted">—</span>';
      return `<tr>
        <td><strong>${Utils.escapeHtml(p.nome)}</strong><br><small class="text-muted">${Utils.escapeHtml(p.categoria || '')}</small></td>
        <td class="text-right">${p.estoqueAtual || 0} un</td>
        <td class="text-right text-muted">${i.vendaDia.toFixed(1).replace('.', ',')}</td>
        <td style="white-space:nowrap;${i.status === 'repor' ? 'color:var(--color-amber-text);font-weight:600;' : ''}">${Analise.formatarDura(i.dura)}</td>
        <td>${val}</td>
        <td><span class="badge badge--${tom}">${txt}</span></td>
      </tr>`;
    }).join('') : '<tr class="empty-row"><td colspan="6">Nenhum produto neste filtro</td></tr>';

    this.renderSugestoes(repor);
  },

  // Pedido sugerido por fornecedor (campo "Fornecedor" do cadastro do produto)
  renderSugestoes(repor) {
    const box = document.getElementById('estoque-sugestoes');
    if (!repor.length) {
      box.innerHTML = `<div class="panel"><h3 class="panel__title">Pedido sugerido</h3><div class="empty-state"><strong>Nada para repor ✓</strong>Quando um produto estiver acabando, o pedido aparece aqui pronto para enviar.</div></div>`;
      return;
    }
    const grupos = {};
    repor.forEach((i) => {
      const nome = (i.produto.fornecedor || '').trim() || 'Sem fornecedor definido';
      (grupos[nome] = grupos[nome] || []).push(i);
    });
    this.gruposSugestao = grupos;
    box.innerHTML = Object.entries(grupos).map(([forn, itens], gi) => {
      const linhas = itens.map((i) => {
        const qtd = this.sugestaoQtd[i.produto.id] !== undefined ? this.sugestaoQtd[i.produto.id] : Analise.quantidadeSugerida(i);
        return { i, qtd };
      });
      const total = linhas.reduce((s, l) => s + l.qtd * (l.i.produto.precoCusto || 0), 0);
      return `
      <div class="panel">
        <div class="panel__header" style="margin-bottom:6px;">
          <div><h3 class="panel__title" style="margin:0;">Pedido sugerido</h3><small class="text-muted">${Utils.escapeHtml(forn)}</small></div>
          <span class="badge badge--primary">Automático</span>
        </div>
        ${linhas.map(({ i, qtd }) => `
          <div class="sugestao-linha">
            <div><strong>${Utils.escapeHtml(i.produto.nome)}</strong><small>Tem ${Math.max(0, i.produto.estoqueAtual || 0)} · vende ${i.vendaDia.toFixed(1).replace('.', ',')}/dia · custo ${Utils.formatMoney(i.produto.precoCusto)}</small></div>
            <input type="number" min="0" step="1" value="${qtd}" data-sugestao-produto="${i.produto.id}" title="Quantidade a pedir">
          </div>`).join('')}
        <div class="sugestao-total"><span class="text-muted">Total do pedido</span><strong>${Utils.formatMoney(total)}</strong></div>
        <div class="nota">Calculado pela média de vendas dos últimos ${Analise.DIAS_MEDIA} dias, para cobrir cerca de ${Analise.DIAS_COBERTURA} dias. Ajuste as quantidades se quiser.</div>
        <div class="btn-row" style="flex-direction:column;">
          <button class="btn btn--primary" style="justify-content:center;" data-criar-pedido="${gi}">Criar pedido de compra</button>
          <button class="btn" style="justify-content:center;" data-whats-pedido="${gi}">Enviar lista pelo WhatsApp</button>
        </div>
      </div>`;
    }).join('');
  },

  itensDoGrupo(gi) {
    const itens = Object.values(this.gruposSugestao || {})[gi] || [];
    return itens.map((i) => {
      const qtd = this.sugestaoQtd[i.produto.id] !== undefined ? this.sugestaoQtd[i.produto.id] : Analise.quantidadeSugerida(i);
      return { produto: i.produto, quantidade: qtd };
    }).filter((x) => x.quantidade > 0);
  },

  async criarPedidoSugerido(gi) {
    const nomeForn = Object.keys(this.gruposSugestao || {})[gi];
    const itens = this.itensDoGrupo(gi);
    if (!itens.length) { Utils.toast('Informe ao menos uma quantidade maior que zero', 'error'); return; }
    let fornecedor = null;
    if (nomeForn && nomeForn !== 'Sem fornecedor definido') {
      const todos = await DB.getAll('fornecedores');
      fornecedor = todos.find((f) => (f.nome || '').trim().toLowerCase() === nomeForn.toLowerCase());
      if (!fornecedor) {
        const ok = await Utils.confirmDialog(`"${nomeForn}" ainda não está em Compras > Fornecedores. Cadastrar agora e criar o pedido?`);
        if (!ok) return;
        fornecedor = { nome: nomeForn, telefone: '', email: '', observacoes: 'Cadastrado a partir do pedido sugerido', criadoEm: Utils.nowISO() };
        fornecedor.id = await DB.add('fornecedores', fornecedor);
      }
    } else {
      Utils.toast('Defina o fornecedor no cadastro desses produtos para criar o pedido automático', 'error');
      return;
    }
    const linhas = itens.map(({ produto, quantidade }) => ({ produtoId: produto.id, nome: produto.nome, quantidade, precoCusto: produto.precoCusto || 0, subtotal: quantidade * (produto.precoCusto || 0) }));
    await DB.add('pedidosCompra', {
      fornecedorId: fornecedor.id,
      fornecedorNome: fornecedor.nome,
      itens: linhas,
      total: linhas.reduce((s, l) => s + l.subtotal, 0),
      status: 'aberto',
      dataPedido: Utils.nowISO(),
    });
    itens.forEach(({ produto }) => { delete this.sugestaoQtd[produto.id]; });
    Utils.toast('Pedido de compra criado! Confira em Compras quando a mercadoria chegar.', 'ok');
    await App.mudarView('fornecedores');
    Fornecedores.mostrarTab('pedidos');
  },

  async enviarPedidoWhatsapp(gi) {
    const nomeForn = Object.keys(this.gruposSugestao || {})[gi];
    const itens = this.itensDoGrupo(gi);
    if (!itens.length) return;
    const forn = (this.fornecedoresCache || []).find((f) => (f.nome || '').trim().toLowerCase() === (nomeForn || '').toLowerCase());
    const loja = Auth.usuario && Auth.usuario.loja ? Auth.usuario.loja.nome : '';
    const texto = `Olá! Pedido${loja ? ' da ' + loja : ''}:\n` + itens.map(({ produto, quantidade }) => `• ${quantidade}x ${produto.nome}`).join('\n') + '\nObrigado!';
    window.open(Utils.linkWhatsapp(forn ? forn.telefone : '', texto), '_blank');
  },

  async abrirFormulario() {
    const produtos = await Produtos.listarAtivos();
    const body = `
      <form id="form-movimentacao">
        <div class="form-grid">
          <div class="field field--full">
            <label>Produto *</label>
            <select id="f-produto" required>
              <option value="">Selecione...</option>
              ${produtos.map((p) => `<option value="${p.id}">${Utils.escapeHtml(p.nome)} (estoque atual: ${p.estoqueAtual})</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Tipo de movimentação *</label>
            <select id="f-tipo" required>
              <option value="entrada">Entrada (compra / reposição)</option>
              <option value="saida">Saída (perda, quebra, uso interno)</option>
              <option value="ajuste">Ajuste manual (definir diferença)</option>
            </select>
          </div>
          <div class="field">
            <label id="f-quantidade-label">Quantidade *</label>
            <input type="number" id="f-quantidade" step="1" required placeholder="Ex: 12">
          </div>
          <div class="field" id="f-caixas-field" style="display:none;">
            <label>Ou quantidade em caixas</label>
            <input type="number" id="f-caixas" step="1" min="0" placeholder="Ex: 2">
          </div>
          <div class="field field--full">
            <label>Motivo / observação</label>
            <input type="text" id="f-motivo" placeholder="Ex: Compra fornecedor XYZ">
          </div>
        </div>
        <p class="hint-text" id="f-hint">Informe a quantidade que está entrando no estoque.</p>
        <div class="modal__footer">
          <button type="button" class="btn" id="btn-cancelar-mov">Cancelar</button>
          <button type="submit" class="btn btn--primary">Registrar movimentação</button>
        </div>
      </form>
    `;
    App.abrirModal('Nova movimentação de estoque', body);

    const tipoSelect = document.getElementById('f-tipo');
    const produtoSelect = document.getElementById('f-produto');
    const hint = document.getElementById('f-hint');
    const qtyLabel = document.getElementById('f-quantidade-label');
    const caixasField = document.getElementById('f-caixas-field');
    const caixasInput = document.getElementById('f-caixas');
    const qtyInput = document.getElementById('f-quantidade');

    const atualizarCampoCaixas = () => {
      const produto = produtos.find((p) => p.id === parseInt(produtoSelect.value, 10));
      const podeUsarCaixa = tipoSelect.value === 'entrada' && produto && produto.unidadesPorCaixa > 1;
      caixasField.style.display = podeUsarCaixa ? '' : 'none';
      if (podeUsarCaixa) caixasField.querySelector('label').textContent = `Ou quantidade em caixas (cx c/ ${produto.unidadesPorCaixa} un.)`;
      else caixasInput.value = '';
    };

    tipoSelect.addEventListener('change', () => {
      if (tipoSelect.value === 'entrada') { hint.textContent = 'Informe a quantidade que está entrando no estoque.'; qtyLabel.textContent = 'Quantidade a adicionar *'; }
      else if (tipoSelect.value === 'saida') { hint.textContent = 'Informe a quantidade que está saindo do estoque (perda, quebra, uso interno).'; qtyLabel.textContent = 'Quantidade a remover *'; }
      else { hint.textContent = 'Ajuste manual: use valores positivos para aumentar e negativos para diminuir o estoque.'; qtyLabel.textContent = 'Diferença (+ ou -) *'; }
      atualizarCampoCaixas();
    });
    produtoSelect.addEventListener('change', atualizarCampoCaixas);

    caixasInput.addEventListener('input', () => {
      const produto = produtos.find((p) => p.id === parseInt(produtoSelect.value, 10));
      if (!produto) return;
      const caixas = parseInt(caixasInput.value, 10) || 0;
      qtyInput.value = caixas * produto.unidadesPorCaixa;
    });

    document.getElementById('btn-cancelar-mov').addEventListener('click', () => App.fecharModal());

    document.getElementById('form-movimentacao').addEventListener('submit', async (e) => {
      e.preventDefault();
      const produtoId = parseInt(document.getElementById('f-produto').value, 10);
      const tipo = document.getElementById('f-tipo').value;
      const quantidade = parseInt(document.getElementById('f-quantidade').value, 10);
      const motivo = document.getElementById('f-motivo').value.trim();

      if (!produtoId) { Utils.toast('Selecione um produto', 'error'); return; }
      if (!quantidade) { Utils.toast('Informe a quantidade', 'error'); return; }

      await this.registrarMovimentacao({ produtoId, tipo, quantidade, motivo });
      App.fecharModal();
      Utils.toast('Movimentação registrada!', 'ok');
      this.renderTudo();
      Produtos.renderTabela();
      if (typeof Dashboard !== 'undefined') Dashboard.render();
    });
  },

  init() {
    document.getElementById('btn-nova-movimentacao').addEventListener('click', () => this.abrirFormulario());
    document.getElementById('estoque-filtro-tipo').addEventListener('change', () => this.renderTabela());

    document.getElementById('estoque-tab-btn-geral').addEventListener('click', () => this.mostrarTab('geral'));
    document.getElementById('estoque-tab-btn-mov').addEventListener('click', () => this.mostrarTab('mov'));
    document.getElementById('estoque-filtro-status').addEventListener('click', (e) => {
      const chip = e.target.closest('.filter-chip');
      if (!chip) return;
      this.filtroStatus = chip.dataset.status;
      this.renderVisaoGeral();
    });
    document.getElementById('estoque-alertas').addEventListener('click', (e) => {
      const b = e.target.closest('[data-estoque-acao]');
      if (!b) return;
      const acao = b.dataset.estoqueAcao;
      if (acao === 'combo') App.mudarView('produtos').then(() => Produtos.mostrarTab('combos'));
      if (acao === 'sugestao') document.getElementById('estoque-sugestoes').scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (acao === 'parados') { this.filtroStatus = 'parado'; this.renderVisaoGeral(); }
    });
    const sug = document.getElementById('estoque-sugestoes');
    sug.addEventListener('change', (e) => {
      const inp = e.target.closest('[data-sugestao-produto]');
      if (!inp) return;
      this.sugestaoQtd[parseInt(inp.dataset.sugestaoProduto, 10)] = Math.max(0, parseInt(inp.value, 10) || 0);
      this.renderSugestoes(this.infos.filter((i) => i.status === 'repor'));
    });
    sug.addEventListener('click', (e) => {
      const c = e.target.closest('[data-criar-pedido]');
      if (c) { this.criarPedidoSugerido(parseInt(c.dataset.criarPedido, 10)); return; }
      const w = e.target.closest('[data-whats-pedido]');
      if (w) this.enviarPedidoWhatsapp(parseInt(w.dataset.whatsPedido, 10));
    });
  },
};
