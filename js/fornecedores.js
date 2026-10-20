/* ==========================================================================
   fornecedores.js — Cadastro de Fornecedores e Pedidos de Compra
   ========================================================================== */

const Fornecedores = {
  cache: [],
  pedidosCache: [],
  filtroPedido: 'todos',

  async carregar() {
    this.cache = await DB.getAll('fornecedores');
    this.cache.sort((a, b) => a.nome.localeCompare(b.nome));
    return this.cache;
  },

  async buscarPorId(id) {
    return DB.get('fornecedores', id);
  },

  async carregarPedidos() {
    this.pedidosCache = await DB.getAll('pedidosCompra');
    this.pedidosCache.sort((a, b) => new Date(b.dataPedido) - new Date(a.dataPedido));
    return this.pedidosCache;
  },

  /* ---------------- Cadastro de fornecedores ---------------- */

  async renderTabela() {
    const tbody = document.getElementById('fornecedores-table-body');
    const termo = (document.getElementById('fornecedores-search').value || '').toLowerCase();
    await this.carregar();
    let lista = this.cache;
    if (termo) {
      lista = lista.filter((f) => f.nome.toLowerCase().includes(termo) || (f.telefone || '').toLowerCase().includes(termo));
    }
    if (!lista.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Nenhum fornecedor cadastrado</td></tr>';
      return;
    }
    tbody.innerHTML = lista.map((f) => `
      <tr>
        <td><strong>${Utils.escapeHtml(f.nome)}</strong></td>
        <td>${Utils.escapeHtml(f.telefone || '-')}</td>
        <td>${Utils.escapeHtml(f.email || '-')}</td>
        <td>${Utils.escapeHtml(f.observacoes || '-')}</td>
        <td class="btn-row">
          <button class="btn btn--sm btn--icon" data-action="editar-fornecedor" data-id="${f.id}" title="Editar">✏️</button>
          <button class="btn btn--sm btn--icon" data-action="excluir-fornecedor" data-id="${f.id}" title="Excluir">✕</button>
        </td>
      </tr>`).join('');
  },

  abrirFormulario(fornecedor = null) {
    const isEdit = !!fornecedor;
    const f = fornecedor || { nome: '', telefone: '', email: '', observacoes: '' };
    const body = `
      <form id="form-fornecedor">
        <div class="form-grid">
          <div class="field field--full">
            <label>Nome do fornecedor *</label>
            <input type="text" id="f-forn-nome" required value="${Utils.escapeHtml(f.nome)}">
          </div>
          <div class="field">
            <label>Telefone / WhatsApp</label>
            <input type="tel" id="f-forn-telefone" value="${Utils.escapeHtml(f.telefone || '')}">
          </div>
          <div class="field">
            <label>E-mail</label>
            <input type="email" id="f-forn-email" value="${Utils.escapeHtml(f.email || '')}">
          </div>
          <div class="field field--full">
            <label>Observações</label>
            <textarea id="f-forn-obs">${Utils.escapeHtml(f.observacoes || '')}</textarea>
          </div>
        </div>
        <div class="modal__footer">
          <button type="button" class="btn" id="btn-cancelar-fornecedor">Cancelar</button>
          <button type="submit" class="btn btn--primary">${isEdit ? 'Salvar alterações' : 'Cadastrar fornecedor'}</button>
        </div>
      </form>
    `;
    App.abrirModal(isEdit ? 'Editar fornecedor' : 'Novo fornecedor', body);
    document.getElementById('btn-cancelar-fornecedor').addEventListener('click', () => App.fecharModal());

    document.getElementById('form-fornecedor').addEventListener('submit', async (e) => {
      e.preventDefault();
      const novo = {
        ...(isEdit ? { id: f.id } : {}),
        nome: document.getElementById('f-forn-nome').value.trim(),
        telefone: document.getElementById('f-forn-telefone').value.trim(),
        email: document.getElementById('f-forn-email').value.trim(),
        observacoes: document.getElementById('f-forn-obs').value.trim(),
      };
      if (!novo.nome) { Utils.toast('Informe o nome do fornecedor', 'error'); return; }
      if (isEdit) await DB.put('fornecedores', novo); else await DB.add('fornecedores', novo);
      App.fecharModal();
      Utils.toast(isEdit ? 'Fornecedor atualizado!' : 'Fornecedor cadastrado!', 'ok');
      this.renderTabela();
    });
  },

  /* ---------------- Pedidos de compra ---------------- */

  async renderPedidos() {
    const tbody = document.getElementById('pedidos-compra-table-body');
    await this.carregarPedidos();
    let lista = this.pedidosCache;
    if (this.filtroPedido !== 'todos') lista = lista.filter((p) => p.status === this.filtroPedido);

    if (!lista.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Nenhum pedido de compra encontrado</td></tr>';
      return;
    }

    tbody.innerHTML = lista.map((p) => `
      <tr>
        <td>#${p.id}</td>
        <td>${Utils.escapeHtml(p.fornecedorNome)}</td>
        <td>${Utils.formatDate(p.dataPedido)}</td>
        <td class="text-right">${p.itens.length}</td>
        <td class="text-right"><strong>${Utils.formatMoney(p.total)}</strong></td>
        <td>${p.status === 'recebido' ? '<span class="badge badge--success">Recebido</span>' : '<span class="badge badge--warning">Em aberto</span>'}</td>
        <td class="btn-row">
          ${p.status !== 'recebido' ? `<button class="btn btn--sm btn--success" data-action="receber-pedido" data-id="${p.id}">Receber</button>` : ''}
          <button class="btn btn--sm btn--icon" data-action="excluir-pedido" data-id="${p.id}" title="Excluir">✕</button>
        </td>
      </tr>`).join('');
  },

  async abrirFormularioPedido() {
    await this.carregar();
    const produtos = await Produtos.listarAtivos();
    if (!this.cache.length) { Utils.toast('Cadastre ao menos um fornecedor primeiro', 'error'); return; }
    if (!produtos.length) { Utils.toast('Cadastre ao menos um produto primeiro', 'error'); return; }

    const linhaItemHtml = (idx) => `
      <div class="combo-item-linha" data-idx="${idx}">
        <select class="pedido-produto-select">
          ${produtos.map((p) => `<option value="${p.id}" data-custo="${p.precoCusto}">${Utils.escapeHtml(p.nome)}</option>`).join('')}
        </select>
        <input type="number" class="pedido-qtd-input" min="1" value="1">
        <input type="text" class="pedido-custo-input" value="${(produtos[0].precoCusto || 0).toFixed(2).replace('.', ',')}" style="width:80px;" title="Custo unitário">
        <button type="button" class="btn btn--sm btn--icon" data-action="remover-item-pedido">✕</button>
      </div>`;

    const body = `
      <form id="form-pedido-compra">
        <div class="field field--full">
          <label>Fornecedor *</label>
          <select id="f-pedido-fornecedor" required>
            ${this.cache.map((f) => `<option value="${f.id}">${Utils.escapeHtml(f.nome)}</option>`).join('')}
          </select>
        </div>
        <div class="field field--full" style="margin-top:10px;">
          <label>Itens do pedido</label>
          <div id="pedido-itens-lista">${linhaItemHtml(0)}</div>
          <button type="button" class="btn btn--ghost btn--sm" id="btn-add-item-pedido" style="margin-top:6px;">+ Adicionar produto</button>
        </div>
        <div class="field" style="margin-top:10px;">
          <label>Total estimado do pedido</label>
          <input type="text" id="f-pedido-total-preview" disabled value="R$ 0,00">
        </div>
        <div class="modal__footer">
          <button type="button" class="btn" id="btn-cancelar-pedido">Cancelar</button>
          <button type="submit" class="btn btn--primary">Criar pedido de compra</button>
        </div>
      </form>
    `;
    App.abrirModal('Novo pedido de compra', body);
    document.getElementById('btn-cancelar-pedido').addEventListener('click', () => App.fecharModal());

    const atualizarTotal = () => {
      let total = 0;
      document.querySelectorAll('.combo-item-linha').forEach((linha) => {
        const qtd = parseInt(linha.querySelector('.pedido-qtd-input').value, 10) || 0;
        const custo = Utils.parseMoneyInput(linha.querySelector('.pedido-custo-input').value);
        total += qtd * custo;
      });
      document.getElementById('f-pedido-total-preview').value = Utils.formatMoney(total);
    };

    const listaEl = document.getElementById('pedido-itens-lista');
    listaEl.addEventListener('input', atualizarTotal);
    listaEl.addEventListener('change', (e) => {
      if (e.target.classList.contains('pedido-produto-select')) {
        const custo = e.target.selectedOptions[0].dataset.custo;
        e.target.closest('.combo-item-linha').querySelector('.pedido-custo-input').value = Utils.formatMoney(parseFloat(custo)).replace('R$', '').trim();
        atualizarTotal();
      }
    });
    document.getElementById('btn-add-item-pedido').addEventListener('click', () => {
      const div = document.createElement('div');
      div.innerHTML = linhaItemHtml(listaEl.children.length);
      listaEl.appendChild(div.firstElementChild);
      atualizarTotal();
    });
    listaEl.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action="remover-item-pedido"]');
      if (!btn) return;
      if (document.querySelectorAll('.combo-item-linha').length > 1) { btn.closest('.combo-item-linha').remove(); atualizarTotal(); }
      else Utils.toast('O pedido precisa ter ao menos um item', 'error');
    });
    atualizarTotal();

    document.getElementById('form-pedido-compra').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fornecedorId = parseInt(document.getElementById('f-pedido-fornecedor').value, 10);
      const fornecedor = await this.buscarPorId(fornecedorId);
      const itens = Array.from(document.querySelectorAll('.combo-item-linha')).map((linha) => {
        const produtoId = parseInt(linha.querySelector('.pedido-produto-select').value, 10);
        const produto = produtos.find((p) => p.id === produtoId);
        const quantidade = Math.max(1, parseInt(linha.querySelector('.pedido-qtd-input').value, 10) || 1);
        const precoCusto = Utils.parseMoneyInput(linha.querySelector('.pedido-custo-input').value);
        return { produtoId, nome: produto ? produto.nome : 'Produto', quantidade, precoCusto, subtotal: quantidade * precoCusto };
      });
      const total = itens.reduce((s, i) => s + i.subtotal, 0);

      const pedido = {
        fornecedorId,
        fornecedorNome: fornecedor.nome,
        itens,
        total,
        status: 'aberto',
        dataPedido: Utils.nowISO(),
      };
      await DB.add('pedidosCompra', pedido);
      App.fecharModal();
      Utils.toast('Pedido de compra criado!', 'ok');
      this.renderPedidos();
    });
  },

  async receberPedido(id) {
    const pedido = await DB.get('pedidosCompra', id);
    if (!pedido || pedido.status === 'recebido') return;
    const ok = await Utils.confirmDialog(`Confirmar recebimento do pedido #${pedido.id}? Isso vai dar entrada em estoque de todos os itens.`);
    if (!ok) return;

    for (const item of pedido.itens) {
      await Estoque.registrarMovimentacao({
        produtoId: item.produtoId,
        tipo: 'entrada',
        quantidade: item.quantidade,
        motivo: `Recebimento do pedido de compra #${pedido.id} (${pedido.fornecedorNome})`,
      });
    }

    // Atualiza o custo dos produtos com o valor pago neste pedido, para a
    // margem e o lucro estimado ficarem corretos.
    const custosAtualizados = [];
    for (const item of pedido.itens) {
      if (!(item.precoCusto > 0)) continue;
      const produto = await Produtos.buscarPorId(item.produtoId);
      if (produto && Math.abs((produto.precoCusto || 0) - item.precoCusto) > 0.004) {
        custosAtualizados.push(`${produto.nome}: ${Utils.formatMoney(produto.precoCusto)} → ${Utils.formatMoney(item.precoCusto)}`);
        produto.precoCustoAnterior = produto.precoCusto;
        produto.precoCusto = item.precoCusto;
        produto.custoAtualizadoEm = Utils.nowISO();
        await DB.put('produtos', produto);
      }
    }

    pedido.status = 'recebido';
    pedido.dataRecebimento = Utils.nowISO();
    pedido.custosAtualizados = custosAtualizados;
    await DB.put('pedidosCompra', pedido);
    await Produtos.carregar();

    Utils.toast(custosAtualizados.length
      ? `Pedido recebido! Estoque atualizado e custo de ${custosAtualizados.length} produto(s) ajustado.`
      : 'Pedido recebido! Estoque atualizado.', 'ok');
    if (custosAtualizados.length) {
      App.abrirModal('Custos atualizados', `<p>O preço de custo destes produtos mudou neste pedido. Confira se o preço de venda ainda dá a margem que você quer:</p>
        <ul>${custosAtualizados.map((c) => '<li>' + Utils.escapeHtml(c) + '</li>').join('')}</ul>
        <div class="modal__footer"><button class="btn" id="btn-custos-ok">Ok</button><button class="btn btn--primary" id="btn-custos-produtos">Ver produtos</button></div>`);
      document.getElementById('btn-custos-ok').addEventListener('click', () => App.fecharModal());
      document.getElementById('btn-custos-produtos').addEventListener('click', () => { App.fecharModal(); App.mudarView('produtos'); });
    }
    this.renderPedidos();
    if (typeof Estoque !== 'undefined') Estoque.renderTudo();
    if (typeof Produtos !== 'undefined') Produtos.renderTabela();
    if (typeof Dashboard !== 'undefined') Dashboard.render();
  },

  async renderTudo() {
    await this.renderTabela();
    await this.renderPedidos();
  },

  mostrarTab(tab) {
    document.getElementById('fornecedores-tab-cadastro').style.display = tab === 'cadastro' ? '' : 'none';
    document.getElementById('fornecedores-tab-pedidos').style.display = tab === 'pedidos' ? '' : 'none';
    document.getElementById('fornecedores-tab-btn-cadastro').classList.toggle('is-active', tab === 'cadastro');
    document.getElementById('fornecedores-tab-btn-pedidos').classList.toggle('is-active', tab === 'pedidos');
  },

  init() {
    document.getElementById('btn-novo-fornecedor').addEventListener('click', () => this.abrirFormulario());
    document.getElementById('fornecedores-search').addEventListener('input', Utils.debounce(() => this.renderTabela(), 200));
    document.getElementById('fornecedores-table-body').addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = parseInt(btn.dataset.id, 10);
      if (btn.dataset.action === 'editar-fornecedor') {
        const f = await this.buscarPorId(id);
        this.abrirFormulario(f);
      } else if (btn.dataset.action === 'excluir-fornecedor') {
        const ok = await Utils.confirmDialog('Deseja realmente excluir este fornecedor?');
        if (ok) { await DB.delete('fornecedores', id); Utils.toast('Fornecedor excluído', 'ok'); this.renderTabela(); }
      }
    });

    document.getElementById('btn-novo-pedido-compra').addEventListener('click', () => this.abrirFormularioPedido());
    document.querySelectorAll('#view-fornecedores .filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#view-fornecedores .filter-chip').forEach((c) => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        this.filtroPedido = chip.dataset.filtroPedido;
        this.renderPedidos();
      });
    });
    document.getElementById('pedidos-compra-table-body').addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = parseInt(btn.dataset.id, 10);
      if (btn.dataset.action === 'receber-pedido') {
        this.receberPedido(id);
      } else if (btn.dataset.action === 'excluir-pedido') {
        const ok = await Utils.confirmDialog('Deseja excluir este pedido de compra? (Isso não desfaz uma entrada de estoque já recebida)');
        if (ok) { await DB.delete('pedidosCompra', id); Utils.toast('Pedido excluído', 'ok'); this.renderPedidos(); }
      }
    });

    document.getElementById('fornecedores-tab-btn-cadastro').addEventListener('click', () => this.mostrarTab('cadastro'));
    document.getElementById('fornecedores-tab-btn-pedidos').addEventListener('click', () => this.mostrarTab('pedidos'));
  },
};

window.Fornecedores = Fornecedores;
