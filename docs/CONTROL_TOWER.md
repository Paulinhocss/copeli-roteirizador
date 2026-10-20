# Control Tower Logística — Copeli

## Visão

O antigo roteirizador passa a ser a base de um **Control Tower Logístico independente**, focado em execução, visibilidade, exceção e melhoria contínua.

A proposta não é apenas desenhar rotas. O sistema deve responder diariamente:

1. **O que precisa ser entregue?**
2. **Qual é o melhor plano?**
3. **O que está acontecendo agora?**
4. **Onde a operação está saindo do planejado?**
5. **Por que os desvios acontecem?**
6. **Qual ação de melhoria está em andamento e qual resultado ela gerou?**

## Arquitetura funcional

### 1. Cockpit Operacional

Visão do dia com:

- entregas previstas;
- entregas roteirizadas;
- entregas sem rota;
- rotas liberadas / em rota / concluídas;
- entregas concluídas / não entregues / reagendadas;
- valor em rota;
- km planejado e, quando houver fonte confiável, km realizado;
- alertas críticos;
- mapa com situação das rotas.

### 2. Planejamento e Roteirização

Mantém os dois modos já definidos:

- **Faixas de CEP**: faixa define o motorista; HERE otimiza a sequência.
- **Otimização por frota**: X entregas + Y veículos; HERE distribui e sequencia.

O resultado do planejamento deixa de ser temporário. Ao liberar a rota, uma fotografia do plano deve ser persistida.

### 3. Execução

Ciclo operacional sugerido:

```
PLANEJADA
  -> LIBERADA
  -> EM_ROTA
  -> FINALIZADA
```

Paradas:

```
PENDENTE
  -> EM_DESLOCAMENTO
  -> NO_CLIENTE
  -> ENTREGUE
```

Exceções:

```
NAO_ENTREGUE | REAGENDADA | CANCELADA
```

Cada mudança gera evento com data/hora, fonte e usuário.

### 4. Gestão por Exceção

O Control Tower deve destacar automaticamente situações como:

- entrega sem geocodificação;
- entrega sem rota;
- CEP sem faixa no modo CEP;
- rota com excesso de paradas;
- entrega vencida;
- rota não iniciada no horário esperado;
- entrega não realizada;
- reincidência por cliente, bairro, cidade ou motivo;
- excesso de km planejado;
- baixa produtividade;
- plano de ação vencido.

### 5. Performance

KPIs iniciais:

**Demanda**
- entregas programadas;
- backlog;
- valor programado;
- entregas por cidade / região.

**Planejamento**
- rotas por dia;
- km planejado;
- entregas por rota;
- km por entrega;
- percentual sem rota;
- percentual com erro de geocodificação.

**Execução**
- taxa de entrega;
- first-attempt delivery rate;
- taxa de não entrega;
- taxa de reagendamento;
- tempo de rota;
- entregas por hora;
- aderência planejado x realizado.

**Qualidade**
- ocorrências por 100 entregas;
- Pareto de motivos;
- reincidência;
- erro de endereço;
- cliente ausente / fechado;
- divergência operacional.

**Econômico**
- valor transportado por rota;
- R$/km;
- custo estimado de ocorrências;
- economia comprovada das melhorias.

> Km real só deve ser apresentado quando existir fonte confiável, como telemetria, odômetro ou rastreamento. Até lá, o indicador deve ser explicitamente "km planejado".

### 6. Melhoria Contínua

O módulo de melhoria contínua deve transformar desvios em ações gerenciáveis.

Fluxo:

```
Indicador / ocorrência
      ↓
Oportunidade
      ↓
Análise de causa
      ↓
Plano 5W2H
      ↓
Execução
      ↓
Validação do resultado
      ↓
Padronização / conclusão
```

Cada melhoria deve registrar linha de base, meta, responsável, prazo, resultado atual e economia estimada.

## Fontes

### Deak / SQL Server

Somente leitura:

- pedidos;
- clientes;
- endereços;
- data prometida;
- NF;
- valor;
- vendedor;
- situação operacional disponível.

Fonte inicial: `dbo.vw_copeli_Entrega`.

### PostgreSQL do Control Tower

Autoridade para:

- configuração;
- motoristas e veículos;
- faixas de CEP;
- planejamento liberado;
- rotas;
- paradas;
- eventos;
- ocorrências;
- alertas;
- metas;
- planos de melhoria.

### HERE

- geocodificação;
- routing;
- Tour Planning.

### Contele Fleet

Fonte de execução física e telemetria:

- posição atual dos veículos;
- motorista vinculado;
- ignição e velocidade;
- odômetro;
- trajetos realizados;
- km realizado;
- tempo realizado;
- base para planejado x realizado.

O Control Tower não deve persistir indiscriminadamente cada ponto de GPS. A posição atual fica em cache operacional; o histórico detalhado é consultado na Contele por período e os indicadores consolidados são armazenados no Control Tower.

## Roadmap

### Fase 1 — Fundação Control Tower

- persistência de rota/parada;
- cockpit diário;
- eventos;
- ocorrências;
- alertas básicos;
- histórico.

### Fase 2 — Execução

- liberação de rota;
- atualização de status;
- tela operacional do motorista / conferente;
- não entrega e motivo;
- reagendamento;
- planejado x realizado em tempo.

### Fase 3 — Performance

- dashboards;
- metas;
- Pareto;
- motorista / veículo / região / cliente;
- tendências semanais e mensais.

### Fase 4 — Melhoria Contínua

- oportunidades automáticas;
- plano 5W2H;
- responsáveis e prazos;
- baseline x resultado;
- economia e ganho operacional.

### Fase 5 — Telemetria e custo

Com a integração Contele Fleet, parte desta fase pode ser antecipada:

- GPS / rastreador / odômetro via Contele;
- km real;
- tempo real;
- custo por veículo;
- consumo;
- custo por entrega;
- produtividade completa.

## Regra de arquitetura

O Control Tower continua **independente do Vanguard One**.

O Deak é fonte operacional/comercial e deve ser consumido preferencialmente em leitura. O PostgreSQL do Control Tower mantém o histórico logístico que não pode desaparecer quando o estado do pedido muda no ERP.


## Tratamento dos tipos de entrega

O Control Tower deve **trazer todas as demandas logísticas elegíveis da origem**, inclusive:

- ENTREGA PRÓPRIA;
- ENTREGA TRANSPORTADORA;
- SEDEX.

Nenhuma delas deve desaparecer do cockpit.

A diferença está no tratamento operacional:

- **ENTREGA PRÓPRIA**: entra normalmente no planejamento da frota própria e pode ser otimizada pelo HERE.
- **ENTREGA TRANSPORTADORA**: aparece no cockpit com aviso visual de operação terceirizada. Não entra automaticamente na otimização da frota própria, salvo intervenção explícita do gestor.
- **SEDEX**: aparece no cockpit com aviso visual de expedição postal. Não entra automaticamente na otimização da frota própria.

O gestor deve conseguir filtrar por modalidade, enxergar o volume e o valor de cada grupo e identificar rapidamente demandas que exigem acompanhamento externo.

Sugestão visual:

- ENTREGA PRÓPRIA: status operacional normal;
- TRANSPORTADORA: badge/alerta "TERCEIRIZADA";
- SEDEX: badge/alerta "SEDEX / ACOMPANHAR POSTAGEM".

Se uma entrega terceirizada ou SEDEX permanecer sem avanço além do SLA configurado, o Control Tower deve gerar alerta de exceção.
