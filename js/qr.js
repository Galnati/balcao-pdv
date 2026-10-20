/* ==========================================================================
   qr.js — Gerador de QR Code (sem dependências), usado no Pix do Caixa.
   Modo byte, correção de erro nível M, versões 1 a 15.
   Baseado no algoritmo da norma ISO/IEC 18004.
   ========================================================================== */

const QR = (() => {
  // [ec por bloco, blocos grupo 1, dados por bloco g1, blocos g2, dados por bloco g2] — nível M
  const TAB_M = [null,
    [10, 1, 16, 0, 0], [16, 1, 28, 0, 0], [26, 1, 44, 0, 0], [18, 2, 32, 0, 0], [24, 2, 43, 0, 0],
    [16, 4, 27, 0, 0], [18, 4, 31, 0, 0], [22, 2, 38, 2, 39], [22, 3, 36, 2, 37], [26, 4, 43, 1, 44],
    [30, 1, 50, 4, 51], [22, 6, 36, 2, 37], [22, 8, 37, 1, 38], [24, 4, 40, 5, 41], [24, 5, 41, 5, 42]];
  const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46],
    [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66], [6, 26, 48, 70]];

  const bit = (x, i) => ((x >>> i) & 1) !== 0;

  // ---- Reed-Solomon em GF(256), polinômio 0x11D ----
  function rsMul(x, y) {
    let z = 0;
    for (let i = 7; i >= 0; i--) {
      z = (z << 1) ^ ((z >>> 7) * 0x11D);
      z ^= ((y >>> i) & 1) * x;
    }
    return z;
  }
  function rsDivisor(grau) {
    const r = new Array(grau).fill(0);
    r[grau - 1] = 1;
    let raiz = 1;
    for (let i = 0; i < grau; i++) {
      for (let j = 0; j < r.length; j++) {
        r[j] = rsMul(r[j], raiz);
        if (j + 1 < r.length) r[j] ^= r[j + 1];
      }
      raiz = rsMul(raiz, 0x02);
    }
    return r;
  }
  function rsResto(dados, divisor) {
    const r = divisor.map(() => 0);
    for (const b of dados) {
      const f = b ^ r.shift();
      r.push(0);
      divisor.forEach((c, i) => { r[i] ^= rsMul(c, f); });
    }
    return r;
  }

  function gerar(texto) {
    const bytes = Array.from(new TextEncoder().encode(texto));
    // escolhe a menor versão que cabe
    let versao = 0;
    for (let v = 1; v <= 15; v++) {
      const t = TAB_M[v];
      const capacidade = t[1] * t[2] + t[3] * t[4];
      const bitsNecessarios = 4 + (v < 10 ? 8 : 16) + bytes.length * 8;
      if (bitsNecessarios <= capacidade * 8) { versao = v; break; }
    }
    if (!versao) throw new Error('Texto grande demais para o QR Code');
    const [ecPorBloco, b1, d1, b2, d2] = TAB_M[versao];
    const capacidade = b1 * d1 + b2 * d2;

    // ---- bits de dados ----
    const bits = [];
    const push = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    push(0b0100, 4);
    push(bytes.length, versao < 10 ? 8 : 16);
    bytes.forEach((b) => push(b, 8));
    push(0, Math.min(4, capacidade * 8 - bits.length));
    push(0, (8 - (bits.length % 8)) % 8);
    for (let pad = 0xEC; bits.length < capacidade * 8; pad ^= 0xEC ^ 0x11) push(pad, 8);
    const dados = [];
    for (let i = 0; i < bits.length; i += 8) dados.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));

    // ---- blocos + correção de erro + intercalação ----
    const divisor = rsDivisor(ecPorBloco);
    const blocos = [];
    let k = 0;
    for (let i = 0; i < b1 + b2; i++) {
      const n = i < b1 ? d1 : d2;
      const dat = dados.slice(k, k + n);
      k += n;
      blocos.push({ dat, ec: rsResto(dat, divisor) });
    }
    const final = [];
    const maxDados = Math.max(d1, d2);
    for (let i = 0; i < maxDados; i++) blocos.forEach((b) => { if (i < b.dat.length) final.push(b.dat[i]); });
    for (let i = 0; i < ecPorBloco; i++) blocos.forEach((b) => final.push(b.ec[i]));

    // ---- matriz ----
    const size = versao * 4 + 17;
    const mod = Array.from({ length: size }, () => new Array(size).fill(false));
    const fun = Array.from({ length: size }, () => new Array(size).fill(false));
    const set = (x, y, v) => { mod[y][x] = v; fun[y][x] = true; };

    for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => {
      for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= size || y >= size) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d !== 2 && d !== 4);
      }
    };
    finder(3, 3); finder(size - 4, 3); finder(3, size - 4);
    const al = ALIGN[versao];
    const n = al.length;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue;
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    const desenharFormato = (mask) => {
      const data = (0 << 3) | mask; // nível M = 00
      let rem = data;
      for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
      const b = ((data << 10) | rem) ^ 0x5412;
      for (let i = 0; i <= 5; i++) set(8, i, bit(b, i));
      set(8, 7, bit(b, 6)); set(8, 8, bit(b, 7)); set(7, 8, bit(b, 8));
      for (let i = 9; i < 15; i++) set(14 - i, 8, bit(b, i));
      for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(b, i));
      for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(b, i));
      set(8, size - 8, true);
    };
    desenharFormato(0);
    if (versao >= 7) {
      let rem = versao;
      for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
      const b = (versao << 12) | rem;
      for (let i = 0; i < 18; i++) {
        const c = bit(b, i), a = size - 11 + (i % 3), bb = Math.floor(i / 3);
        set(a, bb, c); set(bb, a, c);
      }
    }

    // ---- posiciona os dados em zigue-zague ----
    let idx = 0;
    for (let right = size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vert = 0; vert < size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const up = ((right + 1) & 2) === 0;
          const y = up ? size - 1 - vert : vert;
          if (!fun[y][x] && idx < final.length * 8) {
            mod[y][x] = bit(final[idx >>> 3], 7 - (idx & 7));
            idx++;
          }
        }
      }
    }

    // ---- máscara: escolhe a de menor penalidade ----
    const cond = [
      (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
      (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0,
    ];
    const aplicar = (m) => {
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fun[y][x] && cond[m](x, y)) mod[y][x] = !mod[y][x];
    };
    const penalidade = () => {
      let p = 0;
      for (let a = 0; a < 2; a++) for (let i = 0; i < size; i++) {
        let run = 1;
        for (let j = 1; j < size; j++) {
          const c = a ? mod[j][i] : mod[i][j];
          const ant = a ? mod[j - 1][i] : mod[i][j - 1];
          if (c === ant) { run++; if (run === 5) p += 3; else if (run > 5) p++; } else run = 1;
        }
      }
      for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) {
        const c = mod[y][x];
        if (c === mod[y][x + 1] && c === mod[y + 1][x] && c === mod[y + 1][x + 1]) p += 3;
      }
      let escuros = 0;
      mod.forEach((r) => r.forEach((c) => { if (c) escuros++; }));
      p += Math.floor(Math.abs(escuros * 20 - size * size * 10) / (size * size)) * 10;
      return p;
    };
    let melhor = 0, menor = Infinity;
    for (let m = 0; m < 8; m++) {
      aplicar(m); desenharFormato(m);
      const p = penalidade();
      if (p < menor) { menor = p; melhor = m; }
      aplicar(m);
    }
    aplicar(melhor); desenharFormato(melhor);
    return { size, mod };
  }

  // Devolve um <svg> com o QR (borda de 4 módulos)
  function svg(texto, tamanhoPx = 200) {
    const { size, mod } = gerar(texto);
    const total = size + 8;
    let path = '';
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (mod[y][x]) path += `M${x + 4},${y + 4}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${total}" width="${tamanhoPx}" height="${tamanhoPx}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${path}" fill="#000"/></svg>`;
  }

  return { gerar, svg };
})();

window.QR = QR;
