/* ==========================================================================
   combos.js — Combos / Promoções (kits de produtos vendidos por um preço fixo)
   ========================================================================== */

const Combos = {
  cache: [],

  async carregar() {
    this.cache = await DB.getAll('combos');
    this.cache.sort((a, b) => a.nome.localeCompare(b.nome));
    return this.cache;
  },

  async listarAtivos() {
    await this.carregar();
    return this.cache.filter((c) => c.ativo !== false);
  },

  async buscarPorId(id) {
    return DB.get('combos', id);
  },

  precoNormalSoma(combo, produtos) {
    return combo.itens.reduce((sum, it) => {
      const p = produtos.find((pr) => pr.id === it.produtoId);
      return sum + (p ? p.precoVenda * it.quantidade : 0);
    }, 0);
  },

  async renderTabela() {
    const tbody = document.getElementById('combos-table-body');
    await this.carregar();
    const produtos = await Produtos.listarAtivos();

    if (!this.cache.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Nenhum combo cadastrado</td></tr>';
      return;
    }

    tbody.innerHTML = this.cache.map((c) => {
      const precoNormal = this.precoNormalSoma(c, produtos);
      const economia = Math.max(0, precoNormal - c.precoVenda);
      return `
      <tr>
        <td><strong>${Utils.escapeHtml(c.nome)}</strong></td>
        <td>${c.itens.map((it) => {
          const p = produtos.find((pr) => pr.id === it.produtoId);
          return Utils.escapeHtml((it.quantidade + 'x ' + (p ? p.nome : 'produto removido')));
        }).join(', ')}</td>
        <td class="text-right">${Utils.formatMoney(precoNormal)}</td>
        <td class="text-right"><strong>${Utils.formatMoney(c.precoVenda)}</strong>${economia > 0 ? '<br><small class="text-muted">economia ' + Utils.formatMoney(economia) + '</small>' : ''}</td>
        <td class="btn-row">
          <button class="btn btn--sm btn--icon" data-action="editar-combo" data-id="${c.id}" title="Editar">✏️</button>
          <button class="btn btn--sm btn--icon" data-action="excluir-combo" data-id="${c.id}" title="Excluir">✕</button>
        </td>
      </tr>`;
    }).join('');
  },

  async abrirFormulario(combo = null) {
    const isEdit = !!combo;
    const c = combo || { nome: '', precoVenda: 0, ativo: true, itens: [] };
    const produtos = await Produtos.listarAtivos();

    const itensIniciais = c.itens.length ? c.itens : [{ produtoId: produtos[0] ? produtos[0].id : '', quantidade: 1 }];

    const linhaItemHtml = (item, idx) => `
      <div class="combo-item-linha" data-idx="${idx}">
        <select class="combo-produto-select">
          ${produtos.map((p) => `<option value="${p.id}" ${item.produtoId === p.id ? 'selected' : ''}>${Utils.escapeHtml(p.nome)}</option>`).join('')}
        </select>
        <input type="number" class="combo-qtd-input" min="1" value="${item.quantidade}">
        <button type="button" class="btn btn--sm btn--icon" data-action="remover-item-combo">✕</button>
      </div>`;

    const body = `
      <form id="form-combo">
        <div class="field field--full">
          <label>Nome do combo *</label>
          <input type="text" id="f-combo-nome" required value="${Utils.escapeHtml(c.nome)}" placeholder="Ex: Combo Churrasco (leve 3 pague 2)">
        </div>
        <div class="field field--full" style="margin-top:10px;">
          <label>Produtos do kit</label>
          <div id="combo-itens-lista">${itensIniciais.map(linhaItemHtml).join('')}</div>
          <button type="button" class="btn btn--ghost btn--sm" id="btn-add-item-combo" style="margin-top:6px;">+ Adicionar produto ao kit</button>
        </div>
        <div class="field" style="margin-top:10px;">
          <label>Preço de venda do combo (R$) *</label>
          <input type="text" id="f-combo-preco" required value="${c.precoVenda ? c.precoVenda.toFixed(2).replace('.', ',') : '0,00'}">
        </div>
        <div class="field" style="margin-top:10px;">
          <label><input type="checkbox" id="f-combo-ativo" ${c.ativo !== false ? 'checked' : ''}> Combo ativo (aparece no PDV)</label>
        </div>
        <div class="modal__footer">
          <button type="button" class="btn" id="btn-cancelar-combo">Cancelar</button>
          <button type="submit" class="btn btn--primary">${isEdit ? 'Salvar alterações' : 'Cadastrar combo'}</button>
        </div>
      </form>
    `;

    App.abrirModal(isEdit ? 'Editar combo' : 'Novo combo', body);
    document.getElementById('btn-cancelar-combo').addEventListener('click', () => App.fecharModal());

    document.getElementById('btn-add-item-combo').addEventListener('click', () => {
      const lista = document.getElementById('combo-itens-lista');
      const div = document.createElement('div');
      div.innerHTML = linhaItemHtml({ produtoId: produtos[0] ? produtos[0].id : '', quantidade: 1 }, lista.children.length);
      lista.appendChild(div.firstElementChild);
    });

    document.getElementById('combo-itens-lista').addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action="remover-item-combo"]');
      if (!btn) return;
      const linha = btn.closest('.combo-item-linha');
      if (document.querySelectorAll('.combo-item-linha').length > 1) linha.remove();
      else Utils.toast('O combo precisa ter ao menos um produto', 'error');
    });

    document.getElementById('form-combo').addEventListener('submit', async (e) => {
      e.preventDefault();
      const itens = Array.from(document.querySelectorAll('.combo-item-linha')).map((linha) => ({
        produtoId: parseInt(linha.querySelector('.combo-produto-select').value, 10),
        quantidade: Math.max(1, parseInt(linha.querySelector('.combo-qtd-input').value, 10) || 1),
      }));

      const novo = {
        ...(isEdit ? { id: c.id } : {}),
        nome: document.getElementById('f-combo-nome').value.trim(),
        itens,
        precoVenda: Utils.parseMoneyInput(document.getElementById('f-combo-preco').value),
        ativo: document.getElementById('f-combo-ativo').checked,
      };
      if (!novo.nome) { Utils.toast('Informe o nome do combo', 'error'); return; }
      if (!novo.itens.length) { Utils.toast('Adicione ao menos um produto ao combo', 'error'); return; }
      if (!novo.precoVenda || novo.precoVenda <= 0) { Utils.toast('Informe o preço de venda do combo', 'error'); return; }

      if (isEdit) await DB.put('combos', novo); else await DB.add('combos', novo);
      App.fecharModal();
      Utils.toast(isEdit ? 'Combo atualizado!' : 'Combo cadastrado!', 'ok');
      this.renderTabela();
    });
  },

  init() {
    document.getElementById('btn-novo-combo').addEventListener('click', () => this.abrirFormulario());
    document.getElementById('combos-table-body').addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = parseInt(btn.dataset.id, 10);
      if (btn.dataset.action === 'editar-combo') {
        const combo = await this.buscarPorId(id);
        this.abrirFormulario(combo);
      } else if (btn.dataset.action === 'excluir-combo') {
        const ok = await Utils.confirmDialog('Deseja realmente excluir este combo?');
        if (ok) {
          await DB.delete('combos', id);
          Utils.toast('Combo excluído', 'ok');
          this.renderTabela();
        }
      }
    });
  },
};

window.Combos = Combos;
