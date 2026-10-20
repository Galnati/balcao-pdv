/* ==========================================================================
   perfil.js — Meu perfil: foto, dados pessoais e senha do usuário logado
   Os dados ficam na conta do usuário no servidor (valem em todos os aparelhos).
   ========================================================================== */

const Perfil = {
  async salvarNoServidor(dados) {
    const res = await fetch('/api/auth/perfil', {
      method: 'PUT',
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeader()),
      body: JSON.stringify(dados),
    });
    const json = await res.json().catch(() => ({}));
    if (res.status === 401) { Auth.logout(); throw new Error('Sessão expirada'); }
    if (!res.ok) throw new Error(json.error || 'Não foi possível salvar');
    // Atualiza a sessão salva neste aparelho com os dados novos
    Auth.salvarSessao(Auth.token, json.usuario);
    return json.usuario;
  },

  iniciais(nome) {
    return (nome || '?').split(' ').filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
  },

  // Atualiza todos os avatares do app (topo e tela de perfil)
  aplicarAvatar() {
    const u = Auth.usuario || {};
    ['topbar-avatar', 'perfil-avatar'].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = u.foto ? `<img src="${u.foto}" alt="Foto de ${Utils.escapeHtml(u.nome || '')}">` : this.iniciais(u.nome);
      el.classList.toggle('has-foto', !!u.foto);
    });
    const remover = document.getElementById('btn-remover-foto-usuario');
    if (remover) remover.style.display = u.foto ? '' : 'none';
    const enviar = document.getElementById('btn-foto-usuario-2');
    if (enviar) enviar.textContent = u.foto ? 'Trocar foto' : 'Enviar foto';
    const top = document.getElementById('topbar-avatar');
    if (top) top.title = 'Meu perfil — ' + (u.nome || '');
  },

  preencherFormulario() {
    const u = Auth.usuario || {};
    document.getElementById('perfil-nome').value = u.nome || '';
    document.getElementById('perfil-email').value = u.email || '';
    document.getElementById('perfil-telefone').value = u.telefone || '';
    document.getElementById('perfil-cargo').value = u.cargo || '';
    this.marcarAlterado(false);
  },

  render() {
    const u = Auth.usuario || {};
    this.aplicarAvatar();
    document.getElementById('perfil-nome-view').textContent = u.nome || '—';
    document.getElementById('perfil-cargo-view').textContent = u.cargo || 'Função não informada';
    document.getElementById('perfil-loja-view').textContent = u.loja ? u.loja.nome : '—';
    document.getElementById('perfil-papel-view').textContent = u.papel === 'admin' ? 'Administrador' : 'Caixa';
    document.getElementById('perfil-desde-view').textContent = u.criadoEm
      ? new Date(u.criadoEm).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      : '—';
    // Não sobrescreve o que a pessoa está digitando (ex.: atualização em tempo real)
    if (!this.alterado) this.preencherFormulario();
  },

  alterado: false,
  marcarAlterado(sim) {
    this.alterado = sim;
    document.getElementById('perfil-status').textContent = sim ? 'Alterações não salvas' : '';
    document.getElementById('btn-perfil-desfazer').style.visibility = sim ? 'visible' : 'hidden';
  },

  async enviarFoto(arquivo) {
    if (!arquivo) return;
    if (!arquivo.type.startsWith('image/')) { Utils.toast('Escolha um arquivo de imagem (JPG ou PNG)', 'error'); return; }
    try {
      const foto = await Utils.redimensionarImagem(arquivo, 320, 0.85);
      await this.salvarNoServidor({ foto });
      this.render();
      App.renderMinhaConta();
      Utils.toast('Foto atualizada!', 'ok');
    } catch (err) {
      Utils.toast('Não foi possível salvar a foto: ' + err.message, 'error');
    }
  },

  // Quem já tinha enviado foto pela tela de Configurações (versão anterior)
  // tem a foto levada automaticamente para o perfil.
  async migrarFotoAntiga() {
    const u = Auth.usuario;
    if (!u || u.foto) return;
    try {
      const cfg = await DB.get('config', 'fotoUsuario-' + u.id);
      if (cfg && cfg.valor) {
        await this.salvarNoServidor({ foto: cfg.valor });
        await DB.put('config', { chave: 'fotoUsuario-' + u.id, valor: '' });
        this.aplicarAvatar();
      }
    } catch (e) { /* nada a migrar */ }
  },

  async atualizarDoServidor() {
    // Busca os dados mais recentes (ex.: perfil alterado em outro aparelho)
    try {
      const res = await fetch('/api/auth/me', { headers: authHeader() });
      if (res.ok) {
        const json = await res.json();
        Auth.salvarSessao(Auth.token, json.usuario);
      }
    } catch (e) { /* segue com a sessão salva */ }
  },

  async init() {
    await this.atualizarDoServidor();
    this.aplicarAvatar();
    this.migrarFotoAntiga();

    const input = document.getElementById('input-foto-usuario');
    ['btn-foto-usuario', 'btn-foto-usuario-2'].forEach((id) => document.getElementById(id).addEventListener('click', () => input.click()));
    input.addEventListener('change', () => { const f = input.files[0]; input.value = ''; this.enviarFoto(f); });

    document.getElementById('btn-remover-foto-usuario').addEventListener('click', async () => {
      const ok = await Utils.confirmDialog('Remover sua foto de perfil?');
      if (!ok) return;
      try {
        await this.salvarNoServidor({ foto: '' });
        this.render();
        Utils.toast('Foto removida', 'ok');
      } catch (err) { Utils.toast(err.message, 'error'); }
    });

    const form = document.getElementById('form-perfil');
    form.addEventListener('input', () => this.marcarAlterado(true));
    document.getElementById('btn-perfil-desfazer').addEventListener('click', () => this.preencherFormulario());
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btn-perfil-salvar');
      btn.disabled = true;
      try {
        await this.salvarNoServidor({
          nome: document.getElementById('perfil-nome').value,
          email: document.getElementById('perfil-email').value,
          telefone: document.getElementById('perfil-telefone').value,
          cargo: document.getElementById('perfil-cargo').value,
        });
        this.marcarAlterado(false);
        this.render();
        App.renderMinhaConta();
        Utils.toast('Dados atualizados!', 'ok');
      } catch (err) {
        Utils.toast(err.message, 'error');
      } finally {
        btn.disabled = false;
      }
    });

    document.getElementById('form-senha').addEventListener('submit', async (e) => {
      e.preventDefault();
      const atual = document.getElementById('senha-atual').value;
      const nova = document.getElementById('senha-nova').value;
      const conf = document.getElementById('senha-confirma').value;
      if (!atual || !nova) { Utils.toast('Preencha a senha atual e a nova senha', 'error'); return; }
      if (nova.length < 4) { Utils.toast('A nova senha deve ter pelo menos 4 caracteres', 'error'); return; }
      if (nova !== conf) { Utils.toast('As duas senhas novas não são iguais', 'error'); return; }
      try {
        await this.salvarNoServidor({ senhaAtual: atual, novaSenha: nova });
        e.target.reset();
        Utils.toast('Senha alterada!', 'ok');
      } catch (err) { Utils.toast(err.message, 'error'); }
    });

    this.marcarAlterado(false);
  },
};

window.Perfil = Perfil;
