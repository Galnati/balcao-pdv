/* ==========================================================================
   utils.js — Funções utilitárias compartilhadas
   ========================================================================== */

const Utils = {
  formatMoney(value) {
    const n = Number(value) || 0;
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  },

  parseMoneyInput(value) {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    const cleaned = String(value).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3},)/g, '').replace(',', '.');
    const n = parseFloat(cleaned);
    return isNaN(n) ? 0 : n;
  },

  formatDate(isoString) {
    if (!isoString) return '-';
    const d = new Date(isoString);
    return d.toLocaleDateString('pt-BR');
  },

  formatDateTime(isoString) {
    if (!isoString) return '-';
    const d = new Date(isoString);
    return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  },

  todayISO() {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  },

  nowISO() {
    return new Date().toISOString();
  },

  isPast(dateStr) {
    if (!dateStr) return false;
    return new Date(dateStr + 'T23:59:59') < new Date();
  },

  daysBetween(dateStr) {
    if (!dateStr) return 0;
    const d1 = new Date(dateStr + 'T00:00:00');
    const d2 = new Date();
    d2.setHours(0, 0, 0, 0);
    return Math.round((d1 - d2) / 86400000);
  },

  // Badge de validade pra tabela de produtos: vencido (vermelho), vencendo em
  // até 7 dias (amarelo), ou nada se não tiver validade cadastrada ou estiver longe.
  badgeValidade(validade) {
    if (!validade) return '<span class="text-muted">-</span>';
    const dias = Utils.daysBetween(validade);
    const dataFormatada = Utils.formatDate(validade);
    if (dias < 0) return `<span class="badge badge--danger" title="Venceu ${Math.abs(dias)} dia(s) atrás">! Vencido (${dataFormatada})</span>`;
    if (dias <= 7) return `<span class="badge badge--warning" title="Vence em ${dias} dia(s)">⧗ ${dataFormatada}</span>`;
    return `<span class="text-muted">${dataFormatada}</span>`;
  },

  // Vendas que contam nos totais (ignora as canceladas)
  vendasValidas(vendas) {
    return (vendas || []).filter((v) => v.status !== 'cancelada');
  },

  // Gera e baixa um arquivo CSV (abre no Excel). linhas = array de arrays
  baixarCSV(nomeArquivo, linhas) {
    const esc = (v) => {
      const s = v === null || v === undefined ? '' : String(v);
      return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const conteudo = '\ufeff' + linhas.map((l) => l.map(esc).join(';')).join('\r\n');
    const blob = new Blob([conteudo], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = nomeArquivo; a.click();
    URL.revokeObjectURL(url);
  },

  // Formata número com vírgula (para CSV no padrão brasileiro)
  num(v, casas = 2) {
    return (Number(v) || 0).toFixed(casas).replace('.', ',');
  },

  escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },

  debounce(fn, wait) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), wait);
    };
  },

  toast(message, type = 'ok') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = message;
    container.appendChild(el);
    requestAnimationFrame(() => el.classList.add('toast--show'));
    setTimeout(() => {
      el.classList.remove('toast--show');
      setTimeout(() => el.remove(), 300);
    }, 3200);
  },

  confirmDialog(message) {
    return new Promise((resolve) => {
      const overlay = document.getElementById('confirm-overlay');
      const msgEl = document.getElementById('confirm-message');
      const btnYes = document.getElementById('confirm-yes');
      const btnNo = document.getElementById('confirm-no');
      msgEl.textContent = message;
      overlay.classList.add('is-open');

      const cleanup = (result) => {
        overlay.classList.remove('is-open');
        btnYes.removeEventListener('click', onYes);
        btnNo.removeEventListener('click', onNo);
        resolve(result);
      };
      const onYes = () => cleanup(true);
      const onNo = () => cleanup(false);
      btnYes.addEventListener('click', onYes);
      btnNo.addEventListener('click', onNo);
    });
  },

  uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  },

  renderBarsChart(data, formatter) {
    if (!data.length) return '<p class="text-muted">Sem dados no período.</p>';
    const max = Math.max(...data.map((d) => d.value), 1);
    const fmt = formatter || ((v) => v);
    return `<div class="bars-chart">${data.map((d) => {
      const heightPct = Math.max(2, (d.value / max) * 100);
      return `
        <div class="bars-chart__col" title="${Utils.escapeHtml(d.label)}: ${fmt(d.value)}">
          <div class="bars-chart__value">${d.value > 0 ? fmt(d.value) : ''}</div>
          <div class="bars-chart__bar" style="height:${heightPct}%"></div>
          <div class="bars-chart__label">${Utils.escapeHtml(d.label)}</div>
        </div>`;
    }).join('')}</div>`;
  },

  renderTopList(data, formatter) {
    if (!data.length) return '<p class="text-muted">Sem dados no período.</p>';
    const fmt = formatter || ((v) => v);
    return data.map((d, idx) => `
      <div class="top-products-list__item">
        <div class="top-products-list__rank">${idx + 1}</div>
        <div class="top-products-list__name">${Utils.escapeHtml(d.label)}</div>
        <div class="top-products-list__value">${fmt(d.value)}</div>
      </div>`).join('');
  },

  // ---------------------------------------------------------------------
  // Comprovante de venda (recibo) — reutilizado no PDV e no Histórico de Vendas
  // ---------------------------------------------------------------------

  // Devolve sempre um array [{metodo, valor}] — mesmo pra vendas antigas que
  // não tinham o campo "pagamentos" (pagamento único, sem divisão).
  linhasPagamento(venda) {
    if (Array.isArray(venda.pagamentos) && venda.pagamentos.length) return venda.pagamentos;
    return [{ metodo: venda.formaPagamento, valor: venda.total }];
  },

  gerarReciboHtml(venda) {
    const linhas = venda.itens.map((i) =>
      `<div class="receipt-row"><span>${Utils.escapeHtml(i.quantidade + 'x ' + i.nome)}${i.descontoPct ? ' (-' + i.descontoPct + '%)' : ''}</span><span>${Utils.formatMoney(i.subtotal)}</span></div>`
    ).join('');
    const pagamentos = Utils.linhasPagamento(venda);
    const isDinheiroUnico = pagamentos.length === 1 && pagamentos[0].metodo === 'Dinheiro';

    return `
      <div class="receipt" id="receipt-content">
        <h3>Venda de Bebidas</h3>
        <p class="center">Comprovante de Venda #${venda.id}</p>
        <div class="center">${Utils.formatDateTime(venda.data)}</div>
        <hr>
        <div>Cliente: ${Utils.escapeHtml(venda.clienteNome || 'Venda avulsa')}</div>
        <hr>
        ${linhas}
        <hr>
        <div class="receipt-row"><span>Subtotal</span><span>${Utils.formatMoney(venda.subtotal)}</span></div>
        ${venda.acrescimo ? `<div class="receipt-row"><span>Acréscimo</span><span>+ ${Utils.formatMoney(venda.acrescimo)}</span></div>` : ''}
        ${venda.desconto ? `<div class="receipt-row"><span>Desconto</span><span>- ${Utils.formatMoney(venda.desconto)}</span></div>` : ''}
        <div class="receipt-row"><strong>TOTAL</strong><strong>${Utils.formatMoney(venda.total)}</strong></div>
        <hr>
        ${pagamentos.map((p) => `<div class="receipt-row"><span>Pagamento${pagamentos.length > 1 ? ' (' + Utils.escapeHtml(p.metodo) + ')' : ''}</span><span>${pagamentos.length > 1 ? Utils.formatMoney(p.valor) : Utils.escapeHtml(p.metodo)}</span></div>`).join('')}
        ${isDinheiroUnico ? `<div class="receipt-row"><span>Recebido</span><span>${Utils.formatMoney(venda.valorRecebido)}</span></div><div class="receipt-row"><span>Troco</span><span>${Utils.formatMoney(venda.troco)}</span></div>` : ''}
        ${venda.statusPagamento === 'fiado' ? `<div class="receipt-row"><span>Vencimento (fiado)</span><span>${Utils.formatDate(venda.vencimento)}</span></div>` : ''}
        <hr>
        <p class="center">Obrigado pela preferência!</p>
      </div>
    `;
  },

  gerarReciboTexto(venda) {
    const linhas = venda.itens.map((i) => `${i.quantidade}x ${i.nome}${i.descontoPct ? ' (-' + i.descontoPct + '%)' : ''} — ${Utils.formatMoney(i.subtotal)}`).join('\n');
    const pagamentos = Utils.linhasPagamento(venda);
    const isDinheiroUnico = pagamentos.length === 1 && pagamentos[0].metodo === 'Dinheiro';

    let txt = `*Venda de Bebidas*\n`;
    txt += `Comprovante de Venda #${venda.id}\n`;
    txt += `${Utils.formatDateTime(venda.data)}\n`;
    txt += `Cliente: ${venda.clienteNome || 'Venda avulsa'}\n\n`;
    txt += `${linhas}\n\n`;
    txt += `Subtotal: ${Utils.formatMoney(venda.subtotal)}\n`;
    if (venda.acrescimo) txt += `Acréscimo: + ${Utils.formatMoney(venda.acrescimo)}\n`;
    if (venda.desconto) txt += `Desconto: - ${Utils.formatMoney(venda.desconto)}\n`;
    txt += `*TOTAL: ${Utils.formatMoney(venda.total)}*\n\n`;
    if (pagamentos.length > 1) {
      txt += `Pagamento (dividido):\n`;
      pagamentos.forEach((p) => { txt += `  ${p.metodo}: ${Utils.formatMoney(p.valor)}\n`; });
    } else {
      txt += `Pagamento: ${pagamentos[0].metodo}\n`;
    }
    if (isDinheiroUnico) {
      txt += `Recebido: ${Utils.formatMoney(venda.valorRecebido)}\n`;
      txt += `Troco: ${Utils.formatMoney(venda.troco)}\n`;
    }
    if (venda.statusPagamento === 'fiado') {
      txt += `Vencimento (fiado): ${Utils.formatDate(venda.vencimento)}\n`;
    }
    txt += `\nObrigado pela preferência!`;
    return txt;
  },

  // Lê um arquivo de imagem, redimensiona (mantendo proporção) e comprime
  // para JPEG, retornando um data URL pronto para salvar no banco. Evita
  // que fotos de produto pesem demais no IndexedDB / backup do servidor.
  redimensionarImagem(file, maxDim = 500, qualidade = 0.82) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error);
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Não foi possível ler a imagem'));
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width >= height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
            else { width = Math.round(width * (maxDim / height)); height = maxDim; }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', qualidade));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  },

  // Monta um link wa.me. Se um telefone for informado, abre já apontando pro
  // contato (aceita formatos como "(11) 91234-5678"); sem telefone, abre o
  // seletor de conversa do WhatsApp com o texto pronto para colar.
  linkWhatsapp(telefone, texto) {
    let numero = (telefone || '').replace(/\D/g, '');
    if (numero && numero.length <= 11) numero = '55' + numero; // DDI Brasil
    const base = numero ? `https://wa.me/${numero}` : 'https://wa.me/';
    const query = texto ? `?text=${encodeURIComponent(texto)}` : '';
    return `${base}${query}`;
  },

  // Desenha o comprovante de venda como uma imagem (canvas), no estilo de um
  // cupom impresso, e devolve o <canvas> pronto. Usado para enviar a venda
  // como foto pelo WhatsApp em vez de texto puro.
  gerarImagemRecibo(venda) {
    const escala = 2; // retina, pra ficar nítido
    const largura = 360;
    const padding = 18;
    const contentWidth = largura - padding * 2;
    const fontBase = '12.5px "Courier New", monospace';
    const fontBold = 'bold 12.5px "Courier New", monospace';
    const fontTitle = 'bold 16px "Courier New", monospace';
    const lineH = 20;

    const medidor = document.createElement('canvas').getContext('2d');
    const quebrarTexto = (texto, maxWidth, font) => {
      medidor.font = font;
      const palavras = String(texto).split(' ');
      const linhas = [];
      let atual = '';
      palavras.forEach((p) => {
        const teste = atual ? atual + ' ' + p : p;
        if (medidor.measureText(teste).width > maxWidth && atual) {
          linhas.push(atual);
          atual = p;
        } else {
          atual = teste;
        }
      });
      if (atual) linhas.push(atual);
      return linhas;
    };

    const itens = [];
    itens.push({ t: 'title', txt: 'Venda de Bebidas' });
    itens.push({ t: 'center', txt: `Comprovante de Venda #${venda.id}` });
    itens.push({ t: 'center', txt: Utils.formatDateTime(venda.data) });
    itens.push({ t: 'hr' });
    itens.push({ t: 'left', txt: `Cliente: ${venda.clienteNome || 'Venda avulsa'}` });
    itens.push({ t: 'hr' });
    venda.itens.forEach((i) => {
      const linhasNome = quebrarTexto(`${i.quantidade}x ${i.nome}`, contentWidth - 70, fontBase);
      linhasNome.forEach((linha, idx) => {
        itens.push({ t: 'row', esq: linha, dir: idx === linhasNome.length - 1 ? Utils.formatMoney(i.subtotal) : '' });
      });
    });
    itens.push({ t: 'hr' });
    itens.push({ t: 'row', esq: 'Subtotal', dir: Utils.formatMoney(venda.subtotal) });
    if (venda.acrescimo) itens.push({ t: 'row', esq: 'Acréscimo', dir: '+ ' + Utils.formatMoney(venda.acrescimo) });
    if (venda.desconto) itens.push({ t: 'row', esq: 'Desconto', dir: '- ' + Utils.formatMoney(venda.desconto) });
    itens.push({ t: 'row', esq: 'TOTAL', dir: Utils.formatMoney(venda.total), bold: true });
    itens.push({ t: 'hr' });
    const pagamentosImg = Utils.linhasPagamento(venda);
    if (pagamentosImg.length > 1) {
      pagamentosImg.forEach((p) => itens.push({ t: 'row', esq: 'Pag. ' + p.metodo, dir: Utils.formatMoney(p.valor) }));
    } else {
      itens.push({ t: 'row', esq: 'Pagamento', dir: pagamentosImg[0].metodo });
    }
    if (pagamentosImg.length === 1 && pagamentosImg[0].metodo === 'Dinheiro') {
      itens.push({ t: 'row', esq: 'Recebido', dir: Utils.formatMoney(venda.valorRecebido) });
      itens.push({ t: 'row', esq: 'Troco', dir: Utils.formatMoney(venda.troco) });
    }
    if (venda.statusPagamento === 'fiado') {
      itens.push({ t: 'row', esq: 'Vencimento', dir: Utils.formatDate(venda.vencimento) });
    }
    itens.push({ t: 'hr' });
    itens.push({ t: 'center', txt: 'Obrigado pela preferência!' });

    let altura = padding * 2;
    itens.forEach((it) => { altura += it.t === 'hr' ? 14 : lineH; });

    const canvas = document.createElement('canvas');
    canvas.width = largura * escala;
    canvas.height = altura * escala;
    const ctx = canvas.getContext('2d');
    ctx.scale(escala, escala);
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, largura, altura);
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'middle';

    let y = padding;
    itens.forEach((it) => {
      if (it.t === 'hr') {
        y += 7;
        ctx.save();
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = '#000';
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(largura - padding, y);
        ctx.stroke();
        ctx.restore();
        y += 7;
      } else if (it.t === 'title') {
        ctx.font = fontTitle;
        ctx.textAlign = 'center';
        ctx.fillText(it.txt, largura / 2, y + lineH / 2);
        y += lineH;
      } else if (it.t === 'center') {
        ctx.font = fontBase;
        ctx.textAlign = 'center';
        ctx.fillText(it.txt, largura / 2, y + lineH / 2);
        y += lineH;
      } else if (it.t === 'left') {
        ctx.font = fontBase;
        ctx.textAlign = 'left';
        ctx.fillText(it.txt, padding, y + lineH / 2);
        y += lineH;
      } else if (it.t === 'row') {
        ctx.font = it.bold ? fontBold : fontBase;
        ctx.textAlign = 'left';
        ctx.fillText(it.esq, padding, y + lineH / 2);
        ctx.textAlign = 'right';
        ctx.fillText(it.dir, largura - padding, y + lineH / 2);
        y += lineH;
      }
    });

    return canvas;
  },

  // Gera a imagem do comprovante e tenta enviá-la direto pelo WhatsApp (via
  // Web Share API, que abre o seletor de apps no celular/Windows). Quando o
  // compartilhamento de arquivo não é suportado (a maioria dos navegadores
  // desktop), baixa a imagem e abre a conversa do WhatsApp para o usuário
  // anexar manualmente.
  async compartilharImagemRecibo(venda, telefone) {
    const canvas = this.gerarImagemRecibo(venda);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (!blob) { Utils.toast('Não foi possível gerar a imagem do comprovante', 'error'); return; }

    const nomeArquivo = `comprovante-venda-${venda.id}.png`;
    const file = new File([blob], nomeArquivo, { type: 'image/png' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `Comprovante de Venda #${venda.id}` });
        return;
      } catch (err) {
        if (err && err.name === 'AbortError') return; // usuário cancelou o compartilhamento
        // qualquer outro erro cai no fallback de baixar + abrir o WhatsApp
      }
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    a.click();
    URL.revokeObjectURL(url);
    Utils.toast('Imagem do comprovante baixada! Anexe o arquivo na conversa do WhatsApp que vai abrir.', 'info');
    window.open(this.linkWhatsapp(telefone, ''), '_blank');
  },
};

window.Utils = Utils;
