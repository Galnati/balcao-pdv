# Balcão: vendas, estoque e fiado

Sistema de ponto de venda (PDV) para adegas e distribuidoras de bebidas: caixa com leitor de código de barras, estoque com alertas de validade e reposição, vendas fiado com cobrança pelo WhatsApp, contas a pagar e receber e relatórios.

**[Abrir a demonstração](https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/)**

> Esta é a **versão de demonstração** para portfólio. Ela abre direto numa loja fictícia (Adega Boa Hora) com 30 dias de vendas de exemplo. Tudo funciona no próprio navegador, sem servidor e sem internet, e o que você alterar fica salvo só no seu aparelho. O botão **Restaurar dados** volta tudo ao estado inicial.

## O que dá pra testar

- **Início:** vendas do dia, lucro estimado, fiado a receber e uma lista do que precisa de atenção (fiado vencido, produto vencendo, estoque acabando).
- **Caixa:** venda por toque ou por código de barras, desconto, pagamento dividido, Pix com QR Code, comprovante para imprimir ou enviar pelo WhatsApp. Atalhos: `F2` abre o caixa, `F10` finaliza.
- **Vendas:** histórico, calendário e encomendas agendadas para entrega.
- **Produtos e Estoque:** margem, combos, validade, produtos parados e pedido de compra sugerido pela média de vendas.
- **Fiado:** saldo por cliente, limite de crédito e mensagem de cobrança pronta.
- **Contas e Relatórios:** despesas, recebimentos, faturamento, mais vendidos e formas de pagamento.
- **Configurações:** equipe com permissões (Administrador e Caixa), Pix da loja e backup em arquivo `.json`.

O app também é um PWA: dá pra instalar no celular ou no computador e ele abre offline depois da primeira visita.

## Como foi feito

- HTML, CSS e JavaScript puros, sem framework e sem build.
- Design do sistema visual no Figma.
- A versão real roda num servidor Node.js local (sem dependências externas) que guarda os dados num arquivo JSON e sincroniza os aparelhos da loja em tempo real por WebSocket, com login por loja e código de convite.
- Nesta versão de demonstração, o arquivo `js/demo-api.js` substitui o servidor: ele intercepta as chamadas à API e responde no próprio navegador, com a mesma lógica, salvando os dados no `localStorage`. O resto do app é o mesmo código da versão real.

## Rodar no computador

Basta abrir a pasta com qualquer servidor estático, por exemplo:

```bash
python -m http.server 8000
```

E acessar `http://localhost:8000`.

---

Projeto de Maicon Rodrigues.
