/* ==========================================================================
   turno.js — Abertura e fechamento de caixa
   - Abrir o caixa com o troco inicial
   - Registrar sangrias (retiradas) e suprimentos (reforço de troco)
   - Fechar o caixa conferindo o dinheiro da gaveta com o esperado
   Um caixa aberto por loja, compartilhado entre os aparelhos.
   ========================================================================== */

const Turno = {
  atual: null,       // caixa aberto (ou null)
  historico: [],

  async carregar() {
    const todos = await DB.getAll('caixas').catch(() => []);
    todos.sort((a, b) => new Date(b.abertoEm) - new Date(a.abertoEm));
    this.historico = todos;
    this.atual = todos.find((c) => c.status === 'aberto') || null;
    this.renderStatus();
    return this.atual;
  },

  usuarioAtual() {
    const u = Auth.usuario || {};
    return { id: u.id || null, nome: u.nome || 'Usuário' };
  },

  hora(iso) {
    return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  },

  // Totais do turno a partir das vendas feitas enquanto o caixa estava aberto
  async resumo(caixa) {
    const vendas = Utils.vendasValidas(await DB.getAll('vendas')).filter((v) =>
      v.caixaId === caixa.id || (!v.caixaId && v.data >= caixa.abertoEm && (!caixa.fechadoEm || v.data <= caixa.fechadoEm)));
    const porMetodo = {};
    vendas.forEach((v) => Utils.linhasPagamento(v).forEach((p) => { porMetodo[p.metodo] = (porMetodo[p.metodo] || 0) + (p.valor || 0); }));
    const movs = caixa.movimentos || [];
    const suprimentos = movs.filter((m) => m.tipo === 'suprimento').reduce((s, m) => s + m.valor, 0);
    const sangrias = movs.filter((m) => m.tipo === 'sangria').reduce((s, m) => s + m.valor, 0);
    const dinheiro = porMetodo.Dinheiro || 0;
    return {
      vendas: vendas.length,
      totalVendido: vendas.reduce((s, v) => s + v.total, 0),
      porMetodo, suprimentos, sangrias,
      esperado: (caixa.valorInicial || 0) + dinheiro + suprimentos - sangrias,
    };
  },

  renderStatus() {
    const pill = document.getElementById('caixa-pill');
    if (pill) {
      pill.classList.toggle('is-aberto', !!this.atual);
      document.getElementById('caixa-pill-text').textContent = this.atual ? 'Caixa aberto · ' + this.hora(this.atual.abertoEm) : 'Caixa fechado';
    }
    const aviso = document.getElementById('pdv-caixa-fechado');
    if (aviso) aviso.style.display = this.atual ? 'none' : '';
  },

  /* ---------------- Modais ---------------- */

  async abrirPainel() {
    await this.carregar();
    if (!this.atual) return this.modalAbrir();
    const c = this.atual;
    const r = await this.resumo(c);
    const linhasMetodo = Object.entries(r.porMetodo).sort((a, b) => b[1] - a[1])
      .map(([m, v]) => `<div class="pdv-summary-line"><span class="label">${Utils.escapeHtml(m)}</span><span>${Utils.formatMoney(v)}</span></div>`).join('')
      || '<p class="text-muted" style="margin:4px 0;">Nenhuma venda neste turno ainda.</p>';
    const movs = (c.movimentos || []).slice().reverse().map((m) => `
      <div class="compra-linha"><div>${m.tipo === 'sangria' ? 'Sangria (retirada)' : 'Suprimento (reforço)'}${m.motivo ? ' · ' + Utils.escapeHtml(m.motivo) : ''}<small>${this.hora(m.data)} · ${Utils.escapeHtml(m.usuarioNome || '')}</small></div>
      <strong class="${m.tipo === 'sangria' ? 'text-danger' : ''}">${m.tipo === 'sangria' ? '−' : '+'} ${Utils.formatMoney(m.valor)}</strong></div>`).join('');

    App.abrirModal('Caixa aberto', `
      <p class="text-muted" style="margin-top:0;">Aberto por <strong>${Utils.escapeHtml(c.abertoPorNome || '')}</strong> às ${this.hora(c.abertoEm)} · ${r.vendas} venda(s) · ${Utils.formatMoney(r.totalVendido)}</p>
      <div class="turno-grid">
        <div class="turno-box">
          <div class="secao-label">Vendas por forma de pagamento</div>
          ${linhasMetodo}
        </div>
        <div class="turno-box turno-box--destaque">
          <div class="secao-label">Dinheiro na gaveta</div>
          <div class="pdv-summary-line"><span class="label">Troco inicial</span><span>${Utils.formatMoney(c.valorInicial)}</span></div>
          <div class="pdv-summary-line"><span class="label">Vendas em dinheiro</span><span>${Utils.formatMoney(r.porMetodo.Dinheiro || 0)}</span></div>
          <div class="pdv-summary-line"><span class="label">Suprimentos</span><span>+ ${Utils.formatMoney(r.suprimentos)}</span></div>
          <div class="pdv-summary-line"><span class="label">Sangrias</span><span>− ${Utils.formatMoney(r.sangrias)}</span></div>
          <div class="pdv-summary-line total"><span class="label">Esperado</span><span>${Utils.formatMoney(r.esperado)}</span></div>
        </div>
      </div>
      ${movs ? `<div style="margin-top:14px;"><div class="secao-label">Retiradas e reforços</div>${movs}</div>` : ''}
      <div class="modal__footer" style="flex-wrap:wrap;">
        <button class="btn" id="turno-historico">Fechamentos anteriores</button>
        <button class="btn" id="turno-sangria">Sangria</button>
        <button class="btn" id="turno-suprimento">Suprimento</button>
        <button class="btn btn--primary" id="turno-fechar">Fechar caixa</button>
      </div>`);
    document.getElementById('turno-sangria').addEventListener('click', () => this.modalMovimento('sangria'));
    document.getElementById('turno-suprimento').addEventListener('click', () => this.modalMovimento('suprimento'));
    document.getElementById('turno-fechar').addEventListener('click', () => this.modalFechar());
    document.getElementById('turno-historico').addEventListener('click', () => this.modalHistorico());
  },

  modalAbrir(depois) {
    const ultimo = this.historico.find((c) => c.status === 'fechado');
    const sugestao = ultimo && ultimo.deixadoNaGaveta ? ultimo.deixadoNaGaveta : 0;
    App.abrirModal('Abrir caixa', `
      <form id="form-abrir-caixa">
        <p class="text-muted" style="margin-top:0;">Conte o dinheiro que está na gaveta para começar o dia. Ele entra como troco inicial na conferência do fechamento.</p>
        <div class="field">
          <label>Troco inicial (R$)</label>
          <input type="text" id="f-caixa-inicial" inputmode="decimal" value="${sugestao.toFixed(2).replace('.', ',')}">
          ${ultimo && ultimo.deixadoNaGaveta ? `<small class="text-muted">Sugestão: valor deixado na gaveta no último fechamento.</small>` : ''}
        </div>
        <div class="modal__footer">
          ${this.historico.length ? '<button type="button" class="btn" id="turno-historico">Fechamentos anteriores</button>' : ''}
          <button type="button" class="btn" id="btn-cancelar-abrir">Agora não</button>
          <button type="submit" class="btn btn--primary">Abrir caixa</button>
        </div>
      </form>`);
    const hist = document.getElementById('turno-historico');
    if (hist) hist.addEventListener('click', () => this.modalHistorico());
    document.getElementById('btn-cancelar-abrir').addEventListener('click', () => App.fecharModal());
    const input = document.getElementById('f-caixa-inicial');
    input.focus(); input.select();
    document.getElementById('form-abrir-caixa').addEventListener('submit', async (e) => {
      e.preventDefault();
      await this.carregar();
      if (this.atual) { App.fecharModal(); Utils.toast('O caixa já foi aberto em outro aparelho', 'info'); return; }
      const u = this.usuarioAtual();
      const caixa = {
        status: 'aberto',
        abertoEm: Utils.nowISO(),
        abertoPorId: u.id,
        abertoPorNome: u.nome,
        valorInicial: Utils.parseMoneyInput(input.value),
        movimentos: [],
      };
      caixa.id = await DB.add('caixas', caixa);
      this.atual = caixa;
      this.renderStatus();
      App.fecharModal();
      Utils.toast('Caixa aberto. Boas vendas!', 'ok');
      if (typeof depois === 'function') depois();
    });
  },

  modalMovimento(tipo) {
    const titulo = tipo === 'sangria' ? 'Sangria (retirada de dinheiro)' : 'Suprimento (reforço de troco)';
    App.abrirModal(titulo, `
      <form id="form-mov-caixa">
        <div class="form-grid">
          <div class="field"><label>Valor (R$)</label><input type="text" id="f-mov-valor" inputmode="decimal" required></div>
          <div class="field"><label>Motivo</label><input type="text" id="f-mov-motivo" placeholder="${tipo === 'sangria' ? 'Ex.: depósito no banco, pagamento de entrega' : 'Ex.: troco trazido de casa'}"></div>
        </div>
        <div class="modal__footer">
          <button type="button" class="btn" id="btn-voltar-mov">Voltar</button>
          <button type="submit" class="btn btn--primary">Registrar</button>
        </div>
      </form>`);
    document.getElementById('f-mov-valor').focus();
    document.getElementById('btn-voltar-mov').addEventListener('click', () => this.abrirPainel());
    document.getElementById('form-mov-caixa').addEventListener('submit', async (e) => {
      e.preventDefault();
      const valor = Utils.parseMoneyInput(document.getElementById('f-mov-valor').value);
      if (!valor || valor <= 0) { Utils.toast('Informe um valor válido', 'error'); return; }
      await this.carregar();
      if (!this.atual) { Utils.toast('O caixa não está aberto', 'error'); return; }
      const u = this.usuarioAtual();
      this.atual.movimentos = (this.atual.movimentos || []).concat({
        tipo, valor, motivo: document.getElementById('f-mov-motivo').value.trim(), data: Utils.nowISO(), usuarioId: u.id, usuarioNome: u.nome,
      });
      await DB.put('caixas', this.atual);
      Utils.toast(tipo === 'sangria' ? 'Sangria registrada' : 'Suprimento registrado', 'ok');
      this.abrirPainel();
    });
  },

  async modalFechar() {
    await this.carregar();
    if (!this.atual) return;
    const r = await this.resumo(this.atual);
    App.abrirModal('Fechar caixa', `
      <form id="form-fechar-caixa">
        <p class="text-muted" style="margin-top:0;">Conte o dinheiro da gaveta e informe o valor. O app compara com o que deveria ter.</p>
        <div class="form-grid">
          <div class="field"><label>Dinheiro contado na gaveta (R$)</label><input type="text" id="f-fech-contado" inputmode="decimal" required></div>
          <div class="field"><label>Vai deixar na gaveta para amanhã (R$)</label><input type="text" id="f-fech-deixa" inputmode="decimal" value="0,00"></div>
        </div>
        <div class="turno-conferencia" id="turno-conferencia">
          <div class="pdv-summary-line"><span class="label">Esperado</span><span>${Utils.formatMoney(r.esperado)}</span></div>
          <div class="pdv-summary-line"><span class="label">Contado</span><span id="conf-contado">—</span></div>
          <div class="pdv-summary-line total"><span class="label">Diferença</span><span id="conf-dif">—</span></div>
        </div>
        <div class="field" style="margin-top:12px;"><label>Observação (opcional)</label><input type="text" id="f-fech-obs" placeholder="Ex.: faltou troco de R$ 2,00 no Pix de um cliente"></div>
        <div class="modal__footer">
          <button type="button" class="btn" id="btn-voltar-fech">Voltar</button>
          <button type="submit" class="btn btn--primary">Confirmar fechamento</button>
        </div>
      </form>`);
    const contadoEl = document.getElementById('f-fech-contado');
    contadoEl.focus();
    const atualizar = () => {
      const contado = Utils.parseMoneyInput(contadoEl.value);
      const dif = contado - r.esperado;
      document.getElementById('conf-contado').textContent = contadoEl.value ? Utils.formatMoney(contado) : '—';
      const difEl = document.getElementById('conf-dif');
      difEl.textContent = contadoEl.value ? (Math.abs(dif) < 0.005 ? 'Bateu certinho ✓' : (dif > 0 ? 'Sobrou ' : 'Faltou ') + Utils.formatMoney(Math.abs(dif))) : '—';
      difEl.style.color = !contadoEl.value || Math.abs(dif) < 0.005 ? 'var(--color-success)' : 'var(--color-danger)';
    };
    contadoEl.addEventListener('input', atualizar);
    document.getElementById('btn-voltar-fech').addEventListener('click', () => this.abrirPainel());
    document.getElementById('form-fechar-caixa').addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!contadoEl.value.trim()) { Utils.toast('Informe quanto dinheiro você contou', 'error'); return; }
      await this.carregar();
      if (!this.atual) return;
      const caixa = this.atual;
      const fim = Utils.nowISO();
      caixa.fechadoEm = fim;
      const resumo = await this.resumo(caixa);
      const u = this.usuarioAtual();
      Object.assign(caixa, {
        status: 'fechado',
        fechadoPorId: u.id,
        fechadoPorNome: u.nome,
        contado: Utils.parseMoneyInput(contadoEl.value),
        deixadoNaGaveta: Utils.parseMoneyInput(document.getElementById('f-fech-deixa').value),
        esperado: resumo.esperado,
        diferenca: Utils.parseMoneyInput(contadoEl.value) - resumo.esperado,
        observacao: document.getElementById('f-fech-obs').value.trim(),
        resumo,
      });
      await DB.put('caixas', caixa);
      this.atual = null;
      this.renderStatus();
      Utils.toast('Caixa fechado!', 'ok');
      this.mostrarRelatorio(caixa);
    });
  },

  relatorioHtml(c) {
    const r = c.resumo || {};
    const dif = c.diferenca || 0;
    const metodos = Object.entries(r.porMetodo || {}).map(([m, v]) => `<div class="receipt-row"><span>${Utils.escapeHtml(m)}</span><span>${Utils.formatMoney(v)}</span></div>`).join('');
    return `
      <div class="receipt">
        <h3>FECHAMENTO DE CAIXA</h3>
        <div class="center">${Utils.escapeHtml(Auth.usuario && Auth.usuario.loja ? Auth.usuario.loja.nome : '')}</div>
        <hr>
        <div class="receipt-row"><span>Abertura</span><span>${Utils.formatDateTime(c.abertoEm)}</span></div>
        <div class="receipt-row"><span>Por</span><span>${Utils.escapeHtml(c.abertoPorNome || '')}</span></div>
        <div class="receipt-row"><span>Fechamento</span><span>${Utils.formatDateTime(c.fechadoEm)}</span></div>
        <div class="receipt-row"><span>Por</span><span>${Utils.escapeHtml(c.fechadoPorNome || '')}</span></div>
        <hr>
        <div class="receipt-row"><span>Vendas</span><span>${r.vendas || 0}</span></div>
        <div class="receipt-row"><strong>Total vendido</strong><strong>${Utils.formatMoney(r.totalVendido)}</strong></div>
        ${metodos}
        <hr>
        <div class="receipt-row"><span>Troco inicial</span><span>${Utils.formatMoney(c.valorInicial)}</span></div>
        <div class="receipt-row"><span>Suprimentos</span><span>+${Utils.formatMoney(r.suprimentos)}</span></div>
        <div class="receipt-row"><span>Sangrias</span><span>-${Utils.formatMoney(r.sangrias)}</span></div>
        <div class="receipt-row"><strong>Esperado</strong><strong>${Utils.formatMoney(c.esperado)}</strong></div>
        <div class="receipt-row"><strong>Contado</strong><strong>${Utils.formatMoney(c.contado)}</strong></div>
        <div class="receipt-row"><strong>${Math.abs(dif) < 0.005 ? 'Diferença' : (dif > 0 ? 'Sobra' : 'Falta')}</strong><strong>${Utils.formatMoney(Math.abs(dif))}</strong></div>
        <div class="receipt-row"><span>Deixado na gaveta</span><span>${Utils.formatMoney(c.deixadoNaGaveta)}</span></div>
        ${c.observacao ? `<hr><div>Obs.: ${Utils.escapeHtml(c.observacao)}</div>` : ''}
      </div>`;
  },

  mostrarRelatorio(c) {
    const html = this.relatorioHtml(c);
    App.abrirModal('Fechamento do caixa', `${html}
      <div class="modal__footer">
        <button class="btn" id="btn-fech-ok">Fechar</button>
        <button class="btn btn--primary" id="btn-fech-imprimir">⎙ Imprimir</button>
      </div>`);
    document.getElementById('btn-fech-ok').addEventListener('click', () => App.fecharModal());
    document.getElementById('btn-fech-imprimir').addEventListener('click', () => {
      document.getElementById('print-area').innerHTML = html;
      window.print();
    });
  },

  modalHistorico() {
    const fechados = this.historico.filter((c) => c.status === 'fechado').slice(0, 20);
    App.abrirModal('Fechamentos anteriores', `
      ${fechados.length ? `<div class="table-wrap"><table class="data-table">
        <thead><tr><th>Dia</th><th>Quem fechou</th><th class="text-right">Vendido</th><th class="text-right">Diferença</th></tr></thead>
        <tbody>${fechados.map((c) => {
          const d = c.diferenca || 0;
          return `<tr class="row-clickable" data-caixa="${c.id}"><td>${Utils.formatDateTime(c.abertoEm)}</td><td>${Utils.escapeHtml(c.fechadoPorNome || '')}</td>
            <td class="text-right">${Utils.formatMoney(c.resumo ? c.resumo.totalVendido : 0)}</td>
            <td class="text-right"><span class="badge ${Math.abs(d) < 0.005 ? 'badge--success' : 'badge--danger'}">${Math.abs(d) < 0.005 ? 'Bateu' : (d > 0 ? '+' : '−') + Utils.formatMoney(Math.abs(d))}</span></td></tr>`;
        }).join('')}</tbody></table></div>` : '<div class="empty-state">Nenhum caixa fechado ainda.</div>'}
      <div class="modal__footer"><button class="btn" id="btn-hist-voltar">Voltar</button></div>`);
    document.getElementById('btn-hist-voltar').addEventListener('click', () => (this.atual ? this.abrirPainel() : this.modalAbrir()));
    document.querySelectorAll('[data-caixa]').forEach((tr) => tr.addEventListener('click', () => {
      const c = this.historico.find((x) => x.id === parseInt(tr.dataset.caixa, 10));
      if (c) this.mostrarRelatorio(c);
    }));
  },

  // Chamado pelo Caixa antes de finalizar uma venda
  async garantirAberto(depois) {
    await this.carregar();
    if (this.atual) return true;
    this.modalAbrir(depois);
    return false;
  },

  async init() {
    document.getElementById('caixa-pill').addEventListener('click', () => this.abrirPainel());
    document.getElementById('btn-abrir-caixa-pdv').addEventListener('click', () => this.modalAbrir());
    await this.carregar();
  },
};

window.Turno = Turno;
