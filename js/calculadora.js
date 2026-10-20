/* ==========================================================================
   calculadora.js — Calculadora de Preços (independente do cadastro)
   ========================================================================== */

const Calculadora = {
  calcularPrecoVenda() {
    const custo = Utils.parseMoneyInput(document.getElementById('calc-custo').value);
    const extras = Utils.parseMoneyInput(document.getElementById('calc-extras').value);
    const impostosPerc = parseFloat((document.getElementById('calc-impostos').value || '0').replace(',', '.')) || 0;
    const margemPerc = parseFloat((document.getElementById('calc-margem').value || '0').replace(',', '.')) || 0;

    const custoTotal = custo + extras;
    // Preço = (custoTotal com o lucro desejado já embutido) / (1 - impostos%)
    // "Lucro desejado" aqui é sobre o CUSTO (o jeito intuitivo: custo 5 + 50% = 7,50;
    // custo 5 + 100% = 10,00) — não sobre o preço de venda final, que exigiria
    // dividir pelo complemento da margem e zerava (ou explodia) a partir de 100%.
    const precoComLucro = custoTotal * (1 + margemPerc / 100);
    const percentualImposto = impostosPerc / 100;
    let precoVenda;
    if (percentualImposto >= 1) {
      precoVenda = 0;
    } else {
      precoVenda = precoComLucro / (1 - percentualImposto);
    }
    const valorImposto = precoVenda * (impostosPerc / 100);
    const lucroLiquido = precoVenda - custoTotal - valorImposto;
    const markup = custoTotal > 0 ? (precoVenda / custoTotal) : 0;

    document.getElementById('calc-result').innerHTML = `
      <div class="calc-result__row main"><span>Preço de venda sugerido</span><span>${Utils.formatMoney(precoVenda)}</span></div>
      <div class="calc-result__row"><span>Custo total (custo + extras)</span><span>${Utils.formatMoney(custoTotal)}</span></div>
      <div class="calc-result__row"><span>Impostos/taxas (${impostosPerc}%)</span><span>${Utils.formatMoney(valorImposto)}</span></div>
      <div class="calc-result__row"><span>Lucro líquido estimado</span><span>${Utils.formatMoney(lucroLiquido)}</span></div>
      <div class="calc-result__row"><span>Markup (multiplicador sobre custo)</span><span>${markup.toFixed(2)}x</span></div>
    `;
  },

  calcularMargemMarkup() {
    const custo = Utils.parseMoneyInput(document.getElementById('calc2-custo').value);
    const venda = Utils.parseMoneyInput(document.getElementById('calc2-venda').value);

    const lucro = venda - custo;
    const margem = venda > 0 ? (lucro / venda) * 100 : 0;
    const markup = custo > 0 ? ((venda - custo) / custo) * 100 : 0;

    document.getElementById('calc2-result').innerHTML = `
      <div class="calc-result__row main"><span>Margem de lucro</span><span>${margem.toFixed(1)}%</span></div>
      <div class="calc-result__row"><span>Markup sobre o custo</span><span>${markup.toFixed(1)}%</span></div>
      <div class="calc-result__row"><span>Lucro por unidade</span><span>${Utils.formatMoney(lucro)}</span></div>
    `;
  },

  init() {
    ['calc-custo', 'calc-extras', 'calc-impostos', 'calc-margem'].forEach((id) => {
      document.getElementById(id).addEventListener('input', () => this.calcularPrecoVenda());
    });
    ['calc2-custo', 'calc2-venda'].forEach((id) => {
      document.getElementById(id).addEventListener('input', () => this.calcularMargemMarkup());
    });
    this.calcularPrecoVenda();
    this.calcularMargemMarkup();
  },
};
