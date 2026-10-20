/* ==========================================================================
   fiado.js — Vendas a prazo: quem deve, quanto, até quando e cobrança pronta
   Usa as contas a receber geradas pelo Caixa (tipo "receber" com clienteId).
   ========================================================================== */

const Fiado = {
  filtro: 'aberto',          // 'aberto' | 'vencido' | 'todos'
  busca: '',
  selecionadoId: null,
  mensagemEditada: {},       // clienteId -> texto editado à mão
  editando: false,
  dados: null,

  async carregarDados() {
    const [clientes, contas, vendas] = await Promise.all([DB.getAll('clientes'), DB.getAll('contas'), DB.getAll('vendas')]);
    let chavePix = '';
    try { const cfg = await DB.get('config', 'chavePix'); chavePix = cfg && cfg.valor ? cfg.valor : ''; } catch (e) { /* opcional */ }
    const grupos = Analise.fiadoPorCliente(contas);
    const comprasPorCliente = {};
    Utils.vendasValidas(vendas).forEach((v) => { if (v.clienteId) comprasPorCliente[v.clienteId] = (comprasPorCliente[v.clienteId] || 0) + 1; });
    clientes.sort((a, b) => a.nome.localeCompare(b.nome));
    this.dados = { clientes, contas, grupos, comprasPorCliente, chavePix };
    return this.dados;
  },

  statusCliente(cliente, grupo) {
    if (!grupo) return { texto: 'Em dia', tom: 'success' };
    if (grupo.vencido) return { texto: 'Vencido', tom: 'danger' };
    const limite = Number(cliente.limiteCredito) || 0;
    if (limite > 0 && grupo.saldo / limite >= 0.8) return { texto: 'Perto do limite', tom: 'amber' };
    return { texto: 'Em aberto', tom: 'primary' };
  },

  iniciais(nome) {
    return (nome || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
  },

  async render() {
    const { clientes, contas, grupos } = await this.carregarDados();
    const listaGrupos = Object.values(grupos);

    // ---- cards ----
    const aReceber = listaGrupos.reduce((s, g) => s + g.saldo, 0);
    const vencido = listaGrupos.filter((g) => g.vencido).reduce((s, g) => s + g.contas.filter((c) => Utils.isPast(c.vencimento)).reduce((x, c) => x + Math.max(0, c.valor - (c.valorPago || 0)), 0), 0);
    const mes = Utils.todayISO().slice(0, 7);
    const recebidoMes = contas.filter((c) => c.tipo === 'receber' && c.clienteId).reduce((s, c) =>
      s + (c.pagamentos || []).filter((p) => Analise.dataLocal(p.data).slice(0, 7) === mes).reduce((x, p) => x + p.valor, 0), 0);
    const nomeMes = new Date().toLocaleDateString('pt-BR', { month: 'long' });
    document.getElementById('fiado-cards').innerHTML = `
      <div class="kpi"><div class="kpi__label">A receber</div><div class="kpi__value kpi__value--sm">${Utils.formatMoney(aReceber)}</div><div class="kpi__foot">${listaGrupos.length} cliente(s)</div></div>
      <div class="kpi"><div class="kpi__label">Vencido</div><div class="kpi__value kpi__value--sm ${vencido > 0 ? 'text-danger' : ''}">${Utils.formatMoney(vencido)}</div><div class="kpi__foot">${listaGrupos.filter((g) => g.vencido).length} cliente(s) atrasado(s)</div></div>
      <div class="kpi"><div class="kpi__label">Recebido em ${nomeMes}</div><div class="kpi__value kpi__value--sm" style="color:var(--color-success)">${Utils.formatMoney(recebidoMes)}</div><div class="kpi__foot">pagamentos de fiado</div></div>
    `;
    document.getElementById('fiado-count-aberto').textContent = listaGrupos.length || '';
    document.getElementById('fiado-count-vencido').textContent = listaGrupos.filter((g) => g.vencido).length || '';
    document.querySelectorAll('#fiado-filtro .segmented__btn').forEach((b) => b.classList.toggle('is-active', b.dataset.filtro === this.filtro));

    // ---- lista ----
    let lista = clientes.map((c) => ({ cliente: c, grupo: grupos[c.id] || null }));
    if (this.filtro === 'aberto') lista = lista.filter((x) => x.grupo);
    if (this.filtro === 'vencido') lista = lista.filter((x) => x.grupo && x.grupo.vencido);
    const termo = this.busca.toLowerCase();
    if (termo) lista = lista.filter((x) => x.cliente.nome.toLowerCase().includes(termo) || (x.cliente.telefone || '').includes(termo));
    lista.sort((a, b) => {
      const va = a.grupo ? (a.grupo.vencido ? 2 : 1) : 0;
      const vb = b.grupo ? (b.grupo.vencido ? 2 : 1) : 0;
      return vb - va || (b.grupo ? b.grupo.saldo : 0) - (a.grupo ? a.grupo.saldo : 0) || a.cliente.nome.localeCompare(b.cliente.nome);
    });

    if (!lista.some((x) => x.cliente.id === this.selecionadoId)) this.selecionadoId = lista.length ? lista[0].cliente.id : null;

    const tbody = document.getElementById('fiado-table-body');
    if (!lista.length) {
      const msg = this.filtro === 'vencido' ? 'Nenhum fiado vencido ✓' : (this.filtro === 'aberto' ? 'Ninguém está devendo no momento ✓' : 'Nenhum cliente cadastrado');
      tbody.innerHTML = `<tr class="empty-row"><td colspan="5">${msg}</td></tr>`;
    } else {
      tbody.innerHTML = lista.map(({ cliente: c, grupo: g }) => {
        const st = this.statusCliente(c, g);
        const limite = Number(c.limiteCredito) || 0;
        const pct = limite > 0 && g ? Math.min(100, (g.saldo / limite) * 100) : 0;
        const cor = pct >= 100 ? 'red' : (pct >= 80 ? 'amber' : '');
        const venc = g && g.proxVencimento
          ? `${Utils.formatDate(g.proxVencimento + 'T12:00:00').slice(0, 5)}<small class="${g.vencido ? 'text-danger' : 'text-muted'}" style="display:block;font-size:11px;">${g.vencido ? g.diasAtraso + ' dia(s) de atraso' : this.emDias(g.proxVencimento)}</small>`
          : '<span class="text-muted">—</span>';
        const sel = c.id === this.selecionadoId;
        return `
        <tr class="row-clickable ${sel ? 'is-selecionado' : ''}" data-cliente="${c.id}">
          <td><div class="cliente-cell"><span class="avatar ${sel ? '' : 'avatar--muted'}" style="width:32px;height:32px;font-size:12px;">${this.iniciais(c.nome)}</span><div><strong>${Utils.escapeHtml(c.nome)}</strong><small>${Utils.escapeHtml(c.telefone || 'sem telefone')}</small></div></div></td>
          <td class="text-right"><strong>${Utils.formatMoney(g ? g.saldo : 0)}</strong></td>
          <td><div class="limite-cell">${limite > 0 ? `<div class="progress-bar"><div class="progress-bar__fill ${cor ? 'progress-bar__fill--' + cor : ''}" style="width:${pct}%"></div></div><small>${pct.toFixed(0)}% de ${Utils.formatMoney(limite)}</small>` : '<small>sem limite</small>'}</div></td>
          <td>${venc}</td>
          <td><span class="badge badge--${st.tom === 'amber' ? 'amber' : st.tom}">${st.texto}</span></td>
        </tr>`;
      }).join('');
    }

    this.renderDetalhe();
  },

  emDias(iso) {
    const d = Utils.daysBetween(iso);
    return d === 0 ? 'vence hoje' : (d === 1 ? 'amanhã' : `em ${d} dias`);
  },

  mensagemPadrao(cliente, grupo) {
    const loja = Auth.usuario && Auth.usuario.loja ? Auth.usuario.loja.nome : 'nossa loja';
    // "Maria Souza" -> "Maria"; nomes de estabelecimento ("Bar do João") ficam completos
    const partes = cliente.nome.split(' ');
    const primeiro = partes.length > 2 && ['do', 'da', 'de', 'dos', 'das'].includes(partes[1].toLowerCase()) ? cliente.nome : partes[0];
    const venc = grupo.proxVencimento ? `, com vencimento em ${Utils.formatDate(grupo.proxVencimento + 'T12:00:00')}` : '';
    const pix = this.dados.chavePix ? ` Você pode pagar por Pix na chave ${this.dados.chavePix}.` : '';
    return `Oi, ${primeiro}! Tudo bem? Passando para lembrar do seu saldo de ${Utils.formatMoney(grupo.saldo)} na ${loja}${venc}.${pix} Obrigado pela preferência!`;
  },

  renderDetalhe() {
    const box = document.getElementById('fiado-detalhe');
    const { clientes, grupos, comprasPorCliente } = this.dados;
    const cliente = clientes.find((c) => c.id === this.selecionadoId);
    if (!cliente) {
      box.innerHTML = '<div class="empty-state" style="margin:auto;">Selecione um cliente para ver o saldo e cobrar.</div>';
      return;
    }
    const g = grupos[cliente.id] || null;
    const st = this.statusCliente(cliente, g);
    const limite = Number(cliente.limiteCredito) || 0;
    const desde = cliente.criadoEm ? new Date(cliente.criadoEm).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }) : '';
    const saldo = g ? g.saldo : 0;
    const pct = limite > 0 ? Math.min(100, (saldo / limite) * 100) : 0;

    // Se a tela for atualizada no meio da edição (sincronização), não perde o texto digitado
    const campo = document.getElementById('fiado-msg-edit');
    const rascunho = this.editando && campo ? campo.value : null;
    const msg = g ? (rascunho !== null ? rascunho : (this.mensagemEditada[cliente.id] || this.mensagemPadrao(cliente, g))) : '';

    box.innerHTML = `
      <div class="fiado-detalhe__head">
        <span class="avatar avatar--lg">${this.iniciais(cliente.nome)}</span>
        <div><h3>${Utils.escapeHtml(cliente.nome)}</h3><small>${desde ? 'Cliente desde ' + desde + ' · ' : ''}${comprasPorCliente[cliente.id] || 0} compra(s)</small></div>
        <span class="badge badge--${st.tom === 'amber' ? 'amber' : st.tom}">${st.texto}</span>
      </div>

      <div class="saldo-box">
        <div class="saldo-box__row">
          <div><div class="saldo-box__label">Saldo devedor</div><div class="saldo-box__valor ${g && g.vencido ? 'text-danger' : ''}">${Utils.formatMoney(saldo)}</div></div>
          <small class="text-muted">${limite > 0 ? 'de ' + Utils.formatMoney(limite) : 'sem limite definido'}</small>
        </div>
        ${limite > 0 ? `<div class="progress-bar"><div class="progress-bar__fill ${g && g.vencido ? 'progress-bar__fill--red' : (pct >= 80 ? 'progress-bar__fill--amber' : '')}" style="width:${pct}%"></div></div>` : ''}
      </div>

      ${g ? `
      <div>
        <div class="secao-label">Compras em aberto</div>
        ${g.contas.map((c) => `
          <div class="compra-linha">
            <div>${Utils.escapeHtml(c.descricao)}<small>${c.vencimento ? (Utils.isPast(c.vencimento) ? 'venceu ' : 'vence ') + Utils.formatDate(c.vencimento + 'T12:00:00') : 'sem vencimento'}${c.valorPago ? ' · já pagou ' + Utils.formatMoney(c.valorPago) : ''}</small></div>
            <strong>${Utils.formatMoney(Math.max(0, c.valor - (c.valorPago || 0)))}</strong>
            <button class="btn btn--sm" data-receber-conta="${c.id}">Receber</button>
          </div>`).join('')}
      </div>

      <div>
        <div class="secao-label">Mensagem de cobrança</div>
        ${this.editando
          ? `<textarea class="whats-edit" id="fiado-msg-edit">${Utils.escapeHtml(msg)}</textarea>
             <div class="btn-row" style="margin-top:6px;"><button class="link-btn" id="fiado-msg-salvar">Usar esta mensagem</button><button class="link-btn" id="fiado-msg-reset" style="color:var(--color-text-muted)">Voltar ao texto padrão</button></div>`
          : `<div class="whats-preview">${Utils.escapeHtml(msg)}</div>
             <button class="link-btn" id="fiado-msg-editar" style="margin-top:6px;">Editar mensagem</button>`}
        ${this.dados.chavePix ? '' : '<p class="hint-text" style="margin-top:6px;">Dica: cadastre sua chave Pix em Configurações para ela entrar na mensagem.</p>'}
      </div>` : '<div class="empty-state"><strong>Nada em aberto ✓</strong>Este cliente não deve nada no momento.</div>'}

      <div class="fiado-detalhe__acoes">
        ${g ? `<button class="btn btn--whatsapp" id="fiado-btn-whats">${cliente.telefone ? 'Enviar cobrança no WhatsApp' : 'Abrir WhatsApp com a mensagem'}</button>
        <button class="btn" id="fiado-btn-pagar">Registrar pagamento</button>` : ''}
        <button class="btn btn--ghost" id="fiado-btn-editar">Editar cadastro e limite</button>
      </div>
    `;
  },

  async abrirCliente(id) {
    this.selecionadoId = id;
    this.filtro = 'aberto';
    this.editando = false;
    await App.mudarView('fiado');
  },

  // Registra um pagamento abatendo das compras mais antigas primeiro
  async registrarPagamento(clienteId) {
    const g = this.dados.grupos[clienteId];
    if (!g) return;
    if (g.contas.length === 1) { Contas.abrirPagamento(g.contas[0].id); return; }

    App.abrirModal('Registrar pagamento', `
      <p>Saldo devedor: <strong>${Utils.formatMoney(g.saldo)}</strong> em ${g.contas.length} compras. O valor pago abate primeiro as compras mais antigas.</p>
      <form id="form-pagamento-fiado">
        <div class="field">
          <label>Valor recebido (R$)</label>
          <input type="text" id="f-fiado-valor" value="${g.saldo.toFixed(2).replace('.', ',')}" inputmode="decimal">
        </div>
        <div class="modal__footer">
          <button type="button" class="btn" id="btn-cancelar-fiado">Cancelar</button>
          <button type="submit" class="btn btn--success">Registrar pagamento</button>
        </div>
      </form>`);
    document.getElementById('btn-cancelar-fiado').addEventListener('click', () => App.fecharModal());
    document.getElementById('form-pagamento-fiado').addEventListener('submit', async (e) => {
      e.preventDefault();
      let restante = Utils.parseMoneyInput(document.getElementById('f-fiado-valor').value);
      if (!restante || restante <= 0) { Utils.toast('Informe um valor válido', 'error'); return; }
      if (restante > g.saldo + 0.001) { Utils.toast(`O valor passa do saldo devedor (${Utils.formatMoney(g.saldo)})`, 'error'); return; }
      for (const conta of g.contas) {
        if (restante <= 0.001) break;
        const saldoConta = Math.max(0, conta.valor - (conta.valorPago || 0));
        const abate = Math.min(saldoConta, restante);
        restante -= abate;
        conta.pagamentos = [...(conta.pagamentos || []), { valor: abate, data: Utils.nowISO() }];
        conta.valorPago = Math.min((conta.valorPago || 0) + abate, conta.valor);
        if (conta.valorPago >= conta.valor - 0.001) { conta.status = 'pago'; conta.dataPagamento = Utils.nowISO(); }
        await DB.put('contas', conta);
      }
      App.fecharModal();
      Utils.toast('Pagamento registrado!', 'ok');
      await this.render();
      App.atualizarBadges();
    });
  },

  init() {
    document.getElementById('fiado-filtro').addEventListener('click', (e) => {
      const b = e.target.closest('.segmented__btn');
      if (!b) return;
      this.filtro = b.dataset.filtro;
      this.render();
    });
    document.getElementById('fiado-busca').addEventListener('input', Utils.debounce((e) => { this.busca = e.target.value.trim(); this.render(); }, 200));
    document.getElementById('btn-fiado-novo-cliente').addEventListener('click', () => Clientes.abrirFormulario());

    document.getElementById('fiado-table-body').addEventListener('click', (e) => {
      const tr = e.target.closest('tr[data-cliente]');
      if (!tr) return;
      this.selecionadoId = parseInt(tr.dataset.cliente, 10);
      this.editando = false;
      this.render();
    });

    document.getElementById('fiado-detalhe').addEventListener('click', async (e) => {
      const id = this.selecionadoId;
      const cliente = this.dados && this.dados.clientes.find((c) => c.id === id);
      if (!cliente) return;
      const g = this.dados.grupos[id];
      const alvo = e.target.closest('button');
      if (!alvo) return;

      if (alvo.dataset.receberConta) { Contas.abrirPagamento(parseInt(alvo.dataset.receberConta, 10)); return; }
      switch (alvo.id) {
        case 'fiado-msg-editar': this.editando = true; this.renderDetalhe(); break;
        case 'fiado-msg-salvar':
          this.mensagemEditada[id] = document.getElementById('fiado-msg-edit').value;
          this.editando = false; this.renderDetalhe(); break;
        case 'fiado-msg-reset': delete this.mensagemEditada[id]; this.editando = false; this.renderDetalhe(); break;
        case 'fiado-btn-whats': {
          const texto = this.editando ? document.getElementById('fiado-msg-edit').value : (this.mensagemEditada[id] || this.mensagemPadrao(cliente, g));
          window.open(Utils.linkWhatsapp(cliente.telefone, texto), '_blank');
          break;
        }
        case 'fiado-btn-pagar': this.registrarPagamento(id); break;
        case 'fiado-btn-editar': Clientes.abrirFormulario(await Clientes.buscarPorId(id)); break;
      }
    });
  },
};

window.Fiado = Fiado;
