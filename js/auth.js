/* ==========================================================================
   auth.js — Sessão do usuário (versão de demonstração)
   Na versão de portfólio não há cadastro: o app entra direto com a conta
   fictícia da loja de exemplo. A lógica de sessão é a mesma da versão
   original; só a tela de login é pulada.
   ========================================================================== */

const Auth = {
  token: null,
  usuario: null,

  carregarSessaoSalva() {
    try {
      this.token = localStorage.getItem('vb_token') || null;
      const usuarioJson = localStorage.getItem('vb_usuario');
      this.usuario = usuarioJson ? JSON.parse(usuarioJson) : null;
    } catch (e) {
      this.token = null;
      this.usuario = null;
    }
  },

  salvarSessao(token, usuario) {
    this.token = token;
    this.usuario = usuario;
    try {
      localStorage.setItem('vb_token', token);
      localStorage.setItem('vb_usuario', JSON.stringify(usuario));
    } catch (e) { /* navegador sem armazenamento: fica só em memória */ }
  },

  limparSessao() {
    this.token = null;
    this.usuario = null;
    try {
      localStorage.removeItem('vb_token');
      localStorage.removeItem('vb_usuario');
    } catch (e) { /* ok */ }
  },

  async requisitar(caminho, body) {
    const res = await fetch('/api/auth/' + caminho, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {}),
    });
    const dados = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(dados.error || 'Erro ao entrar');
    return dados;
  },

  async login(email, senha) {
    const dados = await this.requisitar('login', { email, senha });
    this.salvarSessao(dados.token, dados.usuario);
    return dados.usuario;
  },

  async validarSessaoAtual() {
    if (!this.token) return false;
    try {
      const res = await fetch('/api/auth/me', { headers: { Authorization: 'Bearer ' + this.token } });
      if (!res.ok) return false;
      const dados = await res.json();
      this.usuario = dados.usuario;
      try { localStorage.setItem('vb_usuario', JSON.stringify(dados.usuario)); } catch (e) { /* ok */ }
      return true;
    } catch (e) {
      return false;
    }
  },

  logout() {
    this.limparSessao();
    window.location.reload();
  },

  esconderTela() {
    document.getElementById('auth-screen').classList.remove('is-visible');
    document.querySelector('.app-shell').style.display = '';
  },

  async entrarNoApp() {
    this.esconderTela();
    await App.init();
  },

  async init() {
    this.carregarSessaoSalva();
    const valida = await this.validarSessaoAtual();
    if (!valida) {
      this.limparSessao();
      await this.login(DemoAPI.email, DemoAPI.senha);
    }
    await this.entrarNoApp();
  },
};

window.Auth = Auth;
