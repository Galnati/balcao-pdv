/* ==========================================================================
   encomendas.js — Encomendas / Entregas agendadas (calendário)
   Permite marcar uma venda para ser entregue em outro dia. Ao entregar,
   vira uma venda de verdade (com baixa de estoque); até lá, não mexe no
   estoque.
   ========================================================================== */

const MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS_SEMANA_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const Encomendas = {
  cache: [],
  mesAtual: new Date().getMonth(),
  anoAtual: new Date().getFullYear(),
  diaSelecionado: Utils.todayISO(),

  async carregar() {
    this.cache = await DB.getAll('encomendas');
    return this.cache;
  },

  porData(dataISO) {
    return this.cache
      .filter((e) => e.dataEntrega === dataISO)
      .sort((a, b) => (a.status === b.status ? 0 : a.status === 'pendente' ? -1 : 1));
  },

  contarPendentesPorData(dataISO) {
    return this.cache.filter((e) => e.dataEntrega === dataISO && e.status === 'pendente').length;
  },

  async salvar(encomenda) {
    if (encomenda.id) {
      await DB.put('encomendas', encomenda);
    } else {
      encomenda.status = 'pendente';
      encomenda.criadoEm = Utils.nowISO();
      encomenda.id = await DB.add('encomendas', encomenda);
    }
    await this.carregar();
    return encomenda;
  },

  async excluir(id) {
    await DB.delete('encomendas', id);
    await this.carregar();
  },

  async marcarEntregue(id) {
    const encomenda = await DB.get('encomendas', id);
    if (!encomenda || encomenda.status !== 'pendente') return;

    const venda = {
      data: Utils.nowISO(),
      clienteId: encomenda.clienteId || null,
      clienteNome: encomenda.clienteNome || 'Venda avulsa',
      itens: encomenda.itens,
      subtotal: encomenda.subtotal,
      desconto: encomenda.desconto,
      total: encomenda.total,
      formaPagamento: encomenda.formaPagamento || 'Dinheiro',
      pagamentos: [{ metodo: encomenda.formaPagamento || 'Dinheiro', valor: encomenda.total }],
      statusPagamento: encomenda.formaPagamento === 'Fiado' ? 'fiado' : 'pago',
      valorFiado: encomenda.formaPagamento === 'Fiado' ? encomenda.total : 0,
      valorRecebido: encomenda.total,
      troco: 0,
      vencimento: null,
      encomendaId: encomenda.id,
    };
    venda.id = await DB.add('vendas', venda);

    for (const item of venda.itens) {
      await Estoque.registrarMovimentacao({
        produtoId: item.produtoId,
        tipo: 'saida',
        quantidade: item.quantidade,
        motivo: `Entrega de encomenda #${encomenda.id} (venda #${venda.id})`,
        vendaId: venda.id,
      });
    }

    if (venda.statusPagamento === 'fiado') {
      await DB.add('contas', {
        tipo: 'receber',
        descricao: `Encomenda #${encomenda.id} - ${venda.clienteNome}`,
        valor: venda.total,
        vencimento: encomenda.dataEntrega,
        status: 'pendente',
        clienteId: venda.clienteId,
        vendaId: venda.id,
        criadoEm: Utils.nowISO(),
      });
    }

    encomenda.status = 'entregue';
    encomenda.vendaId = venda.id;
    encomenda.entregueEm = Utils.nowISO();
    await DB.put('encomendas', encomenda);
    await this.carregar();

    Produtos.renderTabela();
    if (typeof Estoque !== 'undefined') Estoque.renderTudo();
    if (typeof Dashboard !== 'undefined') Dashboard.render();
    if (typeof Vendas !== 'undefined') Vendas.renderTabela();
    if (typeof Contas !== 'undefined') Contas.renderTudo();
  },

  async cancelar(id) {
    const encomenda = await DB.get('encomendas', id);
    if (!encomenda) return;
    encomenda.status = 'cancelada';
    await DB.put('encomendas', encomenda);
    await this.carregar();
  },

  // ---------------------------------------------------------------------
  // Calendário
  // ---------------------------------------------------------------------

  renderCalendario() {
    document.getElementById('encomendas-mes-titulo').textContent = `${MESES_PT[this.mesAtual]} ${this.anoAtual}`;

    const cabecalho = document.getElementById('calendar-weekdays');
    cabecalho.innerHTML = DIAS_SEMANA_PT.map((d) => `<div class="calendar-weekday">${d}</div>`).join('');

    const primeiroDia = new Date(this.anoAtual, this.mesAtual, 1);
    const ultimoDia = new Date(this.anoAtual, this.mesAtual + 1, 0);
    const diasNoMes = ultimoDia.getDate();
    const offsetInicial = primeiroDia.getDay(); // 0=domingo

    const hojeISO = Utils.todayISO();
    const celulas = [];

    // dias do mês anterior (preenchimento)
    const ultimoDiaMesAnterior = new Date(this.anoAtual, this.mesAtual, 0).getDate();
    for (let i = offsetInicial - 1; i >= 0; i--) {
      celulas.push({ dia: ultimoDiaMesAnterior - i, outroMes: true, iso: null });
    }
    // dias do mês atual
    for (let d = 1; d <= diasNoMes; d++) {
      const iso = `${this.anoAtual}-${String(this.mesAtual + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      celulas.push({ dia: d, outroMes: false, iso });
    }
    // completa a última semana
    while (celulas.length % 7 !== 0) {
      const d = celulas.length - (offsetInicial + diasNoMes) + 1;
      celulas.push({ dia: d, outroMes: true, iso: null });
    }

    document.getElementById('calendar-days').innerHTML = celulas.map((c) => {
      if (c.outroMes) {
        return `<div class="calendar-day calendar-day--muted">${c.dia}</div>`;
      }
      const pendentes = this.contarPendentesPorData(c.iso);
      const vendasDia = this.vendasPorData(c.iso).length;
      const classes = ['calendar-day'];
      if (c.iso === hojeISO) classes.push('calendar-day--today');
      if (c.iso === this.diaSelecionado) classes.push('calendar-day--selected');
      return `
        <div class="${classes.join(' ')}" data-iso="${c.iso}">
          <span class="calendar-day__num">${c.dia}</span>
          ${pendentes > 0 ? `<span class="calendar-day__badge" title="Encomendas pendentes">${pendentes}</span>` : ''}
          ${vendasDia > 0 ? `<span class="calendar-day__badge calendar-day__badge--vendas" title="Vendas realizadas">${vendasDia}</span>` : ''}
        </div>`;
    }).join('');
  },

  vendasPorData(dataISO) {
    if (typeof Vendas === 'undefined') return [];
    return Utils.vendasValidas(Vendas.cache)
      .filter((v) => v.data.slice(0, 10) === dataISO)
      .sort((a, b) => new Date(b.data) - new Date(a.data));
  },

  renderDia() {
    const [ano, mes, dia] = this.diaSelecionado.split('-');
    document.getElementById('encomendas-dia-titulo').textContent = `Movimento em ${dia}/${mes}/${ano}`;

    const encomendasDia = this.porData(this.diaSelecionado);
    const vendasDia = this.vendasPorData(this.diaSelecionado);
    const container = document.getElementById('encomendas-dia-lista');

    if (!encomendasDia.length && !vendasDia.length) {
      container.innerHTML = '<p class="text-muted">Nenhuma venda ou encomenda para este dia.</p>';
      return;
    }

    const statusBadge = {
      pendente: '<span class="badge badge--warning">Pendente</span>',
      entregue: '<span class="badge badge--success">Entregue</span>',
      cancelada: '<span class="badge badge--muted">Cancelada</span>',
    };

    const totalVendasDia = vendasDia.reduce((s, v) => s + v.total, 0);

    let html = '';

    if (vendasDia.length) {
      html += `<div class="dia-secao-titulo">Vendas realizadas (${vendasDia.length}) — ${Utils.formatMoney(totalVendasDia)}</div>`;
      html += vendasDia.map((v) => `
        <div class="venda-dia-item">
          <div>
            <strong>${Utils.escapeHtml(v.clienteNome || 'Venda avulsa')}</strong>
            <span class="text-muted"> · ${Utils.formatDateTime(v.data).split(' ')[1] || ''} · ${Utils.escapeHtml(v.formaPagamento)}</span>
            ${v.statusPagamento === 'fiado' ? '<span class="badge badge--warning" style="margin-left:6px;">Fiado</span>' : ''}
          </div>
          <div class="venda-dia-item__valor">${Utils.formatMoney(v.total)}</div>
        </div>`).join('');
    }

    if (encomendasDia.length) {
      html += `<div class="dia-secao-titulo">Encomendas agendadas (${encomendasDia.length})</div>`;
      html += encomendasDia.map((e) => {
        const itensResumo = e.itens.map((i) => `${i.quantidade}x ${i.nome}`).join(', ');
        return `
          <div class="encomenda-item">
            <div class="encomenda-item__main">
              <div class="encomenda-item__cliente">${Utils.escapeHtml(e.clienteNome || 'Venda avulsa')} ${statusBadge[e.status]}</div>
              <div class="encomenda-item__itens text-muted">${Utils.escapeHtml(itensResumo)}</div>
              ${e.observacoes ? `<div class="encomenda-item__obs text-muted">Obs: ${Utils.escapeHtml(e.observacoes)}</div>` : ''}
            </div>
            <div class="encomenda-item__valor">${Utils.formatMoney(e.total)}</div>
            <div class="btn-row">
              ${e.status === 'pendente' ? `
                <button class="btn btn--sm btn--success" data-action="entregar-encomenda" data-id="${e.id}">✓ Entregar</button>
                <button class="btn btn--sm btn--icon" data-action="editar-encomenda" data-id="${e.id}" title="Editar">✏️</button>
                <button class="btn btn--sm btn--icon" data-action="cancelar-encomenda" data-id="${e.id}" title="Cancelar">✕</button>
              ` : `
                <button class="btn btn--sm btn--icon" data-action="excluir-encomenda" data-id="${e.id}" title="Excluir registro">✕</button>
              `}
            </div>
          </div>`;
      }).join('');
    }

    container.innerHTML = html;
  },

  // ---------------------------------------------------------------------
  // Abas: Calendário / Histórico completo
  // ---------------------------------------------------------------------

  tabAtiva: 'calendario',

  mostrarTab(tab) {
    this.tabAtiva = tab;
    document.getElementById('encomendas-tab-calendario').style.display = tab === 'calendario' ? '' : 'none';
    document.getElementById('encomendas-tab-historico').style.display = tab === 'historico' ? '' : 'none';
    document.getElementById('encomendas-tab-btn-calendario').classList.toggle('is-active', tab === 'calendario');
    document.getElementById('encomendas-tab-btn-historico').classList.toggle('is-active', tab === 'historico');
    if (tab === 'historico' && typeof Vendas !== 'undefined') Vendas.renderTabela();
  },

  async renderTudo() {
    await this.carregar();
    if (typeof Vendas !== 'undefined') await Vendas.carregar();
    this.renderCalendario();
    this.renderDia();
    if (this.tabAtiva === 'historico' && typeof Vendas !== 'undefined') Vendas.renderTabela();
  },

  mudarMes(delta) {
    this.mesAtual += delta;
    if (this.mesAtual < 0) { this.mesAtual = 11; this.anoAtual--; }
    if (this.mesAtual > 11) { this.mesAtual = 0; this.anoAtual++; }
    this.renderCalendario();
  },

  irParaHoje() {
    const hoje = new Date();
    this.mesAtual = hoje.getMonth();
    this.anoAtual = hoje.getFullYear();
    this.diaSelecionado = Utils.todayISO();
    this.renderCalendario();
    this.renderDia();
  },

  // ---------------------------------------------------------------------
  // Formulário (mini-carrinho dentro do modal)
  // ---------------------------------------------------------------------

  async abrirFormulario(encomenda = null) {
    const isEdit = !!encomenda;
    const dataPadrao = encomenda ? encomenda.dataEntrega : this.diaSelecionado;
    const itens = encomenda ? JSON.parse(JSON.stringify(encomenda.itens)) : [];

    await Clientes.carregar();
    const produtos = await Produtos.listarAtivos();

    const body = `
      <form id="form-encomenda">
        <div class="form-grid">
          <div class="field">
            <label>Data de entrega *</label>
            <input type="date" id="f-data-entrega" required value="${dataPadrao}">
          </div>
          <div class="field">
            <label>Cliente</label>
            <select id="f-encomenda-cliente">
              <option value="">Venda avulsa (sem cliente)</option>
              ${Clientes.cache.map((c) => `<option value="${c.id}" ${encomenda && encomenda.clienteId === c.id ? 'selected' : ''}>${Utils.escapeHtml(c.nome)}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Forma de pagamento prevista</label>
            <select id="f-encomenda-pagamento">
              ${['Dinheiro', 'Pix', 'Cartão Débito', 'Cartão Crédito', 'Fiado'].map((m) => `<option value="${m}" ${encomenda && encomenda.formaPagamento === m ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Desconto (R$)</label>
            <input type="text" id="f-encomenda-desconto" value="${encomenda && encomenda.desconto ? encomenda.desconto.toFixed(2).replace('.', ',') : '0,00'}">
          </div>
          <div class="field field--full">
            <label>Observações</label>
            <input type="text" id="f-encomenda-obs" value="${Utils.escapeHtml(encomenda && encomenda.observacoes ? encomenda.observacoes : '')}" placeholder="Ex: entregar até 18h, endereço, etc.">
          </div>
        </div>

        <div style="margin-top:16px;">
          <label style="font-size:12.5px; font-weight:600; color:var(--color-text-muted);">Produtos *</label>
          <div class="pdv-search" style="margin-top:6px;">
            <input type="text" id="f-encomenda-busca" placeholder="Buscar produto por nome ou código...">
            <div class="pdv-suggestions" id="f-encomenda-suggestions"></div>
          </div>
          <div class="table-wrap" style="margin-top:10px;">
            <table class="data-table">
              <thead><tr><th>Produto</th><th>Qtd</th><th class="text-right">Preço</th><th class="text-right">Subtotal</th><th></th></tr></thead>
              <tbody id="f-encomenda-itens-body"><tr class="empty-row"><td colspan="5">Nenhum produto adicionado</td></tr></tbody>
            </table>
          </div>
        </div>

        <div class="calc-result" id="f-encomenda-total" style="margin-top:14px;"></div>

        <div class="modal__footer">
          <button type="button" class="btn" id="btn-cancelar-encomenda">Cancelar</button>
          <button type="submit" class="btn btn--primary">${isEdit ? 'Salvar alterações' : 'Agendar encomenda'}</button>
        </div>
      </form>
    `;

    App.abrirModal(isEdit ? 'Editar encomenda' : 'Nova encomenda', body);

    const renderMiniCarrinho = () => {
      const tbody = document.getElementById('f-encomenda-itens-body');
      if (!itens.length) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Nenhum produto adicionado</td></tr>';
      } else {
        tbody.innerHTML = itens.map((item, idx) => `
          <tr>
            <td>${Utils.escapeHtml(item.nome)}</td>
            <td>
              <div class="cart-qty">
                <button type="button" data-idx="${idx}" data-acao="diminuir">−</button>
                <input type="number" class="cart-qty-input" data-idx="${idx}" value="${item.quantidade}" min="1">
                <button type="button" data-idx="${idx}" data-acao="aumentar">+</button>
              </div>
            </td>
            <td class="text-right">${Utils.formatMoney(item.precoUnit)}</td>
            <td class="text-right">${Utils.formatMoney(item.precoUnit * item.quantidade)}</td>
            <td><button type="button" class="btn btn--sm btn--icon" data-idx="${idx}" data-acao="remover">✕</button></td>
          </tr>`).join('');
      }
      renderTotal();
    };

    const renderTotal = () => {
      const subtotal = itens.reduce((s, i) => s + i.precoUnit * i.quantidade, 0);
      const desconto = Math.min(Utils.parseMoneyInput(document.getElementById('f-encomenda-desconto').value), subtotal);
      const total = Math.max(0, subtotal - desconto);
      document.getElementById('f-encomenda-total').innerHTML = `
        <div class="calc-result__row"><span>Subtotal</span><span>${Utils.formatMoney(subtotal)}</span></div>
        <div class="calc-result__row"><span>Desconto</span><span>${Utils.formatMoney(desconto)}</span></div>
        <div class="calc-result__row main"><span>Total</span><span>${Utils.formatMoney(total)}</span></div>
      `;
    };

    renderMiniCarrinho();

    const buscaInput = document.getElementById('f-encomenda-busca');
    const suggestionsBox = document.getElementById('f-encomenda-suggestions');

    buscaInput.addEventListener('input', Utils.debounce(() => {
      const termo = buscaInput.value.trim().toLowerCase();
      if (!termo) { suggestionsBox.classList.remove('is-open'); return; }
      const encontrados = produtos.filter((p) => p.nome.toLowerCase().includes(termo) || (p.sku || '').toLowerCase().includes(termo)).slice(0, 8);
      suggestionsBox.innerHTML = encontrados.length
        ? encontrados.map((p) => `
          <div class="pdv-suggestion-item" data-id="${p.id}">
            <div><div>${Utils.escapeHtml(p.nome)}</div><small>${Utils.escapeHtml(p.categoria || '')} • Estoque: ${p.estoqueAtual}</small></div>
            <strong>${Utils.formatMoney(p.precoVenda)}</strong>
          </div>`).join('')
        : '<div class="pdv-suggestion-item is-disabled">Nenhum produto encontrado</div>';
      suggestionsBox.classList.add('is-open');
    }, 150));

    suggestionsBox.addEventListener('click', (e) => {
      const item = e.target.closest('.pdv-suggestion-item[data-id]');
      if (!item) return;
      const produto = produtos.find((p) => p.id === parseInt(item.dataset.id, 10));
      if (!produto) return;
      const existente = itens.find((i) => i.produtoId === produto.id);
      if (existente) existente.quantidade += 1;
      else itens.push({ produtoId: produto.id, nome: produto.nome, precoUnit: produto.precoVenda, quantidade: 1 });
      renderMiniCarrinho();
      buscaInput.value = '';
      suggestionsBox.classList.remove('is-open');
      buscaInput.focus();
    });

    document.addEventListener('click', function fecharSugestoes(e) {
      if (!document.body.contains(buscaInput)) { document.removeEventListener('click', fecharSugestoes); return; }
      if (!e.target.closest('.pdv-search')) suggestionsBox.classList.remove('is-open');
    });

    document.getElementById('f-encomenda-itens-body').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-acao]');
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx, 10);
      if (btn.dataset.acao === 'remover') itens.splice(idx, 1);
      else if (btn.dataset.acao === 'aumentar') itens[idx].quantidade += 1;
      else if (btn.dataset.acao === 'diminuir') itens[idx].quantidade = Math.max(1, itens[idx].quantidade - 1);
      renderMiniCarrinho();
    });

    document.getElementById('f-encomenda-itens-body').addEventListener('change', (e) => {
      if (!e.target.classList.contains('cart-qty-input')) return;
      const idx = parseInt(e.target.dataset.idx, 10);
      itens[idx].quantidade = Math.max(1, parseInt(e.target.value, 10) || 1);
      renderMiniCarrinho();
    });

    document.getElementById('f-encomenda-desconto').addEventListener('input', renderTotal);
    document.getElementById('btn-cancelar-encomenda').addEventListener('click', () => App.fecharModal());

    document.getElementById('form-encomenda').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!itens.length) { Utils.toast('Adicione ao menos um produto', 'error'); return; }

      const clienteId = document.getElementById('f-encomenda-cliente').value ? parseInt(document.getElementById('f-encomenda-cliente').value, 10) : null;
      const clienteNome = clienteId ? (await Clientes.buscarPorId(clienteId)).nome : 'Venda avulsa';
      const subtotal = itens.reduce((s, i) => s + i.precoUnit * i.quantidade, 0);
      const desconto = Math.min(Utils.parseMoneyInput(document.getElementById('f-encomenda-desconto').value), subtotal);

      const nova = {
        ...(isEdit ? { id: encomenda.id, status: encomenda.status, criadoEm: encomenda.criadoEm } : {}),
        dataEntrega: document.getElementById('f-data-entrega').value,
        clienteId,
        clienteNome,
        formaPagamento: document.getElementById('f-encomenda-pagamento').value,
        desconto,
        subtotal,
        total: Math.max(0, subtotal - desconto),
        itens,
        observacoes: document.getElementById('f-encomenda-obs').value.trim(),
      };

      await this.salvar(nova);
      App.fecharModal();
      Utils.toast(isEdit ? 'Encomenda atualizada!' : 'Encomenda agendada!', 'ok');
      this.diaSelecionado = nova.dataEntrega;
      this.mesAtual = parseInt(nova.dataEntrega.slice(5, 7), 10) - 1;
      this.anoAtual = parseInt(nova.dataEntrega.slice(0, 4), 10);
      this.renderCalendario();
      this.renderDia();
      if (typeof Dashboard !== 'undefined') Dashboard.render();
    });
  },

  init() {
    document.getElementById('btn-nova-encomenda').addEventListener('click', () => this.abrirFormulario());
    document.getElementById('encomendas-mes-anterior').addEventListener('click', () => this.mudarMes(-1));
    document.getElementById('encomendas-mes-proximo').addEventListener('click', () => this.mudarMes(1));
    document.getElementById('encomendas-hoje').addEventListener('click', () => this.irParaHoje());
    document.getElementById('encomendas-tab-btn-calendario').addEventListener('click', () => this.mostrarTab('calendario'));
    document.getElementById('encomendas-tab-btn-historico').addEventListener('click', () => this.mostrarTab('historico'));

    document.getElementById('calendar-days').addEventListener('click', (e) => {
      const dia = e.target.closest('.calendar-day[data-iso]');
      if (!dia) return;
      this.diaSelecionado = dia.dataset.iso;
      this.renderCalendario();
      this.renderDia();
    });

    document.getElementById('encomendas-dia-lista').addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = parseInt(btn.dataset.id, 10);

      if (btn.dataset.action === 'entregar-encomenda') {
        const ok = await Utils.confirmDialog('Confirmar entrega desta encomenda? Isso vai gerar a venda e baixar o estoque.');
        if (!ok) return;
        await this.marcarEntregue(id);
        this.renderCalendario();
        this.renderDia();
        Utils.toast('Encomenda entregue! Venda registrada.', 'ok');
      } else if (btn.dataset.action === 'editar-encomenda') {
        const encomenda = await DB.get('encomendas', id);
        this.abrirFormulario(encomenda);
      } else if (btn.dataset.action === 'cancelar-encomenda') {
        const ok = await Utils.confirmDialog('Cancelar esta encomenda?');
        if (!ok) return;
        await this.cancelar(id);
        this.renderCalendario();
        this.renderDia();
        Utils.toast('Encomenda cancelada', 'ok');
      } else if (btn.dataset.action === 'excluir-encomenda') {
        const ok = await Utils.confirmDialog('Excluir este registro de encomenda?');
        if (!ok) return;
        await this.excluir(id);
        this.renderCalendario();
        this.renderDia();
        Utils.toast('Registro excluído', 'ok');
      }
    });
  },
};
