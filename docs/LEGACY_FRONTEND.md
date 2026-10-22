# Frontend legado

A partir da V3, a interface oficial fica em `apps/web` (React + TypeScript + Vite).

Os antigos arquivos de frontend da raiz foram removidos da árvore ativa:

- `index.html`
- `admin.js`
- `roteirizacao-v2.js`
- `control-tower.js`
- `control-tower-realtime.js`

Eles permanecem disponíveis no histórico Git anterior à migração.

## Paridade

A V3 já cobre:

- cockpit Control Tower;
- resumo de KPIs;
- rotas oficiais;
- execução de rota/parada;
- acompanhamento externo de Transportadora e SEDEX;
- posições Contele via SSE;
- alertas e ocorrências;
- planejamento com demanda do Deak;
- geocodificação;
- HERE Tour Planning;
- definição de pontos de despacho;
- liberação oficial do planejamento;
- configuração de modo, depósito, motoristas, veículos, faixas de CEP e pontos externos.

Funcionalidades antigas específicas de manipulação manual/exportação devem ser reintroduzidas somente se ainda fizerem sentido no novo fluxo operacional, como componentes React tipados. Não adicionar novas regras ao frontend legado.
