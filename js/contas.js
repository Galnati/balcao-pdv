/* ==========================================================================
   contas.js — Contas a Pagar e Receber
   ========================================================================== */

const Contas = {
  cache: [],
  filtroAtivo: 'todas',
  buscaDevedor: '',

  async carregar() {
    this.cache = await DB.getAll('contas');
    this.cache.sort((a, b) => (a.vencimento || '').localeCompare(b.vencimento || ''));
    return this.cache;
  },

  statusReal(conta) {
    if (conta.status === 'pago') return 'pago';
    if (conta.status === 'cancelada') return 'cancelada';
    if (Utils.isPast(conta.vencimento)) return 'atrasada';
    return 'pendente';
  },

  // Quanto ainda falta pagar/receber desta conta, descontando os pagamentos
  // parciais já registrados.
  saldoDevedor(conta) {
    return Math.max(0, (conta.valor || 0) - (conta.valorPago || 0));
  },

  async renderCards() {
    await this.carregar();
    const aPagarPendente = this.cache.filter((c) => c.tipo === 'pagar' && c.status !== 'pago' && c.status !== 'cancelada').reduce((s, c) => s + this.saldoDevedor(c), 0);
    const aReceberPendente = this.cache.filter((c) => c.tipo === 'receber' && c.status !== 'pago' && c.status !== 'cancelada').reduce((s, c) => s + this.saldoDevedor(c), 0);
    const atrasadas = this.cache.filter((c) => this.statusReal(c) === 'atrasada');
    const saldo = aReceberPendente - aPagarPendente;

    document.getElementById('contas-cards').innerHTML = `
      <div class="stat-card stat-card--danger">
        <div class="stat-card__label">A pagar (pendente)</div>
        <div class="stat-card__value">${Utils.formatMoney(aPagarPendente)}</div>
      </div>
      <div class="stat-card stat-card--success">
        <div class="stat-card__label">A receber (pendente)</div>
        <div class="stat-card__value">${Utils.formatMoney(aReceberPendente)}</div>
      </div>
      <div class="stat-card stat-card--warning">
        <div class="stat-card__label">Contas atrasadas</div>
        <div class="stat-card__value">${atrasadas.length}</div>
      </div>
      <div class="stat-card stat-card--primary">
        <div class="stat-card__label">Saldo projetado</div>
        <div class="stat-card__value">${Utils.formatMoney(saldo)}</div>
      </div>
    `;
  },

  async renderTabela() {
    const tbody = document.getElementById('contas-table-body');
    await this.carregar();
    let lista = this.cache;

    if (this.filtroAtivo === 'pagar') lista = lista.filter((c) => c.tipo === 'pagar');
    else if (this.filtroAtivo === 'receber') lista = lista.filter((c) => c.tipo === 'receber');
    else if (this.filtroAtivo === 'pendente') lista = lista.filter((c) => !['pago', 'cancelada'].includes(this.statusReal(c)));
    else if (this.filtroAtivo === 'atrasada') lista = lista.filter((c) => this.statusReal(c) === 'atrasada');
    else if (this.filtroAtivo === 'pago') lista = lista.filter((c) => c.status === 'pago');
    else if (this.filtroAtivo === 'devedores') lista = lista.filter((c) => c.tipo === 'receber' && c.status !== 'pago');

    if (this.buscaDevedor.trim()) {
      const termo = this.buscaDevedor.trim().toLowerCase();
      lista = lista.filter((c) =>
        (c.descricao || '').toLowerCase().includes(termo) ||
        (c.fornecedor || '').toLowerCase().includes(termo));
    }

    if (!lista.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Nenhuma conta encontrada</td></tr>';
      return;
    }

    const statusBadge = {
      pago: '<span class="badge badge--success">Quitada</span>',
      atrasada: '<span class="badge badge--danger">Atrasada</span>',
      pendente: '<span class="badge badge--warning">Pendente</span>',
      cancelada: '<span class="badge badge--muted">Cancelada</span>',
    };

    tbody.innerHTML = lista.map((c) => {
      const pago = c.valorPago || 0;
      const temPagamentoParcial = pago > 0 && c.status !== 'pago';
      return `
      <tr>
        <td>${c.tipo === 'pagar' ? '<span class="badge badge--danger">A Pagar</span>' : '<span class="badge badge--success">A Receber</span>'}</td>
        <td>${Utils.escapeHtml(c.descricao)}</td>
        <td>${c.vendaId ? 'Venda #' + c.vendaId : (c.fornecedor ? Utils.escapeHtml(c.fornecedor) : '-')}</td>
        <td>${Utils.formatDate(c.vencimento)}</td>
        <td class="text-right">
          <strong>${Utils.formatMoney(c.valor)}</strong>
          ${temPagamentoParcial ? `<br><small class="text-muted">pago ${Utils.formatMoney(pago)} · falta ${Utils.formatMoney(this.saldoDevedor(c))}</small>` : ''}
        </td>
        <td>${statusBadge[this.statusReal(c)]}${temPagamentoParcial ? '<br><span class="badge badge--warning" style="margin-top:4px;">Parcial</span>' : ''}</td>
        <td class="btn-row">
          ${c.status !== 'pago' && c.status !== 'cancelada' ? `<button class="btn btn--sm btn--success" data-action="pagamento-conta" data-id="${c.id}">Pagamento</button>` : ''}
          <button class="btn btn--sm btn--icon ${c.anexo ? 'btn--success' : ''}" data-action="anexo-conta" data-id="${c.id}" title="${c.anexo ? 'Ver comprovante anexado' : 'Anexar comprovante / nota fiscal'}">⎘</button>
          <button class="btn btn--sm btn--icon" data-action="excluir-conta" data-id="${c.id}" title="Excluir">✕</button>
        </td>
      </tr>`;
    }).join('');
  },

  async renderTudo() {
    await this.renderCards();
    await this.renderTabela();
  },

  abrirFormulario() {
    const body = `
      <form id="form-conta">
        <div class="form-grid">
          <div class="field">
            <label>Tipo *</label>
            <select id="f-tipo" required>
              <option value="pagar">A Pagar (despesa / fornecedor)</option>
              <option value="receber">A Receber</option>
            </select>
          </div>
          <div class="field">
            <label>Valor (R$) *</label>
            <input type="text" id="f-valor" required value="0,00">
          </div>
          <div class="field field--full">
            <label>Descrição *</label>
            <input type="text" id="f-descricao" required placeholder="Ex: Compra de mercadoria, aluguel, etc.">
          </div>
          <div class="field">
            <label>Fornecedor / Pessoa (opcional)</label>
            <input type="text" id="f-fornecedor">
          </div>
          <div class="field">
            <label>Vencimento *</label>
            <input type="date" id="f-vencimento" required value="${Utils.todayISO()}">
          </div>
          <div class="field field--full">
            <label>Comprovante / Nota fiscal (opcional)</label>
            <input type="file" id="f-anexo" accept="image/*,.pdf">
          </div>
        </div>
        <div class="modal__footer">
          <button type="button" class="btn" id="btn-cancelar-conta">Cancelar</button>
          <button type="submit" class="btn btn--primary">Salvar conta</button>
        </div>
      </form>
    `;
    App.abrirModal('Nova conta', body);
    document.getElementById('btn-cancelar-conta').addEventListener('click', () => App.fecharModal());

    document.getElementById('form-conta').addEventListener('submit', async (e) => {
      e.preventDefault();
      const conta = {
        tipo: document.getElementById('f-tipo').value,
        valor: Utils.parseMoneyInput(document.getElementById('f-valor').value),
        descricao: document.getElementById('f-descricao').value.trim(),
        fornecedor: document.getElementById('f-fornecedor').value.trim(),
        vencimento: document.getElementById('f-vencimento').value,
        status: 'pendente',
        criadoEm: Utils.nowISO(),
      };
      if (!conta.descricao || !conta.valor) { Utils.toast('Preencha descrição e valor', 'error'); return; }

      const arquivo = document.getElementById('f-anexo').files[0];
      if (arquivo) {
        if (arquivo.size > 8 * 1024 * 1024) {
          Utils.toast('Arquivo muito grande (máx. 8MB)', 'error');
          return;
        }
        conta.anexo = {
          nome: arquivo.name,
          tipo: arquivo.type,
          tamanho: arquivo.size,
          dataUrl: await this.lerArquivoComoDataURL(arquivo),
          anexadoEm: Utils.nowISO(),
        };
      }

      await DB.add('contas', conta);
      App.fecharModal();
      Utils.toast('Conta cadastrada!', 'ok');
      this.renderTudo();
      if (typeof Dashboard !== 'undefined') Dashboard.render();
    });
  },

  lerArquivoComoDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  },

  async abrirAnexo(id) {
    const conta = await DB.get('contas', id);
    if (!conta) return;
    const temAnexo = !!conta.anexo;

    const body = `
      ${temAnexo ? `
        <div style="margin-bottom:16px;">
          <p style="margin-bottom:8px;"><strong>Arquivo atual:</strong> ${Utils.escapeHtml(conta.anexo.nome)}</p>
          ${conta.anexo.tipo && conta.anexo.tipo.startsWith('image/')
            ? `<img src="${conta.anexo.dataUrl}" style="max-width:100%; max-height:320px; border-radius:8px; border:1px solid var(--color-border); display:block;">`
            : `<a href="${conta.anexo.dataUrl}" target="_blank" rel="noopener" class="btn btn--sm">Abrir arquivo</a>`}
        </div>
      ` : '<p class="text-muted" style="margin-bottom:16px;">Nenhum comprovante anexado ainda.</p>'}
      <div class="field">
        <label>${temAnexo ? 'Substituir por outro arquivo' : 'Anexar comprovante / nota fiscal'}</label>
        <input type="file" id="f-anexo-upload" accept="image/*,.pdf">
      </div>
      <div class="modal__footer">
        ${temAnexo ? '<button type="button" class="btn" id="btn-remover-anexo">✕ Remover anexo</button>' : ''}
        <button type="button" class="btn" id="btn-fechar-anexo">Fechar</button>
        <button type="button" class="btn btn--primary" id="btn-salvar-anexo">Salvar</button>
      </div>
    `;

    App.abrirModal('Comprovante — ' + conta.descricao, body);
    document.getElementById('btn-fechar-anexo').addEventListener('click', () => App.fecharModal());

    if (temAnexo) {
      document.getElementById('btn-remover-anexo').addEventListener('click', async () => {
        const ok = await Utils.confirmDialog('Remover o comprovante anexado?');
        if (!ok) return;
        delete conta.anexo;
        await DB.put('contas', conta);
        Utils.toast('Anexo removido', 'ok');
        App.fecharModal();
        this.renderTabela();
      });
    }

    document.getElementById('btn-salvar-anexo').addEventListener('click', async () => {
      const arquivo = document.getElementById('f-anexo-upload').files[0];
      if (!arquivo) { Utils.toast('Selecione um arquivo', 'error'); return; }
      if (arquivo.size > 8 * 1024 * 1024) { Utils.toast('Arquivo muito grande (máx. 8MB)', 'error'); return; }
      conta.anexo = {
        nome: arquivo.name,
        tipo: arquivo.type,
        tamanho: arquivo.size,
        dataUrl: await this.lerArquivoComoDataURL(arquivo),
        anexadoEm: Utils.nowISO(),
      };
      await DB.put('contas', conta);
      Utils.toast('Comprovante anexado!', 'ok');
      App.fecharModal();
      this.renderTabela();
    });
  },

  async abrirPagamento(id) {
    const conta = await DB.get('contas', id);
    if (!conta) return;
    const jaPago = conta.valorPago || 0;
    const saldo = this.saldoDevedor(conta);
    const pagamentos = conta.pagamentos || [];

    const body = `
      <p style="margin-bottom:10px;">
        <strong>${Utils.escapeHtml(conta.descricao)}</strong><br>
        <span class="text-muted">${conta.tipo === 'pagar' ? 'A pagar' : 'A receber'} · vencimento ${Utils.formatDate(conta.vencimento)}</span>
      </p>
      <div class="cards-grid" style="grid-template-columns: repeat(3, 1fr); margin-bottom:16px;">
        <div class="stat-card">
          <div class="stat-card__label">Valor total</div>
          <div class="stat-card__value" style="font-size:18px;">${Utils.formatMoney(conta.valor)}</div>
        </div>
        <div class="stat-card">
          <div class="stat-card__label">Já pago</div>
          <div class="stat-card__value" style="font-size:18px;">${Utils.formatMoney(jaPago)}</div>
        </div>
        <div class="stat-card stat-card--danger">
          <div class="stat-card__label">Saldo devedor</div>
          <div class="stat-card__value" style="font-size:18px;">${Utils.formatMoney(saldo)}</div>
        </div>
      </div>
      ${pagamentos.length ? `
        <div style="margin-bottom:16px;">
          <label style="font-size:12.5px; font-weight:600; color:var(--color-text-muted);">Pagamentos registrados</label>
          <div class="table-wrap" style="margin-top:6px;">
            <table class="data-table">
              <thead><tr><th>Data</th><th class="text-right">Valor</th></tr></thead>
              <tbody>${pagamentos.map((p) => `<tr><td>${Utils.formatDateTime(p.data)}</td><td class="text-right">${Utils.formatMoney(p.valor)}</td></tr>`).join('')}</tbody>
            </table>
          </div>
        </div>
      ` : ''}
      <form id="form-pagamento-conta">
        <div class="field">
          <label>Valor pago agora (R$) *</label>
          <input type="text" id="f-valor-pago" required value="${saldo.toFixed(2).replace('.', ',')}">
          <small class="text-muted">Pode ser o valor total (quita a dívida) ou um valor parcial (abate e deixa o restante em aberto).</small>
        </div>
        <div class="modal__footer">
          <button type="button" class="btn" id="btn-cancelar-pagamento">Cancelar</button>
          <button type="submit" class="btn btn--success">Registrar pagamento</button>
        </div>
      </form>
    `;

    App.abrirModal('Registrar pagamento', body);
    document.getElementById('btn-cancelar-pagamento').addEventListener('click', () => App.fecharModal());

    document.getElementById('form-pagamento-conta').addEventListener('submit', async (e) => {
      e.preventDefault();
      const valorPagoAgora = Utils.parseMoneyInput(document.getElementById('f-valor-pago').value);
      if (!valorPagoAgora || valorPagoAgora <= 0) { Utils.toast('Informe um valor válido', 'error'); return; }
      if (valorPagoAgora > saldo + 0.001) { Utils.toast(`O valor não pode passar do saldo devedor (${Utils.formatMoney(saldo)})`, 'error'); return; }

      const novoValorPago = jaPago + valorPagoAgora;
      conta.pagamentos = [...pagamentos, { valor: valorPagoAgora, data: Utils.nowISO() }];
      conta.valorPago = Math.min(novoValorPago, conta.valor);

      if (novoValorPago >= conta.valor) {
        conta.status = 'pago';
        conta.dataPagamento = Utils.nowISO();
      }

      await DB.put('contas', conta);
      App.fecharModal();
      Utils.toast(conta.status === 'pago' ? 'Dívida quitada!' : 'Pagamento registrado!', 'ok');
      this.renderTudo();
      Clientes.renderTabela();
      if (typeof Dashboard !== 'undefined') Dashboard.render();
      if (typeof Fiado !== 'undefined' && App.viewAtual === 'fiado') Fiado.render();
      if (typeof App !== 'undefined') App.atualizarBadges();
    });
  },

  init() {
    document.getElementById('btn-nova-conta').addEventListener('click', () => this.abrirFormulario());

    document.querySelectorAll('#view-contas .filter-chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('#view-contas .filter-chip').forEach((c) => c.classList.remove('is-active'));
        chip.classList.add('is-active');
        this.filtroAtivo = chip.dataset.filtro;
        this.renderTabela();
      });
    });

    document.getElementById('contas-busca-devedor').addEventListener('input', Utils.debounce((e) => {
      this.buscaDevedor = e.target.value;
      this.renderTabela();
    }, 200));

    document.getElementById('contas-table-body').addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = parseInt(btn.dataset.id, 10);
      if (btn.dataset.action === 'pagamento-conta') {
        this.abrirPagamento(id);
      } else if (btn.dataset.action === 'excluir-conta') {
        const ok = await Utils.confirmDialog('Deseja excluir esta conta?');
        if (!ok) return;
        await DB.delete('contas', id);
        Utils.toast('Conta excluída', 'ok');
        this.renderTudo();
      } else if (btn.dataset.action === 'anexo-conta') {
        this.abrirAnexo(id);
      }
    });
  },
};
