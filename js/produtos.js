/* ==========================================================================
   produtos.js — Cadastro de Produtos
   ========================================================================== */

const CATEGORIAS_PADRAO = ['Cerveja', 'Refrigerante', 'Água', 'Suco', 'Destilado', 'Vinho', 'Energético', 'Isotônico', 'Outros'];
const UNIDADES_PADRAO = ['Unidade', 'Litro', 'Caixa', 'Fardo', 'Pacote', 'Garrafa', 'Lata'];

const Produtos = {
  cache: [],
  categoriasCustom: [],

  async carregar() {
    this.cache = await DB.getAll('produtos');
    this.cache.sort((a, b) => a.nome.localeCompare(b.nome));
    return this.cache;
  },

  async carregarCategoriasCustom() {
    const config = await DB.get('config', 'categoriasCustom');
    this.categoriasCustom = (config && Array.isArray(config.valor)) ? config.valor : [];
    return this.categoriasCustom;
  },

  async adicionarCategoriaCustom(nome) {
    nome = nome.trim();
    if (!nome) return false;
    const jaExiste = this.categoriasEmUso().some((c) => c.toLowerCase() === nome.toLowerCase());
    if (jaExiste) return false;
    this.categoriasCustom.push(nome);
    await DB.put('config', { chave: 'categoriasCustom', valor: this.categoriasCustom });
    return true;
  },

  async listarAtivos() {
    if (!this.cache.length) await this.carregar();
    return this.cache.filter((p) => p.ativo !== false);
  },

  async buscarPorId(id) {
    return DB.get('produtos', id);
  },

  margem(custo, venda) {
    if (!venda) return 0;
    return ((venda - custo) / venda) * 100;
  },

  async salvar(produto) {
    if (produto.id) {
      produto.atualizadoEm = Utils.nowISO();
      await DB.put('produtos', produto);
    } else {
      produto.criadoEm = Utils.nowISO();
      produto.atualizadoEm = produto.criadoEm;
      produto.id = await DB.add('produtos', produto);
    }
    await this.carregar();
    return produto;
  },

  async excluir(id) {
    await DB.delete('produtos', id);
    await this.carregar();
  },

  categoriasEmUso() {
    const usadas = this.cache.map((p) => p.categoria).filter(Boolean);
    return Array.from(new Set([...CATEGORIAS_PADRAO, ...this.categoriasCustom, ...usadas])).sort((a, b) => a.localeCompare(b));
  },

  renderCategoriaOptions(selectEl, selecionado) {
    const valorAtual = selecionado !== undefined ? selecionado : selectEl.value;
    selectEl.innerHTML = '<option value="">Todas categorias</option>' +
      this.categoriasEmUso().map((c) => `<option value="${c}" ${c === valorAtual ? 'selected' : ''}>${c}</option>`).join('');
  },

  async renderTabela() {
    const tbody = document.getElementById('produtos-table-body');
    const termo = (document.getElementById('produtos-search').value || '').toLowerCase();
    const categoria = document.getElementById('produtos-filtro-categoria').value;

    await this.carregar();
    this.renderCategoriaOptions(document.getElementById('produtos-filtro-categoria'), categoria);
    let lista = this.cache;
    if (termo) {
      lista = lista.filter((p) => p.nome.toLowerCase().includes(termo) || (p.sku || '').toLowerCase().includes(termo));
    }
    if (categoria) {
      lista = lista.filter((p) => p.categoria === categoria);
    }

    if (!lista.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="10">Nenhum produto encontrado</td></tr>';
      return;
    }

    tbody.innerHTML = lista.map((p) => {
      const margem = this.margem(p.precoCusto, p.precoVenda);
      const estoqueBaixo = p.estoqueAtual <= (p.estoqueMinimo || 0);
      const foto = p.foto
        ? `<img src="${p.foto}" alt="" class="produto-thumb">`
        : `<div class="produto-thumb produto-thumb--vazio">○</div>`;
      return `
        <tr>
          <td>${Utils.escapeHtml(p.sku || '-')}</td>
          <td><div class="produto-nome-cell">${foto}<div><strong>${Utils.escapeHtml(p.nome)}</strong><br><small class="text-muted">${Utils.escapeHtml(p.unidade || '')}${p.unidadesPorCaixa > 1 ? ` · cx c/ ${p.unidadesPorCaixa} un.` : ''}</small></div></div></td>
          <td>${Utils.escapeHtml(p.categoria || '-')}</td>
          <td class="text-right">${Utils.formatMoney(p.precoCusto)}</td>
          <td class="text-right">${Utils.formatMoney(p.precoVenda)}</td>
          <td class="text-right">${margem.toFixed(1)}%</td>
          <td class="text-right">${estoqueBaixo ? '<span class="badge badge--danger">' + p.estoqueAtual + '</span>' : p.estoqueAtual}</td>
          <td>${Utils.badgeValidade(p.validade)}</td>
          <td>${p.ativo === false ? '<span class="badge badge--muted">Inativo</span>' : '<span class="badge badge--success">Ativo</span>'}</td>
          <td class="btn-row">
            <button class="btn btn--sm btn--icon" data-action="editar-produto" data-id="${p.id}" title="Editar">✏️</button>
            <button class="btn btn--sm btn--icon" data-action="excluir-produto" data-id="${p.id}" title="Excluir">✕</button>
          </td>
        </tr>`;
    }).join('');
  },

  abrirFormulario(produto = null) {
    const isEdit = !!produto;
    const p = produto || { sku: '', nome: '', categoria: '', unidade: 'Unidade', unidadesPorCaixa: 1, precoCusto: 0, precoVenda: 0, estoqueAtual: 0, estoqueMinimo: 5, fornecedor: '', ativo: true, foto: '', validade: '' };

    const body = `
      <form id="form-produto">
        <div class="field field--full produto-foto-field">
          <label>Foto do produto</label>
          <div class="produto-foto-row">
            <img id="f-foto-preview" class="produto-foto-preview ${p.foto ? '' : 'is-vazio'}" src="${p.foto || ''}" alt="">
            <div class="btn-row">
              <input type="file" id="f-foto" accept="image/*" style="display:none;">
              <button type="button" class="btn btn--sm" id="btn-escolher-foto">Escolher foto</button>
              <button type="button" class="btn btn--sm btn--icon" id="btn-remover-foto" title="Remover foto" style="${p.foto ? '' : 'display:none;'}">✕</button>
            </div>
          </div>
        </div>
        <div class="form-grid">
          <div class="field">
            <label>Nome do produto *</label>
            <input type="text" id="f-nome" required value="${Utils.escapeHtml(p.nome)}">
          </div>
          <div class="field">
            <label>Código / SKU</label>
            <input type="text" id="f-sku" value="${Utils.escapeHtml(p.sku || '')}">
          </div>
          <div class="field">
            <label>Categoria</label>
            <div style="display:flex; gap:6px;">
              <select id="f-categoria" style="flex:1;">
                <option value="">Selecione...</option>
                ${this.categoriasEmUso().map((c) => `<option value="${Utils.escapeHtml(c)}" ${c === p.categoria ? 'selected' : ''}>${Utils.escapeHtml(c)}</option>`).join('')}
              </select>
              <button type="button" class="btn btn--sm" id="btn-nova-categoria" title="Cadastrar nova categoria">+ Nova</button>
            </div>
            <div class="btn-row" id="nova-categoria-row" style="display:none; margin-top:6px;">
              <input type="text" id="f-nova-categoria-nome" placeholder="Nome da nova categoria" style="flex:1;">
              <button type="button" class="btn btn--sm btn--primary" id="btn-confirmar-categoria">Adicionar</button>
              <button type="button" class="btn btn--sm btn--icon" id="btn-cancelar-nova-categoria">✕</button>
            </div>
          </div>
          <div class="field">
            <label>Unidade de venda</label>
            <select id="f-unidade">
              ${UNIDADES_PADRAO.map((u) => `<option value="${u}" ${u === p.unidade ? 'selected' : ''}>${u}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Unidades por caixa</label>
            <input type="number" id="f-unidades-caixa" step="1" min="1" value="${p.unidadesPorCaixa || 1}" placeholder="Ex: 12">
            <small class="text-muted">Quantas unidades vêm em cada caixa/fardo deste produto (usado ao dar entrada em estoque por caixa).</small>
          </div>
          <div class="field">
            <label>Preço de custo (R$) *</label>
            <input type="text" id="f-custo" required value="${p.precoCusto ? p.precoCusto.toFixed(2).replace('.', ',') : '0,00'}">
          </div>
          <div class="field">
            <label>Preço de venda (R$) *</label>
            <input type="text" id="f-venda" required value="${p.precoVenda ? p.precoVenda.toFixed(2).replace('.', ',') : '0,00'}">
          </div>
          <div class="field">
            <label>Estoque atual (unidades)</label>
            <input type="number" id="f-estoque" step="1" value="${p.estoqueAtual}">
          </div>
          <div class="field" id="f-estoque-caixas-field" style="display:none;">
            <label id="f-estoque-caixas-label">Ou em caixas</label>
            <input type="number" id="f-estoque-caixas" step="1" min="0" placeholder="Ex: 5">
          </div>
          <div class="field">
            <label>Estoque mínimo (alerta)</label>
            <input type="number" id="f-estoque-min" step="1" value="${p.estoqueMinimo}">
          </div>
          <div class="field">
            <label>Fornecedor</label>
            <input type="text" id="f-fornecedor" value="${Utils.escapeHtml(p.fornecedor || '')}">
          </div>
          <div class="field">
            <label>Data de validade (opcional)</label>
            <input type="date" id="f-validade" value="${p.validade || ''}">
            <small class="text-muted">Útil pra bebidas com prazo curto — o dashboard avisa quando estiver perto de vencer.</small>
          </div>
          <div class="field">
            <label>Margem estimada</label>
            <input type="text" id="f-margem-preview" disabled value="${this.margem(p.precoCusto, p.precoVenda).toFixed(1)}%">
          </div>
          <div class="field checkbox-field field--full">
            <input type="checkbox" id="f-ativo" ${p.ativo !== false ? 'checked' : ''}>
            <label style="margin:0;">Produto ativo (disponível para venda)</label>
          </div>
        </div>
        <div class="modal__footer">
          <button type="button" class="btn" id="btn-cancelar-produto">Cancelar</button>
          <button type="submit" class="btn btn--primary">${isEdit ? 'Salvar alterações' : 'Cadastrar produto'}</button>
        </div>
      </form>
    `;

    App.abrirModal(isEdit ? 'Editar produto' : 'Novo produto', body);

    // ---- Foto do produto ----
    let fotoAtual = p.foto || '';
    const fotoInput = document.getElementById('f-foto');
    const fotoPreview = document.getElementById('f-foto-preview');
    const btnRemoverFoto = document.getElementById('btn-remover-foto');

    document.getElementById('btn-escolher-foto').addEventListener('click', () => fotoInput.click());
    fotoInput.addEventListener('change', async () => {
      const arquivo = fotoInput.files[0];
      if (!arquivo) return;
      if (!arquivo.type.startsWith('image/')) { Utils.toast('Selecione um arquivo de imagem', 'error'); return; }
      try {
        fotoAtual = await Utils.redimensionarImagem(arquivo);
        fotoPreview.src = fotoAtual;
        fotoPreview.classList.remove('is-vazio');
        btnRemoverFoto.style.display = '';
      } catch (err) {
        Utils.toast('Não foi possível processar essa imagem', 'error');
      }
    });
    btnRemoverFoto.addEventListener('click', () => {
      fotoAtual = '';
      fotoInput.value = '';
      fotoPreview.src = '';
      fotoPreview.classList.add('is-vazio');
      btnRemoverFoto.style.display = 'none';
    });

    const updatePreview = () => {
      const custo = Utils.parseMoneyInput(document.getElementById('f-custo').value);
      const venda = Utils.parseMoneyInput(document.getElementById('f-venda').value);
      document.getElementById('f-margem-preview').value = this.margem(custo, venda).toFixed(1) + '%';
    };
    document.getElementById('f-custo').addEventListener('input', updatePreview);
    document.getElementById('f-venda').addEventListener('input', updatePreview);

    document.getElementById('btn-cancelar-produto').addEventListener('click', () => App.fecharModal());

    // ---- Categoria: cadastrar nova ----
    const novaCategoriaRow = document.getElementById('nova-categoria-row');
    const novaCategoriaInput = document.getElementById('f-nova-categoria-nome');
    const selectCategoria = document.getElementById('f-categoria');

    document.getElementById('btn-nova-categoria').addEventListener('click', () => {
      novaCategoriaRow.style.display = 'flex';
      novaCategoriaInput.focus();
    });
    document.getElementById('btn-cancelar-nova-categoria').addEventListener('click', () => {
      novaCategoriaRow.style.display = 'none';
      novaCategoriaInput.value = '';
    });
    const confirmarNovaCategoria = async () => {
      const nome = novaCategoriaInput.value.trim();
      if (!nome) { Utils.toast('Digite o nome da nova categoria', 'error'); return; }
      const adicionada = await this.adicionarCategoriaCustom(nome);
      if (adicionada) {
        const opt = document.createElement('option');
        opt.value = nome;
        opt.textContent = nome;
        selectCategoria.appendChild(opt);
        Utils.toast('Categoria cadastrada!', 'ok');
      }
      selectCategoria.value = nome;
      novaCategoriaRow.style.display = 'none';
      novaCategoriaInput.value = '';
    };
    document.getElementById('btn-confirmar-categoria').addEventListener('click', confirmarNovaCategoria);
    novaCategoriaInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); confirmarNovaCategoria(); }
    });

    // ---- Unidades por caixa: entrada de estoque em caixas ----
    const unidadesCaixaInput = document.getElementById('f-unidades-caixa');
    const estoqueInput = document.getElementById('f-estoque');
    const estoqueCaixasField = document.getElementById('f-estoque-caixas-field');
    const estoqueCaixasLabel = document.getElementById('f-estoque-caixas-label');
    const estoqueCaixasInput = document.getElementById('f-estoque-caixas');

    const atualizarCampoCaixasEstoque = () => {
      const unidadesPorCaixa = parseInt(unidadesCaixaInput.value, 10) || 1;
      if (unidadesPorCaixa > 1) {
        estoqueCaixasField.style.display = '';
        estoqueCaixasLabel.textContent = `Ou em caixas (cx c/ ${unidadesPorCaixa} un.)`;
      } else {
        estoqueCaixasField.style.display = 'none';
        estoqueCaixasInput.value = '';
      }
    };
    unidadesCaixaInput.addEventListener('input', atualizarCampoCaixasEstoque);
    estoqueCaixasInput.addEventListener('input', () => {
      const unidadesPorCaixa = parseInt(unidadesCaixaInput.value, 10) || 1;
      const caixas = parseInt(estoqueCaixasInput.value, 10) || 0;
      estoqueInput.value = caixas * unidadesPorCaixa;
    });
    atualizarCampoCaixasEstoque();

    document.getElementById('form-produto').addEventListener('submit', async (e) => {
      e.preventDefault();
      const novo = {
        ...(isEdit ? { id: p.id, criadoEm: p.criadoEm } : {}),
        nome: document.getElementById('f-nome').value.trim(),
        sku: document.getElementById('f-sku').value.trim(),
        categoria: document.getElementById('f-categoria').value.trim(),
        unidade: document.getElementById('f-unidade').value,
        unidadesPorCaixa: parseInt(document.getElementById('f-unidades-caixa').value, 10) || 1,
        precoCusto: Utils.parseMoneyInput(document.getElementById('f-custo').value),
        precoVenda: Utils.parseMoneyInput(document.getElementById('f-venda').value),
        estoqueAtual: parseInt(document.getElementById('f-estoque').value, 10) || 0,
        estoqueMinimo: parseInt(document.getElementById('f-estoque-min').value, 10) || 0,
        fornecedor: document.getElementById('f-fornecedor').value.trim(),
        validade: document.getElementById('f-validade').value || '',
        ativo: document.getElementById('f-ativo').checked,
        foto: fotoAtual,
      };
      if (!novo.nome) { Utils.toast('Informe o nome do produto', 'error'); return; }

      const estoqueAnterior = isEdit ? p.estoqueAtual : 0;
      await this.salvar(novo);

      if (isEdit && novo.estoqueAtual !== estoqueAnterior) {
        const diff = novo.estoqueAtual - estoqueAnterior;
        await Estoque.registrarMovimentacao({
          produtoId: novo.id,
          tipo: 'ajuste',
          quantidade: diff,
          motivo: 'Ajuste manual via cadastro de produto',
        }, false);
      }

      App.fecharModal();
      Utils.toast(isEdit ? 'Produto atualizado!' : 'Produto cadastrado!', 'ok');
      await this.renderTabela();
      if (typeof Estoque !== 'undefined') Estoque.renderTudo();
      if (typeof Dashboard !== 'undefined') Dashboard.render();
    });
  },

  async init() {
    await this.carregarCategoriasCustom();
    document.getElementById('btn-novo-produto').addEventListener('click', () => this.abrirFormulario());
    document.getElementById('produtos-search').addEventListener('input', Utils.debounce(() => this.renderTabela(), 200));
    document.getElementById('produtos-filtro-categoria').addEventListener('change', () => this.renderTabela());
    this.renderCategoriaOptions(document.getElementById('produtos-filtro-categoria'));

    document.getElementById('produtos-table-body').addEventListener('click', async (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const id = parseInt(btn.dataset.id, 10);
      if (btn.dataset.action === 'editar-produto') {
        const produto = await this.buscarPorId(id);
        this.abrirFormulario(produto);
      } else if (btn.dataset.action === 'excluir-produto') {
        const ok = await Utils.confirmDialog('Deseja realmente excluir este produto? Esta ação não pode ser desfeita.');
        if (ok) {
          await this.excluir(id);
          Utils.toast('Produto excluído', 'ok');
          this.renderTabela();
        }
      }
    });

    document.getElementById('produtos-tab-btn-produtos').addEventListener('click', () => this.mostrarTab('produtos'));
    document.getElementById('produtos-tab-btn-combos').addEventListener('click', () => this.mostrarTab('combos'));
  },

  mostrarTab(tab) {
    document.getElementById('produtos-tab-produtos').style.display = tab === 'produtos' ? '' : 'none';
    document.getElementById('produtos-tab-combos').style.display = tab === 'combos' ? '' : 'none';
    document.getElementById('produtos-tab-btn-produtos').classList.toggle('is-active', tab === 'produtos');
    document.getElementById('produtos-tab-btn-combos').classList.toggle('is-active', tab === 'combos');
    if (tab === 'combos' && typeof Combos !== 'undefined') Combos.renderTabela();
  },
};
