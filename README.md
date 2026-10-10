# Tibia Legado — Conversor de Tibia Coins

Converte **Gold (KK) ⇄ Tibia Coins ⇄ Reais** no Tibia. A página busca os preços atuais
em outros sites por meio de um Web Service próprio.

```
game/
├── .github/workflows/      # CI/CD: testes, build e deploy no Render
├── backend/                # Web Service (Node.js + Express)
│   ├── src/
│   │   ├── controllers/    # validação de entrada, cache e respostas
│   │   ├── routes/         # endpoints da API
│   │   ├── services/       # busca no Rei dos Coins e no TibiaTrade
│   │   ├── config.js
│   │   └── server.js       # ponto de entrada
│   ├── tests/              # testes automatizados (node:test)
│   ├── .env.example
│   ├── Dockerfile
│   └── package.json
├── frontend/               # Página (HTML/JS puro, sem framework)
│   ├── public/             # index.html e config.js de desenvolvimento
│   ├── scripts/            # build e servidor local
│   ├── src/
│   │   ├── assets/         # estilos
│   │   ├── pages/          # tela do conversor
│   │   ├── services/       # chamadas à API
│   │   └── main.js         # ponto de entrada
│   ├── .env.example
│   ├── Dockerfile
│   └── package.json
├── docker-compose.yml
├── LICENSE
└── README.md
```

## Web Services

| Endpoint | O que faz | Resposta |
| --- | --- | --- |
| `GET /api/tibialegado_getTCValue` | Preço em R$ de 250 Tibia Coins no [Rei dos Coins](https://www.reidoscoins.com.br/Tibia/Tibia-Coins) | `{ ok, valor, valorTexto, quantidade, fonte, consultadoEm, cache }` |
| `GET /api/tibialegado_getAvgCoinValue?servidor=Descubra` | "Média Preço Venda" (gold por TC) do servidor no [TibiaTrade](https://tibiatrade.gg/pt/tc-to-gold) | `{ ok, servidor, mediaPrecoVenda, atualizadoEm, fonte, consultadoEm, cache }` |
| `GET /api/health` | Verificação de saúde | `{ ok: true }` |

Em caso de erro: `{ ok: false, codigo, erro }` com status 400, 404, 502 ou 504.
Os resultados ficam em cache por 10 minutos (`CACHE_TTL_MS`).

- **tibialegado_getTCValue**: abre a página do produto no Rei dos Coins (que cria uma sessão e um
  token `tp`) e envia `quantity=250` para a mesma rota interna que o site usa ao mudar a
  quantidade, com o cookie da sessão.
- **tibialegado_getAvgCoinValue**: lê a tabela de todos os servidores em
  `/trpc/tibiaCoinPrice.list` (a mesma fonte da página `tc-to-gold`) e devolve
  `sell_average_price` do servidor pedido, com a data em que o TibiaTrade atualizou o valor.

Se algum site mudar de layout, a API responde `codigo: "layout_alterado"` e a página mostra
a mensagem de erro sem alterar o campo.

## Rodar localmente

```bash
# Backend
cd backend && npm install && npm start      # http://localhost:3000
npm test                                     # testes da API

# Frontend (em outro terminal)
cd frontend && npm start                     # http://localhost:8080
```

Ou tudo junto com Docker: `docker compose up --build`.

## Publicar no Render

1. **Backend** — New → *Web Service*, repositório `game`:
   Root Directory `backend`, Build `npm install`, Start `npm start`, Health Check `/api/health`.
   Variável `ALLOW_ORIGIN` = endereço do frontend.
2. **Frontend** — New → *Static Site*, repositório `game`:
   Root Directory `frontend`, Build `npm run build`, Publish Directory `dist`.
   Variável `API_BASE_URL` = endereço do backend (ex.: `https://tibialegado-backend.onrender.com`).
3. **CI/CD (opcional)** — em cada serviço do Render, copie o *Deploy Hook* e salve no GitHub
   (Settings → Secrets and variables → Actions) como `RENDER_BACKEND_DEPLOY_HOOK` e
   `RENDER_FRONTEND_DEPLOY_HOOK`; crie também a variável `API_BASE_URL`. Com isso, os workflows
   testam e publicam a cada push. Para não publicar duas vezes, desligue o *Auto-Deploy* no Render.

No plano gratuito, o backend "dorme" após 15 minutos sem acesso e leva cerca de 1 minuto para
acordar; a página avisa quando isso acontece.

## Licença

[MIT](LICENSE)
