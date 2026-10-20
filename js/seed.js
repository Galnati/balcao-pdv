/* ==========================================================================
   seed.js — Popular dados de exemplo para testes
   ========================================================================== */

const Seed = {
  async popular() {
    const produtosExemplo = [
      { sku: 'CERV001', nome: 'Cerveja Pilsen Lata 350ml', categoria: 'Cerveja', unidade: 'Lata', precoCusto: 2.5, precoVenda: 4.5, estoqueAtual: 120, estoqueMinimo: 24, fornecedor: 'Distribuidora Central', ativo: true },
      { sku: 'CERV002', nome: 'Cerveja Puro Malte 600ml', categoria: 'Cerveja', unidade: 'Garrafa', precoCusto: 6.0, precoVenda: 11.9, estoqueAtual: 60, estoqueMinimo: 12, fornecedor: 'Distribuidora Central', ativo: true },
      { sku: 'REFRI001', nome: 'Refrigerante Cola 2L', categoria: 'Refrigerante', unidade: 'Garrafa', precoCusto: 5.5, precoVenda: 9.9, estoqueAtual: 40, estoqueMinimo: 10, fornecedor: 'Atacado Bebidas SP', ativo: true },
      { sku: 'REFRI002', nome: 'Refrigerante Guaraná Lata 350ml', categoria: 'Refrigerante', unidade: 'Lata', precoCusto: 2.2, precoVenda: 4.0, estoqueAtual: 80, estoqueMinimo: 20, fornecedor: 'Atacado Bebidas SP', ativo: true },
      { sku: 'AGUA001', nome: 'Água Mineral sem Gás 500ml', categoria: 'Água', unidade: 'Garrafa', precoCusto: 0.9, precoVenda: 2.5, estoqueAtual: 150, estoqueMinimo: 30, fornecedor: 'Fonte Pura', ativo: true },
      { sku: 'SUCO001', nome: 'Suco de Laranja 1L', categoria: 'Suco', unidade: 'Litro', precoCusto: 4.0, precoVenda: 8.5, estoqueAtual: 25, estoqueMinimo: 8, fornecedor: 'Sucos Naturais Ltda', ativo: true },
      { sku: 'DEST001', nome: 'Vodka Nacional 900ml', categoria: 'Destilado', unidade: 'Garrafa', precoCusto: 18.0, precoVenda: 34.9, estoqueAtual: 15, estoqueMinimo: 4, fornecedor: 'Importadora Drinks', ativo: true },
      { sku: 'ENERG001', nome: 'Energético Lata 250ml', categoria: 'Energético', unidade: 'Lata', precoCusto: 4.5, precoVenda: 8.9, estoqueAtual: 3, estoqueMinimo: 15, fornecedor: 'Atacado Bebidas SP', ativo: true },
      { sku: 'VINH001', nome: 'Vinho Tinto Seco 750ml', categoria: 'Vinho', unidade: 'Garrafa', precoCusto: 15.0, precoVenda: 28.9, estoqueAtual: 18, estoqueMinimo: 5, fornecedor: 'Importadora Drinks', ativo: true },
    ];

    const clientesExemplo = [
      { nome: 'Bar do João', telefone: '(11) 98888-1111', documento: '111.222.333-44', endereco: 'Rua das Flores, 123', observacoes: 'Cliente frequente, compra às sextas.' },
      { nome: 'Mercadinho da Esquina', telefone: '(11) 97777-2222', documento: '22.333.444/0001-55', endereco: 'Av. Central, 900', observacoes: '' },
      { nome: 'Maria Souza', telefone: '(11) 96666-3333', documento: '555.666.777-88', endereco: '', observacoes: 'Compra para eventos.' },
    ];

    for (const p of produtosExemplo) {
      await Produtos.salvar({ ...p });
    }
    for (const c of clientesExemplo) {
      await Clientes.salvar({ ...c });
    }

    await Produtos.carregar();
    await Clientes.carregar();

    // Algumas vendas de exemplo nos últimos dias
    const produtos = Produtos.cache;
    const clientes = Clientes.cache;
    const formas = ['Dinheiro', 'Pix', 'Cartão Débito', 'Cartão Crédito'];

    for (let i = 0; i < 10; i++) {
      const dataVenda = new Date();
      dataVenda.setDate(dataVenda.getDate() - Math.floor(Math.random() * 10));

      const numItens = 1 + Math.floor(Math.random() * 3);
      const itens = [];
      for (let j = 0; j < numItens; j++) {
        const produto = produtos[Math.floor(Math.random() * produtos.length)];
        const qtd = 1 + Math.floor(Math.random() * 5);
        itens.push({ produtoId: produto.id, nome: produto.nome, quantidade: qtd, precoUnit: produto.precoVenda, subtotal: produto.precoVenda * qtd });
      }
      const subtotal = itens.reduce((s, i) => s + i.subtotal, 0);
      const desconto = Math.random() < 0.2 ? Math.round(subtotal * 0.05 * 100) / 100 : 0;
      const total = subtotal - desconto;
      const cliente = Math.random() < 0.6 ? clientes[Math.floor(Math.random() * clientes.length)] : null;
      const forma = formas[Math.floor(Math.random() * formas.length)];

      const venda = {
        data: dataVenda.toISOString(),
        clienteId: cliente ? cliente.id : null,
        clienteNome: cliente ? cliente.nome : 'Venda avulsa',
        itens,
        subtotal,
        desconto,
        total,
        formaPagamento: forma,
        statusPagamento: 'pago',
        valorRecebido: total,
        troco: 0,
        vencimento: null,
      };
      venda.id = await DB.add('vendas', venda);

      for (const item of itens) {
        await Estoque.registrarMovimentacao({ produtoId: item.produtoId, tipo: 'saida', quantidade: item.quantidade, motivo: `Venda #${venda.id} (exemplo)`, vendaId: venda.id }, true);
      }
    }

    // Contas de exemplo
    const vencFutura = new Date(); vencFutura.setDate(vencFutura.getDate() + 5);
    const vencAtrasada = new Date(); vencAtrasada.setDate(vencAtrasada.getDate() - 3);

    await DB.add('contas', { tipo: 'pagar', descricao: 'Fornecedor - reposição de estoque', valor: 850.0, vencimento: vencFutura.toISOString().slice(0, 10), status: 'pendente', fornecedor: 'Distribuidora Central', criadoEm: Utils.nowISO() });
    await DB.add('contas', { tipo: 'pagar', descricao: 'Aluguel do ponto', valor: 1200.0, vencimento: vencAtrasada.toISOString().slice(0, 10), status: 'pendente', fornecedor: '', criadoEm: Utils.nowISO() });
    await DB.add('contas', { tipo: 'receber', descricao: `Venda fiado - ${clientes[0].nome}`, valor: 120.5, vencimento: vencFutura.toISOString().slice(0, 10), status: 'pendente', clienteId: clientes[0].id, criadoEm: Utils.nowISO() });
  },
};
