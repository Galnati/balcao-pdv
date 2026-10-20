/* ==========================================================================
   equipe.js — Pessoas com acesso à loja e suas funções (Configurações)
   Só o administrador vê e altera. Novas pessoas entram pelo código de convite.
   ========================================================================== */

const Equipe = {
  async requisitar(metodo, caminho, body) {
    const res = await fetch('/api/auth/equipe' + (caminho || ''), {
      method: metodo,
      headers: Object.assign({ 'Content-Type': 'application/json' }, authHeader()),
      body: body ? JSON.stringify(body) : undefined,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Erro ao falar com o servidor');
    return json;
  },

  async render() {
    const box = document.getElementById('equipe-lista');
    if (!box || !App.ehAdmin()) return;
    let pessoas = [];
    try { pessoas = await this.requisitar('GET'); } catch (e) { box.innerHTML = `<p class="text-muted">${Utils.escapeHtml(e.message)}</p>`; return; }
    const eu = Auth.usuario ? Auth.usuario.id : null;
    box.innerHTML = pessoas.map((p) => `
      <div class="equipe-linha">
        <span class="avatar ${p.foto ? 'has-foto' : 'avatar--muted'}">${p.foto ? `<img src="${p.foto}" alt="">` : Perfil.iniciais(p.nome)}</span>
        <div class="equipe-linha__info"><strong>${Utils.escapeHtml(p.nome)}${p.id === eu ? ' (você)' : ''}</strong><small>${Utils.escapeHtml(p.email)}${p.cargo ? ' · ' + Utils.escapeHtml(p.cargo) : ''}</small></div>
        <select data-papel="${p.id}" ${p.id === eu ? 'title="Para deixar de ser administrador, promova outra pessoa antes"' : ''}>
          <option value="admin" ${p.papel === 'admin' ? 'selected' : ''}>Administrador</option>
          <option value="membro" ${p.papel !== 'admin' ? 'selected' : ''}>Caixa</option>
        </select>
        ${p.id === eu ? '<span style="width:34px"></span>' : `<button class="btn btn--sm btn--icon" data-remover="${p.id}" title="Remover acesso">✕</button>`}
      </div>`).join('') + '<p class="hint-text" style="margin-top:10px;">Para incluir alguém, passe o código de convite acima. A pessoa entra como <strong>Caixa</strong> e você pode mudar a função aqui.</p>';
  },

  init() {
    const box = document.getElementById('equipe-lista');
    box.addEventListener('change', async (e) => {
      const sel = e.target.closest('select[data-papel]');
      if (!sel) return;
      try {
        await this.requisitar('PUT', '/' + sel.dataset.papel, { papel: sel.value });
        Utils.toast('Função atualizada', 'ok');
        if (parseInt(sel.dataset.papel, 10) === Auth.usuario.id) { await Perfil.atualizarDoServidor(); App.aplicarPermissoes(); }
      } catch (err) { Utils.toast(err.message, 'error'); }
      this.render();
    });
    box.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-remover]');
      if (!b) return;
      const ok = await Utils.confirmDialog('Remover o acesso desta pessoa à loja? Ela não conseguirá mais entrar. As vendas que ela fez continuam registradas.');
      if (!ok) return;
      try { await this.requisitar('DELETE', '/' + b.dataset.remover); Utils.toast('Acesso removido', 'ok'); } catch (err) { Utils.toast(err.message, 'error'); }
      this.render();
    });
  },
};

window.Equipe = Equipe;
