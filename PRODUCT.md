# Money Tree — Documento do Produto

> Fonte de verdade inicial para o comportamento, as regras e a evolução do sistema.

**Versão do contrato:** 0.2  
**Estado:** apto para orientar a primeira implementação, condicionado aos requisitos de segurança e às decisões pendentes deste documento.

## 1. Visão do produto

Money Tree é um sistema de gestão financeira pessoal voltado ao público brasileiro. Seu objetivo não é apenas registrar entradas e despesas, mas responder com clareza:

- Quanto dinheiro está realmente disponível agora?
- Quanto ainda pode ser gasto sem comprometer contas e metas?
- Quais despesas estão acima do normal?
- Quando cada meta financeira poderá ser atingida?
- Que mudança concreta pode melhorar a situação financeira do usuário?

O sistema deve transformar dados financeiros em decisões simples, explicáveis e seguras. Ele não deve julgar o usuário, prometer resultados, movimentar dinheiro sozinho ou apresentar recomendações genéricas como se fossem certezas.

## 2. Público e escopo inicial

### Público principal

Pessoa física que deseja organizar sua própria vida financeira em reais (BRL), com receitas fixas ou variáveis, contas recorrentes, cartões, compras parceladas e metas de curto ou longo prazo.

### Escopo da primeira versão

- Uso individual.
- Interface em português do Brasil.
- Moeda principal em real brasileiro.
- Lançamentos manuais e importação de arquivos.
- Funcionamento local-first: os dados pertencem ao usuário, continuam acessíveis sem internet e permanecem criptografados quando armazenados.
- Recomendações financeiras explicáveis e confirmáveis.

### Fora do escopo inicial

- Movimentar dinheiro ou iniciar pagamentos.
- Executar compras ou investimentos.
- Declarar imposto de renda.
- Substituir contador, planejador financeiro ou consultor de investimentos.
- Recomendar produtos financeiros específicos sem uma futura camada adequada de perfil, risco, conformidade e fontes verificáveis.
- Integração direta com APIs oficiais do Open Finance sem um parceiro participante autorizado.

## 3. Princípios do sistema

1. **Dinheiro real antes de dinheiro previsto:** o orçamento disponível deve partir do saldo efetivamente existente. Receitas futuras aparecem em projeções, mas não devem ser tratadas como dinheiro livre antes de serem recebidas.
2. **Explicação antes de recomendação:** toda recomendação deve mostrar os valores, o período e a regra que a originaram.
3. **Controle humano:** a IA pode sugerir, simular e preparar alterações, mas só o usuário pode confirmá-las.
4. **Privacidade por padrão:** dados financeiros não devem ser publicados nem armazenados em texto aberto. O envio a terceiros só pode ocorrer após consentimento específico, informado e revogável, limitado aos campos estritamente necessários.
5. **Sem culpa:** mensagens devem ser objetivas e respeitosas, evitando termos como “fracasso”, “irresponsável” ou “você errou”.
6. **Previsões não são garantias:** projeções devem indicar as hipóteses usadas e diferenciar valores confirmados de estimativas.
7. **Correção fácil:** qualquer categorização ou lançamento automático deve poder ser revisado, desfeito e corrigido.
8. **Consistência:** receitas, despesas, transferências, parcelas e recorrências devem seguir as mesmas regras em todas as telas.

## 4. Vocabulário do produto

O sistema deve usar termos reconhecíveis pelo usuário:

- **Receita:** dinheiro que entra e aumenta o patrimônio disponível.
- **Despesa:** dinheiro gasto ou comprometido. Usar “despesa” em vez de “perda”, exceto quando for uma perda patrimonial real.
- **Transferência:** movimentação entre contas do próprio usuário; não é receita nem despesa.
- **Conta:** local onde o dinheiro ou a dívida está registrada, como conta corrente, carteira ou cartão.
- **Saldo atual:** valor existente em uma conta na data atual.
- **Saldo projetado:** estimativa futura baseada em receitas e despesas previstas.
- **Dinheiro livre:** valor que pode ser utilizado sem comprometer obrigações, metas planejadas e a margem de segurança.
- **Valor comprometido:** soma das despesas previstas e demais reservas obrigatórias do período.
- **Meta:** objetivo financeiro com valor-alvo e, opcionalmente, prazo.
- **Orçamento de categoria:** limite ou envelope reservado para um tipo de gasto.
- **Patrimônio líquido:** ativos menos dívidas.

## 5. Estrutura principal do produto

### 5.1 Visão geral

A tela inicial deve mostrar primeiro o que exige decisão, não apenas uma coleção de gráficos.

Ordem recomendada:

1. Dinheiro livre até a próxima receita ou até o fim do mês.
2. Saldo total e valor já comprometido.
3. Próximas contas e risco de saldo negativo.
4. Progresso das metas.
5. Orçamento das principais categorias.
6. Recomendação prioritária da IA.
7. Evolução do fluxo de caixa e do patrimônio.

Exemplo de resumo:

> Você tem R$ 3.240 disponíveis. R$ 1.800 estão comprometidos com contas, R$ 800 estão reservados para metas e R$ 640 estão livres até o próximo salário.

O valor livre deve sempre permitir abrir a explicação do cálculo.

### 5.2 Contas

Tipos iniciais:

- Conta corrente.
- Conta de pagamento.
- Poupança.
- Dinheiro/carteira.
- Cartão de crédito.
- Investimento acompanhado manualmente.
- Empréstimo ou financiamento.
- Outro ativo ou dívida.

Cada conta deve possuir:

- Nome.
- Tipo.
- Instituição opcional.
- Saldo inicial.
- Moeda.
- Data do saldo inicial.
- Estado ativa/arquivada.
- Inclusão ou não nos cálculos de dinheiro disponível e patrimônio.

Arquivar uma conta não deve apagar seu histórico.

Na primeira versão, todas as contas operacionais devem usar BRL. O campo de moeda existe para evolução futura, mas contas em outra moeda não podem ser habilitadas até que o produto defina fonte da cotação, instante de conversão, moeda-base, arredondamento e tratamento de ganho ou perda cambial.

### 5.3 Lançamentos

Tipos:

- Receita.
- Despesa.
- Transferência.
- Ajuste de saldo.

“Fixa” ou “variável” é uma classificação da receita ou despesa, não um tipo contábil. Recorrência também é um atributo independente.

Campos principais:

- Descrição.
- Valor sempre positivo, com o tipo determinando o efeito contábil.
- Data de competência.
- Data de pagamento ou recebimento.
- Conta de origem/destino.
- Categoria e subcategoria.
- Pessoa ou estabelecimento opcional.
- Natureza: fixa ou variável, quando for receita ou despesa.
- Estado: previsto, pendente, liquidado, conciliado, atrasado, cancelado ou estornado.
- Recorrência opcional.
- Parcela opcional.
- Observação e etiquetas opcionais.
- Origem: manual, importação, integração ou sugestão da IA.

Regras:

- O sistema deve impedir duplicação acidental, especialmente após importações.
- Transferências devem gerar os dois lados vinculados e não afetar receita ou despesa total.
- Os dois lados de uma transferência devem ser gravados, alterados, estornados e conciliados de forma atômica.
- Dividir uma compra entre categorias deve preservar o valor total original.
- Um lançamento liquidado ou conciliado não deve ser apagado fisicamente. Sua correção deve gerar estorno ou versão auditável.
- Um lançamento apenas previsto pode ser apagado após confirmação. Se pertencer a recorrência, parcela ou vínculo, o diálogo deve perguntar se a alteração afeta apenas a ocorrência ou toda a série.
- Alterações devem possuir desfazer quando tecnicamente possível.
- Cada lançamento importado ou sincronizado deve possuir identificador idempotente de origem para impedir duplicação em reprocessamentos.
- Texto de descrição, estabelecimento, etiqueta e observação deve ser tratado como entrada não confiável e escapado em toda renderização.

### 5.3.1 Razão, saldo e conciliação

O razão de lançamentos é a fonte de verdade histórica. O sistema deve distinguir:

- **Saldo calculado:** saldo inicial somado aos lançamentos liquidados.
- **Saldo informado:** saldo recebido de extrato, instituição ou entrada manual em determinado instante.
- **Saldo conciliado:** saldo calculado que foi conferido com uma fonte externa.
- **Diferença de conciliação:** divergência entre saldo calculado e informado.

Um ajuste de saldo deve registrar valor, data, motivo e origem. Ele não pode reescrever silenciosamente lançamentos anteriores.

Em caso de divergência, o sistema deve mostrar a diferença e pedir uma decisão: localizar lançamentos ausentes, corrigir duplicidades ou criar um ajuste explícito. Uma importação nunca deve substituir o histórico silenciosamente.

### 5.4 Caixa de entrada financeira

Lançamentos importados ou detectados devem entrar em uma área de revisão quando houver dúvida.

O usuário deve poder:

- Confirmar categoria sugerida.
- Trocar categoria.
- Marcar como transferência.
- Vincular a uma recorrência.
- Dividir o lançamento.
- Identificar duplicidade.
- Criar regra para lançamentos futuros semelhantes.

Uma sugestão com baixa confiança nunca deve ser aplicada silenciosamente.

### 5.5 Categorias e orçamentos

Categorias iniciais sugeridas:

- Moradia.
- Supermercado e alimentação.
- Transporte.
- Saúde.
- Educação.
- Lazer e entretenimento.
- Assinaturas.
- Compras pessoais.
- Família e dependentes.
- Impostos e tarifas.
- Dívidas e juros.
- Metas e reservas.
- Renda.
- Outras.

O usuário pode editar, criar, agrupar e arquivar categorias.

Métodos de orçamento:

- **Por categoria:** limite específico para cada categoria.
- **Flexível:** separa essenciais, estilo de vida e metas.
- **Envelope:** reserva dinheiro já existente para cada finalidade.

O método envelope é o padrão recomendado. Saldo não utilizado pode acumular para o período seguinte quando essa opção estiver ativa.

Para cada categoria, mostrar:

- Valor planejado.
- Valor utilizado.
- Valor restante.
- Percentual utilizado.
- Ritmo esperado para o dia atual do período.
- Previsão de estouro.

Não usar apenas cor para comunicar a situação; incluir texto e ícone.

### 5.6 Recorrências, contas e assinaturas

O sistema deve permitir recorrências semanais, mensais, anuais ou personalizadas.

Comportamentos esperados:

- Criar automaticamente ocorrências previstas, sem marcá-las como pagas.
- Detectar possíveis recorrências a partir do histórico.
- Mostrar um calendário financeiro.
- Alertar sobre vencimentos próximos e atrasos.
- Detectar mudança incomum no valor de uma conta recorrente.
- Identificar possíveis assinaturas sem uso quando o usuário as marcar dessa forma.
- Permitir editar apenas uma ocorrência ou toda a série.

Despesas anuais, como IPVA, IPTU e seguros, podem gerar uma reserva mensal sugerida.

### 5.7 Cartões e compras parceladas

O comportamento deve refletir o uso brasileiro de cartões:

- Data da compra, fechamento e vencimento são informações diferentes.
- A compra entra na fatura correta conforme a data de fechamento.
- Uma compra parcelada gera parcelas futuras vinculadas, mantendo o valor total original.
- Antecipar ou cancelar parcelas deve exigir uma alteração explícita.
- Pagamento da fatura é transferência para quitação do cartão e não uma segunda despesa.
- Mostrar fatura atual, próxima fatura, limite utilizado e parcelas futuras.
- Não considerar o limite disponível do cartão como dinheiro disponível.

Regras contábeis do cartão:

- Compra à vista reconhece a despesa integral e aumenta o passivo do cartão; não reduz imediatamente o saldo da conta corrente.
- Compra parcelada registra imediatamente o compromisso total e o consumo do limite, mas reconhece no orçamento de cada período apenas a parcela correspondente. Relatórios devem identificar claramente se exibem compromisso total ou despesa mensal reconhecida.
- O pagamento da fatura reduz o caixa e o passivo pelo mesmo valor, sem registrar nova despesa.
- Cada parcela afeta o orçamento uma única vez no período ao qual pertence e deve aparecer como obrigação futura até sua liquidação.
- O dinheiro livre deve reservar apenas faturas e parcelas ainda não pagas dentro do horizonte, nunca compras já refletidas no saldo da conta corrente.
- Autorizações pendentes devem aparecer separadamente e reduzir provisoriamente o limite; só entram como despesa reconhecida após confirmação, evitando duplicidade quando forem substituídas pelo lançamento definitivo.
- Juros, multa, anuidade e IOF são despesas próprias e não transferências.
- Estorno deve reduzir o passivo e reverter a despesa ou criar crédito na fatura, conforme o estado da compra.
- Fechamento e reabertura de fatura devem ser eventos auditáveis.

### 5.8 Metas

Tipos de meta:

- Reserva de emergência.
- Viagem.
- Compra planejada.
- Quitação de dívida.
- Educação.
- Aposentadoria ou longo prazo.
- Meta livre.

Campos:

- Nome.
- Valor-alvo.
- Valor já reservado.
- Data-alvo opcional.
- Prioridade.
- Conta associada opcional.
- Contribuição recorrente opcional.
- Forma da reserva: apenas alocação virtual, dinheiro segregado em conta ou contribuição futura.

O sistema deve calcular:

- Quanto falta.
- Percentual concluído.
- Contribuição mensal necessária.
- Data provável de conclusão no ritmo atual.
- Impacto de atrasar, adiantar ou alterar a contribuição.

Quando o prazo for inviável, explicar a diferença e oferecer opções, como aumentar a contribuição, reduzir o alvo ou mudar a data. Nenhuma opção deve ser aplicada automaticamente.

O valor reservado não pode ser descontado duas vezes. Se o dinheiro estiver em uma conta excluída do saldo disponível, não deve ser novamente subtraído como alocação. Se for apenas um envelope virtual dentro de uma conta disponível, deve reduzir o dinheiro livre uma única vez. Contribuições futuras aparecem somente na projeção.

### 5.9 Dívidas

Para empréstimos e financiamentos, registrar:

- Saldo devedor.
- Taxa de juros.
- Parcela.
- Vencimento.
- Prazo restante.
- Encargos opcionais.
- Custo Efetivo Total (CET), quando disponível.
- Periodicidade da taxa.
- Sistema de amortização, quando conhecido.
- IOF, seguros, tarifas, multas e juros de atraso aplicáveis.

O planejador deve comparar cenários de pagamento extra e informar:

- Nova data provável de quitação.
- Juros potencialmente economizados.
- Impacto sobre o dinheiro livre e as metas.
- Hipóteses e limitações do cálculo.

Os cálculos de dívida devem declarar a convenção de arredondamento, a periodicidade de capitalização e quais encargos foram considerados. Na ausência de CET ou sistema de amortização, o resultado deve ser rotulado como estimativa incompleta.

O sistema não deve recomendar sacrificar despesas essenciais ou zerar a margem de segurança para acelerar uma dívida.

### 5.10 Patrimônio

O patrimônio líquido deve somar ativos e subtrair dívidas.

Gráficos recomendados:

- Patrimônio líquido ao longo do tempo.
- Receitas versus despesas.
- Dinheiro guardado por mês.
- Gastos por categoria.
- Progresso das metas.
- Saldo projetado.
- Evolução de dívidas.

Todos os gráficos devem ter alternativa textual, valores acessíveis e filtros de período. O usuário deve conseguir distinguir dados reais de projeções.

## 6. Cálculos financeiros principais

### 6.1 Saldo disponível

```text
saldo_disponivel = soma_dos_saldos_atuais_das_contas_liquidas_incluidas
```

O saldo atual de uma conta deve vir do razão conciliado ou, quando ainda não conciliado, ser identificado como estimado. Investimentos sem liquidez imediata, limites de crédito, saldos bloqueados e valores de terceiros não entram por padrão.

### 6.2 Dinheiro livre

```text
dinheiro_livre = saldo_disponivel
               - obrigacoes_futuras_nao_liquidadas_ate_o_horizonte
               - alocacoes_virtuais_ainda_nao_segregadas
               - margem_de_seguranca
```

O horizonte padrão pode ser a próxima receita fixa ou o final do mês. O usuário deve enxergar qual horizonte está sendo usado.

Receitas futuras previstas não aumentam o dinheiro livre antes de sua confirmação. Elas podem aparecer em um cenário projetado separado.

Regras contra dupla contagem:

- Despesa já liquidada não é subtraída novamente se já estiver refletida no saldo atual.
- Pagamento de fatura não é contado como nova despesa.
- Reserva mantida em conta já excluída do saldo disponível não é subtraída novamente.
- Transferência entre contas incluídas não altera o dinheiro livre total.
- Obrigação cancelada, estornada ou já liquidada não entra no comprometimento futuro.
- Em caso de saldo não conciliado, o dinheiro livre deve indicar que é estimado.

### 6.3 Limite diário sugerido

```text
limite_diario = dinheiro_livre / dias_restantes_no_horizonte
```

Esse valor é uma referência, não uma obrigação. Gastos já planejados por categoria devem ser considerados para evitar dupla contagem.

Se o dinheiro livre for zero ou negativo, o sistema não deve apresentar limite positivo. Se não houver dias restantes, deve mostrar o estado “horizonte encerrado” e solicitar um novo período em vez de dividir por zero. Para renda irregular sem próxima receita conhecida, o horizonte padrão deve ser configurado pelo usuário e nunca presumir uma entrada futura.

### 6.4 Taxa de economia

```text
taxa_de_economia = (receitas_reconhecidas - despesas_reconhecidas) / receitas_reconhecidas
```

A taxa deve usar uma base explicitamente escolhida e consistente: competência ou caixa. O padrão para análise de orçamento é competência; uma visão de fluxo de caixa pode usar valores liquidados, mas deve receber outro rótulo. Compras no cartão entram uma única vez como despesa reconhecida e o pagamento da fatura não entra novamente.

Se não houver receita reconhecida no período, o sistema deve mostrar “não calculável” em vez de dividir por zero ou apresentar percentual enganoso.

### 6.5 Projeção

A projeção deve considerar:

- Saldo atual.
- Recorrências previstas.
- Parcelas futuras.
- Receitas previstas.
- Reservas para metas.
- Apenas o cenário explicitamente ativado pelo usuário, quando houver.

O resultado deve ser apresentado como estimativa e indicar o que ainda não foi confirmado.

A projeção-base deve conter somente dados reais, recorrências e previsões aprovadas. Cenários são ramificações isoladas, visualmente identificadas e não podem alterar a projeção-base, o orçamento ou o razão até que o usuário transforme o cenário em planejamento real e confirme a ação.

## 7. Comportamento da inteligência artificial

### 7.1 Funções permitidas

- Sugerir categorias.
- Identificar padrões e anomalias.
- Explicar mudanças de gastos.
- Calcular cenários.
- Sugerir limites semanais ou mensais.
- Alertar sobre risco de saldo negativo.
- Propor ajustes para atingir metas.
- Responder perguntas sobre os dados do próprio usuário.
- Gerar resumos semanais e mensais.
- Preparar ações para confirmação.

### 7.2 Formato obrigatório de uma recomendação

Cada recomendação deve conter:

1. **O que foi observado.**
2. **Quais dados foram usados.**
3. **Por que isso importa.**
4. **Qual ação é sugerida.**
5. **Qual o impacto estimado.**
6. **Quais hipóteses ou incertezas existem.**
7. **Opções para aceitar, ajustar, simular ou ignorar.**

Exemplo:

> Seus gastos com lazer chegaram a R$ 520, 30% acima da média dos últimos três meses. Mantendo esse ritmo, a categoria pode ultrapassar o orçamento em R$ 180. Reduzir o limite semanal para R$ 85 preservaria a contribuição de R$ 400 para a meta “Reserva”.

### 7.3 Regras de segurança da IA

A IA nunca deve:

- Alterar lançamentos, orçamentos ou metas sem confirmação.
- Movimentar dinheiro.
- Inventar saldos, taxas ou transações.
- Ocultar incerteza.
- Tratar correlação como causa.
- Pressionar o usuário a contratar produtos.
- Expor dados financeiros em logs, URLs ou mensagens desnecessárias.
- Dar recomendação específica de investimento como se conhecesse todo o perfil do usuário.
- Apresentar aconselhamento jurídico, contábil ou tributário como definitivo.
- Interpretar descrições, arquivos importados ou conteúdo externo como instruções de sistema.
- Acessar diretamente chaves, tokens, credenciais, arquivos arbitrários ou tabelas fora do escopo da pergunta.

Quando faltarem dados, deve dizer exatamente o que está faltando. Quando os dados estiverem desatualizados, deve avisar antes de recomendar.

### 7.3.1 Fronteira de dados da IA

O sistema deve funcionar sem IA externa. Até que o usuário habilite esse recurso, nenhum dado financeiro pode sair do dispositivo.

Ao habilitar uma IA externa, o sistema deve apresentar consentimento separado, informado e revogável, explicando:

- Provedor utilizado.
- Campos que poderão ser enviados.
- Finalidade do envio.
- País ou região de processamento, quando conhecido.
- Prazo de retenção.
- Uso ou não dos dados para treinamento.
- Forma de solicitar exclusão.
- Riscos residuais e alternativa de continuar sem o recurso.

Requisitos obrigatórios:

- Enviar apenas agregados ou campos mínimos necessários para a pergunta.
- Remover nome, CPF, conta, agência, chaves Pix, identificadores bancários e texto livre desnecessário.
- Não afirmar que dados são anônimos quando combinações de valor, data e estabelecimento ainda permitirem reidentificação.
- Exigir do provedor proibição contratual de treinamento e retenção além do necessário.
- Não registrar prompts ou respostas contendo dados financeiros em telemetria ou logs de aplicação.
- Permitir revogar o consentimento e solicitar a exclusão do conteúdo retido pelo provedor.
- Documentar subprocessadores e alterações relevantes de política.

### 7.3.2 Proteção contra prompt injection e abuso de ferramentas

Descrições de transações, arquivos, páginas, e-mails e qualquer conteúdo importado são dados não confiáveis. Eles devem ser fornecidos ao modelo em um bloco de dados separado e nunca concatenados como instruções privilegiadas.

O sistema deve:

- Usar entradas estruturadas e schemas explícitos.
- Validar em código toda saída do modelo antes de exibi-la ou utilizá-la.
- Aplicar lista positiva de ferramentas e parâmetros.
- Autorizar operações fora do modelo, usando as permissões do usuário e o princípio do menor privilégio.
- Exigir confirmação humana para qualquer gravação, exportação, compartilhamento ou alteração financeira.
- Rejeitar URLs, comandos, consultas ou referências a dados fora do escopo permitido.
- Testar ataques diretos e indiretos de prompt injection.
- Tratar a resposta do modelo como não confiável e sujeita a erro.

### 7.4 Confiança e confirmação

- Alta confiança: pode sugerir uma ação pronta para confirmação.
- Média confiança: deve destacar a incerteza e pedir revisão.
- Baixa confiança: deve perguntar ou manter o item na caixa de entrada.

Toda alteração confirmada deve registrar a origem da sugestão e permitir desfazer quando possível.

O nível de confiança deve ser calculado ou calibrado por regra documentada. Ele não pode ser apenas uma afirmação textual produzida pelo próprio modelo.

### 7.5 Perguntas em linguagem natural

Exemplos suportados:

- “Quanto posso gastar com lazer neste fim de semana?”
- “Posso comprar algo de R$ 2.000 sem atrasar minhas metas?”
- “Por que gastei mais neste mês?”
- “Quando consigo formar uma reserva de seis meses?”
- “O que muda se eu economizar R$ 300 a mais por mês?”
- “Quais assinaturas aumentaram?”

A resposta deve incluir cálculo, período e origem dos valores.

## 8. Alertas e notificações

Alertas úteis:

- Conta próxima do vencimento.
- Conta atrasada.
- Risco de saldo negativo.
- Categoria próxima do limite.
- Categoria com previsão de estouro.
- Despesa incomum.
- Possível assinatura nova.
- Aumento em despesa recorrente.
- Meta atrasada ou adiantada.
- Receita esperada ainda não confirmada.
- Importação com duplicidades.
- Dados desatualizados.

Regras:

- Alertas devem ser agrupados e priorizados.
- Evitar notificações repetitivas.
- Oferecer controles por tipo e canal.
- Alertas críticos devem permanecer visíveis até serem resolvidos ou dispensados.
- Um aviso deve indicar a ação possível, não apenas declarar um problema.

## 9. Fechamento financeiro periódico

### Resumo semanal

- Quanto entrou e saiu.
- Quanto ainda está livre.
- Contas dos próximos sete dias.
- Categoria que merece atenção.
- Progresso das metas.
- Uma ação prioritária e explicada.

### Fechamento mensal

- Receitas previstas versus realizadas.
- Despesas previstas versus realizadas.
- Economia do mês.
- Variação por categoria.
- Evolução patrimonial.
- Metas cumpridas ou atrasadas.
- Despesas recorrentes alteradas.
- Ajustes sugeridos para o próximo mês.

Fechar o mês não deve bloquear correções posteriores. Alterações retroativas devem recalcular relatórios e registrar que houve uma revisão.

## 10. Importação e integrações

### Primeira etapa

- Lançamento manual.
- Importação CSV.
- Importação OFX.
- Mapeamento de colunas e pré-visualização antes de salvar.
- Detecção de duplicidades.
- Regras de categorização reutilizáveis.

Arquivos importados são conteúdo não confiável. O importador deve:

- Aceitar apenas CSV e OFX por lista positiva, validando extensão, assinatura/conteúdo e estrutura; não confiar apenas no nome ou `Content-Type`.
- Impor limites configurados de tamanho, quantidade de linhas, campos, profundidade e tempo de processamento.
- Processar localmente sempre que possível e nunca executar macros, fórmulas, scripts ou conteúdo ativo.
- Desabilitar entidades externas, expansão recursiva e acesso a rede ou sistema de arquivos no parser XML/OFX.
- Gerar nomes internos aleatórios para temporários, aplicar permissões mínimas e apagá-los após uso ou falha.
- Escapar todo texto importado ao renderizar e tratar novamente esses dados como não confiáveis ao lê-los do banco.
- Neutralizar valores que possam virar fórmulas ao exportar CSV para planilhas.
- Mostrar pré-visualização, rejeições e avisos antes da confirmação.
- Ser idempotente: reimportar o mesmo extrato não pode duplicar lançamentos.
- Nunca enviar o arquivo a antivírus ou serviço externo sem consentimento específico, pois isso pode expor dados financeiros.

### Open Finance

Open Finance deve ser uma etapa futura feita por parceiro autorizado. O fluxo deve:

- Explicar quais dados serão acessados e para qual finalidade.
- Solicitar consentimento explícito.
- Permitir selecionar contas quando suportado.
- Mostrar validade e estado do consentimento.
- Permitir revogação.
- Indicar data e hora da última sincronização.
- Manter o sistema útil quando a integração estiver indisponível.
- Solicitar somente os escopos estritamente necessários.
- Proteger tokens em cofre de segredos ou armazenamento seguro da plataforma, nunca no navegador em texto aberto.
- Rotacionar, expirar e revogar tokens conforme o contrato do parceiro.
- Validar estado, nonce, PKCE, assinatura, audiência, emissor e expiração quando aplicáveis ao protocolo utilizado.
- Validar assinatura e impedir repetição de callbacks ou webhooks.
- Registrar concessão, renovação, uso e revogação do consentimento sem registrar tokens.
- Parar novas coletas e eliminar dados derivados que não tenham outra base de retenção após revogação.
- Aplicar idempotência e reconciliação em todas as sincronizações.

Somente instituições autorizadas pelo Banco Central participam diretamente do ecossistema oficial. A documentação oficial também determina que o acesso seja limitado aos dados consentidos pelo cliente.

### Registrato

O sistema pode orientar o usuário a consultar o Registrato para conferir contas, empréstimos, financiamentos, relacionamentos bancários e chaves Pix. Não deve solicitar credenciais gov.br nem tentar automatizar acesso não autorizado.

## 11. Armazenamento, Git e privacidade

### Decisão de arquitetura recomendada

- **Git:** código-fonte, documentação, migrações, testes e configurações sem dados pessoais.
- **Banco local:** lançamentos e demais dados financeiros com criptografia autenticada em repouso.
- **Backup:** arquivo criptografado e autenticado, restaurável e armazenado separadamente do código.
- **Sincronização futura:** opcional; quando existir, a criptografia de ponta a ponta dos dados financeiros é obrigatória, salvo decisão de arquitetura documentada que identifique e aceite explicitamente outro modelo de confiança.

Dados financeiros em texto aberto não devem ser versionados no Git, mesmo em repositório privado. Apagar um arquivo não o remove automaticamente do histórico ou de clones existentes.

Se for obrigatório guardar um backup usando Git:

- O repositório deve ser privado.
- Apenas um artefato totalmente criptografado pode ser versionado.
- A chave nunca pode estar no repositório.
- Nenhum arquivo temporário ou versão em texto aberto pode ser commitado.
- O processo de restauração deve ser testado.
- Deve existir aviso claro de que a perda da chave pode tornar o backup irrecuperável.
- Cada backup deve usar chave de dados própria protegida por uma chave mestra, permitindo rotação e descarte criptográfico.
- O formato deve possuir versão, data, algoritmo, parâmetros de derivação e verificação de autenticidade, sem expor conteúdo financeiro.
- Metadados visíveis do Git, como data, tamanho e frequência, devem ser tratados como vazamento residual documentado.
- A interface deve explicar que não é possível garantir a exclusão de clones ou cópias feitas por terceiros.

A opção preferencial permanece: Git somente para código e documentação; backups financeiros em armazenamento próprio com política de retenção e exclusão.

### Criptografia e gestão de chaves

- Usar criptografia autenticada mantida por biblioteca consolidada, como AES-GCM ou ChaCha20-Poly1305; não criar algoritmo próprio.
- Gerar nonces e chaves com gerador criptograficamente seguro e nunca reutilizar nonce com a mesma chave.
- Derivar chaves de senha com função resistente e parâmetros versionados adequados à plataforma.
- Separar chave mestra, chave de criptografia de dados e chaves de integração.
- Armazenar chaves em cofre do sistema operacional, hardware seguro ou gerenciador de segredos quando disponível.
- Não persistir chave de descriptografia em `localStorage`, IndexedDB, código-fonte, Git, log ou telemetria.
- Manter a chave descriptografada em memória somente durante a sessão desbloqueada e eliminá-la no bloqueio quando a plataforma permitir.
- Documentar geração, distribuição, rotação, revogação, comprometimento, recuperação e destruição de chaves.
- Incluir versão criptográfica em bancos e backups para permitir migração futura.
- Falha de autenticação do conteúdo deve interromper a leitura e produzir erro de integridade; nunca tentar recuperar silenciosamente dados adulterados.

### Exclusão e retenção

- O usuário deve poder excluir exportações locais, dados ativos, conta remota e consentimentos.
- Cada classe de dado deve ter finalidade, local, prazo de retenção e regra de eliminação documentados.
- A exclusão deve abranger banco principal, cache, índices, filas, telemetria, prompts e cópias controladas pelo serviço.
- Backups devem expirar por política. Durante a retenção, dados excluídos não podem voltar ao sistema sem uma restauração explícita e um novo processo de exclusão.
- Quando a remoção física imediata do backup não for viável, usar descarte criptográfico por destruição da chave de dados e documentar o prazo máximo para expurgo.
- Cópias Git ou clones fora do controle do sistema não podem ser prometidos como apagáveis; essa limitação deve ser informada antes de habilitar esse modo.

### Proteções mínimas

- Criptografia em trânsito para qualquer comunicação externa.
- Criptografia autenticada do banco local e recomendação adicional de criptografia de disco.
- Segredos em cofre do sistema operacional ou gerenciador apropriado; variáveis de ambiente podem apenas injetá-los em tempo de execução e não são armazenamento permanente.
- Bloqueio local configurável mesmo sem servidor, com bloqueio automático por inatividade.
- Reautenticação antes de exportar, excluir, revelar dados sensíveis, alterar criptografia ou conectar integrações.
- Quando houver servidor: passkeys ou MFA, limitação de tentativas, recuperação segura, revogação de dispositivos e gestão de sessões.
- Sessões web em cookies `HttpOnly`, `Secure` e `SameSite`, com proteção CSRF e rotação após autenticação; tokens não devem ficar em `localStorage`.
- Exportação e exclusão dos dados pelo usuário.
- Registro de ações importantes com identificadores pseudônimos, sem valores, descrições, tokens, prompts, credenciais ou dados bancários.
- Coleta mínima de dados.
- Política clara de retenção.
- Nenhum dado financeiro em telemetria por padrão.
- Backups com integridade verificável.
- Política de Segurança de Conteúdo (CSP), codificação de saída e dependências sem scripts remotos desnecessários para reduzir risco de XSS.
- Dependências fixadas por arquivo de lock, atualização controlada, análise de vulnerabilidades e inventário de componentes.

### Registro de auditoria

Cada evento de segurança ou alteração relevante deve registrar somente:

- Tipo do evento.
- Data e hora em UTC.
- Identificador pseudônimo do ator, dispositivo e objeto.
- Origem da ação: usuário, importação, integração, regra ou IA.
- Resultado e código de erro seguro.
- Correlação com o evento anterior quando necessária.

Logs devem ter acesso restrito, proteção contra alteração, retenção definida e exclusão controlada. Nunca registrar senha, chave, token, cookie, conteúdo integral de transação, prompt financeiro ou resposta sensível.

### Modelo de ameaças obrigatório

Antes da implementação e a cada mudança relevante, manter um modelo de ameaças com:

- Ativos: banco financeiro, chaves, backups, tokens, prompts, consentimentos e histórico.
- Atores: usuário, pessoa com acesso ao dispositivo, invasor remoto, extensão maliciosa, dependência comprometida, provedor de IA e parceiro financeiro.
- Fronteiras: navegador/aplicação, banco local, sistema operacional, servidor de sincronização, Git, IA e Open Finance.
- Fluxos de dados e locais de armazenamento.
- Ameaças de falsificação, adulteração, repúdio, exposição, indisponibilidade e elevação de privilégio.
- Mitigação, responsável, teste e risco residual aceito para cada ameaça.

Requisitos derivados do modelo de ameaças devem possuir testes automatizados ou procedimento verificável.

### Resposta a incidentes

Manter procedimento para detectar, conter, investigar, corrigir e comunicar incidentes. Ele deve definir:

- Canal de relato e responsável.
- Preservação segura de evidências sem ampliar a exposição.
- Revogação de sessões, tokens e chaves comprometidas.
- Rotação de segredos e publicação de correções.
- Identificação dos dados e titulares afetados.
- Comunicação ao usuário com ações concretas de proteção.
- Avaliação das obrigações legais aplicáveis, incluindo comunicação à ANPD e aos titulares quando houver risco ou dano relevante.
- Revisão posterior e atualização do modelo de ameaças.

## 12. Modelo de dados inicial

Entidades principais:

- `users`: identidade e preferências.
- `accounts`: contas, cartões, ativos e dívidas.
- `transactions`: receitas, despesas, transferências e ajustes.
- `transaction_splits`: divisão de um lançamento.
- `reconciliations`: saldos informados, diferenças e decisões de conciliação.
- `ledger_reversals`: vínculo imutável entre lançamento e estorno.
- `categories`: categorias e agrupamentos.
- `budgets`: orçamento por período e categoria.
- `allocations`: envelopes virtuais, dinheiro segregado e contribuições futuras sem dupla contagem.
- `recurrence_rules`: regras de repetição.
- `installment_plans`: compras parceladas e parcelas vinculadas.
- `card_statements`: faturas, fechamentos, vencimentos, pagamentos e reaberturas.
- `goals`: metas e contribuições.
- `debts`: dados adicionais de dívidas.
- `balance_snapshots`: histórico patrimonial.
- `imports`: origem, estado e deduplicação de arquivos importados.
- `classification_rules`: regras de categorização.
- `recommendations`: sugestões, evidências, estado e decisão do usuário.
- `notifications`: alertas e preferências.
- `scenarios`: simulações sem impacto nos dados reais.
- `audit_events`: ações importantes e reversões, sem conteúdo sensível desnecessário.
- `consents`: finalidade, escopo, provedor, validade, revogação e política aplicável.
- `sync_cursors`: cursores e identificadores idempotentes sem tokens de acesso.
- `crypto_metadata`: versão, algoritmo e parâmetros não secretos; nunca a chave em texto aberto.
- `sessions`: sessões e dispositivos, apenas quando houver autenticação remota.

Valores monetários devem ser armazenados em centavos inteiros ou em tipo decimal seguro. Nunca usar ponto flutuante binário para cálculos financeiros.

Datas de competência, pagamento, fechamento e vencimento devem ser campos distintos quando aplicáveis.

Taxas, percentuais e câmbio devem usar decimal seguro com escala documentada. Cada cálculo financeiro deve definir arredondamento, moeda e fuso horário. Horários técnicos são persistidos em UTC; datas financeiras preservam também a data civil e o fuso de origem quando isso afetar o período.

## 13. Estados e tratamento de erros

Toda área de dados deve prever:

- Carregando.
- Sem dados ainda.
- Sem resultados para o filtro.
- Erro recuperável.
- Dados parcialmente disponíveis.
- Offline.
- Dados desatualizados.
- Permissão ou consentimento expirado.
- Banco bloqueado ou chave indisponível.
- Falha de integridade criptográfica.
- Conflito de sincronização.

Mensagens de erro devem dizer:

- O que aconteceu.
- O que foi preservado.
- Como tentar novamente ou corrigir.

Falha de integridade, autenticação ou descriptografia nunca deve ser descrita como arquivo vazio nem permitir sobrescrita automática. O sistema deve preservar o original, bloquear alterações potencialmente destrutivas e orientar restauração ou recuperação.

Formulários devem preservar valores após erro, apontar o primeiro campo inválido e impedir envios duplicados.

Operações destrutivas devem usar diálogos próprios e acessíveis; nunca `alert`, `confirm` ou `prompt` do navegador.

## 14. Acessibilidade e experiência

- Meta WCAG 2.2 AA.
- Navegação completa por teclado.
- Foco visível.
- Nomes acessíveis em botões e ícones.
- Contraste suficiente.
- Alvos de toque adequados em celular.
- Gráficos com resumo textual ou tabela equivalente.
- Estados não comunicados apenas por cor.
- Datas, moeda e números formatados em `pt-BR`.
- Suporte a zoom de 200% sem perda de funcionalidade.
- Respeito à preferência de movimento reduzido.
- Layout responsivo, sem esconder informações financeiras críticas no celular.

## 15. Fluxos principais

### Primeiro acesso

1. Explicar como os dados serão armazenados.
2. Criar ou proteger a chave local e explicar as consequências de perda da credencial.
3. Configurar bloqueio por inatividade e criar o primeiro backup de recuperação.
4. Solicitar moeda, início do mês financeiro e horizonte preferido.
5. Criar contas ou importar um extrato.
6. Registrar receitas e despesas recorrentes.
7. Criar a primeira meta.
8. Conciliar o saldo inicial.
9. Calcular o primeiro dinheiro livre.
10. Explicar o cálculo e permitir ajustes.

### Registrar uma despesa

1. Usuário informa valor, conta, categoria e data.
2. Sistema valida sem apagar campos.
3. Sistema verifica possível duplicidade.
4. Ao confirmar, grava o lançamento de forma atômica e recalcula saldos, orçamento, projeção e metas afetadas.
5. Exibe confirmação curta e opção de desfazer.

### Importar extrato

1. Selecionar arquivo.
2. Validar formato localmente quando possível.
3. Aplicar limites e parser seguro, sem rede, scripts ou entidades externas.
4. Pré-visualizar e mapear colunas.
5. Detectar duplicidades e transferências prováveis usando identificadores idempotentes.
6. Sugerir categorias com confiança.
7. Usuário revisa e confirma.
8. Sistema grava tudo em transação atômica ou não grava nada em caso de falha.
9. Sistema apresenta resumo do que foi importado, ignorado e deixado para revisão.

### Simular uma compra

1. Informar valor, forma de pagamento, data e número de parcelas.
2. Sistema calcula efeito sobre dinheiro livre, faturas, projeção e metas.
3. Mostrar cenário antes/depois e principais hipóteses.
4. Permitir salvar apenas como cenário ou transformar em lançamento planejado.

## 16. Roadmap

### Fase 1 — Fundação

- Contas e saldos.
- Receitas e despesas.
- Categorias.
- Recorrências.
- Orçamentos.
- Metas.
- Dashboard com dinheiro livre.
- Gráficos básicos.
- Banco local e backup.
- Criptografia autenticada, bloqueio local e restauração testada.
- Modelo de ameaças e testes das invariantes financeiras.

### Fase 2 — Vida financeira brasileira

- Cartões e faturas.
- Compras parceladas.
- Calendário financeiro.
- Assinaturas.
- Projeções de 30, 90 e 365 dias.
- Importação CSV/OFX.
- Dívidas e cenários de quitação.
- Fechamento mensal.

### Fase 3 — Inteligência explicável

- Sugestão de categorias.
- Detecção de anomalias.
- Perguntas em linguagem natural.
- Simulador de decisões.
- Recomendações semanais.
- Previsão de estouro de orçamento.
- Auditoria e confirmação das ações sugeridas.
- Consentimento e minimização para eventual IA externa.
- Testes adversariais de prompt injection.

### Fase 4 — Expansão

- Aplicação móvel ou PWA avançada.
- Sincronização criptografada entre dispositivos.
- Compartilhamento familiar com permissões.
- Open Finance por parceiro autorizado.
- Metas colaborativas.
- Relatórios personalizados.

## 17. Critérios de sucesso

O produto estará cumprindo sua função quando o usuário conseguir:

- Entender em poucos segundos quanto pode gastar.
- Registrar ou revisar um lançamento rapidamente.
- Saber quais contas vencerão antes da próxima receita.
- Ver se uma compra ameaça alguma meta.
- Corrigir facilmente uma categorização incorreta.
- Recuperar seus dados a partir de um backup testado.
- Compreender por que a IA fez uma recomendação.
- Usar o sistema sem entregar seus dados a terceiros por obrigação.
- Conferir cada componente do cálculo de dinheiro livre sem dupla contagem.
- Bloquear o aplicativo e manter o banco ilegível sem a chave.

Métricas úteis, sem coletar dados financeiros desnecessários:

- Percentual de lançamentos revisados.
- Categorias com orçamento configurado.
- Metas com contribuição ativa.
- Recomendações aceitas, ajustadas ou ignoradas.
- Taxa de importações concluídas sem erro.
- Backups criados e restaurações testadas.
- Quantidade de meses fechados.
- Divergências de conciliação abertas e resolvidas.
- Falhas de integridade detectadas sem perda ou sobrescrita do original.

## 18. Decisões pendentes

Antes da implementação completa, confirmar:

1. O sistema será apenas local ou acessível também pelo celular e outros dispositivos?
2. O uso será somente individual ou deve suportar casal/família desde o início?
3. Git é obrigatório apenas para o código ou também para um backup criptografado dos dados?
4. A primeira versão será web/PWA, desktop ou ambas?
5. A IA poderá receber dados minimizados e pseudonimizados por uma API externa, após consentimento específico, ou deverá funcionar inteiramente no dispositivo?

Até essas respostas existirem, adotar como padrão seguro: uso individual, aplicação web local-first, banco e backup com criptografia autenticada, bloqueio local, dados financeiros fora do Git, IA externa desabilitada e IA sem permissão para modificar dados automaticamente.

## 19. Referências do levantamento

- [Open Finance — Banco Central do Brasil](https://www.bcb.gov.br/estabilidadefinanceira/openfinance/documentacao)
- [Participantes do Open Finance — Banco Central do Brasil](https://www.bcb.gov.br/meubc/faqs/s/open-finance)
- [Consentimento — Open Finance Brasil](https://openfinancebrasil.atlassian.net/wiki/spaces/OF/pages/219480491)
- [Registrato — Banco Central do Brasil](https://www.bcb.gov.br/meubc/registrato/1000/https%3A/www3.bcb.gov.br/sgspub)
- [Princípios da LGPD — Governo Federal](https://www.gov.br/saude/pt-br/acesso-a-informacao/lgpd/principios)
- [Remoção de dados sensíveis — GitHub Docs](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/removing-sensitive-data-from-a-repository)
- [Actual Budget — visão local-first](https://actualbudget.org/docs/vision/)
- [Actual Budget — método de orçamento](https://actualbudget.org/docs/budgeting/)
- [YNAB — metas, dívidas e relatórios](https://www.ynab.com/features)
- [Monarch Money — orçamento e recorrências](https://www.monarchmoney.com/landing/budgeting-tools)
- [Rocket Money — assinaturas e orçamento](https://www.rocketmoney.com/)
- [OWASP — Cryptographic Storage Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html)
- [OWASP — Key Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Key_Management_Cheat_Sheet.html)
- [OWASP — HTML5 Security Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/HTML5_Security_Cheat_Sheet.html)
- [OWASP — File Upload Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/File_Upload_Cheat_Sheet.html)
- [OWASP — XML External Entity Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/XML_External_Entity_Prevention_Cheat_Sheet.html)
- [OWASP — Threat Modeling Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Threat_Modeling_Cheat_Sheet.html)
- [OWASP GenAI — Prompt Injection](https://genai.owasp.org/llmrisk/llm01-prompt-injection/)
- [NIST SP 800-63B — autenticação e sessões](https://pages.nist.gov/800-63-4/sp800-63b.html)
- [ANPD — Comunicação de Incidente de Segurança](https://www.gov.br/anpd/pt-br/canais_atendimento/agente-de-tratamento/comunicado-de-incidente-de-seguranca-cis)
