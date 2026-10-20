/* ==========================================================================
   demo-api.js — "Servidor" simulado dentro do navegador (versão de portfólio)

   A versão original do Balcão roda com um servidor Node.js (server.js) que
   guarda os dados num arquivo JSON e sincroniza vários aparelhos em tempo
   real. Para publicar o app no GitHub Pages (que só hospeda arquivos
   estáticos), este arquivo intercepta todas as chamadas a "/api/..." e
   responde aqui mesmo, com a mesma lógica do servidor, salvando tudo no
   localStorage do navegador.

   - Nenhum dado sai do aparelho: não há internet, conta real nem sincronização.
   - Já abre com uma loja fictícia cheia de dados de exemplo.
   - "Restaurar demonstração" (Configurações) apaga tudo e recria os exemplos.
   ========================================================================== */

(function () {
  const STORAGE_KEY = 'balcao_demo_db_v1';
  const STORES = ['produtos', 'clientes', 'movimentacoesEstoque', 'vendas', 'contas', 'config', 'encomendas', 'combos', 'fornecedores', 'pedidosCompra', 'caixas'];
  const AUTH_STORES = ['usuarios', 'lojas'];
  const DEMO_EMAIL = 'demo@balcao.app';
  const DEMO_SENHA = 'demo1234';
  const LOJA_ID = 1;

  /* ---------------- Persistência ---------------- */

  let memoria = null; // usado se o localStorage estiver bloqueado

  function salvar(db) {
    memoria = db;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(db)); } catch (e) { /* só memória */ }
  }

  function carregar() {
    if (memoria) return memoria;
    try {
      const txt = localStorage.getItem(STORAGE_KEY);
      if (txt) { memoria = JSON.parse(txt); return memoria; }
    } catch (e) { /* recria abaixo */ }
    memoria = criarBancoDemo();
    salvar(memoria);
    return memoria;
  }

  /* ---------------- Dados de exemplo ---------------- */

  // Gerador pseudoaleatório com semente fixa: a demonstração fica sempre igual.
  function prng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function isoDia(offsetDias) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDias);
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 10);
  }

  function isoDataHora(offsetDias, hora, minuto) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDias);
    d.setHours(hora, minuto, 0, 0);
    return d.toISOString();
  }

  const r2 = (n) => Math.round(n * 100) / 100;

  function criarBancoDemo() {
    const rnd = prng(20261020);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const agora = new Date().toISOString();

    const db = { _meta: { nextIds: {}, demo: true, criadoEm: agora } };
    STORES.concat(AUTH_STORES).forEach((s) => { db[s] = []; });

    db.lojas.push({ id: LOJA_ID, nome: 'Adega Boa Hora', codigoConvite: 'DEMO24', criadoEm: isoDataHora(-60, 9, 0) });
    db.usuarios.push(
      { id: 1, lojaId: LOJA_ID, nome: 'Ana Ribeiro', email: DEMO_EMAIL, senha: DEMO_SENHA, telefone: '(11) 90000-0000', cargo: 'Proprietária', foto: '', papel: 'admin', criadoEm: isoDataHora(-60, 9, 0) },
      { id: 2, lojaId: LOJA_ID, nome: 'Bruno Lima', email: 'bruno@exemplo.com', senha: DEMO_SENHA, cargo: 'Atendente', foto: '', papel: 'membro', criadoEm: isoDataHora(-40, 9, 0) },
      { id: 3, lojaId: LOJA_ID, nome: 'Carla Mendes', email: 'carla@exemplo.com', senha: DEMO_SENHA, cargo: 'Atendente (fim de semana)', foto: '', papel: 'membro', criadoEm: isoDataHora(-20, 9, 0) }
    );

    const fornecedores = [
      { nome: 'Distribuidora Central', telefone: '(11) 3000-1000', email: 'pedidos@distcentral.exemplo', observacoes: 'Entrega às terças e sextas.' },
      { nome: 'Atacado Bebidas SP', telefone: '(11) 3000-2000', email: 'vendas@atacadosp.exemplo', observacoes: 'Pedido mínimo de R$ 500.' },
      { nome: 'Importadora Drinks', telefone: '(11) 3000-3000', email: 'contato@importdrinks.exemplo', observacoes: '' },
      { nome: 'Fonte Pura', telefone: '(11) 3000-4000', email: '', observacoes: 'Água e gelo.' },
    ];
    fornecedores.forEach((f, i) => db.fornecedores.push({ id: i + 1, lojaId: LOJA_ID, ...f }));

    const produtos = [
      ['CERV001', 'Cerveja Pilsen Lata 350ml', 'Cerveja', 'Lata', 2.5, 4.5, 140, 48, 'Distribuidora Central', 12, 9],
      ['CERV002', 'Cerveja Puro Malte 600ml', 'Cerveja', 'Garrafa', 6.0, 11.9, 64, 24, 'Distribuidora Central', 24, 5],
      ['CERV003', 'Cerveja IPA Long Neck 355ml', 'Cerveja', 'Garrafa', 5.2, 9.9, 36, 12, 'Distribuidora Central', 6, 2],
      ['CERV004', 'Cerveja Pilsen Lata 473ml', 'Cerveja', 'Lata', 3.4, 6.0, 20, 24, 'Distribuidora Central', 12, 6],
      ['REFRI001', 'Refrigerante Cola 2L', 'Refrigerante', 'Garrafa', 5.5, 9.9, 42, 12, 'Atacado Bebidas SP', 6, 4],
      ['REFRI002', 'Refrigerante Guaraná Lata 350ml', 'Refrigerante', 'Lata', 2.2, 4.0, 85, 24, 'Atacado Bebidas SP', 12, 4],
      ['REFRI003', 'Refrigerante Limão 2L', 'Refrigerante', 'Garrafa', 4.8, 8.5, 18, 6, 'Atacado Bebidas SP', 6, 1],
      ['AGUA001', 'Água Mineral sem Gás 500ml', 'Água', 'Garrafa', 0.9, 2.5, 160, 36, 'Fonte Pura', 12, 6],
      ['AGUA002', 'Água com Gás 500ml', 'Água', 'Garrafa', 1.2, 3.0, 48, 12, 'Fonte Pura', 12, 2],
      ['GELO001', 'Gelo em Cubos 5kg', 'Outros', 'Pacote', 6.0, 12.0, 14, 6, 'Fonte Pura', 1, 2],
      ['SUCO001', 'Suco de Laranja 1L', 'Suco', 'Litro', 4.0, 8.5, 22, 8, 'Atacado Bebidas SP', 6, 1],
      ['DEST001', 'Vodka Nacional 900ml', 'Destilado', 'Garrafa', 18.0, 34.9, 15, 4, 'Importadora Drinks', 6, 1],
      ['DEST002', 'Cachaça Ouro 700ml', 'Destilado', 'Garrafa', 14.0, 27.9, 11, 3, 'Importadora Drinks', 6, 1],
      ['DEST003', 'Gin Nacional 750ml', 'Destilado', 'Garrafa', 32.0, 59.9, 6, 3, 'Importadora Drinks', 6, 0],
      ['ENERG001', 'Energético Lata 250ml', 'Energético', 'Lata', 4.5, 8.9, 4, 15, 'Atacado Bebidas SP', 6, 3],
      ['ISO001', 'Isotônico 500ml', 'Isotônico', 'Garrafa', 3.2, 6.5, 24, 6, 'Atacado Bebidas SP', 6, 1],
      ['VINH001', 'Vinho Tinto Seco 750ml', 'Vinho', 'Garrafa', 15.0, 28.9, 18, 5, 'Importadora Drinks', 6, 1],
      ['VINH002', 'Espumante Brut 750ml', 'Vinho', 'Garrafa', 22.0, 44.9, 9, 3, 'Importadora Drinks', 6, 0],
    ];
    // validades: um produto vencendo, um vencido (para mostrar os alertas)
    const validades = { SUCO001: isoDia(4), ISO001: isoDia(-2), CERV003: isoDia(90), REFRI003: isoDia(45) };
    const pesos = [];
    produtos.forEach((p, i) => {
      const [sku, nome, categoria, unidade, precoCusto, precoVenda, estoqueAtual, estoqueMinimo, fornecedor, unidadesPorCaixa, peso] = p;
      db.produtos.push({
        id: i + 1, lojaId: LOJA_ID, sku, codigoBarras: '789' + String(1000000000 + i * 7919).slice(0, 10),
        nome, categoria, unidade, precoCusto, precoVenda, estoqueAtual, estoqueMinimo, fornecedor, unidadesPorCaixa,
        validade: validades[sku] || '', ativo: true, criadoEm: isoDataHora(-60, 10, 0), atualizadoEm: isoDataHora(-1, 10, 0),
      });
      for (let k = 0; k < peso; k++) pesos.push(i + 1);
    });
    const prodPorId = Object.fromEntries(db.produtos.map((p) => [p.id, p]));

    const clientes = [
      { nome: 'Bar do João', telefone: '(11) 98888-1111', documento: '', endereco: 'Rua das Flores, 123', observacoes: 'Cliente frequente, compra às sextas.', limiteFiado: 500 },
      { nome: 'Mercadinho da Esquina', telefone: '(11) 97777-2222', documento: '', endereco: 'Av. Central, 900', observacoes: '', limiteFiado: 800 },
      { nome: 'Maria Souza', telefone: '(11) 96666-3333', documento: '', endereco: '', observacoes: 'Compra para eventos.', limiteFiado: 300 },
      { nome: 'Pedro Alves', telefone: '(11) 95555-4444', documento: '', endereco: 'Rua Ipê, 45', observacoes: '', limiteFiado: 200 },
      { nome: 'Lanchonete Sabor & Cia', telefone: '(11) 94444-5555', documento: '', endereco: 'Rua do Comércio, 77', observacoes: 'Pede entrega.', limiteFiado: 600 },
      { nome: 'Juliana Costa', telefone: '(11) 93333-6666', documento: '', endereco: '', observacoes: '', limiteFiado: 0 },
    ];
    clientes.forEach((c, i) => db.clientes.push({ id: i + 1, lojaId: LOJA_ID, ...c, criadoEm: isoDataHora(-55 + i, 11, 0) }));

    db.combos.push({
      id: 1, lojaId: LOJA_ID, nome: 'Combo Churrasco (12 latas + gelo)', precoVenda: 59.9, ativo: true,
      componentes: [{ produtoId: 1, quantidade: 12 }, { produtoId: 10, quantidade: 1 }],
    });

    // Caixas: um fechamento por dia nos últimos dias + o caixa de hoje aberto
    let caixaId = 1;
    const caixaDoDia = {};
    // O caixa de hoje abriu às 8h (ou 30 min atrás, se ainda for cedo); as
    // vendas de hoje ficam distribuídas entre a abertura e agora.
    const oitoHoras = new Date(); oitoHoras.setHours(8, 0, 0, 0);
    const aberturaHoje = Date.now() - oitoHoras.getTime() > 90 * 60 * 1000 ? oitoHoras : new Date(Date.now() - 30 * 60 * 1000);
    const duracaoHoje = Date.now() - aberturaHoje.getTime();
    for (let d = -29; d <= 0; d++) {
      const aberto = d === 0;
      const operador = aberto ? db.usuarios[0] : (d % 7 === 0 || d % 7 === -1 ? db.usuarios[2] : (d % 2 ? db.usuarios[1] : db.usuarios[0]));
      const c = {
        id: caixaId++, lojaId: LOJA_ID, status: aberto ? 'aberto' : 'fechado',
        abertoEm: aberto ? aberturaHoje.toISOString() : isoDataHora(d, 9, 0), abertoPorId: operador.id, abertoPorNome: operador.nome,
        valorInicial: 150, movimentos: [],
      };
      db.caixas.push(c);
      caixaDoDia[d] = c;
    }

    // Vendas dos últimos 30 dias (mais movimento no fim de semana)
    let vendaId = 1;
    let movId = 1;
    let contaId = 1;
    const formas = ['Dinheiro', 'Pix', 'Pix', 'Pix', 'Cartão Débito', 'Cartão Crédito'];
    for (let d = -29; d <= 0; d++) {
      const dia = new Date(); dia.setDate(dia.getDate() + d);
      const fimDeSemana = [0, 5, 6].includes(dia.getDay());
      const qtdVendas = d === 0 ? 6 : (fimDeSemana ? 9 : 5) + Math.floor(rnd() * 4);
      const caixa = caixaDoDia[d];
      for (let v = 0; v < qtdVendas; v++) {
        const data = d === 0
          ? new Date(aberturaHoje.getTime() + ((v + 0.5) / qtdVendas) * duracaoHoje * 0.95).toISOString()
          : isoDataHora(d, 10 + Math.floor(rnd() * 12), Math.floor(rnd() * 60));
        const nItens = 1 + Math.floor(rnd() * 3);
        const itens = [];
        for (let j = 0; j < nItens; j++) {
          const p = prodPorId[pick(pesos)];
          if (itens.some((i) => i.produtoId === p.id)) continue;
          const qtd = p.precoVenda < 7 ? 2 + Math.floor(rnd() * 10) : 1 + Math.floor(rnd() * 2);
          itens.push({ tipo: 'produto', produtoId: p.id, comboId: null, componentes: null, nome: p.nome, quantidade: qtd, precoUnit: p.precoVenda, descontoPct: 0, subtotal: r2(p.precoVenda * qtd) });
        }
        if (rnd() < 0.06) {
          const combo = db.combos[0];
          itens.push({ tipo: 'combo', produtoId: null, comboId: combo.id, componentes: combo.componentes, nome: combo.nome, quantidade: 1, precoUnit: combo.precoVenda, descontoPct: 0, subtotal: combo.precoVenda });
        }
        const subtotal = r2(itens.reduce((s, i) => s + i.subtotal, 0));
        const desconto = rnd() < 0.12 ? r2(Math.round(subtotal * 0.05)) : 0;
        const total = r2(subtotal - desconto);
        const cliente = rnd() < 0.45 ? db.clientes[Math.floor(rnd() * db.clientes.length)] : null;
        const fiado = !!(cliente && cliente.limiteFiado > 0 && rnd() < 0.18 && d > -25);
        const forma = fiado ? 'Fiado' : pick(formas);
        const operador = db.usuarios.find((u) => u.id === caixa.abertoPorId);
        const recebido = forma === 'Dinheiro' ? Math.ceil(total / 10) * 10 : total;
        const vencimento = fiado ? isoDia(d + 15) : null;
        const venda = {
          id: vendaId++, lojaId: LOJA_ID, data, operadorId: operador.id, operadorNome: operador.nome, caixaId: caixa.id,
          clienteId: cliente ? cliente.id : null, clienteNome: cliente ? cliente.nome : 'Venda avulsa',
          itens, subtotal, descontoItens: 0, desconto, acrescimo: 0, ajusteTipo: 'desconto', ajustePercentual: false, total,
          formaPagamento: forma, pagamentos: [{ metodo: forma, valor: total }], statusPagamento: fiado ? 'fiado' : 'pago',
          valorFiado: fiado ? total : 0, valorRecebido: recebido, troco: r2(recebido - total), vencimento,
        };
        db.vendas.push(venda);

        itens.forEach((i) => {
          const linhas = i.tipo === 'combo' ? i.componentes.map((c) => ({ produtoId: c.produtoId, quantidade: c.quantidade * i.quantidade })) : [{ produtoId: i.produtoId, quantidade: i.quantidade }];
          linhas.forEach((l) => db.movimentacoesEstoque.push({ id: movId++, lojaId: LOJA_ID, produtoId: l.produtoId, produtoNome: prodPorId[l.produtoId].nome, tipo: 'saida', quantidade: l.quantidade, motivo: `Venda #${venda.id}`, vendaId: venda.id, data }));
        });

        if (fiado) {
          const pago = d < -16 && rnd() < 0.6;
          db.contas.push({ id: contaId++, lojaId: LOJA_ID, tipo: 'receber', descricao: `Venda #${venda.id} - ${cliente.nome}`, valor: total, valorPago: pago ? total : 0, vencimento, status: pago ? 'pago' : 'pendente', clienteId: cliente.id, vendaId: venda.id, criadoEm: data, ...(pago ? { pagoEm: isoDataHora(d + 10, 15, 0) } : {}) });
        }
      }
      if (!caixaDoDia[d].status || caixaDoDia[d].status === 'fechado') {
        const c = caixaDoDia[d];
        c.fechadoEm = isoDataHora(d, 22, 30);
        c.fechadoPorNome = c.abertoPorNome;
      }
    }

    // Uma venda cancelada (para o histórico mostrar o estado)
    const cancelada = db.vendas[Math.floor(db.vendas.length * 0.4)];
    if (cancelada && cancelada.statusPagamento !== 'fiado') {
      cancelada.status = 'cancelada';
      cancelada.canceladaEm = cancelada.data;
      cancelada.canceladaPorId = 1;
      cancelada.canceladaPorNome = 'Ana Ribeiro';
      cancelada.motivoCancelamento = 'Cliente desistiu';
    }

    // Entradas de estoque (reposições)
    [[-26, 1, 120], [-26, 8, 96], [-19, 2, 48], [-19, 6, 72], [-12, 1, 96], [-12, 5, 24], [-5, 8, 60], [-5, 3, 24]].forEach(([d, pid, q]) => {
      db.movimentacoesEstoque.push({ id: movId++, lojaId: LOJA_ID, produtoId: pid, produtoNome: prodPorId[pid].nome, tipo: 'entrada', quantidade: q, motivo: 'Reposição de fornecedor', vendaId: null, data: isoDataHora(d, 8, 30) });
    });

    // Contas a pagar
    [
      ['Distribuidora Central - reposição de cervejas', 1280.0, isoDia(5), 'pendente', 'Distribuidora Central'],
      ['Aluguel do ponto', 2200.0, isoDia(-3), 'pendente', ''],
      ['Conta de energia', 386.4, isoDia(9), 'pendente', ''],
      ['Atacado Bebidas SP - refrigerantes', 640.0, isoDia(-12), 'pago', 'Atacado Bebidas SP'],
      ['Internet e telefone', 129.9, isoDia(-8), 'pago', ''],
    ].forEach(([descricao, valor, vencimento, status, fornecedor]) => {
      db.contas.push({ id: contaId++, lojaId: LOJA_ID, tipo: 'pagar', descricao, valor, vencimento, status, fornecedor, criadoEm: isoDataHora(-20, 10, 0), ...(status === 'pago' ? { valorPago: valor, pagoEm: vencimento + 'T13:00:00.000Z' } : {}) });
    });

    // Pedido de compra em aberto
    db.pedidosCompra.push({
      id: 1, lojaId: LOJA_ID, fornecedorId: 2, fornecedorNome: 'Atacado Bebidas SP', status: 'pendente', data: isoDataHora(-1, 16, 0), criadoEm: isoDataHora(-1, 16, 0),
      itens: [{ produtoId: 15, nome: 'Energético Lata 250ml', quantidade: 36, precoCusto: 4.5 }, { produtoId: 4, nome: 'Cerveja Pilsen Lata 473ml', quantidade: 48, precoCusto: 3.4 }],
      total: r2(36 * 4.5 + 48 * 3.4), observacoes: 'Gerado a partir das sugestões de reposição',
    });

    // Encomendas (entregas agendadas)
    const enc = (id, dia, clienteIdx, itensDef, forma, obs) => {
      const c = db.clientes[clienteIdx];
      const itens = itensDef.map(([pid, q]) => ({ tipo: 'produto', produtoId: pid, nome: prodPorId[pid].nome, quantidade: q, precoUnit: prodPorId[pid].precoVenda, descontoPct: 0, subtotal: r2(prodPorId[pid].precoVenda * q) }));
      const subtotal = r2(itens.reduce((s, i) => s + i.subtotal, 0));
      db.encomendas.push({ id, lojaId: LOJA_ID, dataEntrega: isoDia(dia), clienteId: c.id, clienteNome: c.nome, itens, subtotal, desconto: 0, total: subtotal, formaPagamento: forma, observacoes: obs, status: 'pendente', criadoEm: isoDataHora(-2, 14, 0) });
    };
    enc(1, 1, 2, [[1, 48], [10, 2], [8, 24]], 'Pix', 'Aniversário — entregar até 17h');
    enc(2, 3, 4, [[5, 12], [6, 24]], 'Fiado', 'Entregar pela porta dos fundos');
    enc(3, 6, 0, [[2, 24], [12, 2]], 'Dinheiro', '');

    // Configurações da loja (Pix fictício para o QR Code de exemplo)
    db.config.push(
      { chave: 'chavePix', valor: 'demo@balcao.app', lojaId: LOJA_ID },
      { chave: 'chavePixTipo', valor: 'email', lojaId: LOJA_ID },
      { chave: 'pixNome', valor: 'Adega Boa Hora', lojaId: LOJA_ID },
      { chave: 'pixCidade', valor: 'Sao Paulo', lojaId: LOJA_ID }
    );

    STORES.concat(AUTH_STORES).forEach((s) => {
      db._meta.nextIds[s] = db[s].reduce((m, i) => Math.max(m, i.id || 0), 0) + 1;
    });
    return db;
  }

  /* ---------------- Sessão ---------------- */

  function criarToken(usuarioId) { return 'demo.' + usuarioId; }
  function lerToken(headers) {
    const auth = (headers && (headers.Authorization || headers.authorization)) || '';
    const m = String(auth).match(/^Bearer\s+demo\.(\d+)$/i);
    return m ? parseInt(m[1], 10) : null;
  }

  function usuarioPublico(u, loja) {
    return {
      id: u.id, nome: u.nome, email: u.email, telefone: u.telefone || '', cargo: u.cargo || '', foto: u.foto || '',
      criadoEm: u.criadoEm || null, papel: u.papel, lojaId: u.lojaId,
      loja: loja ? { id: loja.id, nome: loja.nome, codigoConvite: loja.codigoConvite } : null,
    };
  }

  function autenticar(db, headers) {
    const id = lerToken(headers);
    const usuario = id && db.usuarios.find((u) => u.id === id);
    if (!usuario) return null;
    const loja = db.lojas.find((l) => l.id === usuario.lojaId);
    return loja ? { usuario, loja } : null;
  }

  /* ---------------- Roteador (mesma lógica do server.js) ---------------- */

  const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const ok = (obj) => ({ status: 200, body: obj });
  const erro = (status, msg) => ({ status, body: { error: msg } });

  function tratarAuth(db, metodo, partes, body, headers) {
    const acao = partes[1];

    if (acao === 'login' && metodo === 'POST') {
      const email = String(body.email || '').trim().toLowerCase();
      const u = db.usuarios.find((x) => x.email === email);
      if (!u || u.senha !== body.senha) return erro(401, 'E-mail ou senha incorretos (na demonstração: ' + DEMO_EMAIL + ' / ' + DEMO_SENHA + ')');
      return ok({ token: criarToken(u.id), usuario: usuarioPublico(u, db.lojas.find((l) => l.id === u.lojaId)) });
    }

    if ((acao === 'registrar-loja' || acao === 'entrar-convite') && metodo === 'POST') {
      return erro(400, 'Na versão de demonstração não é possível criar contas. Use ' + DEMO_EMAIL + ' / ' + DEMO_SENHA + '.');
    }

    const sessao = autenticar(db, headers);
    if (!sessao) return erro(401, 'Sessão inválida');

    if (acao === 'me' && metodo === 'GET') return ok({ usuario: usuarioPublico(sessao.usuario, sessao.loja) });

    if (acao === 'equipe') {
      if (sessao.usuario.papel !== 'admin') return erro(403, 'Só o administrador da loja pode gerenciar a equipe');
      const daLoja = db.usuarios.filter((u) => u.lojaId === sessao.loja.id);
      const alvoId = partes[2] ? parseInt(partes[2], 10) : null;
      if (metodo === 'GET' && alvoId === null) {
        return ok(daLoja.map((u) => ({ id: u.id, nome: u.nome, email: u.email, papel: u.papel, cargo: u.cargo || '', foto: u.foto || '', criadoEm: u.criadoEm || null })));
      }
      const alvo = daLoja.find((u) => u.id === alvoId);
      if (!alvo) return erro(404, 'Pessoa não encontrada nesta loja');
      if (metodo === 'PUT') {
        const papel = body.papel === 'admin' ? 'admin' : 'membro';
        if (alvo.papel === 'admin' && papel !== 'admin' && daLoja.filter((u) => u.papel === 'admin').length <= 1) return erro(400, 'A loja precisa ter pelo menos um administrador');
        alvo.papel = papel;
        salvar(db);
        return ok({ ok: true });
      }
      if (metodo === 'DELETE') {
        if (alvo.id === sessao.usuario.id) return erro(400, 'Você não pode remover o seu próprio acesso');
        db.usuarios = db.usuarios.filter((u) => u.id !== alvo.id);
        salvar(db);
        return ok({ ok: true });
      }
    }

    if (acao === 'perfil' && metodo === 'PUT') {
      const u = sessao.usuario;
      if (body.nome !== undefined) {
        const nome = String(body.nome || '').trim();
        if (!nome) return erro(400, 'Informe seu nome');
        u.nome = nome;
      }
      if (body.email !== undefined) {
        const email = String(body.email || '').trim().toLowerCase();
        if (!EMAIL_REGEX.test(email)) return erro(400, 'E-mail inválido');
        if (db.usuarios.some((x) => x.email === email && x.id !== u.id)) return erro(400, 'Já existe outra conta com este e-mail');
        u.email = email;
      }
      if (body.telefone !== undefined) u.telefone = String(body.telefone || '').trim().slice(0, 30);
      if (body.cargo !== undefined) u.cargo = String(body.cargo || '').trim().slice(0, 60);
      if (body.foto !== undefined) {
        const foto = String(body.foto || '');
        if (foto && !/^data:image\/(jpeg|png|webp);base64,/.test(foto)) return erro(400, 'Formato de imagem inválido');
        if (foto.length > 2 * 1024 * 1024) return erro(400, 'Imagem muito grande');
        u.foto = foto;
      }
      if (body.novaSenha) {
        if ((body.senhaAtual || '') !== u.senha) return erro(400, 'A senha atual está incorreta');
        if (String(body.novaSenha).length < 4) return erro(400, 'A nova senha deve ter pelo menos 4 caracteres');
        u.senha = String(body.novaSenha);
      }
      u.atualizadoEm = new Date().toISOString();
      salvar(db);
      return ok({ usuario: usuarioPublico(u, sessao.loja) });
    }

    return erro(404, 'Rota de autenticação não encontrada');
  }

  function tratarApi(metodo, caminho, body, headers) {
    const db = carregar();
    const partes = caminho.split('/').filter(Boolean);

    if (partes[0] === '_ping') return ok({ ok: true, hora: new Date().toISOString(), demo: true });
    if (partes[0] === 'auth') return tratarAuth(db, metodo, partes, body, headers);

    const sessao = autenticar(db, headers);
    if (!sessao) return erro(401, 'Não autenticado — faça login novamente');
    const lojaId = sessao.loja.id;

    if (partes[0] === '_backup-status') return ok({ ultimoBackupEm: db._meta.ultimoBackupEm || null, pasta: 'navegador' });
    if (partes[0] === '_backup-agora' && metodo === 'POST') {
      db._meta.ultimoBackupEm = new Date().toISOString();
      salvar(db);
      return ok({ ok: true, arquivo: 'demo (salvo no navegador)', quando: db._meta.ultimoBackupEm });
    }
    if (partes[0] === '_export' && metodo === 'GET') {
      const copia = { _meta: { exportadoEm: new Date().toISOString(), loja: sessao.loja.nome } };
      STORES.forEach((s) => { copia[s] = db[s].filter((i) => i.lojaId === lojaId); });
      return ok(copia);
    }

    const ehAdmin = sessao.usuario.papel === 'admin';
    if (!ehAdmin) {
      const s0 = partes[0];
      const proibido = s0 === '_import' || metodo === 'DELETE' || (metodo === 'PUT' && s0 === 'vendas') ||
        (metodo !== 'GET' && s0 === 'config' && !(partes[1] || '').startsWith('fotoUsuario-'));
      if (proibido) return erro(403, 'Sua função (Caixa) não tem permissão para isso. Peça ao administrador da loja.');
    }

    if (partes[0] === '_import' && metodo === 'POST') {
      STORES.forEach((s) => {
        const restante = db[s].filter((i) => i.lojaId !== lojaId);
        const importados = Array.isArray(body[s]) ? body[s].map((item) => ({ ...item, lojaId })) : [];
        db[s] = restante.concat(importados);
        const maxId = db[s].reduce((m, item) => Math.max(m, item.id || 0), 0);
        if (maxId + 1 > (db._meta.nextIds[s] || 1)) db._meta.nextIds[s] = maxId + 1;
      });
      salvar(db);
      return ok({ ok: true });
    }

    if (partes[0] === 'estoque' && partes[1] === 'movimentar' && metodo === 'POST') {
      const { produtoId, tipo, quantidade, motivo, vendaId } = body;
      const produto = db.produtos.find((p) => p.id === produtoId && p.lojaId === lojaId);
      if (!produto) return erro(404, 'Produto não encontrado');
      const delta = tipo === 'entrada' ? Math.abs(quantidade) : tipo === 'saida' ? -Math.abs(quantidade) : quantidade;
      produto.estoqueAtual = (produto.estoqueAtual || 0) + delta;
      produto.atualizadoEm = new Date().toISOString();
      const registro = {
        id: db._meta.nextIds.movimentacoesEstoque++, lojaId, produtoId, produtoNome: produto.nome, tipo,
        quantidade: tipo === 'ajuste' ? delta : Math.abs(quantidade), motivo: motivo || '', vendaId: vendaId || null, data: new Date().toISOString(),
      };
      db.movimentacoesEstoque.push(registro);
      salvar(db);
      return ok({ produto, movimentacao: registro });
    }

    const store = partes[0];
    if (!STORES.includes(store)) return erro(404, 'Coleção não encontrada');
    const isConfig = store === 'config';
    const campo = isConfig ? 'chave' : 'id';
    const id = partes[1] !== undefined ? (isConfig ? decodeURIComponent(partes[1]) : parseInt(partes[1], 10)) : null;

    if (metodo === 'GET' && id === null) return ok(db[store].filter((i) => i.lojaId === lojaId));
    if (metodo === 'GET') {
      const item = db[store].find((i) => i[campo] === id && i.lojaId === lojaId);
      return item ? ok(item) : erro(404, 'Registro não encontrado');
    }
    if (metodo === 'POST' && id === null) {
      if (!db._meta.nextIds[store]) db._meta.nextIds[store] = 1;
      const obj = isConfig ? { ...body, lojaId } : { ...body, id: db._meta.nextIds[store]++, lojaId };
      if (isConfig) {
        const idx = db[store].findIndex((i) => i.chave === obj.chave && i.lojaId === lojaId);
        if (idx === -1) db[store].push(obj); else db[store][idx] = obj;
      } else {
        db[store].push(obj);
      }
      salvar(db);
      return ok(obj);
    }
    if (metodo === 'PUT' && id !== null) {
      const idx = db[store].findIndex((i) => i[campo] === id && i.lojaId === lojaId);
      const obj = isConfig ? { ...body, chave: id, lojaId } : { ...body, id, lojaId };
      if (idx === -1) {
        db[store].push(obj);
        if (!isConfig && id >= (db._meta.nextIds[store] || 1)) db._meta.nextIds[store] = id + 1;
      } else {
        db[store][idx] = obj;
      }
      salvar(db);
      return ok(obj);
    }
    if (metodo === 'DELETE' && id !== null) {
      db[store] = db[store].filter((i) => !(i[campo] === id && i.lojaId === lojaId));
      salvar(db);
      return ok({ ok: true });
    }
    if (metodo === 'DELETE') {
      db[store] = db[store].filter((i) => i.lojaId !== lojaId);
      salvar(db);
      return ok({ ok: true });
    }
    return erro(405, 'Método não permitido');
  }

  /* ---------------- Interceptação do fetch ---------------- */

  const fetchOriginal = window.fetch.bind(window);

  function normalizarHeaders(h) {
    if (!h) return {};
    if (typeof Headers !== 'undefined' && h instanceof Headers) { const o = {}; h.forEach((v, k) => { o[k] = v; }); return o; }
    return h;
  }

  window.fetch = function (input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || '';
    const m = url.match(/^\/api(\/[^?#]*)/);
    if (!m) return fetchOriginal(input, init);

    const opts = init || {};
    const metodo = (opts.method || 'GET').toUpperCase();
    let body = {};
    if (opts.body) { try { body = JSON.parse(opts.body); } catch (e) { body = {}; } }

    let resultado;
    try {
      // Cópia profunda para que o app nunca altere o "banco" por referência
      resultado = tratarApi(metodo, m[1], body, normalizarHeaders(opts.headers));
      resultado = { status: resultado.status, body: JSON.parse(JSON.stringify(resultado.body)) };
    } catch (e) {
      resultado = { status: 400, body: { error: e.message || 'Erro na requisição' } };
    }
    const resposta = new Response(JSON.stringify(resultado.body), { status: resultado.status, headers: { 'Content-Type': 'application/json' } });
    // Pequeno atraso para imitar a rede e manter a ordem assíncrona do app
    return new Promise((resolve) => setTimeout(() => resolve(resposta), 15));
  };

  /* ---------------- API pública da demonstração ---------------- */

  window.DemoAPI = {
    email: DEMO_EMAIL,
    senha: DEMO_SENHA,
    restaurar() {
      memoria = null;
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* ok */ }
      carregar();
    },
  };
})();
