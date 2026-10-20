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

## Estratégia de sincronização

A posição atual pode ser consultada com alta frequência, mas o PostgreSQL guarda apenas o último estado por veículo. Não devemos persistir indiscriminadamente um ponto a cada poucos segundos.

Para histórico, o Control Tower consulta os trackings da Contele no intervalo da rota e consolida os indicadores relevantes.

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
