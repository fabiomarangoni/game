# Conversor de Tibia Coins

Página para converter **Gold (KK) ⇄ Tibia Coins ⇄ Reais** no Tibia, com um pequeno servidor
que busca os preços atuais em outros sites.

## Funcionalidades

- Parâmetros: Valor 250 TC (R$), Valor TC Servidor (Coin), Servidor e Valor Unitário TC (calculado).
- Botão **Buscar** no Valor 250 TC: preço de 250 TC no [Rei dos Coins](https://www.reidoscoins.com.br/Tibia/Tibia-Coins).
- Botão **Buscar** no Valor TC Servidor: "Média Preço Venda" do servidor no [TibiaTrade](https://tibiatrade.gg/pt/tc-to-gold).
- Conversor de Coin (KK → TC → R$) e Conversor de Tibia Coin (TC → KK → R$).
- Tabela de referência de 1 KK a 150 KK.
- Variação Histórica por servidor e guia Histórico com filtro por servidor.
- Últimos valores e histórico ficam salvos no navegador (localStorage).

## Webservices

| Rota | O que devolve |
| --- | --- |
| `GET /api/preco-250tc` | `{ ok, valor, valorTexto, quantidade, fonte, consultadoEm, cache }` |
| `GET /api/tc-servidor?servidor=Descubra` | `{ ok, servidor, mediaPrecoVenda, atualizadoEm, fonte, consultadoEm, cache }` |
| `GET /api/health` | `{ ok: true }` |

Em caso de erro: `{ ok: false, codigo, erro }` com status 400, 404, 502 ou 504.
Os resultados ficam em cache por 10 minutos (`CACHE_TTL_MS`).

**Como cada busca funciona**

- *Rei dos Coins*: o servidor abre a página do produto (que cria uma sessão e um token `tp`)
  e envia `quantity=250` para a mesma rota interna que o site usa ao mudar a quantidade,
  com o cookie da sessão.
- *TibiaTrade*: o servidor lê a tabela de todos os servidores em
  `/trpc/tibiaCoinPrice.list` (a mesma fonte da página `tc-to-gold`) e devolve a coluna
  `sell_average_price` ("Média Preço Venda") do servidor pedido.

Se algum dos sites mudar de layout, a rota responde com `codigo: "layout_alterado"` e a página
mostra a mensagem de erro sem alterar o campo.

## Rodar localmente

```bash
npm install
npm start          # http://localhost:3000
npm test           # testes das rotas com simuladores dos dois sites
```

## Publicar no Render

1. No Render, clique em **New → Blueprint** e escolha este repositório (o arquivo `render.yaml`
   já define o serviço). Ou **New → Web Service** com:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Health Check Path: `/api/health`
2. Abra o endereço `https://<nome-do-serviço>.onrender.com`.

No plano gratuito, o serviço "dorme" após 15 minutos sem acesso e leva cerca de 1 minuto
para acordar; a página avisa quando isso acontece.

Variáveis opcionais: `CACHE_TTL_MS`, `UPSTREAM_TIMEOUT_MS`, `ALLOW_ORIGIN`.
