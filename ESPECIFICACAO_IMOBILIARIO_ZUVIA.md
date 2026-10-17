# Especificação de engenharia — Token imobiliário de prédio em Assunção (via Zuvia)

**Status:** rascunho v0.1 · 17/10/2026  
**Autor:** Cláudio Ikeda (CTO) com apoio do Claude  
**Natureza:** proposta de engenharia. Itens marcados **[confirmar]** dependem de advogados, da Zuvia, da B3 ou de dados que ainda não temos. Itens **[a definir]** não têm valor decidido.

---

## 0. Premissas e o que ainda não sabemos

O que sabemos (fonte: notícias de ago/2025 sobre a Zuvia e a B3):

- A Zuvia se apresenta como plataforma de crowdfunding de investimentos e lançou ofertas sob a Resolução CVM 88.
- A Zuvia e a B3 firmaram parceria para tokenizar Contratos de Investimento Coletivo (CIC) e permitir negociação posterior em plataformas que usam a tecnologia da B3. Liquidação financeira via Pix.
- A primeira operação foi um token ligado a um empreendimento residencial em Bauru (SP): ~500 mil tokens a R$ 25 cada.
- A B3 fornece a infraestrutura de tokenização e negociação; a Zuvia gerencia as operações e o relacionamento com emissores e investidores.

O que **não** está confirmado e precisa ser verificado antes de qualquer commit de engenharia:

| # | Ponto | Por quê importa | Quem confirma |
|---|---|---|---|
| P1 | Situação da Zuvia como plataforma de crowdfunding autorizada pela CVM (número e data da autorização) | A frase "certificado pela CVM" não aparece nas fontes que li. Consultar o registro de plataformas no site da CVM | Advogados + registro CVM |
| P2 | Se a Res. 88 comporta nosso emissor: limite de captação por emissor/ano e porte máximo do emissor | A regra do crowdfunding foi pensada para empresas de menor porte e tem teto de captação. Um prédio inteiro pode exceder o teto | Advogados |
| P3 | Se um ativo **no Paraguai** pode ser objeto de CIC/crowdfunding no Brasil | Há questão de enquadramento do ativo estrangeiro, divulgação e registro | Advogados BR + PY |
| P4 | Qual blockchain/registro a Zuvia e a B3 usam e que APIs expõem | Define toda a camada de integração | Zuvia / B3 |
| P5 | Quem é o emissor: holding, PropCo ou veículo dedicado | Define cap table, contratos e o objeto do token | Advogados |
| P6 | Prédio, vendedor, preço, % da holding na OpCo | Sem isso não há números nem prazos | Cláudio |

**Regra do projeto:** nenhum número de rentabilidade ou valorização entra em código, tela ou material enquanto não houver parecer jurídico. Valorização aparece apenas como cenário ilustrativo, rotulado.

---

## 1. Objetivo do produto

Permitir que investidores no Brasil adquiram, via oferta regulada pela CVM e distribuída pela Zuvia, tokens que representam participação econômica em **um prédio inteiro em Assunção** (região da Av. Mariscal López / Paseo La Galería, Villa Morra), com renda de locação mobiliada e, em cenário não prometido, eventual valorização do imóvel.

Fora do escopo (decisões já tomadas):

- Nenhum produto financeiro no Paraguai (conta, crédito, investimento).
- Nenhuma garantia de recompra por construtora ou terceiro.
- Foz do Iguaçu e Ciudad del Este ficam para fase futura.
- A captação internacional da OpCo é um processo separado do token.

---

## 2. Estrutura jurídico-operacional que a engenharia precisa refletir

```
Investidores do token (BR)
        │  (CIC tokenizado via Zuvia / infra B3)
        ▼
   Emissor [confirmar: holding BR ou veículo dedicado]
        │
        ▼
   PropCo (PY)  ── dona do prédio (matrícula única)
        │  recebe aluguel
        ▲
   OpCo (PY)    ── aluga, administra, mantém
        ▲
   Sócios internacionais (reduzem a cota da holding na OpCo)
```

Implicações de engenharia:

- Duas partes pagantes e recebedoras: **OpCo → PropCo** (aluguel) e **emissor → investidores** (distribuições). Cada fluxo precisa de conciliação própria.
- O sistema precisa distinguir **renda distribuível** (caixa) de **variação de valor justo** (contábil, não distribuível). Nunca misturar nas telas.
- A OpCo é parte relacionada da holding enquanto a cota for > 20% [confirmar]. O contrato de locação PropCo–OpCo é a principal proteção do investidor e vira dado de primeira classe no sistema.

---

## 3. Arquitetura proposta

### 3.1 Visão geral

**Princípio:** a Zuvia e a B3 são o sistema de registro da oferta, da titularidade e da negociação. Nosso sistema **não** duplica o livro de titularidade; ele guarda o que é nosso (ativo, contratos, fluxo de caixa, relatórios) e **reconcilia** com o que vem da Zuvia/B3.

### 3.2 Componentes

| Componente | Responsabilidade | Observações |
|---|---|---|
| **Adaptador Zuvia** | Cadastro de oferta, documentos, status da captação, lista de investidores aceitos | Contrato de API **[confirmar]**; começar com camada de abstração para trocar de plataforma |
| **Adaptador B3 / ledger** | Consulta de titularidade, eventos de transferência, mercado subsequente, proventos | Depende de P4. Tratar como fonte de verdade da titularidade |
| **Serviço de Ativo** | Cadastro do prédio, unidades, contratos de locação, matrícula, seguros, laudos | Dados jurídicos PY em espanhol, com tradução para pt-BR |
| **Serviço de Receita** | Aluguéis recebidos da OpCo, despesas da PropCo, caixa distribuível | Moeda funcional: G$ e US$ **[confirmar]**; investidores em R$ |
| **Serviço de Distribuição** | Cálculo de proventos por token, retenção de impostos, instrução de pagamento via Pix | Cálculo determinístico, reproduzível, com trilha de auditoria |
| **Serviço de Avaliação** | Registro de laudos anuais independentes, valor justo, cenários ilustrativos | Cenários só com rótulo "ilustrativo" |
| **Serviço de Câmbio** | Cotação G$ / US$ / R$ com fonte e carimbo de tempo | Fonte oficial **[a definir]** |
| **Compliance** | KYC/AML (via Zuvia ou complementar), PEP, sanções, limites do investidor, suitability | Responsabilidade principal da plataforma; nós somos emissor |
| **Relatórios** | Informe periódico, demonstrações, extrato do investidor, informe de rendimentos | Prazos e conteúdo **[confirmar]** na norma aplicável |
| **Observabilidade e auditoria** | Logs imutáveis, métricas, alertas | Ver seção 9 |

---

## 4. Modelo de dados (núcleo)

```
Emissor(id, razao_social, cnpj, tipo, status)
Oferta(id, emissor_id, plataforma='zuvia', id_externo, valor_alvo, valor_minimo,
       preco_token, qtd_tokens, janela_inicio, janela_fim, status)
Token(id, oferta_id, simbolo, qtd_total, qtd_emitida, casas_decimais, id_externo_ledger)
Investidor(id, id_externo_plataforma, tipo, residencia_fiscal, status_kyc, perfil)
Posicao(investidor_id, token_id, quantidade, data_ref)         -- espelho do ledger
Ativo(id, propco_id, descricao, matricula, endereco, area_total_m2, data_aquisicao,
      preco_aquisicao_usd)
Unidade(id, ativo_id, numero, area_m2, mobiliada, canal_alvo)  -- canal: ancora|flex|curta
ContratoLocacaoMestre(id, propco_id, opco_id, inicio, fim, aluguel_minimo, pct_receita,
                      garantias, gatilhos_substituicao_opco)
ReceitaMensal(id, mes, canal, receita_bruta, despesas_opco, ocupacao_pct, adr)
FluxoPropCo(id, mes, aluguel_recebido, despesas_propco, impostos, caixa_distribuivel)
Distribuicao(id, mes_ref, valor_total_brl, valor_por_token, data_pagamento, status)
Laudo(id, data, avaliador, valor_usd, metodo, arquivo_hash)
CenarioIlustrativo(id, rotulo, taxa_anual, horizonte_anos, texto_aviso)
EventoAuditoria(id, ator, acao, entidade, antes, depois, ts)
```
