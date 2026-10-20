/* ==========================================================================
   dashboard.js — Início: o que precisa de atenção hoje
   Cada alerta vem com o próximo passo pronto (regra do redesign Balcão v2).
   ========================================================================== */

const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const DIAS_LONGOS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];

const Dashboard = {
  acoes: {}, // id do alerta -> função executada pelo botão

  icone(view) {
    const el = document.querySelector(`.nav-item[data-view="${view}"] .nav-item__icon`);
    return el ? el.innerHTML : '';
  },

  saudacao() {
    const h = new Date().getHours();
    return h < 12 ? 'Bom dia' : (h < 18 ? 'Boa tarde' : 'Boa noite');
  },

  async render() {
    let [vendas, contas, produtos, clientes, pedidos] = await Promise.all([
      DB.getAll('vendas'), DB.getAll('contas'), Produtos.carregar(), DB.getAll('clientes'), DB.getAll('pedidosCompra').catch(() => []),
    ]);
    await Encomendas.carregar();

    const hoje = Utils.todayISO();
    const ehAdmin = App.ehAdmin();
    const todasVendas = vendas;
    vendas = Utils.vendasValidas(vendas);
    const produtosPorId = {};
    produtos.forEach((p) => { produtosPorId[p.id] = p; });
    const clientesPorId = {};
    clientes.forEach((c) => { clientesPorId[c.id] = c; });
    const diaLocal = (v) => Analise.dataLocal(v.data);

    /* ---------- Saudação ---------- */
    const nome = (Auth.usuario && Auth.usuario.nome ? Auth.usuario.nome : '').split(' ')[0];
    document.getElementById('dash-greeting').textContent = this.saudacao() + (nome ? ', ' + nome : '') ;

    /* ---------- KPIs ---------- */
    const vendasHoje = vendas.filter((v) => diaLocal(v) === hoje);
    const fatHoje = vendasHoje.reduce((s, v) => s + v.total, 0);
    const semanaPassadaISO = Analise.isoDiasAtras(7);
    const fatSemanaPassada = vendas.filter((v) => diaLocal(v) === semanaPassadaISO).reduce((s, v) => s + v.total, 0);
    const lucroHoje = vendasHoje.reduce((s, v) => s + Analise.lucroVenda(v, produtosPorId), 0);
    const margemHoje = fatHoje > 0 ? (lucroHoje / fatHoje) * 100 : 0;
    const fiado = Analise.fiadoPorCliente(contas);
    const gruposFiado = Object.values(fiado);
    const totalFiado = gruposFiado.reduce((s, g) => s + g.saldo, 0);
    const vencidos = gruposFiado.filter((g) => g.vencido);
    const ticket = vendasHoje.length ? fatHoje / vendasHoje.length : 0;

    let variacao = '';
    if (fatSemanaPassada > 0) {
      const pct = ((fatHoje - fatSemanaPassada) / fatSemanaPassada) * 100;
      variacao = `<span class="badge ${pct >= 0 ? 'badge--success' : 'badge--danger'}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}%</span> vs. ${DIAS_LONGOS[new Date().getDay()].split('-')[0]} ${[0, 6].includes(new Date().getDay()) ? 'passado' : 'passada'}`;
    } else {
      variacao = `${vendasHoje.length} venda(s) hoje`;
    }

    document.getElementById('dashboard-cards').innerHTML = `
      <div class="kpi"><div class="kpi__label">Vendas hoje</div><div class="kpi__value">${Utils.formatMoney(fatHoje)}</div><div class="kpi__foot">${variacao}</div></div>
      ${ehAdmin ? '' : '<!--'}<div class="kpi"><div class="kpi__label">Lucro estimado hoje</div><div class="kpi__value">${Utils.formatMoney(lucroHoje)}</div><div class="kpi__foot">${fatHoje > 0 ? 'Margem média de ' + margemHoje.toFixed(0) + '%' : 'Pelo custo cadastrado dos produtos'}</div></div>${ehAdmin ? '' : '-->'}
      ${ehAdmin ? '' : `<div class="kpi"><div class="kpi__label">Vendas no mês</div><div class="kpi__value">${Utils.formatMoney(vendas.filter((v) => diaLocal(v).slice(0, 7) === hoje.slice(0, 7)).reduce((s, v) => s + v.total, 0))}</div><div class="kpi__foot">${vendas.filter((v) => diaLocal(v).slice(0, 7) === hoje.slice(0, 7)).length} venda(s)</div></div>`}
      <div class="kpi"><div class="kpi__label">Fiado a receber</div><div class="kpi__value">${Utils.formatMoney(totalFiado)}</div><div class="kpi__foot">${vencidos.length ? `<span class="badge badge--danger">${vencidos.length} atrasado${vencidos.length > 1 ? 's' : ''}</span>` : ''}${gruposFiado.length} cliente(s)</div></div>
      <div class="kpi"><div class="kpi__label">Ticket médio</div><div class="kpi__value">${Utils.formatMoney(ticket)}</div><div class="kpi__foot">${vendasHoje.length} venda(s) hoje</div></div>
    `;

    /* ---------- Alertas acionáveis ---------- */
    this.acoes = {};
    const alertas = [];
    const addAlerta = (tom, icone, titulo, desc, botao, acao) => {
      const id = 'a' + alertas.length;
      this.acoes[id] = acao;
      alertas.push({ id, tom, icone, titulo, desc, botao });
    };

    vencidos.sort((a, b) => b.diasAtraso - a.diasAtraso).slice(0, 2).forEach((g) => {
      const c = clientesPorId[g.clienteId];
      const nomeC = c ? c.nome : 'Cliente';
      addAlerta('red', 'fiado', `Fiado vencido: ${nomeC} — ${Utils.formatMoney(g.saldo)}`,
        `${g.diasAtraso} dia(s) de atraso. A mensagem de cobrança já está pronta para enviar.`,
        'Cobrar', () => Fiado.abrirCliente(g.clienteId));
    });
    if (vencidos.length > 2) {
      addAlerta('red', 'fiado', `Mais ${vencidos.length - 2} cliente(s) com fiado vencido`, 'Veja a lista completa de vencidos no Fiado.', 'Ver fiados', () => { Fiado.filtro = 'vencido'; App.mudarView('fiado'); });
    }

    const aVencer = gruposFiado.filter((g) => !g.vencido && g.proxVencimento && Utils.daysBetween(g.proxVencimento) <= 3);
    if (aVencer.length) {
      const total = aVencer.reduce((s, g) => s + g.saldo, 0);
      addAlerta('blue', 'fiado', aVencer.length === 1
        ? `Fiado de ${(clientesPorId[aVencer[0].clienteId] || {}).nome || 'cliente'} vence ${this.quando(aVencer[0].proxVencimento)} — ${Utils.formatMoney(total)}`
        : `${aVencer.length} fiados vencem nos próximos 3 dias — ${Utils.formatMoney(total)}`,
        'Um lembrete gentil antes do vencimento evita atraso.', 'Lembrar', () => {
          if (aVencer.length === 1) Fiado.abrirCliente(aVencer[0].clienteId); else { Fiado.filtro = 'aberto'; App.mudarView('fiado'); }
        });
    }

    const status = Analise.produtosComStatus(produtos, vendas);
    const validade = status.filter((s) => s.status === 'vencido' || s.status === 'vencendo').sort((a, b) => a.diasValidade - b.diasValidade);
    validade.slice(0, 2).forEach((s) => {
      const d = s.diasValidade;
      addAlerta(d < 0 ? 'red' : 'amber', 'estoque',
        d < 0 ? `${s.produto.nome} venceu há ${-d} dia(s)` : (d === 0 ? `${s.produto.nome} vence hoje` : `${s.produto.nome} vence em ${d} dia(s)`),
        d < 0 ? `${s.produto.estoqueAtual} un. em estoque. Retire da venda e registre a perda no estoque.` : `${s.produto.estoqueAtual} un. em estoque. Sugestão: monte um combo ou promoção para girar antes.`,
        d < 0 ? 'Ajustar estoque' : 'Criar combo',
        () => {
          if (d < 0) { App.mudarView('estoque').then(() => { Estoque.mostrarTab('mov'); Estoque.abrirFormulario(); }); }
          else { App.mudarView('produtos').then(() => Produtos.mostrarTab('combos')); }
        });
    });

    const repor = status.filter((s) => s.status === 'repor').sort((a, b) => a.dura - b.dura);
    repor.slice(0, 2).forEach((s) => {
      const p = s.produto;
      let titulo;
      if ((p.estoqueAtual || 0) <= 0) titulo = `${p.nome} está sem estoque`;
      else if (s.vendaDia > 0 && s.dura <= Analise.DIAS_REPOR) titulo = s.dura < 1 ? `${p.nome} acaba hoje` : `${p.nome} acaba em ~${Analise.formatarDura(s.dura)}`;
      else titulo = `${p.nome} está abaixo do mínimo`;
      const desc = s.vendaDia > 0
        ? `Você vende ${s.vendaDia.toFixed(1).replace('.', ',')} un/dia e tem ${Math.max(0, p.estoqueAtual || 0)} un (mínimo ${p.estoqueMinimo || 0}).`
        : `${p.estoqueAtual} un. em estoque (mínimo ${p.estoqueMinimo || 0}).`;
      addAlerta('amber', 'produtos', titulo, desc, 'Ver pedido sugerido', () => App.mudarView('estoque'));
    });
    if (repor.length > 2) addAlerta('amber', 'produtos', `Mais ${repor.length - 2} produto(s) para repor`, 'O pedido sugerido já considera todos eles.', 'Abrir Estoque', () => App.mudarView('estoque'));

    const emTresDias = new Date(); emTresDias.setDate(emTresDias.getDate() + 3);
    const limitePagar = emTresDias.toISOString().slice(0, 10);
    const pagar = !ehAdmin ? [] : contas.filter((c) => c.tipo === 'pagar' && c.status !== 'pago' && c.status !== 'cancelada' && c.vencimento && c.vencimento <= limitePagar);
    if (pagar.length) {
      const total = pagar.reduce((s, c) => s + Math.max(0, (c.valor || 0) - (c.valorPago || 0)), 0);
      const atrasadas = pagar.filter((c) => Utils.isPast(c.vencimento)).length;
      addAlerta(atrasadas ? 'red' : 'blue', 'contas', `${pagar.length} conta(s) a pagar ${atrasadas ? 'atrasada(s) ou vencendo' : 'vencendo em até 3 dias'} — ${Utils.formatMoney(total)}`,
        pagar.slice(0, 2).map((c) => c.descricao).join(' · '), 'Ver contas', () => App.mudarView('contas'));
    }

    const entregasHoje = Encomendas.cache.filter((e) => e.dataEntrega === hoje && e.status === 'pendente');
    if (entregasHoje.length) {
      addAlerta('blue', 'encomendas', `${entregasHoje.length} encomenda(s) para entregar hoje`, entregasHoje.slice(0, 3).map((e) => e.clienteNome || 'Cliente').join(', '), 'Ver encomendas', () => App.mudarView('encomendas'));
    }

    const pedidosAbertos = pedidos.filter((p) => p.status === 'aberto');
    if (pedidosAbertos.length) {
      const p = pedidosAbertos[0];
      addAlerta('blue', 'fornecedores', pedidosAbertos.length === 1 ? `Pedido #${p.id} de ${p.fornecedorNome} aguardando entrega` : `${pedidosAbertos.length} pedidos de compra aguardando entrega`,
        'Confira a entrega para dar entrada no estoque automaticamente.', 'Conferir entrega', () => App.mudarView('fornecedores').then(() => Fornecedores.mostrarTab('pedidos')));
    }

    document.getElementById('dash-alertas-count').textContent = alertas.length ? alertas.length + (alertas.length === 1 ? ' item' : ' itens') : '';
    document.getElementById('dash-alertas').innerHTML = alertas.length
      ? alertas.map((a) => `
        <div class="alerta">
          <div class="alerta__icon alerta__icon--${a.tom}">${this.icone(a.icone)}</div>
          <div class="alerta__body"><div class="alerta__title">${Utils.escapeHtml(a.titulo)}</div><div class="alerta__desc">${Utils.escapeHtml(a.desc)}</div></div>
          <button class="btn btn--sm" data-alerta="${a.id}">${a.botao}</button>
        </div>`).join('')
      : '<div class="empty-state"><strong>Tudo em ordem ✓</strong>Nenhum fiado vencido, produto vencendo ou estoque para repor.</div>';

    const diaSemana = new Date().getDay();
    document.getElementById('dash-sub').textContent = alertas.length
      ? `Hoje é ${DIAS_LONGOS[diaSemana]}. Veja o que precisa da sua atenção antes do movimento.`
      : `Hoje é ${DIAS_LONGOS[diaSemana]}. Bom trabalho — está tudo em dia.`;

    /* ---------- Últimas vendas ---------- */
    const ultimas = todasVendas.slice().sort((a, b) => new Date(b.data) - new Date(a.data)).slice(0, 5);
    document.getElementById('dash-ultimas').innerHTML = ultimas.length
      ? ultimas.map((v) => {
          const hora = new Date(v.data).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          const dia = diaLocal(v) === hoje ? hora : Utils.formatDate(v.data).slice(0, 5) + ' ' + hora;
          const fiadoPend = v.statusPagamento === 'fiado';
          return `
          <div class="venda-linha">
            <div class="venda-linha__main">#${v.id} · ${Utils.escapeHtml(v.clienteNome || 'Venda avulsa')}<small>${dia} · ${Utils.escapeHtml(v.formaPagamento || '')}${v.operadorNome ? ' · ' + Utils.escapeHtml(v.operadorNome.split(' ')[0]) : ''}</small></div>
            ${v.status === 'cancelada' ? '<span class="badge badge--muted">Cancelada</span>' : `<span class="badge ${fiadoPend ? 'badge--amber' : 'badge--success'}">${fiadoPend ? 'Fiado' : 'Pago'}</span>`}
            <div class="venda-linha__valor">${Utils.formatMoney(v.total)}</div>
          </div>`;
        }).join('')
      : '<div class="empty-state">Nenhuma venda ainda. Que tal abrir o Caixa?</div>';

    /* ---------- Semana ---------- */
    const dias = [];
    for (let i = 6; i >= 0; i--) dias.push(Analise.isoDiasAtras(i));
    const porDia = {};
    dias.forEach((d) => { porDia[d] = 0; });
    let semanaAnterior = 0;
    const iniAnterior = Analise.isoDiasAtras(13);
    vendas.forEach((v) => {
      const d = diaLocal(v);
      if (porDia[d] !== undefined) porDia[d] += v.total;
      else if (d >= iniAnterior && d < dias[0]) semanaAnterior += v.total;
    });
    const totalSemana = dias.reduce((s, d) => s + porDia[d], 0);
    const max = Math.max(1, ...dias.map((d) => porDia[d]));
    document.getElementById('dash-semana-total').textContent = Utils.formatMoney(totalSemana);
    if (semanaAnterior > 0 && Math.abs((totalSemana - semanaAnterior) / semanaAnterior) < 10) {
      const pct = ((totalSemana - semanaAnterior) / semanaAnterior) * 100;
      document.getElementById('dash-semana-var').innerHTML = `<span class="badge ${pct >= 0 ? 'badge--success' : 'badge--danger'}">${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(0)}%</span>`;
    } else {
      document.getElementById('dash-semana-var').innerHTML = '';
    }
    document.getElementById('dashboard-chart').innerHTML = `<div class="semana-chart">${dias.map((d) => {
      const dt = new Date(d + 'T12:00:00');
      return `<div class="semana-chart__col ${d === hoje ? 'is-hoje' : ''}" title="${Utils.formatDate(d + 'T12:00:00')}: ${Utils.formatMoney(porDia[d])}">
        <div class="semana-chart__bar" style="height:${Math.max(4, (porDia[d] / max) * 100)}%"></div>
        <div class="semana-chart__label">${DIAS_CURTOS[dt.getDay()]}</div>
      </div>`;
    }).join('')}</div>`;

    /* ---------- Mais vendidos ---------- */
    const contar = (lista) => {
      const m = {};
      lista.forEach((v) => (v.itens || []).forEach((i) => { const n = (i.nome || '').replace(/^◆\s*/, ''); m[n] = (m[n] || 0) + i.quantidade; }));
      return Object.entries(m).map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 5);
    };
    let top = contar(vendasHoje);
    let titulo = 'Mais vendidos hoje';
    if (!top.length) { top = contar(vendas.filter((v) => diaLocal(v) >= Analise.isoDiasAtras(30))); titulo = 'Mais vendidos (30 dias)'; }
    document.getElementById('dash-top-titulo').textContent = titulo;
    document.getElementById('dashboard-top-products').innerHTML = Utils.renderTopList(top, (v) => v + ' un');
  },

  quando(iso) {
    const d = Utils.daysBetween(iso);
    return d <= 0 ? 'hoje' : (d === 1 ? 'amanhã' : `em ${d} dias`);
  },

  init() {
    document.getElementById('dash-alertas').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-alerta]');
      if (btn && this.acoes[btn.dataset.alerta]) this.acoes[btn.dataset.alerta]();
    });
  },
};
