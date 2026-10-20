/* ==========================================================================
   clientes.js — Cadastro de Clientes
   ========================================================================== */

const Clientes = {
  cache: [],

  async carregar() {
    this.cache = await DB.getAll('clientes');
    this.cache.sort((a, b) => a.nome.localeCompare(b.nome));
    return this.cache;
  },

  async buscarPorId(id) {
    return DB.get('clientes', id);
  },

  async salvar(cliente) {
    if (cliente.id) {
      await DB.put('clientes', cliente);
    } else {
      cliente.criadoEm = Utils.nowISO();
      cliente.id = await DB.add('clientes', cliente);
    }
    await this.carregar();
    return cliente;
  },

  async excluir(id) {
    await DB.delete('clientes', id);
    await this.carregar();
  },

  async saldoEmAberto(clienteId) {
    const contas = await DB.getAll('contas');
    return contas
      .filter((c) => c.tipo === 'receber' && c.clienteId === clienteId && c.status === 'pendente')
      .reduce((sum, c) => sum + Math.max(0, (c.valor || 0) - (c.valorPago || 0)), 0);
  },

  async totalComprado(clienteId) {
    const vendas = await DB.getAll('vendas');
    return vendas.filter((v) => v.clienteId === clienteId).reduce((sum, v) => sum + v.total, 0);
  },

  async popularSelectPDV() {
    const select = document.getElementById('pdv-cliente-select');
    const valorAtual = select.value;
    await this.carregar();
    select.innerHTML = '<option value="">Venda avulsa (sem cliente)</option>' +
      this.cache.map((c) => `<option value="${c.id}">${Utils.escapeHtml(c.nome)}</option>`).join('');
    if (valorAtual) select.value = valorAtual;
  },

  bairrosEmUso() {
    return Array.from(new Set(this.cache.map((c) => c.bairro).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  },

  renderFiltroBairro() {
    const select = document.getElementById('clientes-filtro-bairro');
    const valorAtual = select.value;
    select.innerHTML = '<option value="">Todos os bairros</option>' +
      this.bairrosEmUso().map((b) => `<option value="${Utils.escapeHtml(b)}" ${b === valorAtual ? 'selected' : ''}>${Utils.escapeHtml(b)}</option>`).join('');
  },

  async renderTabela() {
    const tbody = document.getElementById('clientes-table-body');
    const termo = (document.getElementById('clientes-search').value || '').toLowerCase();
    const bairro = document.getElementById('clientes-filtro-bairro').value;
    await this.carregar();
    this.renderFiltroBairro();
    let lista = this.cache;
    if (termo) {
      lista = lista.filter((c) =>
        c.nome.toLowerCase().includes(termo) ||
        (c.telefone || '').toLowerCase().includes(termo) ||
        (c.documento || '').toLowerCase().includes(termo) ||
        (c.bairro || '').toLowerCase().includes(termo));
    }
    if (bairro) {
      lista = lista.filter((c) => c.bairro === bairro);
    }

    if (!lista.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Nenhum cliente encontrado</td></tr>';
      return;
    }

    const rows = await Promise.all(lista.map(async (c) => {
      const total = await this.totalComprado(c.id);
      const saldo = await this.saldoEmAberto(c.id);
      return `
        <tr>
          <td><strong>${Utils.escapeHtml(c.nome)}</strong>${c.endereco ? '<br><small class="text-muted">' + Utils.escapeHtml(c.endereco) + '</small>' : ''}</td>
          <td>${Utils.escapeHtml(c.telefone || '-')}</td>
          <td>${Utils.escapeHtml(c.bairro || '-')}</td>
          <td>${Utils.escapeHtml(c.documento || '-')}</td>
          <td class="text-right">${Utils.formatMoney(total)}</td>
          <td class="text-right">${saldo > 0 ? '<span class="badge badge--danger">' + Utils.formatMoney(saldo) + '</span>' : Utils.formatMoney(0)}</td>
          <td class="btn-row">
            <button class="btn btn--sm btn--icon" data-action="editar-cliente" data-id="${c.id}" title="Editar">✏️</button>
            <button class="btn btn--sm btn--icon" data-action="excluir-cliente" data-id="${c.id}" title="Excluir">✕</button>
          </td>
        </tr>`;
    }));
    tbody.innerHTML = rows.join('');
  },

  abrirFormulario(cliente = null) {
    const isEdit = !!cliente;
    const c = cliente || { nome: '', telefone: '', email: '', documento: '', endereco: '', bairro: '', observacoes: '', limiteCredito: 0 };

    const body = `
      <form id="form-cliente">
        <div class="form-grid">
          <div class="field field--full">
            <label>Nome completo *</label>
            <input type="text" id="f-nome" required value="${Utils.escapeHtml(c.nome)}">
          </div>
          <div class="field">
            <label>Telefone / WhatsApp</label>
            <input type="tel" id="f-telefone" value="${Utils.escapeHtml(c.telefone || '')}">
          </div>
          <div class="field">
            <label>CPF / CNPJ</label>
            <input type="text" id="f-documento" value="${Utils.escapeHtml(c.documento || '')}">
          </div>
          <div class="field">
            <label>E-mail</label>
            <input type="email" id="f-email" value="${Utils.escapeHtml(c.email || '')}">
          </div>
          <div class="field">
            <label>Bairro</label>
            <input type="text" id="f-bairro" list="clientes-bairros-datalist" value="${Utils.escapeHtml(c.bairro || '')}">
            <datalist id="clientes-bairros-datalist">
              ${this.bairrosEmUso().map((b) => `<option value="${Utils.escapeHtml(b)}">`).join('')}
            </datalist>
          </div>
          <div class="field">
            <label>Limite de fiado (R$)</label>
            <input type="text" id="f-limite" inputmode="decimal" value="${c.limiteCredito ? Number(c.limiteCredito).toFixed(2).replace('.', ',') : ''}" placeholder="Sem limite">
            <small class="text-muted">O Caixa avisa antes de a venda fiado passar desse valor.</small>
          </div>
          <div class="field field--full">
            <label>Endereço</label>
            <input type="text" id="f-endereco" value="${Utils.escapeHtml(c.endereco || '')}">
          </div>
          <div class="field field--full">
            <label>Observações</label>
            <textarea id="f-obs">${Utils.escapeHtml(c.observacoes || '')}</textarea>
          </div>
        </div>
        <div class="modal__footer">
          <button type="button" class="btn" id="btn-cancelar-cliente">Cancelar</button>
          <button type="submit" class="btn btn--primary">${isEdit ? 'Salvar alterações' : 'Cadastrar cliente'}</button>
        </div>
      </form>
    `;

    App.abrirModal(isEdit ? 'Editar cliente' : 'Novo cliente', body);
    document.getElementById('btn-cancelar-cliente').addEventListener('click', () => App.fecharModal());

    document.getElementById('form-cliente').addEventListener('submit', async (e) => {
      e.preventDefault();
      const novo = {
        ...(isEdit ? { id: c.id, criadoEm: c.criadoEm } : {}),
        nome: document.getElementById('f-nome').value.trim(),
        telefone: document.getElementById('f-telefone').value.trim(),
        documento: document.getElementById('f-documento').value.trim(),
        email: document.getElementById('f-email').value.trim(),
        bairro: document.getElementById('f-bairro').value.trim(),
        endereco: document.getElementById('f-endereco').value.trim(),
        observacoes: document.getElementById('f-obs').value.trim(),
        limiteCredito: Utils.parseMoneyInput(document.getElementById('f-limite').value) || 0,
      };
      if (!novo.nome) { Utils.toast('Informe o nome do cliente', 'error'); return; }

      await this.salvar(novo);
      App.fecharModal();
      Utils.toast(isEdit ? 'Cliente atualizado!' : 'Cliente cadastrado!', 'ok');
      this.renderTabela();
      await this.popularSelectPDV();
      if (typeof PDV !== 'undefined') PDV.atualizarCliente();
      if (typeof Fiado !== 'undefined' && App.viewAtual === 'fiado') {
        if (!isEdit && novo.id) { Fiado.filtro = 'todos'; Fiado.selecionadoId = novo.id; }
        Fiado.render();
      }
    });
  },

  init() {
    document.getElementById('btn-novo-cliente').addEventListener('click', () => this.abrirFormulario());
    document.getElementById('clientes-search').addEventListener('input', Utils.debounce(() => this.renderTabela(), 200));
    document.getElementById('clientes-filtro-bairro').addEventListener('change', () => this.renderTabela());

    document.getElementById('clientes-table-body').addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = parseInt(btn.dataset.id, 10);
      if (btn.dataset.action === 'editar-cliente') {
        const cliente = await this.buscarPorId(id);
        this.abrirFormulario(cliente);
      } else if (btn.dataset.action === 'excluir-cliente') {
        const ok = await Utils.confirmDialog('Deseja realmente excluir este cliente?');
        if (ok) {
          await this.excluir(id);
          Utils.toast('Cliente excluído', 'ok');
          this.renderTabela();
          this.popularSelectPDV();
        }
      }
    });
  },
};
