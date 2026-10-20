/* ==========================================================================
   app.js — Bootstrap da aplicação, navegação e modal genérico
   ========================================================================== */

const App = {
  viewAtual: 'dashboard',

  titulos: {
    dashboard: 'Início',
    pdv: 'Caixa',
    encomendas: 'Vendas',
    produtos: 'Produtos',
    clientes: 'Clientes',
    estoque: 'Estoque',
    fornecedores: 'Compras',
    fiado: 'Fiado',
    contas: 'Contas a pagar e receber',
    calculadora: 'Calculadora de preço',
    relatorios: 'Relatórios',
    config: 'Configurações',
    perfil: 'Meu perfil',
  },

  subtitulos: {
    pdv: 'Toque no produto ou leia o código de barras',
    encomendas: 'Histórico, calendário e encomendas',
    produtos: 'Cadastro, preços, margem e combos',
    clientes: 'Cadastro completo de clientes',
    estoque: 'Validade, reposição e produtos parados',
    fornecedores: 'Fornecedores e pedidos de compra',
    fiado: 'Vendas a prazo e cobranças',
    contas: 'Despesas, recebimentos e vencimentos',
    calculadora: 'Preço de venda ideal a partir do custo',
    relatorios: 'Faturamento, mais vendidos e formas de pagamento',
    config: 'Loja, backup e notificações',
    perfil: 'Sua foto, seus dados e sua senha',
  },

  // Itens de menu que ficam destacados para telas que não estão no menu
  navPai: { clientes: 'fiado', calculadora: 'produtos' },

  abrirModal(titulo, htmlBody) {
    document.getElementById('modal-title').textContent = titulo;
    document.getElementById('modal-body').innerHTML = htmlBody;
    document.getElementById('modal-overlay').classList.add('is-open');
  },

  fecharModal() {
    if (typeof Scanner !== 'undefined') Scanner.parar(false);
    document.getElementById('modal-overlay').classList.remove('is-open');
    document.getElementById('modal-body').innerHTML = '';
  },

  // Permissões por função: "admin" vê tudo; "membro" (Caixa) não vê lucro,
  // contas e relatórios, nem apaga dados (o servidor também bloqueia).
  viewsSoAdmin: ['contas', 'relatorios', 'calculadora'],

  ehAdmin() {
    return !!(Auth.usuario && Auth.usuario.papel === 'admin');
  },

  aplicarPermissoes() {
    document.body.classList.toggle('papel-membro', !this.ehAdmin());
    if (!this.ehAdmin() && this.viewsSoAdmin.includes(this.viewAtual)) this.mudarView('dashboard');
  },

  async mudarView(view) {
    if (!this.titulos[view]) return;
    if (!this.ehAdmin() && this.viewsSoAdmin.includes(view)) {
      Utils.toast('Essa área é só para o administrador da loja', 'info');
      return;
    }
    document.querySelectorAll('.view').forEach((v) => v.classList.remove('is-active'));
    document.getElementById('view-' + view).classList.add('is-active');
    const navAtivo = this.navPai[view] || view;
    document.querySelectorAll('.nav-item').forEach((n) => n.classList.toggle('is-active', n.dataset.view === navAtivo));
    document.getElementById('topbar-title').textContent = this.titulos[view];
    document.getElementById('topbar-subtitle').textContent = this.subtitulos[view] || this.dataPorExtenso();
    if (this.viewAtual !== view) window.scrollTo(0, 0);
    this.viewAtual = view;

    // Recarrega dados sempre que entra na view
    switch (view) {
      case 'dashboard': await Dashboard.render(); break;
      case 'pdv': await Clientes.popularSelectPDV(); await PDV.renderGrade(); PDV.renderCarrinho(); break;
      case 'fiado': await Fiado.render(); break;
      case 'perfil': Perfil.render(); break;
      case 'encomendas': await Encomendas.renderTudo(); break;
      case 'produtos': await Produtos.renderTabela(); break;
      case 'clientes': await Clientes.renderTabela(); break;
      case 'estoque': await Estoque.renderTudo(); break;
      case 'fornecedores': await Fornecedores.renderTudo(); break;
      case 'contas': await Contas.renderTudo(); break;
      case 'relatorios': await Relatorios.render(); break;
      case 'calculadora': Calculadora.calcularPrecoVenda(); Calculadora.calcularMargemMarkup(); break;
    }
    if (view === 'config' && typeof Equipe !== 'undefined') Equipe.render();
    if (typeof Turno !== 'undefined') Turno.carregar();
    this.atualizarBadges();
  },

  dataPorExtenso() {
    const s = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    return s.charAt(0).toUpperCase() + s.slice(1);
  },

  // Contadores no menu: fiados vencidos e produtos que pedem atenção
  atualizarBadges: Utils.debounce(async () => {
    try {
      const [contas, produtos, vendas] = await Promise.all([DB.getAll('contas'), DB.getAll('produtos'), DB.getAll('vendas')]);
      const vencidos = Object.values(Analise.fiadoPorCliente(contas)).filter((g) => g.vencido).length;
      const atencao = Analise.produtosComStatus(produtos, vendas).filter((i) => ['vencido', 'vencendo', 'repor'].includes(i.status)).length;
      const set = (id, n, amber) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.textContent = n;
        el.style.display = n ? '' : 'none';
        el.classList.toggle('nav-badge--amber', !!amber);
      };
      set('nav-badge-fiado', vencidos, false);
      set('nav-badge-estoque', atencao, true);
    } catch (e) { /* contadores são só um atalho visual */ }
  }, 300),

  setSync(online) {
    const pill = document.getElementById('sync-pill');
    if (!pill) return;
    pill.classList.toggle('is-online', online);
    pill.classList.toggle('is-offline', !online);
    document.getElementById('sync-pill-text').textContent = online ? 'Sincronizado' : 'Reconectando…';
  },

  initAtalhos() {
    // Botões "ir para" espalhados pelas telas (data-goto="view")
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-goto]');
      if (!b) return;
      e.preventDefault();
      this.mudarView(b.dataset.goto);
    });

    // Atalhos de teclado do Caixa (F2 abre o Caixa de qualquer tela)
    document.addEventListener('keydown', (e) => {
      const modalAberto = document.getElementById('modal-overlay').classList.contains('is-open') || document.getElementById('confirm-overlay').classList.contains('is-open');
      if (modalAberto || !Auth.usuario) return;
      if (e.key === 'F2') {
        e.preventDefault();
        this.mudarView('pdv').then(() => document.getElementById('pdv-search-input').focus());
      } else if (this.viewAtual === 'pdv' && e.key === 'F3') {
        e.preventDefault();
        document.getElementById('pdv-search-input').focus();
      } else if (this.viewAtual === 'pdv' && e.key === 'F4') {
        e.preventDefault();
        const sel = document.getElementById('pdv-cliente-select');
        sel.focus();
        if (sel.showPicker) { try { sel.showPicker(); } catch (err) { /* nem todo navegador permite */ } }
      } else if (this.viewAtual === 'pdv' && e.key === 'F10') {
        e.preventDefault();
        PDV.finalizarVenda();
      }
    });
  },

  atualizarRelogio() {
    const el = document.getElementById('topbar-clock');
    el.textContent = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    if (this.viewAtual === 'dashboard') document.getElementById('topbar-subtitle').textContent = this.dataPorExtenso();
  },

  initNavegacao() {
    document.querySelectorAll('.nav-item').forEach((item) => {
      item.addEventListener('click', () => {
        this.mudarView(item.dataset.view);
        this.fecharMenuMobile();
      });
    });
  },

  abrirMenuMobile() {
    document.querySelector('.sidebar').classList.add('is-open');
    document.getElementById('sidebar-backdrop').classList.add('is-open');
  },

  fecharMenuMobile() {
    document.querySelector('.sidebar').classList.remove('is-open');
    document.getElementById('sidebar-backdrop').classList.remove('is-open');
  },

  initMenuMobile() {
    document.getElementById('topbar-menu-btn').addEventListener('click', () => this.abrirMenuMobile());
    document.getElementById('sidebar-backdrop').addEventListener('click', () => this.fecharMenuMobile());
  },

  initModal() {
    document.getElementById('modal-close').addEventListener('click', () => this.fecharModal());
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target.id === 'modal-overlay') this.fecharModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.fecharModal();
    });
  },

  initConfig() {
    document.getElementById('btn-exportar').addEventListener('click', async () => {
      const data = await DB.exportAll();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `backup-balcao-${Utils.todayISO()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      Utils.toast('Backup exportado!', 'ok');
    });

    document.getElementById('btn-importar').addEventListener('click', () => {
      document.getElementById('input-importar').click();
    });

    document.getElementById('input-importar').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const ok = await Utils.confirmDialog('Importar este backup vai SUBSTITUIR todos os dados atuais. Deseja continuar?');
      if (!ok) { e.target.value = ''; return; }
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        await DB.importAll(data);
        Utils.toast('Backup importado com sucesso!', 'ok');
        await this.recarregarTudo();
      } catch (err) {
        Utils.toast('Erro ao importar arquivo: ' + err.message, 'error');
      }
      e.target.value = '';
    });

    document.getElementById('btn-seed').addEventListener('click', async () => {
      const ok = await Utils.confirmDialog('Isso vai adicionar produtos, clientes e vendas de exemplo. Continuar?');
      if (!ok) return;
      await Seed.popular();
      Utils.toast('Dados de exemplo carregados!', 'ok');
      await this.recarregarTudo();
    });

    document.getElementById('btn-backup-agora').addEventListener('click', async () => {
      try {
        const resultado = await DB.backupAgora();
        Utils.toast('Backup salvo neste navegador', 'ok');
        this.atualizarStatusBackup();
      } catch (err) {
        Utils.toast('Erro ao fazer backup: ' + err.message, 'error');
      }
    });
    this.atualizarStatusBackup();

    document.getElementById('btn-limpar-tudo').addEventListener('click', async () => {
      const ok = await Utils.confirmDialog('ATENÇÃO: isso vai apagar TODOS os dados (produtos, clientes, vendas, estoque, contas). Esta ação não pode ser desfeita. Deseja continuar?');
      if (!ok) return;
      const ok2 = await Utils.confirmDialog('Tem certeza absoluta? Todos os dados serão perdidos permanentemente.');
      if (!ok2) return;
      for (const store of ['produtos', 'clientes', 'movimentacoesEstoque', 'vendas', 'contas', 'encomendas', 'combos', 'fornecedores', 'pedidosCompra']) {
        await DB.clear(store);
      }
      Utils.toast('Todos os dados foram apagados', 'ok');
      await this.recarregarTudo();
    });
  },

  /* ---------------- Notificações de estoque baixo ---------------- */

  async verificarEstoqueBaixoENotificar() {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (localStorage.getItem('vb_notif_estoque') !== '1') return;
    try {
      const baixo = await Estoque.produtosEstoqueBaixo();
      const chave = 'vb_notif_avisados_' + Utils.todayISO();
      let avisados = [];
      try { avisados = JSON.parse(localStorage.getItem(chave) || '[]'); } catch (e) { avisados = []; }
      const novos = baixo.filter((p) => !avisados.includes(p.id));
      if (novos.length) {
        const corpo = novos.length === 1
          ? `${novos[0].nome} está com estoque baixo (${novos[0].estoqueAtual} un., mínimo ${novos[0].estoqueMinimo})`
          : `${novos.length} produtos estão com estoque baixo: ${novos.slice(0, 3).map((p) => p.nome).join(', ')}${novos.length > 3 ? '...' : ''}`;
        new Notification('Estoque baixo — Balcão', { body: corpo, icon: 'icons/icon-192.png' });
        localStorage.setItem(chave, JSON.stringify(avisados.concat(novos.map((p) => p.id))));
      }
    } catch (e) { /* silencioso — notificação é best-effort */ }
  },

  initNotificacoes() {
    const btn = document.getElementById('btn-ativar-notificacoes');
    const status = document.getElementById('notificacoes-status');
    const atualizarStatus = () => {
      const suportado = typeof Notification !== 'undefined';
      const ativado = suportado && Notification.permission === 'granted' && localStorage.getItem('vb_notif_estoque') === '1';
      status.textContent = !suportado
        ? 'Este navegador não suporta notificações.'
        : ativado ? '✓ Notificações ativadas neste aparelho.'
        : (Notification.permission === 'denied' ? 'Permissão bloqueada — habilite notificações para este site nas configurações do navegador.' : 'Desativadas neste aparelho.');
      btn.style.display = ativado ? 'none' : '';
    };

    btn.addEventListener('click', async () => {
      if (typeof Notification === 'undefined') { Utils.toast('Este navegador não suporta notificações', 'error'); return; }
      const permissao = await Notification.requestPermission();
      if (permissao === 'granted') {
        localStorage.setItem('vb_notif_estoque', '1');
        Utils.toast('Notificações de estoque baixo ativadas!', 'ok');
        this.verificarEstoqueBaixoENotificar();
      } else {
        Utils.toast('Permissão de notificação não concedida', 'error');
      }
      atualizarStatus();
    });

    atualizarStatus();
    this.verificarEstoqueBaixoENotificar();
    setInterval(() => this.verificarEstoqueBaixoENotificar(), 5 * 60 * 1000);
  },

  async atualizarStatusBackup() {
    const el = document.getElementById('backup-ultimo-status');
    if (!el) return;
    try {
      const status = await DB.backupStatus();
      el.textContent = status.ultimoBackupEm
        ? '✓ Último backup: ' + Utils.formatDateTime(status.ultimoBackupEm)
        : 'Ainda não foi feito nenhum backup neste servidor.';
    } catch (e) {
      el.textContent = '';
    }
  },

  renderMinhaConta() {
    const u = Auth.usuario;
    if (!u) return;
    document.getElementById('conta-usuario-nome').textContent = u.nome;
    document.getElementById('conta-usuario-email').textContent = u.email;
    document.getElementById('conta-loja-nome').textContent = u.loja ? u.loja.nome : '-';
    document.getElementById('conta-codigo-convite').textContent = u.loja ? u.loja.codigoConvite : '-';
    document.getElementById('sidebar-loja-nome').textContent = u.loja ? u.loja.nome : '';
    if (typeof Perfil !== 'undefined') Perfil.aplicarAvatar();
  },

  async initChavePix() {
    const campos = { chavePix: 'config-chave-pix', chavePixTipo: 'config-chave-pix-tipo', pixNome: 'config-pix-nome', pixCidade: 'config-pix-cidade' };
    for (const [chave, id] of Object.entries(campos)) {
      try {
        const cfg = await DB.get('config', chave);
        if (cfg && cfg.valor) document.getElementById(id).value = cfg.valor;
      } catch (e) { /* ainda não configurado */ }
    }
    const nomeEl = document.getElementById('config-pix-nome');
    if (!nomeEl.value && Auth.usuario && Auth.usuario.loja) nomeEl.value = Auth.usuario.loja.nome.slice(0, 25);
    document.getElementById('btn-salvar-pix').addEventListener('click', async () => {
      const chave = document.getElementById('config-chave-pix').value.trim();
      const tipo = document.getElementById('config-chave-pix-tipo').value;
      if (chave && tipo === 'email' && !chave.includes('@')) { Utils.toast('A chave do tipo e-mail precisa ter @', 'error'); return; }
      if (chave && tipo === 'cpf' && ![11, 14].includes(chave.replace(/\D/g, '').length)) { Utils.toast('CPF tem 11 números e CNPJ tem 14', 'error'); return; }
      if (chave && !document.getElementById('config-pix-cidade').value.trim()) { Utils.toast('Informe a cidade — o banco exige no QR Code', 'error'); return; }
      for (const [k, id] of Object.entries(campos)) await DB.put('config', { chave: k, valor: document.getElementById(id).value.trim() });
      if (typeof Pix !== 'undefined') Pix.cache = null;
      Utils.toast(chave ? 'Pix salvo — o QR Code do Caixa já usa estes dados' : 'Chave Pix removida', 'ok');
    });
  },

  initMinhaConta() {
    this.renderMinhaConta();

    document.getElementById('btn-copiar-convite').addEventListener('click', async () => {
      const codigo = Auth.usuario && Auth.usuario.loja ? Auth.usuario.loja.codigoConvite : '';
      if (!codigo) return;
      try {
        await navigator.clipboard.writeText(codigo);
        Utils.toast('Código copiado!', 'ok');
      } catch (e) {
        Utils.toast('Código: ' + codigo, 'info');
      }
    });

    // Versão de demonstração: em vez de "sair", restaura a loja de exemplo
    const restaurarDemo = async () => {
      const ok = await Utils.confirmDialog('Restaurar a demonstração? Tudo o que você alterou será apagado e os dados de exemplo voltam ao estado inicial.');
      if (!ok) return;
      DemoAPI.restaurar();
      Auth.logout();
    };
    document.getElementById('btn-sair-conta').addEventListener('click', restaurarDemo);
    document.getElementById('btn-restaurar-demo-banner').addEventListener('click', restaurarDemo);
    const banner = document.getElementById('demo-banner');
    try { if (sessionStorage.getItem('vb_demo_banner_fechado') === '1') banner.classList.add('is-hidden'); } catch (e) { /* ok */ }
    document.getElementById('btn-fechar-demo-banner').addEventListener('click', () => {
      banner.classList.add('is-hidden');
      try { sessionStorage.setItem('vb_demo_banner_fechado', '1'); } catch (e) { /* ok */ }
    });
  },

  async recarregarTudo() {
    await Produtos.carregar();
    await Clientes.carregar();
    await Estoque.carregar();
    await Vendas.carregar();
    await Contas.carregar();
    await Encomendas.carregar();
    await this.mudarView(this.viewAtual);
  },

  async init() {
    await openDatabase();

    this.initNavegacao();
    this.initModal();
    this.initConfig();
    this.initMinhaConta();
    this.initNotificacoes();
    this.initMenuMobile();
    this.initAtalhos();
    await Perfil.init();
    this.aplicarPermissoes();
    if (this.ehAdmin()) this.initChavePix();
    Equipe.init();
    Importar.init();
    await Turno.init();

    Produtos.init();
    Combos.init();
    Fornecedores.init();
    Clientes.init();
    Fiado.init();
    Dashboard.init();
    Estoque.init();
    Vendas.init();
    Contas.init();
    Calculadora.init();
    Relatorios.init();
    Encomendas.init();
    await PDV.init();

    await Produtos.carregar();
    await Clientes.carregar();
    await Encomendas.carregar();

    // Primeiro uso: se não houver produtos, sugere carregar dados de exemplo
    const totalProdutos = await DB.count('produtos');
    if (totalProdutos === 0) {
      Utils.toast('Bem-vindo! Vá em Configurações para carregar dados de exemplo, se quiser testar o sistema.', 'info');
    }

    await Dashboard.render();

    document.getElementById('topbar-subtitle').textContent = this.dataPorExtenso();
    this.atualizarBadges();
    this.atualizarRelogio();
    setInterval(() => this.atualizarRelogio(), 30000);

    Realtime.init();
  },
};

document.addEventListener('DOMContentLoaded', () => {
  Auth.init().catch((err) => {
    console.error(err);
    Utils.toast('Erro ao iniciar o aplicativo: ' + err.message, 'error');
  });
});
