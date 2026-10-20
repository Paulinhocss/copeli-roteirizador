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

A Control Tower **não depende de views prontas do Deak**. A leitura operacional é feita diretamente nas tabelas nativas necessárias, com SQL versionado no Git do projeto.

A antiga `dbo.vw_copeli_Entrega` permanece somente como referência temporária de paridade/homologação, nunca como contrato de dados do sistema.

Camada inicial de leitura:

- `Orcamento`: pedido, modalidade, data programada, endereço e frete;
- `OrcamentoItem`: composição/valor e situação dos itens;
- `Clientes`: identificação do cliente;
- `NFiscalOrcamento`: vínculo pedido-item-NF;
- `StatusPedido`: eventos do processo; não tratar simplesmente o último registro como status logístico.

A máquina de estados logística pertence ao Control Tower.

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

Todas as modalidades entram no cockpit e na operação da frota própria.

### Entrega própria

Fluxo físico:

```
COPELI -> CLIENTE FINAL
```

O destino operacional da rota é o endereço do cliente.

### Entrega transportadora

Fluxo físico:

```
COPELI -> TRANSPORTADORA -> CLIENTE FINAL
```

A primeira perna é executada pela frota Copeli. O motorista leva o material até a transportadora específica. Depois do despacho, a entrega passa para acompanhamento externo.

Para a HERE, vários pedidos destinados à mesma transportadora podem ser consolidados em **uma única parada física**, preservando o vínculo de todos os pedidos/volumes.

### SEDEX

Fluxo físico:

```
COPELI -> CORREIOS -> CLIENTE FINAL
```

A primeira perna também é executada pela frota Copeli. O motorista leva os volumes até o ponto/agência dos Correios configurado. Depois da postagem, passa para acompanhamento externo.

Vários pedidos SEDEX podem compartilhar uma única parada física nos Correios.

### Regra de segurança

Transportadora e SEDEX **não podem ser roteirizados para o endereço final do cliente por engano**. Antes da otimização/liberação, o sistema exige um `destino_operacional` válido:

- TRANSPORTADORA -> ponto físico da transportadora;
- SEDEX -> ponto/agência dos Correios.

Se o ponto ainda não estiver definido, a demanda continua visível no cockpit, porém a liberação é bloqueada com aviso ao gestor.

### Estados externos

Após a frota Copeli concluir a parada de despacho:

```
AGUARDANDO_DESPACHO
  -> DESPACHADO
  -> EM_TRANSITO
  -> ENTREGUE
```

Também existe `EXCECAO` para ocorrências no trecho terceirizado.

Assim medimos separadamente:

- SLA Copeli até o ponto de despacho;
- SLA externo;
- SLA total até o cliente final.


## Liberação oficial do planejamento

A otimização continua sendo uma simulação até o gestor clicar em **Liberar planejamento**.

Na liberação, o backend grava de forma transacional:

- um `ct_planejamento` com snapshot JSON completo;
- cada rota em `ct_rota`;
- cada parada em `ct_parada`;
- motorista, veículo, sequência, ETA, km, duração e valor planejados;
- modalidade e destino operacional;
- evento `ROTA_LIBERADA`.

Depois da liberação, o ciclo oficial é:

```
ROTA: LIBERADA -> EM_ROTA -> FINALIZADA
PARADA: PENDENTE -> EM_DESLOCAMENTO -> NO_CLIENTE -> ENTREGUE
```

As transições ficam registradas em `ct_evento`.


## Parada física x entrega

O modelo operacional distingue **parada física** de **entrega/pedido**.

```text
ct_rota
  -> ct_parada            (local físico visitado pelo motorista)
       -> ct_parada_entrega (um ou mais pedidos/entregas vinculados)
```

Exemplos:

- 1 entrega própria para um cliente = 1 parada + 1 entrega;
- 8 pedidos SEDEX levados à mesma agência = 1 parada nos Correios + 8 entregas;
- 6 pedidos para a mesma transportadora = 1 parada na transportadora + 6 entregas.

A HERE deve otimizar **paradas físicas**, não repetir o mesmo endereço de Correios/transportadora para cada pedido. O Control Tower preserva cada pedido individualmente para valor, SLA, rastreio, ocorrência e entrega final.

No trecho externo, o status é controlado em `ct_parada_entrega`, permitindo códigos de rastreio e situações diferentes para pedidos que saíram na mesma parada.


## Cockpit operacional implementado

A interface possui uma aba **Control Tower** com:

- data operacional;
- rotas oficiais do dia;
- rotas liberadas, em rota e finalizadas;
- numero de paradas fisicas e numero de entregas;
- valor em operacao e km planejado;
- separacao por Entrega Propria, Transportadora e SEDEX;
- acompanhamento do trecho externo;
- detalhes de cada rota e parada;
- comandos de inicio/finalizacao de rota;
- chegada, entrega e nao realizacao por parada;
- status externo individual por pedido;
- ocorrencias e alertas operacionais;
- mapa das paradas junto aos veiculos recebidos da Contele.

O cockpit atualiza os dados operacionais periodicamente enquanto a aba esta ativa.

## Motor inicial de alertas

O backend avalia automaticamente as condicoes operacionais a cada minuto e mantem alertas com `fingerprint`, evitando duplicacao. As regras iniciais sao:

- rota sem motorista;
- rota sem veiculo;
- veiculo em rota sem vinculo Contele;
- posicao Contele desatualizada por mais de 5 minutos durante rota ativa;
- parada nao entregue;
- excecao em transporte externo;
- entrega externa em transito sem rastreio/referencia.

Quando a condicao deixa de existir, o alerta gerenciado e resolvido automaticamente.
