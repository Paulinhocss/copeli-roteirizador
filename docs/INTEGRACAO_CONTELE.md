# Integração Contele Fleet

O Control Tower usa a Contele Fleet como fonte de telemetria e execução física da frota.

## Objetivos

- posição atual dos veículos;
- ignição, velocidade e odômetro;
- motorista associado;
- trajetos realizados;
- km realizado;
- tempo realizado;
- comparação rota planejada x rota executada;
- futuramente eventos de condução, combustível, manutenção e checklist.

## Regra de autoridade

- **Deak**: pedido, cliente, NF, endereço, data prometida, valor e situação comercial/operacional.
- **Control Tower**: planejamento, rota, paradas, exceções, histórico, metas e melhoria contínua.
- **HERE**: geocodificação e otimização do plano.
- **Contele Fleet**: telemetria, localização e execução física do veículo.

Nenhuma dessas fontes deve sobrescrever silenciosamente a outra.

## Fluxo alvo

```
Deak / vw_copeli_Entrega
          |
          v
Control Tower
          |
          +--> HERE -> rota planejada
          |
          +--> Contele Fleet -> posição / trajeto / km real
          |
          v
Planejado x Realizado
          |
          v
Alertas -> Ocorrências -> Melhoria Contínua
```

## Credencial

A integração usa `x-api-key`.

Variável:

```
CONTELE_API_KEY=
```

A chave nunca deve ser gravada no Git.

## Endpoints internos

```
GET  /api/integracoes/contele/status
GET  /api/integracoes/contele/veiculos
GET  /api/integracoes/contele/posicoes
GET  /api/integracoes/contele/posicoes/cache
GET  /api/integracoes/contele/trackings
GET  /api/integracoes/contele/km
GET  /api/integracoes/contele/motoristas/:driverId/rotas
POST /api/integracoes/contele/rotas-planejadas
```

## Estratégia de sincronização em tempo real

"Guardar apenas a última posição" não significa consultar a Contele em intervalos longos.

Para veículos com **rastreador Contele**, a própria plataforma atualiza a localização aproximadamente a cada 15 segundos. Durante uma rota ativa, o Control Tower deve consultar a API de últimos pontos em ciclo curto e atualizar somente o estado mais recente de cada veículo.

Cadência inicial proposta:

- rota ativa: consultar Contele a cada **30 segundos**;
- veículo com ignição ligada fora de rota: a cada **60 segundos**;
- veículo parado / sem rota: a cada **3 a 5 minutos**;
- frontend do Control Tower: receber atualização do nosso backend por **SSE/WebSocket**, sem cada navegador consultar a Contele diretamente.

Assim, dez usuários olhando o mapa não geram dez vezes mais chamadas à API.

O registro `ct_contele_posicao_atual` funciona como estado operacional mais recente. Eventos relevantes devem ser persistidos separadamente, por exemplo:

- ignição ligada/desligada;
- saída do CD;
- entrada e saída de geofence de cliente;
- chegada à parada;
- desvio relevante da rota;
- parada prolongada;
- veículo sem comunicação;
- retorno ao CD.

Para reconstrução detalhada de uma viagem, o Control Tower consulta os trackings históricos da Contele no intervalo da rota e consolida km, tempo e trajetória.

> Se algum veículo utilizar apenas o modo Contele System/app do motorista, a frequência de origem pode ser muito menor (aproximadamente 5 minutos). O Control Tower deve exibir a idade da última posição e nunca aparentar uma precisão maior que a fonte.

## Próxima etapa

Após receber a chave da API da conta Copeli:

1. validar lista de veículos;
2. identificar os IDs Contele de cada veículo;
3. vincular veículo Control Tower <-> veículo Contele;
4. identificar os IDs dos motoristas;
5. validar posição atual;
6. validar relatório de km;
7. publicar uma rota de homologação;
8. comparar rota planejada x realizada.
