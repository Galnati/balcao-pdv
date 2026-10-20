/* ==========================================================================
   pdv.js — Ponto de Venda (Frente de Caixa)
   ========================================================================== */

const PDV = {
  carrinho: [], // { tipo: 'produto'|'combo', produtoId|comboId, nome, precoUnit, quantidade, estoqueDisponivel, descontoPct, componentes }
  metodoPagamento: 'Dinheiro',
  mistoAtivo: false,
  mistoLinhas: [], // { metodo, valor }
  categoriaAtiva: 'mais-vendidos',
  gradeProdutos: [],
  gradeCombos: [],
  clienteInfo: null, // { cliente, saldo } do cliente selecionado (para o aviso de limite)

  async init() {
    const searchInput = document.getElementById('pdv-search-input');
    const suggestionsBox = document.getElementById('pdv-suggestions');

    searchInput.addEventListener('input', Utils.debounce(async () => {
      const termo = searchInput.value.trim().toLowerCase();
      if (!termo) { suggestionsBox.classList.remove('is-open'); return; }
      const produtos = await Produtos.listarAtivos();
      const combos = (typeof Combos !== 'undefined') ? await Combos.listarAtivos() : [];

      const produtosEncontrados = produtos.filter((p) =>
        p.nome.toLowerCase().includes(termo) || (p.sku || '').toLowerCase().includes(termo)).slice(0, 6);
      const combosEncontrados = combos.filter((c) => c.nome.toLowerCase().includes(termo)).slice(0, 4);

      if (!produtosEncontrados.length && !combosEncontrados.length) {
        suggestionsBox.innerHTML = '<div class="pdv-suggestion-item is-disabled">Nenhum produto encontrado</div>';
      } else {
        const linhasProdutos = produtosEncontrados.map((p) => `
          <div class="pdv-suggestion-item" data-tipo="produto" data-id="${p.id}">
            <div>
              <div>${Utils.escapeHtml(p.nome)}</div>
              <small>${Utils.escapeHtml(p.categoria || '')} • Estoque: ${p.estoqueAtual}</small>
            </div>
            <strong>${Utils.formatMoney(p.precoVenda)}</strong>
          </div>`);
        const linhasCombos = combosEncontrados.map((c) => `
          <div class="pdv-suggestion-item" data-tipo="combo" data-id="${c.id}">
            <div>
              <div>${Utils.escapeHtml(c.nome)} <span class="badge badge--warning">combo</span></div>
              <small>${c.itens.length} produto(s) no kit</small>
            </div>
            <strong>${Utils.formatMoney(c.precoVenda)}</strong>
          </div>`);
        suggestionsBox.innerHTML = linhasProdutos.concat(linhasCombos).join('');
      }
      suggestionsBox.classList.add('is-open');
    }, 150));

    suggestionsBox.addEventListener('click', async (e) => {
      const item = e.target.closest('.pdv-suggestion-item[data-id]');
      if (!item) return;
      const id = parseInt(item.dataset.id, 10);
      if (item.dataset.tipo === 'combo') {
        const combo = await Combos.buscarPorId(id);
        await this.adicionarComboAoCarrinho(combo);
      } else {
        const produto = await Produtos.buscarPorId(id);
        this.adicionarAoCarrinho(produto);
      }
      searchInput.value = '';
      suggestionsBox.classList.remove('is-open');
      searchInput.focus();
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.pdv-search')) suggestionsBox.classList.remove('is-open');
    });

    document.getElementById('pdv-clear-cart').addEventListener('click', async () => {
      if (!this.carrinho.length) return;
      const ok = await Utils.confirmDialog('Deseja limpar o carrinho?');
      if (ok) { this.carrinho = []; this.renderCarrinho(); }
    });

    document.getElementById('pdv-cart-body').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx, 10);
      if (btn.dataset.action === 'remover-item') {
        this.carrinho.splice(idx, 1);
      } else if (btn.dataset.action === 'aumentar') {
        this.alterarQuantidade(idx, 1);
      } else if (btn.dataset.action === 'diminuir') {
        this.alterarQuantidade(idx, -1);
      } else if (btn.dataset.action === 'mais-caixa') {
        this.alterarQuantidade(idx, this.carrinho[idx].porCaixa || 1);
      }
      this.renderCarrinho();
    });

    document.getElementById('pdv-cart-body').addEventListener('change', (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      if (e.target.classList.contains('cart-qty-input')) {
        const val = parseInt(e.target.value, 10) || 1;
        this.carrinho[idx].quantidade = Math.max(1, val);
        this.renderCarrinho();
      } else if (e.target.classList.contains('cart-desconto-input')) {
        let val = Utils.parseMoneyInput(e.target.value);
        val = Math.max(0, Math.min(100, val));
        this.carrinho[idx].descontoPct = val;
        this.renderCarrinho();
      }
    });

    document.getElementById('pdv-payment-methods').addEventListener('click', (e) => {
      const el = e.target.closest('.payment-method');
      if (!el) return;
      document.querySelectorAll('.payment-method').forEach((m) => m.classList.remove('is-selected'));
      el.classList.add('is-selected');
      this.metodoPagamento = el.dataset.method;
      this.atualizarCamposPagamento();
      this.renderResumo();
    });

    document.getElementById('pdv-ajuste-tipo').addEventListener('change', () => this.renderResumo());
    document.getElementById('pdv-ajuste-valor').addEventListener('input', () => this.renderResumo());
    document.getElementById('pdv-ajuste-modo').addEventListener('change', () => this.renderResumo());
    document.getElementById('pdv-recebido').addEventListener('input', () => this.renderResumo());

    document.getElementById('pdv-btn-misto').addEventListener('click', () => this.ativarMisto());
    document.getElementById('pdv-misto-cancelar').addEventListener('click', () => this.desativarMisto());
    document.getElementById('pdv-misto-add').addEventListener('click', () => this.adicionarLinhaMisto());
    document.getElementById('pdv-misto-linhas').addEventListener('input', (e) => {
      const idx = parseInt(e.target.dataset.idx, 10);
      if (Number.isNaN(idx)) return;
      if (e.target.classList.contains('misto-metodo')) this.mistoLinhas[idx].metodo = e.target.value;
      if (e.target.classList.contains('misto-valor')) this.mistoLinhas[idx].valor = Utils.parseMoneyInput(e.target.value);
      this.atualizarCamposPagamento();
      // Importante: NÃO chama renderMisto() aqui — ele reconstrói o HTML das
      // linhas (innerHTML) a cada tecla digitada, o que troca o <input> por um
      // novo elemento e derruba o foco no meio da digitação (o campo "trava"
      // depois do primeiro dígito). Aqui só atualizamos o status/total, sem
      // recriar os campos. A formatação "bonitinha" (0,00) do valor só
      // acontece quando o campo perde o foco (evento 'change' abaixo).
      this.atualizarStatusMisto();
      this.renderResumo();
    });
    document.getElementById('pdv-misto-linhas').addEventListener('change', (e) => {
      if (e.target.classList.contains('misto-valor')) {
        // Ao sair do campo, aí sim reconstrói a linha pra mostrar o valor
        // já formatado (ex: "7" vira "7,00").
        this.renderMisto();
      }
    });
    document.getElementById('pdv-misto-linhas').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action="remover-linha-misto"]');
      if (!btn) return;
      this.mistoLinhas.splice(parseInt(btn.dataset.idx, 10), 1);
      this.atualizarCamposPagamento();
      this.renderMisto();
    });

    document.getElementById('pdv-finalizar').addEventListener('click', () => this.finalizarVenda());

    // Grade de produtos (toque para adicionar)
    document.getElementById('pdv-grid').addEventListener('click', async (e) => {
      const tile = e.target.closest('.produto-tile');
      if (!tile) return;
      const id = parseInt(tile.dataset.id, 10);
      if (tile.dataset.tipo === 'combo') {
        await this.adicionarComboAoCarrinho(await Combos.buscarPorId(id));
      } else {
        this.adicionarAoCarrinho(await Produtos.buscarPorId(id));
      }
    });
    document.getElementById('pdv-categorias').addEventListener('click', (e) => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      this.categoriaAtiva = chip.dataset.cat;
      this.renderGrade(false);
    });

    // Leitor de código de barras: o leitor "digita" o código e aperta Enter.
    searchInput.addEventListener('keydown', async (e) => {
      if (e.key !== 'Enter') return;
      const termo = searchInput.value.trim().toLowerCase();
      if (!termo) return;
      e.preventDefault();
      const produtos = await Produtos.listarAtivos();
      const exato = produtos.find((p) => (p.sku || '').toLowerCase() === termo);
      const parecidos = produtos.filter((p) => p.nome.toLowerCase().includes(termo) || (p.sku || '').toLowerCase().includes(termo));
      const primeiro = suggestionsBox.querySelector('.pdv-suggestion-item[data-id]');
      if (exato || parecidos.length === 1) {
        this.adicionarAoCarrinho(exato || parecidos[0]);
      } else if (primeiro && suggestionsBox.classList.contains('is-open')) {
        primeiro.click();
        return;
      } else {
        Utils.toast('Nenhum produto com esse código', 'error');
        return;
      }
      searchInput.value = '';
      suggestionsBox.classList.remove('is-open');
    });

    // Câmera do celular como leitor de código de barras
    document.getElementById('pdv-btn-camera').addEventListener('click', () => {
      Scanner.abrir(async (codigo) => {
        const produtos = await Produtos.listarAtivos();
        const achado = produtos.find((p) => (p.sku || '').trim() === codigo.trim());
        if (achado) { this.adicionarAoCarrinho(achado); Utils.toast(achado.nome + ' adicionado', 'ok'); return; }
        searchInput.value = codigo;
        searchInput.dispatchEvent(new Event('input'));
        Utils.toast('Código ' + codigo + ' não está cadastrado em nenhum produto', 'error');
      });
    });

    document.getElementById('pdv-pix-box').addEventListener('click', async (e) => {
      if (e.target.closest('#btn-copiar-pix')) {
        try { await navigator.clipboard.writeText(this.pixPayload); Utils.toast('Código Pix copiado', 'ok'); }
        catch (err) { Utils.toast('Não foi possível copiar automaticamente', 'error'); }
      }
    });

    // Cliente: mostra saldo de fiado e limite de crédito
    document.getElementById('pdv-cliente-select').addEventListener('change', () => this.atualizarCliente());

    // Celular: barra fixa com total + folha da venda
    document.getElementById('caixa-barra-cobrar').addEventListener('click', () => {
      if (!this.carrinho.length) { Utils.toast('Toque em um produto para começar a venda', 'info'); return; }
      document.getElementById('caixa-venda').classList.add('is-open');
    });
    document.getElementById('pdv-fechar-venda').addEventListener('click', () => {
      document.getElementById('caixa-venda').classList.remove('is-open');
    });

    await Clientes.popularSelectPDV();
    this.renderCarrinho();
    this.atualizarCamposPagamento();
    await this.renderGrade();
  },

  /* ---------------- Grade de produtos ---------------- */

  async renderGrade(recarregar = true) {
    if (recarregar) {
      this.gradeProdutos = await Produtos.listarAtivos();
      this.gradeCombos = (typeof Combos !== 'undefined') ? await Combos.listarAtivos() : [];
      const vendas = await DB.getAll('vendas');
      this.vendidos30 = Analise.quantidadesVendidas(vendas, Analise.isoDiasAtras(30));
    }
    const produtos = this.gradeProdutos;
    const categorias = Array.from(new Set(produtos.map((p) => p.categoria).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    const chips = [['mais-vendidos', 'Mais vendidos']].concat(categorias.map((c) => [c, c]));
    if (this.gradeCombos.length) chips.push(['combos', 'Combos']);
    if (!chips.some(([k]) => k === this.categoriaAtiva)) this.categoriaAtiva = 'mais-vendidos';
    document.getElementById('pdv-categorias').innerHTML = chips.map(([k, l]) =>
      `<button type="button" class="chip ${k === this.categoriaAtiva ? 'is-active' : ''}" data-cat="${Utils.escapeHtml(k)}">${Utils.escapeHtml(l)}</button>`).join('');

    let lista;
    if (this.categoriaAtiva === 'combos') {
      lista = this.gradeCombos.map((c) => ({ tipo: 'combo', item: c }));
    } else if (this.categoriaAtiva === 'mais-vendidos') {
      lista = produtos.slice()
        .sort((a, b) => ((this.vendidos30 || {})[b.id] || 0) - ((this.vendidos30 || {})[a.id] || 0) || a.nome.localeCompare(b.nome))
        .slice(0, 12).map((p) => ({ tipo: 'produto', item: p }));
    } else {
      lista = produtos.filter((p) => p.categoria === this.categoriaAtiva).map((p) => ({ tipo: 'produto', item: p }));
    }

    const grid = document.getElementById('pdv-grid');
    if (!lista.length) {
      grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1;">${produtos.length ? 'Nada nesta categoria.' : 'Cadastre produtos em Produtos para vendê-los com um toque aqui.'}</div>`;
      return;
    }
    grid.innerHTML = lista.map(({ tipo, item }) => {
      const noCarrinho = this.carrinho.filter((i) => (tipo === 'combo' ? i.tipo === 'combo' && i.comboId === item.id : i.tipo !== 'combo' && i.produtoId === item.id))
        .reduce((s, i) => s + i.quantidade, 0);
      let alerta = '';
      let estoqueTxt = 'Combo';
      let semEstoque = false;
      if (tipo === 'produto') {
        estoqueTxt = (item.estoqueAtual || 0) + ' un';
        semEstoque = (item.estoqueAtual || 0) <= 0;
        const dv = item.validade ? Utils.daysBetween(item.validade) : null;
        if (dv !== null && dv < 0) alerta = '<span class="badge badge--danger">Vencido</span>';
        else if (dv !== null && dv <= Analise.DIAS_VENCENDO) alerta = `<span class="badge badge--amber">Vence em ${dv} dia${dv === 1 ? '' : 's'}</span>`;
        else if (semEstoque) alerta = '<span class="badge badge--danger">Sem estoque</span>';
        else if ((item.estoqueAtual || 0) <= (item.estoqueMinimo || 0)) alerta = '<span class="badge badge--danger">Estoque baixo</span>';
      }
      return `
        <button type="button" class="produto-tile ${noCarrinho ? 'is-no-carrinho' : ''} ${semEstoque ? 'is-sem-estoque' : ''}" data-tipo="${tipo}" data-id="${item.id}">
          <span class="produto-tile__top"><span>${Utils.escapeHtml(tipo === 'combo' ? 'Combo' : (item.categoria || ''))}</span>${noCarrinho ? `<span class="produto-tile__qtd">${noCarrinho}</span>` : ''}</span>
          <span class="produto-tile__nome">${Utils.escapeHtml(item.nome)}</span>
          ${alerta}
          <span class="produto-tile__foot"><span class="produto-tile__preco">${Utils.formatMoney(item.precoVenda)}</span><span class="produto-tile__estoque">${estoqueTxt}</span></span>
        </button>`;
    }).join('');
  },

  /* ---------------- Pix com QR Code e valor ---------------- */

  async renderPix(total) {
    const box = document.getElementById('pdv-pix-box');
    const mostrar = !this.mistoAtivo && this.metodoPagamento === 'Pix' && total > 0;
    box.style.display = mostrar ? '' : 'none';
    if (!mostrar) { this.pixChave = null; return; }
    const cfg = await Pix.config();
    if (!cfg.chave) {
      box.innerHTML = `<div class="pix-box__vazio">Cadastre a chave Pix da loja em <button type="button" class="link-btn" data-goto="config">Configurações</button> para mostrar o QR Code com o valor da venda.</div>`;
      return;
    }
    const chaveRender = cfg.chave + '|' + total.toFixed(2);
    if (this.pixChave === chaveRender) return; // já está desenhado
    this.pixChave = chaveRender;
    this.pixPayload = Pix.payload(cfg, total, 'BALCAO' + Date.now().toString(36).toUpperCase());
    box.innerHTML = `
      <div class="pix-box__qr">${QR.svg(this.pixPayload, 132)}</div>
      <div class="pix-box__info">
        <strong>Pix de ${Utils.formatMoney(total)}</strong>
        <small>Mostre o QR para o cliente. Confira o recebimento no app do banco antes de finalizar.</small>
        <button type="button" class="btn btn--sm" id="btn-copiar-pix">Copiar código Pix</button>
      </div>`;
  },

  /* ---------------- Cliente / limite de crédito ---------------- */

  async atualizarCliente() {
    const id = document.getElementById('pdv-cliente-select').value;
    if (!id) { this.clienteInfo = null; this.renderAvisoLimite(); return; }
    const cliente = await Clientes.buscarPorId(parseInt(id, 10));
    const saldo = cliente ? await Clientes.saldoEmAberto(cliente.id) : 0;
    this.clienteInfo = cliente ? { cliente, saldo } : null;
    this.renderAvisoLimite();
  },

  temFiadoSelecionado() {
    return this.mistoAtivo ? this.mistoLinhas.some((l) => l.metodo === 'Fiado') : this.metodoPagamento === 'Fiado';
  },

  valorFiadoAtual() {
    if (this.mistoAtivo) return this.mistoLinhas.filter((l) => l.metodo === 'Fiado').reduce((s, l) => s + (l.valor || 0), 0);
    return this.metodoPagamento === 'Fiado' ? this.calcularTotais().total : 0;
  },

  // Retorna { excede, mensagem } considerando o fiado desta venda
  checarLimite() {
    const info = this.clienteInfo;
    if (!info) return { excede: false, mensagem: '' };
    const limite = Number(info.cliente.limiteCredito) || 0;
    const novoSaldo = info.saldo + (this.temFiadoSelecionado() ? this.valorFiadoAtual() : 0);
    if (limite > 0) {
      const excede = this.temFiadoSelecionado() && novoSaldo > limite + 0.001;
      const msg = excede
        ? `Passa do limite: ${info.cliente.nome.split(' ')[0]} ficaria devendo ${Utils.formatMoney(novoSaldo)} (limite ${Utils.formatMoney(limite)}).`
        : `Fiado em aberto: ${Utils.formatMoney(info.saldo)} de ${Utils.formatMoney(limite)} de limite.`;
      return { excede, mensagem: msg };
    }
    return { excede: false, mensagem: info.saldo > 0 ? `Fiado em aberto: ${Utils.formatMoney(info.saldo)} (sem limite definido).` : '' };
  },

  renderAvisoLimite() {
    const el = document.getElementById('pdv-limite-aviso');
    if (!el) return;
    const { excede, mensagem } = this.checarLimite();
    el.style.display = mensagem ? '' : 'none';
    el.textContent = mensagem;
    el.classList.toggle('is-excedido', excede);
  },


  adicionarAoCarrinho(produto) {
    if (!produto) return;
    const existente = this.carrinho.find((i) => i.tipo !== 'combo' && i.produtoId === produto.id);
    if (existente) {
      existente.quantidade += 1;
    } else {
      this.carrinho.push({
        tipo: 'produto',
        produtoId: produto.id,
        nome: produto.nome,
        precoUnit: produto.precoVenda,
        quantidade: 1,
        estoqueDisponivel: produto.estoqueAtual,
        descontoPct: 0,
        porCaixa: produto.unidadesPorCaixa > 1 ? produto.unidadesPorCaixa : 0,
      });
    }
    this.renderCarrinho();
  },

  async adicionarComboAoCarrinho(combo) {
    if (!combo) return;
    // Calcula o estoque disponível do combo como o mínimo entre os produtos
    // que o compõem (não dá pra montar mais kits do que o item mais escasso).
    let estoqueDisponivel = Infinity;
    const componentes = [];
    for (const it of combo.itens) {
      const produto = await Produtos.buscarPorId(it.produtoId);
      if (!produto) continue;
      componentes.push({ produtoId: it.produtoId, nome: produto.nome, quantidade: it.quantidade });
      const possiveisKits = Math.floor((produto.estoqueAtual || 0) / it.quantidade);
      estoqueDisponivel = Math.min(estoqueDisponivel, possiveisKits);
    }
    if (estoqueDisponivel === Infinity) estoqueDisponivel = 0;

    const existente = this.carrinho.find((i) => i.tipo === 'combo' && i.comboId === combo.id);
    if (existente) {
      existente.quantidade += 1;
    } else {
      this.carrinho.push({
        tipo: 'combo',
        comboId: combo.id,
        nome: '◆ ' + combo.nome,
        precoUnit: combo.precoVenda,
        quantidade: 1,
        estoqueDisponivel,
        descontoPct: 0,
        componentes,
      });
    }
    this.renderCarrinho();
  },

  alterarQuantidade(idx, delta) {
    const item = this.carrinho[idx];
    if (!item) return;
    item.quantidade = Math.max(1, item.quantidade + delta);
  },

  precoComDesconto(item) {
    const pct = item.descontoPct || 0;
    return item.precoUnit * (1 - pct / 100);
  },

  renderCarrinho() {
    const lista = document.getElementById('pdv-cart-body');
    if (!this.carrinho.length) {
      lista.innerHTML = '<div class="caixa-vazio">Toque em um produto ao lado ou leia o código de barras para começar.</div>';
    } else {
      lista.innerHTML = this.carrinho.map((item, idx) => {
        const excedeEstoque = item.quantidade > item.estoqueDisponivel;
        const precoFinal = this.precoComDesconto(item);
        return `
        <div class="caixa-item">
          <div class="caixa-item__main">
            <div class="caixa-item__nome">${Utils.escapeHtml(item.nome)}</div>
            <div class="caixa-item__sub">${Utils.formatMoney(item.precoUnit)} un. · desc.
              <input type="text" class="cart-desconto-input" data-idx="${idx}" value="${item.descontoPct || 0}" title="Desconto neste item (%)" inputmode="decimal">%</div>
            ${item.porCaixa ? `<button type="button" class="link-btn caixa-item__fardo" data-action="mais-caixa" data-idx="${idx}">+ 1 caixa/fardo (${item.porCaixa} un)</button>` : ''}
            ${excedeEstoque ? `<div class="caixa-item__alerta">Acima do estoque (${item.estoqueDisponivel} disponível)</div>` : ''}
          </div>
          <div class="stepper">
            <button type="button" data-action="diminuir" data-idx="${idx}" aria-label="Diminuir">−</button>
            <input type="number" class="cart-qty-input" data-idx="${idx}" value="${item.quantidade}" min="1">
            <button type="button" data-action="aumentar" data-idx="${idx}" aria-label="Aumentar">+</button>
          </div>
          <div class="caixa-item__total">${Utils.formatMoney(precoFinal * item.quantidade)}</div>
          <button type="button" class="caixa-item__remover" data-action="remover-item" data-idx="${idx}" title="Remover">✕</button>
        </div>`;
      }).join('');
    }
    const unidades = this.carrinho.reduce((s, i) => s + i.quantidade, 0);
    const txtItens = this.carrinho.length + (this.carrinho.length === 1 ? ' item' : ' itens');
    document.getElementById('pdv-itens-count').textContent = txtItens;
    document.getElementById('caixa-barra-itens').textContent = txtItens + (unidades !== this.carrinho.length ? ` · ${unidades} un` : '');
    if (this.gradeProdutos.length || this.gradeCombos.length) this.renderGrade(false);
    this.renderResumo();
  },

  atualizarCamposPagamento() {
    const temFiado = this.mistoAtivo
      ? this.mistoLinhas.some((l) => l.metodo === 'Fiado')
      : this.metodoPagamento === 'Fiado';
    const isDinheiroUnico = !this.mistoAtivo && this.metodoPagamento === 'Dinheiro';

    document.getElementById('pdv-payment-methods').style.display = this.mistoAtivo ? 'none' : '';
    document.getElementById('pdv-vencimento-field').style.display = temFiado ? '' : 'none';
    document.getElementById('pdv-recebido-field').style.display = isDinheiroUnico ? '' : 'none';
    document.getElementById('pdv-troco-line').style.display = isDinheiroUnico ? '' : 'none';
    if (temFiado && !document.getElementById('pdv-vencimento').value) {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      document.getElementById('pdv-vencimento').value = d.toISOString().slice(0, 10);
    }
  },

  ativarMisto() {
    this.mistoAtivo = true;
    document.getElementById('pdv-misto-area').style.display = '';
    document.getElementById('pdv-btn-misto').style.display = 'none';
    if (!this.mistoLinhas.length) {
      const { total } = this.calcularTotais();
      this.mistoLinhas = [{ metodo: 'Dinheiro', valor: total }];
    }
    this.atualizarCamposPagamento();
    this.renderMisto();
  },

  desativarMisto() {
    this.mistoAtivo = false;
    this.mistoLinhas = [];
    document.getElementById('pdv-misto-area').style.display = 'none';
    document.getElementById('pdv-btn-misto').style.display = '';
    this.atualizarCamposPagamento();
    this.renderResumo();
  },

  adicionarLinhaMisto() {
    const { total } = this.calcularTotais();
    const jaAlocado = this.mistoLinhas.reduce((s, l) => s + (l.valor || 0), 0);
    const restante = Math.max(0, total - jaAlocado);
    this.mistoLinhas.push({ metodo: 'Pix', valor: restante });
    this.renderMisto();
  },

  renderMisto() {
    const container = document.getElementById('pdv-misto-linhas');
    const metodos = ['Dinheiro', 'Pix', 'Cartão Débito', 'Cartão Crédito', 'Fiado'];
    container.innerHTML = this.mistoLinhas.map((l, idx) => `
      <div class="pdv-misto-linha">
        <select class="misto-metodo" data-idx="${idx}">
          ${metodos.map((m) => `<option value="${m}" ${l.metodo === m ? 'selected' : ''}>${m}</option>`).join('')}
        </select>
        <input type="text" class="misto-valor" data-idx="${idx}" value="${(l.valor || 0).toFixed(2).replace('.', ',')}">
        <button type="button" class="btn btn--sm btn--icon" data-action="remover-linha-misto" data-idx="${idx}">✕</button>
      </div>
    `).join('');
    this.atualizarStatusMisto();
    this.renderResumo();
  },

  // Atualiza só a linha de status ("Falta alocar...", "Valores batem...")
  // sem mexer no HTML dos campos — pra poder ser chamada a cada tecla
  // digitada sem derrubar o foco do campo que está sendo editado.
  atualizarStatusMisto() {
    const { total } = this.calcularTotais();
    const somaAlocada = this.mistoLinhas.reduce((s, l) => s + (l.valor || 0), 0);
    const diferenca = total - somaAlocada;
    const statusEl = document.getElementById('pdv-misto-status');
    if (!statusEl) return;
    if (Math.abs(diferenca) < 0.01) {
      statusEl.textContent = '✓ Valores batem com o total da venda (' + Utils.formatMoney(total) + ')';
      statusEl.className = 'hint-text pdv-misto-status--ok';
    } else if (diferenca > 0) {
      statusEl.textContent = 'Falta alocar: ' + Utils.formatMoney(diferenca);
      statusEl.className = 'hint-text pdv-misto-status--erro';
    } else {
      statusEl.textContent = 'Valor alocado passa do total em: ' + Utils.formatMoney(-diferenca);
      statusEl.className = 'hint-text pdv-misto-status--erro';
    }
  },

  calcularTotais() {
    const subtotal = this.carrinho.reduce((sum, i) => sum + i.precoUnit * i.quantidade, 0);
    const totalItens = this.carrinho.reduce((sum, i) => sum + this.precoComDesconto(i) * i.quantidade, 0);
    const descontoItens = subtotal - totalItens;

    const ajusteTipo = document.getElementById('pdv-ajuste-tipo').value; // 'desconto' | 'acrescimo'
    const ajusteModo = document.getElementById('pdv-ajuste-modo').value; // 'percentual' | 'valor'
    const ajusteEntrada = Utils.parseMoneyInput(document.getElementById('pdv-ajuste-valor').value);
    const ajusteValor = ajusteModo === 'percentual' ? totalItens * (ajusteEntrada / 100) : ajusteEntrada;

    const desconto = ajusteTipo === 'desconto' ? Math.min(Math.max(0, ajusteValor), totalItens) : 0;
    const acrescimo = ajusteTipo === 'acrescimo' ? Math.max(0, ajusteValor) : 0;

    const total = Math.max(0, totalItens - desconto + acrescimo);
    const recebido = Utils.parseMoneyInput(document.getElementById('pdv-recebido').value);
    const troco = (!this.mistoAtivo && this.metodoPagamento === 'Dinheiro') ? Math.max(0, recebido - total) : 0;
    return {
      subtotal, descontoItens, desconto, acrescimo, ajusteTipo, ajusteModo,
      ajustePercentual: ajusteModo === 'percentual' ? ajusteEntrada : 0,
      total, recebido, troco,
    };
  },

  renderResumo() {
    const { subtotal, descontoItens, desconto, acrescimo, ajusteTipo, total, troco } = this.calcularTotais();
    document.getElementById('pdv-subtotal').textContent = Utils.formatMoney(subtotal - descontoItens);

    const linha = document.getElementById('pdv-ajuste-line');
    const label = document.getElementById('pdv-ajuste-label');
    const view = document.getElementById('pdv-ajuste-view');
    linha.classList.remove('pdv-summary-line--desconto', 'pdv-summary-line--acrescimo');
    if (ajusteTipo === 'acrescimo') {
      linha.classList.add('pdv-summary-line--acrescimo');
      label.textContent = 'Acréscimo';
      view.textContent = '+ ' + Utils.formatMoney(acrescimo);
    } else {
      linha.classList.add('pdv-summary-line--desconto');
      label.textContent = 'Desconto';
      view.textContent = '- ' + Utils.formatMoney(desconto);
    }
    linha.style.display = (desconto > 0 || acrescimo > 0) ? '' : 'none';

    document.getElementById('pdv-total').textContent = Utils.formatMoney(total);
    document.getElementById('caixa-barra-total').textContent = Utils.formatMoney(total);
    this.renderAvisoLimite();
    this.renderPix(total);
    document.getElementById('pdv-troco').textContent = Utils.formatMoney(troco);

    if (this.mistoAtivo) {
      const somaAlocada = this.mistoLinhas.reduce((s, l) => s + (l.valor || 0), 0);
      const statusEl = document.getElementById('pdv-misto-status');
      if (statusEl) {
        const diferenca = total - somaAlocada;
        if (Math.abs(diferenca) < 0.01) {
          statusEl.textContent = '✓ Valores batem com o total da venda (' + Utils.formatMoney(total) + ')';
          statusEl.className = 'hint-text pdv-misto-status--ok';
        } else if (diferenca > 0) {
          statusEl.textContent = 'Falta alocar: ' + Utils.formatMoney(diferenca);
          statusEl.className = 'hint-text pdv-misto-status--erro';
        } else {
          statusEl.textContent = 'Valor alocado passa do total em: ' + Utils.formatMoney(-diferenca);
          statusEl.className = 'hint-text pdv-misto-status--erro';
        }
      }
    }
  },

  // Evita registrar a mesma venda duas vezes (duplo clique / F10 repetido)
  async finalizarVenda() {
    if (this.finalizando) return;
    this.finalizando = true;
    try { await this._finalizarVenda(); } finally { this.finalizando = false; }
  },

  async _finalizarVenda() {
    if (!this.carrinho.length) { Utils.toast('Adicione produtos ao carrinho', 'error'); return; }
    // Caixa precisa estar aberto (conferência do dinheiro no fim do dia)
    const aberto = await Turno.garantirAberto(() => setTimeout(() => this.finalizarVenda(), 0));
    if (!aberto) return;

    const clienteId = document.getElementById('pdv-cliente-select').value ? parseInt(document.getElementById('pdv-cliente-select').value, 10) : null;
    const { subtotal, descontoItens, desconto, acrescimo, ajusteTipo, ajustePercentual, total, recebido, troco } = this.calcularTotais();

    let pagamentos;
    if (this.mistoAtivo) {
      pagamentos = this.mistoLinhas.filter((l) => (l.valor || 0) > 0).map((l) => ({ metodo: l.metodo, valor: l.valor }));
      if (!pagamentos.length) { Utils.toast('Informe ao menos uma forma de pagamento com valor', 'error'); return; }
      const somaAlocada = pagamentos.reduce((s, p) => s + p.valor, 0);
      if (Math.abs(somaAlocada - total) > 0.01) {
        Utils.toast('A soma das formas de pagamento precisa bater com o total da venda', 'error');
        return;
      }
    } else {
      if (this.metodoPagamento === 'Dinheiro' && recebido > 0 && recebido < total) {
        Utils.toast('Valor recebido é menor que o total da venda', 'error');
        return;
      }
      pagamentos = [{ metodo: this.metodoPagamento, valor: total }];
    }

    const valorFiado = pagamentos.filter((p) => p.metodo === 'Fiado').reduce((s, p) => s + p.valor, 0);
    if (valorFiado > 0 && !clienteId) {
      Utils.toast('Selecione um cliente para a parte fiado da venda', 'error');
      return;
    }

    const limite = this.checarLimite();
    if (valorFiado > 0 && limite.excede) {
      const ok = await Utils.confirmDialog(limite.mensagem + ' Deseja vender fiado mesmo assim?');
      if (!ok) return;
    }

    const formaPagamento = pagamentos.length > 1 ? 'Misto' : pagamentos[0].metodo;
    const statusPagamento = valorFiado > 0 ? 'fiado' : 'pago';
    const clienteNome = clienteId ? (await Clientes.buscarPorId(clienteId)).nome : 'Venda avulsa';

    const operador = Auth.usuario || {};
    const venda = {
      data: Utils.nowISO(),
      operadorId: operador.id || null,
      operadorNome: operador.nome || '',
      caixaId: Turno.atual ? Turno.atual.id : null,
      clienteId,
      clienteNome,
      itens: this.carrinho.map((i) => ({
        tipo: i.tipo,
        produtoId: i.tipo === 'combo' ? null : i.produtoId,
        comboId: i.tipo === 'combo' ? i.comboId : null,
        componentes: i.tipo === 'combo' ? i.componentes : null,
        nome: i.nome,
        quantidade: i.quantidade,
        precoUnit: i.precoUnit,
        descontoPct: i.descontoPct || 0,
        subtotal: this.precoComDesconto(i) * i.quantidade,
      })),
      subtotal: subtotal - descontoItens,
      descontoItens,
      desconto,
      acrescimo,
      ajusteTipo,
      ajustePercentual,
      total,
      formaPagamento,
      pagamentos,
      statusPagamento,
      valorFiado,
      valorRecebido: (!this.mistoAtivo && this.metodoPagamento === 'Dinheiro') ? recebido : total,
      troco,
      vencimento: valorFiado > 0 ? document.getElementById('pdv-vencimento').value : null,
    };

    venda.id = await DB.add('vendas', venda);

    for (const item of venda.itens) {
      if (item.tipo === 'combo' && item.componentes) {
        for (const comp of item.componentes) {
          await Estoque.registrarMovimentacao({
            produtoId: comp.produtoId,
            tipo: 'saida',
            quantidade: comp.quantidade * item.quantidade,
            motivo: `Venda #${venda.id} (combo ${item.nome})`,
            vendaId: venda.id,
          });
        }
      } else {
        await Estoque.registrarMovimentacao({
          produtoId: item.produtoId,
          tipo: 'saida',
          quantidade: item.quantidade,
          motivo: `Venda #${venda.id}`,
          vendaId: venda.id,
        });
      }
    }

    if (valorFiado > 0) {
      await DB.add('contas', {
        tipo: 'receber',
        descricao: `Venda #${venda.id} - ${clienteNome}`,
        valor: valorFiado,
        vencimento: venda.vencimento,
        status: 'pendente',
        clienteId,
        vendaId: venda.id,
        criadoEm: Utils.nowISO(),
      });
    }

    Utils.toast('Venda finalizada com sucesso!', 'ok');
    await this.mostrarRecibo(venda);

    this.carrinho = [];
    document.getElementById('pdv-ajuste-valor').value = '0';
    document.getElementById('pdv-ajuste-tipo').value = 'desconto';
    document.getElementById('pdv-recebido').value = '0,00';
    document.getElementById('pdv-cliente-select').value = '';
    document.getElementById('pdv-vencimento').value = '';
    this.desativarMisto();
    this.clienteInfo = null;
    document.getElementById('caixa-venda').classList.remove('is-open');
    await this.renderGrade();
    this.renderCarrinho();

    Produtos.renderTabela();
    if (typeof Estoque !== 'undefined') Estoque.renderTudo();
    if (typeof Dashboard !== 'undefined') Dashboard.render();
    if (typeof Vendas !== 'undefined') Vendas.renderTabela();
    if (typeof Contas !== 'undefined') Contas.renderTudo();
  },

  async mostrarRecibo(venda) {
    const html = Utils.gerarReciboHtml(venda);
    const cliente = venda.clienteId ? await Clientes.buscarPorId(venda.clienteId) : null;

    App.abrirModal('Comprovante de Venda', `
      ${html}
      <div class="modal__footer">
        <button class="btn" id="btn-fechar-recibo">Fechar</button>
        <button class="btn btn--whatsapp" id="btn-whatsapp-recibo">Enviar por WhatsApp</button>
        <button class="btn btn--primary" id="btn-imprimir-recibo">⎙ Imprimir</button>
      </div>
    `);

    document.getElementById('btn-fechar-recibo').addEventListener('click', () => App.fecharModal());
    document.getElementById('btn-imprimir-recibo').addEventListener('click', () => {
      const printArea = document.getElementById('print-area');
      printArea.innerHTML = html;
      window.print();
    });
    document.getElementById('btn-whatsapp-recibo').addEventListener('click', () => {
      Utils.compartilharImagemRecibo(venda, cliente && cliente.telefone);
    });
  },
};
