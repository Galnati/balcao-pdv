/* ==========================================================================
   importar.js — Importar produtos de uma planilha (CSV salvo pelo Excel)
   Atualiza os produtos que já existem (pelo código ou pelo nome) e cria os novos.
   ========================================================================== */

const Importar = {
  COLUNAS: {
    nome: ['nome', 'produto', 'descricao', 'nome do produto'],
    sku: ['codigo', 'cod', 'sku', 'codigo de barras', 'ean', 'referencia'],
    categoria: ['categoria', 'tipo', 'grupo'],
    precoCusto: ['custo', 'preco de custo', 'preco custo', 'valor de custo', 'custo unitario'],
    precoVenda: ['venda', 'preco', 'preco de venda', 'preco venda', 'valor', 'valor de venda'],
    estoqueAtual: ['estoque', 'quantidade', 'qtd', 'estoque atual', 'saldo'],
    estoqueMinimo: ['minimo', 'estoque minimo', 'qtd minima'],
    fornecedor: ['fornecedor', 'distribuidor'],
    validade: ['validade', 'vencimento', 'data de validade'],
    unidade: ['unidade', 'un', 'medida'],
    unidadesPorCaixa: ['unidades por caixa', 'un por caixa', 'por caixa', 'fardo', 'unidades por fardo'],
  },

  normalizar(t) {
    return String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  },

  // Lê CSV com ; ou , como separador (respeita aspas)
  lerCSV(texto) {
    texto = texto.replace(/^﻿/, '');
    const primeira = texto.split(/\r?\n/)[0] || '';
    const sep = (primeira.match(/;/g) || []).length >= (primeira.match(/,/g) || []).length ? ';' : ',';
    const linhas = [];
    let campo = '', linha = [], aspas = false;
    for (let i = 0; i < texto.length; i++) {
      const ch = texto[i];
      if (aspas) {
        if (ch === '"' && texto[i + 1] === '"') { campo += '"'; i++; } else if (ch === '"') aspas = false; else campo += ch;
      } else if (ch === '"') aspas = true;
      else if (ch === sep) { linha.push(campo); campo = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && texto[i + 1] === '\n') i++;
        linha.push(campo); campo = '';
        if (linha.some((c) => c.trim() !== '')) linhas.push(linha);
        linha = [];
      } else campo += ch;
    }
    linha.push(campo);
    if (linha.some((c) => c.trim() !== '')) linhas.push(linha);
    return linhas;
  },

  numero(v) {
    const s = String(v || '').replace(/[R$\s]/g, '');
    if (!s) return null;
    const n = s.includes(',') ? parseFloat(s.replace(/\./g, '').replace(',', '.')) : parseFloat(s);
    return isNaN(n) ? null : n;
  },

  data(v) {
    const s = String(v || '').trim();
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (m) { const ano = m[3].length === 2 ? '20' + m[3] : m[3]; return `${ano}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
    m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}-${m[3]}` : '';
  },

  interpretar(linhas) {
    const cab = linhas[0].map((c) => this.normalizar(c));
    const mapa = {};
    Object.entries(this.COLUNAS).forEach(([campo, nomes]) => {
      const idx = cab.findIndex((c) => nomes.includes(c));
      if (idx >= 0) mapa[campo] = idx;
    });
    if (mapa.nome === undefined) throw new Error('A planilha precisa ter uma coluna "Nome" (ou "Produto").');
    const itens = [];
    const erros = [];
    linhas.slice(1).forEach((l, i) => {
      const val = (c) => (mapa[c] !== undefined ? (l[mapa[c]] || '').trim() : '');
      const nome = val('nome');
      if (!nome) { erros.push(`Linha ${i + 2}: sem nome`); return; }
      itens.push({
        nome,
        sku: val('sku'),
        categoria: val('categoria'),
        precoCusto: this.numero(val('precoCusto')),
        precoVenda: this.numero(val('precoVenda')),
        estoqueAtual: this.numero(val('estoqueAtual')),
        estoqueMinimo: this.numero(val('estoqueMinimo')),
        fornecedor: val('fornecedor'),
        validade: this.data(val('validade')),
        unidade: val('unidade'),
        unidadesPorCaixa: this.numero(val('unidadesPorCaixa')),
      });
    });
    return { itens, erros, colunas: Object.keys(mapa) };
  },

  baixarModelo() {
    Utils.baixarCSV('modelo-produtos-balcao.csv', [
      ['Nome', 'Código', 'Categoria', 'Custo', 'Venda', 'Estoque', 'Mínimo', 'Fornecedor', 'Validade', 'Unidades por caixa'],
      ['Cerveja Lata 350ml', '7891234567890', 'Cerveja', '2,50', '5,00', '120', '24', 'Distribuidora ABC', '', '12'],
      ['Vinho Tinto Reserva 750ml', '', 'Vinho', '18,00', '39,90', '10', '3', 'Importadora Drinks', '30/12/2026', ''],
    ]);
  },

  abrir() {
    App.abrirModal('Importar produtos de planilha', `
      <p style="margin-top:0;">Envie um arquivo <strong>.csv</strong>. No Excel ou no Google Planilhas, use <em>Arquivo → Salvar como / Fazer download → CSV</em>.</p>
      <p class="hint-text">Colunas reconhecidas: Nome (obrigatória), Código, Categoria, Custo, Venda, Estoque, Mínimo, Fornecedor, Validade e Unidades por caixa. Produtos que já existem (mesmo código ou mesmo nome) são atualizados; os outros são criados.</p>
      <div class="btn-row" style="margin:12px 0;">
        <button class="btn" id="btn-modelo-csv">Baixar planilha modelo</button>
        <button class="btn btn--primary" id="btn-escolher-csv">Escolher arquivo</button>
        <input type="file" id="input-csv" accept=".csv,text/csv" style="display:none;">
      </div>
      <div id="importar-previa"></div>`);
    document.getElementById('btn-modelo-csv').addEventListener('click', () => this.baixarModelo());
    const input = document.getElementById('input-csv');
    document.getElementById('btn-escolher-csv').addEventListener('click', () => input.click());
    input.addEventListener('change', async () => {
      const arq = input.files[0];
      if (!arq) return;
      try {
        let texto = await arq.text();
        if (texto.includes('�')) texto = new TextDecoder('windows-1252').decode(await arq.arrayBuffer()); // Excel antigo
        const linhas = this.lerCSV(texto);
        if (linhas.length < 2) throw new Error('A planilha está vazia.');
        const res = this.interpretar(linhas);
        await Produtos.carregar();
        const existentes = Produtos.cache;
        let novos = 0, atualizados = 0;
        res.itens.forEach((it) => {
          it.existente = existentes.find((p) => (it.sku && p.sku && p.sku.toLowerCase() === it.sku.toLowerCase()) || this.normalizar(p.nome) === this.normalizar(it.nome)) || null;
          if (it.existente) atualizados++; else novos++;
        });
        this.pendente = res.itens;
        document.getElementById('importar-previa').innerHTML = `
          <div class="nota" style="margin-top:6px;"><strong>${res.itens.length} produto(s) encontrados</strong> — ${novos} novo(s) e ${atualizados} para atualizar.${res.erros.length ? '<br>Ignorados: ' + res.erros.slice(0, 5).map(Utils.escapeHtml).join('; ') : ''}</div>
          <div class="table-wrap" style="max-height:260px;overflow:auto;"><table class="data-table"><thead><tr><th></th><th>Produto</th><th class="text-right">Custo</th><th class="text-right">Venda</th><th class="text-right">Estoque</th></tr></thead>
          <tbody>${res.itens.slice(0, 50).map((it) => `<tr><td><span class="badge ${it.existente ? 'badge--primary' : 'badge--success'}">${it.existente ? 'Atualizar' : 'Novo'}</span></td><td>${Utils.escapeHtml(it.nome)}</td>
            <td class="text-right">${it.precoCusto !== null ? Utils.formatMoney(it.precoCusto) : '—'}</td><td class="text-right">${it.precoVenda !== null ? Utils.formatMoney(it.precoVenda) : '—'}</td><td class="text-right">${it.estoqueAtual !== null ? it.estoqueAtual : '—'}</td></tr>`).join('')}</tbody></table></div>
          <div class="modal__footer"><button class="btn btn--primary" id="btn-confirmar-importacao">Importar ${res.itens.length} produto(s)</button></div>`;
        document.getElementById('btn-confirmar-importacao').addEventListener('click', () => this.executar());
      } catch (err) {
        document.getElementById('importar-previa').innerHTML = `<div class="caixa-limite is-excedido">${Utils.escapeHtml(err.message)}</div>`;
      }
      input.value = '';
    });
  },

  async executar() {
    const itens = this.pendente || [];
    const btn = document.getElementById('btn-confirmar-importacao');
    btn.disabled = true;
    let n = 0;
    for (const it of itens) {
      n++;
      btn.textContent = `Importando ${n} de ${itens.length}…`;
      const campos = {};
      ['sku', 'categoria', 'fornecedor', 'validade', 'unidade'].forEach((c) => { if (it[c]) campos[c] = it[c]; });
      ['precoCusto', 'precoVenda', 'estoqueMinimo', 'unidadesPorCaixa'].forEach((c) => { if (it[c] !== null) campos[c] = it[c]; });
      if (it.existente) {
        const p = Object.assign({}, it.existente, campos, { nome: it.nome });
        await Produtos.salvar(p);
        if (it.estoqueAtual !== null && it.estoqueAtual !== (it.existente.estoqueAtual || 0)) {
          await Estoque.registrarMovimentacao({ produtoId: p.id, tipo: 'ajuste', quantidade: it.estoqueAtual - (it.existente.estoqueAtual || 0), motivo: 'Importação de planilha' });
        }
      } else {
        const p = Object.assign({ nome: it.nome, sku: '', categoria: 'Outros', unidade: 'Unidade', unidadesPorCaixa: 1, precoCusto: 0, precoVenda: 0, estoqueMinimo: 5, fornecedor: '', ativo: true, foto: '', validade: '' }, campos, { estoqueAtual: it.estoqueAtual || 0 });
        await Produtos.salvar(p);
        if (p.estoqueAtual) await Estoque.registrarMovimentacao({ produtoId: p.id, tipo: 'entrada', quantidade: p.estoqueAtual, motivo: 'Estoque inicial (importação de planilha)' }, false);
      }
    }
    App.fecharModal();
    Utils.toast(`${itens.length} produto(s) importados!`, 'ok');
    await App.mudarView('produtos');
  },

  init() {
    document.getElementById('btn-importar-produtos').addEventListener('click', () => this.abrir());
  },
};

window.Importar = Importar;
