/* ==========================================================================
   vendas.js — Histórico de Vendas
   ========================================================================== */

const Vendas = {
  cache: [],

  async carregar() {
    this.cache = await DB.getAll('vendas');
    this.cache.sort((a, b) => new Date(b.data) - new Date(a.data));
    return this.cache;
  },

  async renderTabela() {
    const tbody = document.getElementById('vendas-table-body');
    await this.carregar();

    const dataIni = document.getElementById('vendas-filtro-data-ini').value;
    const dataFim = document.getElementById('vendas-filtro-data-fim').value;
    const status = document.getElementById('vendas-filtro-status').value;

    let lista = this.cache;
    if (dataIni) lista = lista.filter((v) => v.data.slice(0, 10) >= dataIni);
    if (dataFim) lista = lista.filter((v) => v.data.slice(0, 10) <= dataFim);
    if (status) lista = lista.filter((v) => v.statusPagamento === status);

    if (!lista.length) {
      tbody.innerHTML = '<tr class="empty-row"><td colspan="7">Nenhuma venda encontrada</td></tr>';
      return;
    }

    tbody.innerHTML = lista.map((v) => `
      <tr class="row-clickable" data-action="ver-venda" data-id="${v.id}" title="Ver detalhes da venda">
        <td>#${v.id}</td>
        <td>${Utils.formatDateTime(v.data)}</td>
        <td>${Utils.escapeHtml(v.clienteNome || 'Venda avulsa')}</td>
        <td>${v.itens.length} item(ns)</td>
        <td>${Utils.escapeHtml(v.formaPagamento)}</td>
        <td>${v.status === 'cancelada' ? '<span class="badge badge--muted">Cancelada</span>' : (v.statusPagamento === 'pago' ? '<span class="badge badge--success">Pago</span>' : '<span class="badge badge--warning">Fiado</span>')}${v.operadorNome ? `<br><small class="text-muted">${Utils.escapeHtml(v.operadorNome.split(' ')[0])}</small>` : ''}</td>
        <td class="text-right"><strong style="${v.status === 'cancelada' ? 'text-decoration:line-through;color:var(--color-text-muted)' : ''}">${Utils.formatMoney(v.total)}</strong></td>
      </tr>`).join('');
  },

  async verDetalhes(id) {
    const venda = await DB.get('vendas', id);
    if (!venda) return;
    const linhas = venda.itens.map((i) => `
      <tr><td>${Utils.escapeHtml(i.nome)}</td><td class="text-right">${i.quantidade}</td><td class="text-right">${Utils.formatMoney(i.precoUnit)}</td><td class="text-right">${Utils.formatMoney(i.subtotal)}</td></tr>
    `).join('');

    const pagamentos = Utils.linhasPagamento(venda);
    const pagamentoTexto = pagamentos.length > 1
      ? pagamentos.map((p) => `${Utils.escapeHtml(p.metodo)}: ${Utils.formatMoney(p.valor)}`).join(' · ')
      : Utils.escapeHtml(pagamentos[0].metodo);

    const body = `
      ${venda.status === 'cancelada' ? `<div class="caixa-limite is-excedido" style="margin-bottom:12px;">Venda cancelada em ${Utils.formatDateTime(venda.canceladaEm)} por ${Utils.escapeHtml(venda.canceladaPorNome || '')}${venda.motivoCancelamento ? ' — ' + Utils.escapeHtml(venda.motivoCancelamento) : ''}. Os produtos voltaram ao estoque.</div>` : ''}
      <p><strong>Cliente:</strong> ${Utils.escapeHtml(venda.clienteNome || 'Venda avulsa')}<br>
      ${venda.operadorNome ? `<strong>Vendido por:</strong> ${Utils.escapeHtml(venda.operadorNome)}<br>` : ''}
      <strong>Data:</strong> ${Utils.formatDateTime(venda.data)}<br>
      <strong>Pagamento:</strong> ${pagamentoTexto} ${venda.statusPagamento === 'fiado' ? '(inclui fiado, vence em ' + Utils.formatDate(venda.vencimento) + ')' : ''}</p>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Produto</th><th class="text-right">Qtd</th><th class="text-right">Preço</th><th class="text-right">Subtotal</th></tr></thead>
          <tbody>${linhas}</tbody>
          <tfoot>
            <tr><td colspan="3">Subtotal</td><td class="text-right">${Utils.formatMoney(venda.subtotal)}</td></tr>
            ${venda.acrescimo ? `<tr><td colspan="3">Acréscimo</td><td class="text-right">+${Utils.formatMoney(venda.acrescimo)}</td></tr>` : ''}
            ${venda.desconto ? `<tr><td colspan="3">Desconto</td><td class="text-right">-${Utils.formatMoney(venda.desconto)}</td></tr>` : ''}
            <tr><td colspan="3">Total</td><td class="text-right">${Utils.formatMoney(venda.total)}</td></tr>
          </tfoot>
        </table>
      </div>
      <div class="modal__footer">
        ${venda.status !== 'cancelada' && App.ehAdmin() ? '<button class="btn btn--danger" id="btn-cancelar-venda" style="margin-right:auto;">Cancelar venda</button>' : ''}
        <button class="btn" id="btn-fechar-detalhe-venda">Fechar</button>
        <button class="btn btn--whatsapp" id="btn-whatsapp-detalhe-venda">Enviar por WhatsApp</button>
        <button class="btn btn--primary" id="btn-imprimir-detalhe-venda">⎙ Imprimir comprovante</button>
      </div>
    `;
    App.abrirModal(`Venda #${venda.id}`, body);
    document.getElementById('btn-fechar-detalhe-venda').addEventListener('click', () => App.fecharModal());
    const btnCancelar = document.getElementById('btn-cancelar-venda');
    if (btnCancelar) btnCancelar.addEventListener('click', () => this.cancelar(venda));

    const cliente = venda.clienteId ? await Clientes.buscarPorId(venda.clienteId) : null;
    document.getElementById('btn-imprimir-detalhe-venda').addEventListener('click', () => {
      const printArea = document.getElementById('print-area');
      printArea.innerHTML = Utils.gerarReciboHtml(venda);
      window.print();
    });
    document.getElementById('btn-whatsapp-detalhe-venda').addEventListener('click', () => {
      Utils.compartilharImagemRecibo(venda, cliente && cliente.telefone);
    });
  },

  // Cancela a venda: devolve os produtos ao estoque e cancela o fiado gerado por ela
  cancelar(venda) {
    App.abrirModal(`Cancelar venda #${venda.id}`, `
      <form id="form-cancelar-venda">
        <p style="margin-top:0;">Os produtos voltam para o estoque${venda.valorFiado > 0 ? ' e o fiado desta venda deixa de ser cobrado' : ''}. A venda continua no histórico, marcada como cancelada.</p>
        <div class="field"><label>Motivo</label><input type="text" id="f-motivo-cancel" required placeholder="Ex.: cliente desistiu, produto errado, venda duplicada"></div>
        <div class="modal__footer"><button type="button" class="btn" id="btn-voltar-cancel">Voltar</button><button type="submit" class="btn btn--danger">Confirmar cancelamento</button></div>
      </form>`);
    document.getElementById('btn-voltar-cancel').addEventListener('click', () => this.verDetalhes(venda.id));
    document.getElementById('form-cancelar-venda').addEventListener('submit', async (e) => {
      e.preventDefault();
      const atual = await DB.get('vendas', venda.id);
      if (!atual || atual.status === 'cancelada') { App.fecharModal(); return; }
      for (const item of atual.itens || []) {
        const entradas = item.tipo === 'combo' && item.componentes
          ? item.componentes.map((c) => ({ produtoId: c.produtoId, quantidade: c.quantidade * item.quantidade }))
          : (item.produtoId ? [{ produtoId: item.produtoId, quantidade: item.quantidade }] : []);
        for (const en of entradas) {
          try {
            await Estoque.registrarMovimentacao({ produtoId: en.produtoId, tipo: 'entrada', quantidade: en.quantidade, motivo: `Cancelamento da venda #${atual.id}`, vendaId: atual.id });
          } catch (err) { /* produto pode ter sido excluído */ }
        }
      }
      const contas = await DB.getAll('contas');
      for (const c of contas.filter((x) => x.vendaId === atual.id && x.status !== 'pago')) {
        c.status = 'cancelada';
        await DB.put('contas', c);
      }
      atual.status = 'cancelada';
      atual.canceladaEm = Utils.nowISO();
      atual.canceladaPorId = Auth.usuario ? Auth.usuario.id : null;
      atual.canceladaPorNome = Auth.usuario ? Auth.usuario.nome : '';
      atual.motivoCancelamento = document.getElementById('f-motivo-cancel').value.trim();
      await DB.put('vendas', atual);
      Utils.toast(`Venda #${atual.id} cancelada e estoque devolvido`, 'ok');
      App.fecharModal();
      await App.mudarView(App.viewAtual);
    });
  },

  init() {
    ['vendas-filtro-data-ini', 'vendas-filtro-data-fim', 'vendas-filtro-status'].forEach((id) => {
      document.getElementById(id).addEventListener('change', () => this.renderTabela());
    });
    document.getElementById('vendas-table-body').addEventListener('click', (e) => {
      const row = e.target.closest('tr[data-action="ver-venda"]');
      if (!row) return;
      this.verDetalhes(parseInt(row.dataset.id, 10));
    });
  },
};
