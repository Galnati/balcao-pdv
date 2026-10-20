/* ==========================================================================
   pix.js — Monta o "Pix copia e cola" (BR Code estático do Banco Central)
   com o valor da venda, para mostrar como QR Code no Caixa.
   ========================================================================== */

const Pix = {
  campo(id, valor) {
    const v = String(valor);
    return id + String(v.length).padStart(2, '0') + v;
  },

  // Remove acentos e caracteres fora do padrão aceito pelo BR Code
  limpar(texto, max) {
    return String(texto || '')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9 .,\-/]/g, '')
      .trim().toUpperCase().slice(0, max);
  },

  // Deixa a chave no formato exigido para cada tipo
  normalizarChave(chave, tipo) {
    const c = String(chave || '').trim();
    if (tipo === 'telefone') {
      const d = c.replace(/\D/g, '');
      return '+' + (d.startsWith('55') && d.length > 11 ? d : '55' + d);
    }
    if (tipo === 'cpf') return c.replace(/\D/g, '');
    if (tipo === 'email') return c.toLowerCase();
    return c; // aleatória
  },

  crc16(texto) {
    let crc = 0xFFFF;
    for (const byte of new TextEncoder().encode(texto)) {
      crc ^= byte << 8;
      for (let i = 0; i < 8; i++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xFFFF : (crc << 1) & 0xFFFF;
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  },

  // cfg: { chave, tipo, nome, cidade }
  payload(cfg, valor, identificador) {
    const conta = this.campo('00', 'br.gov.bcb.pix') + this.campo('01', this.normalizarChave(cfg.chave, cfg.tipo));
    const txid = (String(identificador || '***').replace(/[^A-Za-z0-9]/g, '').slice(0, 25)) || '***';
    let p = this.campo('00', '01')
      + this.campo('26', conta)
      + this.campo('52', '0000')
      + this.campo('53', '986')
      + (valor > 0 ? this.campo('54', valor.toFixed(2)) : '')
      + this.campo('58', 'BR')
      + this.campo('59', this.limpar(cfg.nome || 'LOJA', 25) || 'LOJA')
      + this.campo('60', this.limpar(cfg.cidade || 'SAO PAULO', 15) || 'SAO PAULO')
      + this.campo('62', this.campo('05', txid))
      + '6304';
    return p + this.crc16(p);
  },

  cache: null,
  async config() {
    if (this.cache) return this.cache;
    const ler = async (k) => { try { const c = await DB.get('config', k); return c && c.valor ? c.valor : ''; } catch (e) { return ''; } };
    const [chave, tipo, nome, cidade] = await Promise.all([ler('chavePix'), ler('chavePixTipo'), ler('pixNome'), ler('pixCidade')]);
    this.cache = { chave, tipo: tipo || 'aleatoria', nome: nome || (Auth.usuario && Auth.usuario.loja ? Auth.usuario.loja.nome : ''), cidade };
    return this.cache;
  },
};

window.Pix = Pix;
