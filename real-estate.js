/**
 * Portal Paraguai · Real Estate Tokenization Marketplace (Assunção · Villa Morra & Paseo La Galería)
 * Especificação de Engenharia v0.1 — Oferta Regulada via Zuvia (Res. CVM 88) & Infraestrutura B3
 * Liquidação Pix via Câmbio Real · Renda de Aluguel em US$ (PropCo/OpCo) + Cenário Ilustrativo de Valorização
 */

const realEstateState = {
  subTab: 'marketplace', // 'marketplace' | 'construtoras' | 'propco_opco' | 'carteira_b3' | 'governanca_cvm'
  regionFilter: 'ALL',   // 'ALL' | 'PASEO_GALERIA' | 'VILLA_MORRA_MCAL' | 'YKUA_SATI_WTC'
  builderFilter: 'ALL',
  statusFilter: 'ALL',   // 'ALL' | 'EM_OFERTA' | 'EM_OPERACAO'

  // Simulador Interativo (Seção 2 e Seção 8: Separação estrita entre Renda Distribuível e Valorização Ilustrativa)
  simulator: {
    selectedBuildingId: 'edf-galeria-prime',
    tokensQty: 400, // 400 tokens * R$ 25 = R$ 10.000,00
    horizonYears: 5,
    scenarioId: 'BASE_VILLA_MORRA' // 'CONSERVADOR' | 'BASE_VILLA_MORRA' | 'EXPANSAO_IG'
  },

  // Cenários Ilustrativos de Valorização (Tabela CenarioIlustrativo - Seção 4)
  scenarios: {
    CONSERVADOR: {
      id: 'CONSERVADOR',
      rotulo: 'Cenário Ilustrativo Conservador (Inflação US$ + Maturação)',
      taxaAnualUsdPct: 4.5,
      aviso: '[CENÁRIO ILUSTRATIVO · NÃO PROMETIDO] Simulação meramente referencial sem garantia de rentabilidade ou recompra.'
    },
    BASE_VILLA_MORRA: {
      id: 'BASE_VILLA_MORRA',
      rotulo: 'Cenário Ilustrativo Base · Eixo Villa Morra / Paseo La Galería',
      taxaAnualUsdPct: 6.8,
      aviso: '[CENÁRIO ILUSTRATIVO · NÃO PROMETIDO] Baseado em histórico de absorção corporativa em Assunção; variação contábil não distribuível até liquidação.'
    },
    EXPANSAO_IG: {
      id: 'EXPANSAO_IG',
      rotulo: 'Cenário Ilustrativo Expansão · Efeito Paraguai Investment Grade (Baa3)',
      taxaAnualUsdPct: 9.2,
      aviso: '[CENÁRIO ILUSTRATIVO · NÃO PROMETIDO] Pressupõe compressão de cap rate em Assunção pós-Investment Grade Moody’s Baa3.'
    }
  },

  // Construtoras Renomadas com Referência de Obras e Rating de Crédito e Risco
  builders: [
    {
      id: 'const-fortis-morra',
      name: 'Fortis & Morra Desarrollos S.A.',
      founded: 2004,
      hq: 'Av. Santa Teresa · Eixo Corporativo, Assunção',
      creditRating: 'AAA (py)',
      riskLevel: 'BAIXO RISCO · GRAU INSTITUCIONAL',
      riskScore: 965,
      deliveredBuildings: 18,
      deliveredM2: '142.000 m²',
      onTimeRate: '100% no prazo',
      leverageDte: '0,28x (Baixa Alavancagem)',
      partnerBanks: 'Banco Itaú Paraguay · Sudameris · Continental',
      referenceWorks: [
        'Torre Miranda Corporate (Av. Santa Teresa · Entregue 2022 · 100% locado)',
        'Residencial Las Palmas Villa Morra (Entregue 2024 · Valorização +24% USD)',
        'Paseo Suites Executive I (Ao lado do Paseo La Galería · Entregue 2025)'
      ],
      guarantees: 'Seguro Garantia de Conclusão de Obra + Conta Escrow Condicionada à Matrícula Única na PropCo (Gate 6.2)'
    },
    {
      id: 'const-eje-galeria',
      name: 'Constructora Eje Corporativo S.A.',
      founded: 2008,
      hq: 'Av. Mariscal López · Villa Morra, Assunção',
      creditRating: 'AA+ (py)',
      riskLevel: 'BAIXO RISCO · ALTA SOLIDEZ',
      riskScore: 938,
      deliveredBuildings: 14,
      deliveredM2: '98.500 m²',
      onTimeRate: '98,5% no prazo',
      leverageDte: '0,34x',
      partnerBanks: 'Banco Continental · Banco GNB Paraguay',
      referenceWorks: [
        'Edifício Mariscal Prime Offices (Villa Morra · Entregue 2021)',
        'Domus Senador Long (Villa Morra · Entregue 2023)',
        'Atrium Boggiani Residencias (Entregue 2025)'
      ],
      guarantees: 'Patrimônio de Afetação Fiduciário PY + Auditoria Trimestral Big Four + Fiança Bancária de Obra'
    },
    {
      id: 'const-costanera-prime',
      name: 'Grupo Costanera & Asunción Prime',
      founded: 2010,
      hq: 'Av. Aviadores del Chaco (WTC Asunción), Assunção',
      creditRating: 'AA (py)',
      riskLevel: 'RISCO MODERADO-BAIXO · OPERACIONAL COMPROVADO',
      riskScore: 912,
      deliveredBuildings: 11,
      deliveredM2: '81.000 m²',
      onTimeRate: '97,0% no prazo',
      leverageDte: '0,39x',
      partnerBanks: 'Banco Sudameris · Banco Atlas',
      referenceWorks: [
        'The Hub Ykua Sati (Em operação · 92% ocupação corporativa)',
        'Torre Aviadores Business Center (Entregue 2022)',
        'Sky Suites Molas López (Entregue 2024)'
      ],
      guarantees: 'Prédio Pronto com Matrícula Única Registrada (#MAT-ASU-88412) + Seguro Patrimonial Mapfre PY'
    },
    {
      id: 'const-chaco-mariscal',
      name: 'Inmobiliaria del Chaco & Mariscal S.A.',
      founded: 2012,
      hq: 'Calle Pacheco · Villa Morra Sul, Assunção',
      creditRating: 'A+ (py)',
      riskLevel: 'RISCO CONTROLADO · ESPECIALISTA BOUTIQUE',
      riskScore: 884,
      deliveredBuildings: 8,
      deliveredM2: '54.000 m²',
      onTimeRate: '96,0% no prazo',
      leverageDte: '0,42x',
      partnerBanks: 'Banco Familiar · Banco Regional',
      referenceWorks: [
        'Villa Morra Garden Lofts (Entregue 2022)',
        'Residencial Embaixadas (Calle Pacheco · Entregue 2024)'
      ],
      guarantees: 'Contrato de Preço Fechado (Turnkey Mobiliado) + Retenção Contratual de 15% para Qualidade Pós-Obra'
    }
  ],

  // Marketplace de Prédios Inteiros (Tabela Ativo + Oferta + Token + ContratoLocacaoMestre - Seção 4)
  buildings: [
    {
      id: 'edf-galeria-prime',
      symbol: 'ZUV-GAL01',
      name: 'Edifício Torre Paseo Galería Prime',
      regionCode: 'PASEO_GALERIA',
      regionLabel: 'Eixo Shopping Paseo La Galería · Av. Santa Teresa',
      distanceLandmark: 'A 250 metros do Shopping Paseo La Galería & WTC Asunción',
      builderId: 'const-fortis-morra',
      builderName: 'Fortis & Morra Desarrollos S.A.',
      creditRating: 'AAA (py)',
      riskScore: 965,
      status: 'EM_OFERTA',
      lifecycleStage: 'Em oferta na Zuvia (Res. CVM 88)',
      deliveryDate: 'Entrega Mobiliada: Out/2027 (Obra em 68%)',
      matriculaPy: 'Matrícula Única #PY-ASU-2026-0914 (Condição Suspensiva Gate 6.2)',
      totalAreaM2: 3450,
      unitsCount: 48,
      unitsMix: '32 Studios Executivos Mobiliados (42m²) + 16 1-Dorm Corporate (65m²)',
      acquisitionPriceUsd: 2175000.00,
      targetCapBrl: 12500000.00,
      minCapBrl: 8500000.00,
      tokenPriceBrl: 25.00,
      totalTokens: 500000,
      subscribedTokens: 392000, // 78.4%
      netRentalYieldUsdPct: 8.4, // Renda líquida distribuível projetada em US$
      minGuaranteedFloorUsdPct: 6.8, // Piso mínimo garantido no Contrato Mestre PropCo-OpCo
      illustrativeAppreciationUsdPct: 6.8,
      navPerTokenBrl: 25.00,
      lastMarketPriceBrl: 25.00,
      channelsMix: { ancoraPct: 45, flexPct: 35, curtaPct: 20 },
      occupancyPct: 91,
      adrUsd: 78.00,
      opcoName: 'Asunción Hospitality & Corporate Stay OpCo S.A.',
      masterLeaseTerm: '10 anos renováveis · Piso US$ 12.325/mês + 78% do NOI excedente',
      gate62Step: 2 // 1: Contrato Assinado, 2: Em Captação, 3: Escrow Condicionado, 4: Matrícula Registrada
    },
    {
      id: 'edf-villa-morra-mcal',
      symbol: 'ZUV-VMOR02',
      name: 'Villa Morra Mariscal Collection',
      regionCode: 'VILLA_MORRA_MCAL',
      regionLabel: 'Coração de Villa Morra · Av. Mariscal López esq. Senador Long',
      distanceLandmark: 'A 350m do Shopping Mariscal & 4 min do Paseo La Galería',
      builderId: 'const-eje-galeria',
      builderName: 'Constructora Eje Corporativo S.A.',
      creditRating: 'AA+ (py)',
      riskScore: 938,
      status: 'EM_OFERTA',
      lifecycleStage: 'Em oferta na Zuvia (Res. CVM 88)',
      deliveryDate: 'Entrega Mobiliada: Jun/2027 (Obra em 82%)',
      matriculaPy: 'Matrícula Única #PY-ASU-2026-1108 (Gate 6.2 Ativo)',
      totalAreaM2: 4120,
      unitsCount: 56,
      unitsMix: '40 Lofts Premium Mobiliados (45m²) + 16 Penthouses Duplex (82m²)',
      acquisitionPriceUsd: 2610000.00,
      targetCapBrl: 15000000.00,
      minCapBrl: 10000000.00,
      tokenPriceBrl: 25.00,
      totalTokens: 600000,
      subscribedTokens: 384000, // 64%
      netRentalYieldUsdPct: 7.9,
      minGuaranteedFloorUsdPct: 6.5,
      illustrativeAppreciationUsdPct: 6.4,
      navPerTokenBrl: 25.00,
      lastMarketPriceBrl: 25.00,
      channelsMix: { ancoraPct: 55, flexPct: 30, curtaPct: 15 },
      occupancyPct: 89,
      adrUsd: 74.00,
      opcoName: 'Asunción Hospitality & Corporate Stay OpCo S.A.',
      masterLeaseTerm: '10 anos · Piso US$ 14.137/mês + 75% do NOI excedente',
      gate62Step: 2
    },
    {
      id: 'edf-hub-wtc',
      symbol: 'ZUV-WTC03',
      name: 'The Hub Ykua Sati · Paseo & WTC',
      regionCode: 'YKUA_SATI_WTC',
      regionLabel: 'Eixo Paseo La Galería & World Trade Center Asunción',
      distanceLandmark: 'A 400m do Shopping Paseo La Galería · Prédio 100% Operacional',
      builderId: 'const-costanera-prime',
      builderName: 'Grupo Costanera & Asunción Prime',
      creditRating: 'AA (py)',
      riskScore: 912,
      status: 'EM_OPERACAO',
      lifecycleStage: 'Ativo em Operação · Mercado Subsequente B3/Zuvia',
      deliveryDate: 'Pronto & Operando (92% Ocupação Executiva)',
      matriculaPy: 'Matrícula Única #MAT-ASU-88412 (100% Registrada na PropCo PY)',
      totalAreaM2: 2890,
      unitsCount: 40,
      unitsMix: '40 Unidades Corporativas Turnkey Mobiliadas (Multinacionais & Diplomacia)',
      acquisitionPriceUsd: 1740000.00,
      targetCapBrl: 10000000.00,
      minCapBrl: 10000000.00,
      tokenPriceBrl: 25.00,
      totalTokens: 400000,
      subscribedTokens: 400000, // 100% captado e em operação
      netRentalYieldUsdPct: 8.8,
      minGuaranteedFloorUsdPct: 7.0,
      illustrativeAppreciationUsdPct: 7.1,
      navPerTokenBrl: 26.85,        // Valor Patrimonial por Token (Laudo Anual Independente)
      lastMarketPriceBrl: 27.40,    // Último Preço Negociado no Ambiente B3/Zuvia
      channelsMix: { ancoraPct: 50, flexPct: 35, curtaPct: 15 },
      occupancyPct: 92,
      adrUsd: 84.00,
      opcoName: 'Asunción Hospitality & Corporate Stay OpCo S.A.',
      masterLeaseTerm: '10 anos em vigor · Piso US$ 10.150/mês cumprido há 14 meses consecutivos',
      gate62Step: 4 // Todos os 4 gates concluídos
    },
    {
      id: 'edf-palacio-pacheco',
      symbol: 'ZUV-PACH04',
      name: 'Palacio Pacheco Boutique Suites',
      regionCode: 'VILLA_MORRA_MCAL',
      regionLabel: 'Villa Morra Sul · Polo Gastronômico & Embaixadas',
      distanceLandmark: 'A 600m da Av. Mariscal López & 5 min do Paseo La Galería',
      builderId: 'const-chaco-mariscal',
      builderName: 'Inmobiliaria del Chaco & Mariscal S.A.',
      creditRating: 'A+ (py)',
      riskScore: 884,
      status: 'EM_OFERTA',
      lifecycleStage: 'Em oferta na Zuvia (Res. CVM 88)',
      deliveryDate: 'Entrega Mobiliada: Dez/2027 (Obra em 54%)',
      matriculaPy: 'Matrícula Única #PY-ASU-2026-1490 (Gate 6.2 Ativo)',
      totalAreaM2: 2240,
      unitsCount: 34,
      unitsMix: '34 Suites Boutique High-Yield para Executivos e Nômades Globais',
      acquisitionPriceUsd: 1393000.00,
      targetCapBrl: 8000000.00,
      minCapBrl: 5600000.00,
      tokenPriceBrl: 25.00,
      totalTokens: 320000,
      subscribedTokens: 148800, // 46.5%
      netRentalYieldUsdPct: 9.1,
      minGuaranteedFloorUsdPct: 7.0,
      illustrativeAppreciationUsdPct: 7.4,
      navPerTokenBrl: 25.00,
      lastMarketPriceBrl: 25.00,
      channelsMix: { ancoraPct: 35, flexPct: 40, curtaPct: 25 },
      occupancyPct: 90,
      adrUsd: 88.00,
      opcoName: 'Asunción Hospitality & Corporate Stay OpCo S.A.',
      masterLeaseTerm: '10 anos · Piso US$ 8.125/mês + 80% do NOI excedente',
      gate62Step: 2
    }
  ],

  // Carteira de Posições do Investidor Brasileiro (Espelho do Ledger B3/Zuvia - Seção 4)
  investorPositions: [
    {
      buildingId: 'edf-hub-wtc',
      symbol: 'ZUV-WTC03',
      buildingName: 'The Hub Ykua Sati · Paseo & WTC',
      qtyTokens: 800,
      avgCostBrl: 25.00,
      investedBrl: 20000.00,
      navPerTokenBrl: 26.85,
      lastMarketPriceBrl: 27.40,
      monthlyDividendUsd: 25.52,
      ledgerSyncStatus: 'CONCILIADO_B3_ZUVIA',
      ledgerRefHash: '0x94f2...b3e1'
    },
    {
      buildingId: 'edf-galeria-prime',
      symbol: 'ZUV-GAL01',
      buildingName: 'Edifício Torre Paseo Galería Prime',
      qtyTokens: 400,
      avgCostBrl: 25.00,
      investedBrl: 10000.00,
      navPerTokenBrl: 25.00,
      lastMarketPriceBrl: 25.00,
      monthlyDividendUsd: 12.18,
      ledgerSyncStatus: 'RESERVA_ESCROW_ZUVIA',
      ledgerRefHash: '0x71a8...c904'
    }
  ],

  // Fluxo Mensal PropCo & Dupla Aprovação de Distribuição Pix (Seção 6.3 e Seção 9)
  monthlyDistributionDemo: {
    mesRef: 'Outubro/2026',
    buildingSymbol: 'ZUV-WTC03 (The Hub Ykua Sati · 400.000 tokens)',
    receitaAncoraUsd: 9200.00,
    receitaFlexUsd: 6850.00,
    receitaCurtaUsd: 3450.00,
    despesasOpcoUsd: 4600.00,
    aluguelPagoPropcoUsd: 14900.00, // Acima do piso mínimo de US$ 10.150
    despesasPropcoUsd: 1120.00,
    impostosPyUsd: 1018.00,         // Regime 10% PY
    caixaDistribuivelUsd: 12762.00,
    approvalFinanceiro: true,
    approvalCompliance: false,      // Aguardando 2ª assinatura (Segregação de funções Seção 9)
    statusPagamento: 'AGUARDANDO_DUPLA_APROVACAO'
  },

  // Laudos Anuais Independentes (Tabela Laudo - Seção 4 e 6.5)
  appraisalReports: [
    {
      id: 'LAUDO-2026-WTC03',
      date: '15/09/2026',
      buildingSymbol: 'ZUV-WTC03',
      buildingName: 'The Hub Ykua Sati · Paseo & WTC',
      evaluator: 'CBRE / Tasa Avaliações Inmobiliarias Paraguay',
      method: 'Fluxo de Caixa Descontado (DCF) + Comparativo Direto Villa Morra',
      acquisitionUsd: 1740000.00,
      fairValueUsd: 1868800.00,
      variationPct: '+7,40% em US$ (Contábil · Não Distribuível em Caixa)',
      fileHash: 'sha256:8f94e2c1b0a7491823c9d11e7b249a804f1e22'
    }
  ],

  // Livro de Ofertas do Mercado Subsequente Integrado à B3 / Zuvia (Seção 6.4)
  secondaryOrders: [
    { id: 'ORD-B3-901', symbol: 'ZUV-WTC03', side: 'VENDA', qty: 200, priceBrl: 27.40, seller: 'Investidor Qualificado #BR-441', status: 'DISPONIVEL_B3' },
    { id: 'ORD-B3-902', symbol: 'ZUV-WTC03', side: 'VENDA', qty: 350, priceBrl: 27.65, seller: 'Investidor Apto #BR-118', status: 'DISPONIVEL_B3' },
    { id: 'ORD-B3-903', symbol: 'ZUV-WTC03', side: 'COMPRA', qty: 500, priceBrl: 27.10, seller: 'Investidor Apto #BR-809', status: 'DISPONIVEL_B3' }
  ],

  // Checklist de Premissas Jurídicas e Regulatórias P1 a P6 (Seção 0 e Seção 7)
  regulatoryChecks: [
    { code: 'P1', title: 'Registro da Zuvia como plataforma autorizada na CVM', owner: 'Advogados + Site CVM', status: 'EM_VERIFICACAO', detail: 'Confirmar número e ato declaratório na CVM sob a Resolução CVM 88.' },
    { code: 'P2', title: 'Limite de captação por emissor/ano na Res. CVM 88 (Até R$ 15 milhões)', owner: 'Advogados Societários BR', status: 'ESTRUTURADO', detail: 'Ofertas de prédios entre R$ 8M e R$ 15M enquadradas no teto da Res. 88 por SPE/Emissor.' },
    { code: 'P3', title: 'Enquadramento de ativo imobiliário em Assunção (PY) via Emissor BR', owner: 'Advogados BR + PY', status: 'PARECER_EM_CURSO', detail: 'Emissor BR detém 100% da PropCo PY (dona da matrícula única em Villa Morra).' },
    { code: 'P4', title: 'APIs e Infraestrutura de Tokenização/Ledger B3 & Zuvia', owner: 'CTO (Cláudio Ikeda) + Zuvia/B3', status: 'ADAPTADOR_PRONTO', detail: 'Camada de abstração desacoplada implementada com reconciliação diária de posições.' },
    { code: 'P5', title: 'Definição do Veículo Emissor (Opção A: Emissor Dedicado por Prédio / PropCo)', owner: 'Advogados + Fiscal', status: 'OPCAO_A_PREFERIDA', detail: 'Isola o risco e a matrícula única de cada edifício sem misturar ativos da holding.' },
    { code: 'P6', title: 'Seleção dos Prédios em Villa Morra / Paseo La Galería e % na OpCo', owner: 'Cláudio Ikeda (CTO)', status: 'MAPEADO_MARKETPLACE', detail: '4 edifícios mapeados com construtoras AAA/AA+ e Contrato Mestre PropCo-OpCo.' }
  ],

  // Trilha de Auditoria Imutável (Tabela EventoAuditoria - Seção 4 e Seção 9)
  auditEvents: [
    { id: 'AUD-RE-104', ts: '17/10/2026 16:40:12', actor: 'Adaptador B3/Zuvia', action: 'RECONCILIACAO_DIARIA_LEDGER', entity: 'Token ZUV-WTC03', detail: '400.000 tokens conciliados (0 divergências entre Posicao local e Ledger B3).' },
    { id: 'AUD-RE-103', ts: '17/10/2026 15:10:04', actor: 'Serviço de Avaliação', action: 'PUBLICACAO_LAUDO_ANUAL', entity: 'Laudo #LAUDO-2026-WTC03', detail: 'Valor justo atualizado para US$ 1.868.800 (Hash SHA-256 gravado · Separado do caixa distribuível).' },
    { id: 'AUD-RE-102', ts: '17/10/2026 11:20:00', actor: 'Gate de Aquisição 6.2', action: 'VERIFICACAO_MATRICULA_PROPCO', entity: 'Ativo ZUV-WTC03', detail: 'Certidão de matrícula única #MAT-ASU-88412 validada antes da liberação de escrow.' },
    { id: 'AUD-RE-101', ts: '17/10/2026 09:00:00', actor: 'Diretoria Financeira', action: 'APROVACAO_1_DE_2_PROVENTOS', entity: 'Distribuicao Out/2026', detail: '1ª assinatura registrada para distribuição de US$ 12.762,00 via Pix Câmbio Real.' }
  ]
};

// ============================================================================
// RENDERIZADOR PRINCIPAL DO MÓDULO IMOBILIÁRIO (ZUVIA / CVM / B3)
// ============================================================================

function renderImobiliarioZuviaView() {
  const totalCaptadoBrl = realEstateState.buildings.reduce((acc, b) => acc + (b.subscribedTokens * b.tokenPriceBrl), 0);
  const myTotalInvestedBrl = realEstateState.investorPositions.reduce((acc, p) => acc + p.investedBrl, 0);
  const myMonthlyUsd = realEstateState.investorPositions.reduce((acc, p) => acc + p.monthlyDividendUsd, 0);

  return `
    <!-- Banner Institucional: Paraguai Investment Grade + Zuvia + CVM + B3 -->
    <div class="card" style="background:linear-gradient(135deg, #040B17 0%, #0B1E3B 58%, #132F5C 100%);color:#FFFFFF;border:1px solid rgba(212,175,55,0.35);margin-bottom:20px;box-shadow:var(--shadow-md);">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:16px;">
        <div style="max-width:820px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px;">
            <span class="badge" style="background:linear-gradient(135deg,#D4AF37,#F59E0B);color:#050E1D;font-weight:800;">🇵🇾 PARAGUAI INVESTMENT GRADE · MOODY'S Baa3</span>
            <span class="badge badge-red">OFERTA VIA ZUVIA · RES. CVM 88</span>
            <span class="badge" style="background:rgba(255,255,255,0.14);color:#F8FAFC;border:1px solid rgba(255,255,255,0.2);">INFRAESTRUTURA B3 · LIQUIDAÇÃO PIX CÂMBIO REAL</span>
          </div>
          <h2 style="font-size:1.45rem;font-weight:800;color:#FFFFFF;margin-bottom:6px;">
            Marketplace de Prédios Tokenizados em Assunção — Villa Morra &amp; Paseo La Galería
          </h2>
          <p style="font-size:0.86rem;color:rgba(226,232,240,0.88);line-height:1.5;">
            Invista a partir de <strong>R$ 25,00 por token</strong> no Brasil em <strong>prédios inteiros de matrícula única (PropCo PY)</strong> construídos por incorporadoras paraguaias de primeira linha (Rating <strong>AAA a A+</strong>). Receba <strong>renda mensal de locação mobiliada em Dólar (US$)</strong> convertida via Pix (Câmbio Real) e acompanhe o potencial de valorização imobiliária da região mais nobre de Assunção.
          </p>
        </div>

        <div style="display:flex;gap:12px;flex-wrap:wrap;background:rgba(5,14,29,0.65);padding:14px 18px;border-radius:var(--radius-md);border:1px solid rgba(255,255,255,0.14);">
          <div>
            <div style="font-size:0.68rem;text-transform:uppercase;color:#94A3B8;font-weight:700;">Volume Tokenizado (4 Prédios)</div>
            <div style="font-family:var(--font-display);font-size:1.25rem;font-weight:800;color:#FDE68A;">${formatBRL(totalCaptadoBrl)}</div>
            <div style="font-size:0.7rem;color:#CBD5E1;">Emissão alvo: R$ 45,5 milhões</div>
          </div>
          <div style="border-left:1px solid rgba(255,255,255,0.15);padding-left:12px;">
            <div style="font-size:0.68rem;text-transform:uppercase;color:#94A3B8;font-weight:700;">Sua Carteira (Espelho B3)</div>
            <div style="font-family:var(--font-display);font-size:1.25rem;font-weight:800;color:#34D399;">${formatBRL(myTotalInvestedBrl)}</div>
            <div style="font-size:0.7rem;color:#CBD5E1;">Renda est.: ${formatUSD(myMonthlyUsd)}/mês (${formatBRL(usdToBrl(myMonthlyUsd))})</div>
          </div>
        </div>
      </div>

      <!-- Regra de Ouro da Especificação (Seção 0 e Seção 2): Separação Estrita Renda Distribuível vs Valorização Ilustrativa -->
      <div style="margin-top:14px;padding:10px 14px;background:rgba(196,30,30,0.18);border-left:4px solid #FBBF24;border-radius:8px;font-size:0.78rem;color:#F8FAFC;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <div>
          ⚖️ <strong>Governança CVM &amp; Regra de Engenharia (Seções 0, 2 e 8):</strong> O sistema separa estritamente <strong>Renda Distribuível (Caixa efetivo de aluguel OpCo → PropCo pago via Pix)</strong> de <strong>Variação de Valor Justo / Valorização do Imóvel</strong> (exibida exclusivamente como <code>[CENÁRIO ILUSTRATIVO · NÃO PROMETIDO]</code> ou Laudo Contábil Anual).
        </div>
        <span class="badge badge-gold">Especificação v0.1 · Cláudio Ikeda (CTO)</span>
      </div>
    </div>

    <!-- Sub-Navegação do Módulo Imobiliário -->
    <div class="sub-nav" role="tablist" aria-label="Navegação do Ecossistema de Tokens Imobiliários">
      <button type="button" class="sub-tab ${realEstateState.subTab === 'marketplace' ? 'active' : ''}" onclick="switchRealEstateSubTab('marketplace')">
        🏙️ Marketplace Villa Morra &amp; La Galería (4 Prédios)
      </button>
      <button type="button" class="sub-tab ${realEstateState.subTab === 'construtoras' ? 'active' : ''}" onclick="switchRealEstateSubTab('construtoras')">
        🏗️ Construtoras, Obras &amp; Rating de Crédito/Risco
      </button>
      <button type="button" class="sub-tab ${realEstateState.subTab === 'propco_opco' ? 'active' : ''}" onclick="switchRealEstateSubTab('propco_opco')">
        ⚖️ Estrutura PropCo/OpCo, Gates (6.2) &amp; Proventos Pix
      </button>
      <button type="button" class="sub-tab ${realEstateState.subTab === 'carteira_b3' ? 'active' : ''}" onclick="switchRealEstateSubTab('carteira_b3')">
        📈 Minha Carteira, Laudos &amp; Mercado B3/Zuvia
      </button>
      <button type="button" class="sub-tab ${realEstateState.subTab === 'governanca_cvm' ? 'active' : ''}" onclick="switchRealEstateSubTab('governanca_cvm')">
        🛡️ Compliance CVM 88, Checklist (P1–P6) &amp; Auditoria
      </button>
    </div>

    ${renderRealEstateActiveSubTab()}
  `;
}

function switchRealEstateSubTab(tab) {
  realEstateState.subTab = tab;
  renderCurrentView(true);
}

function renderRealEstateActiveSubTab() {
  switch (realEstateState.subTab) {
    case 'marketplace':
      return renderMarketplaceVillaMorraSubTab();
    case 'construtoras':
      return renderBuildersCreditRiskSubTab();
    case 'propco_opco':
      return renderPropcoOpcoOperationsSubTab();
    case 'carteira_b3':
      return renderInvestorPortfolioB3SubTab();
    case 'governanca_cvm':
      return renderGovernanceCvmChecklistSubTab();
    default:
      return renderMarketplaceVillaMorraSubTab();
  }
}

// ============================================================================
// ABA 1: MARKETPLACE DE PRÉDIOS EM LANÇAMENTO & OPERAÇÃO (VILLA MORRA & LA GALERÍA)
// ============================================================================

function renderMarketplaceVillaMorraSubTab() {
  const filteredBuildings = realEstateState.buildings.filter(b => {
    if (realEstateState.regionFilter !== 'ALL' && b.regionCode !== realEstateState.regionFilter) return false;
    if (realEstateState.builderFilter !== 'ALL' && b.builderId !== realEstateState.builderFilter) return false;
    if (realEstateState.statusFilter !== 'ALL' && b.status !== realEstateState.statusFilter) return false;
    return true;
  });

  const simBuilding = realEstateState.buildings.find(b => b.id === realEstateState.simulator.selectedBuildingId) || realEstateState.buildings[0];
  const simScenario = realEstateState.scenarios[realEstateState.simulator.scenarioId] || realEstateState.scenarios.BASE_VILLA_MORRA;
  const simTokens = Math.max(1, Number(realEstateState.simulator.tokensQty) || 400);
  const simYears = Math.max(1, Number(realEstateState.simulator.horizonYears) || 5);

  const investedBrl = simTokens * simBuilding.tokenPriceBrl;
  const investedUsd = brlToUsd(investedBrl);
  const ownershipPct = (simTokens / simBuilding.totalTokens) * 100;

  // 1. Cálculo separado de Renda Distribuível (Caixa Líquido em US$ convertido via Câmbio Real)
  const annualRentUsd = investedUsd * (simBuilding.netRentalYieldUsdPct / 100);
  const monthlyRentUsd = annualRentUsd / 12;
  const monthlyRentBrl = usdToBrl(monthlyRentUsd);
  const totalRentHorizonUsd = annualRentUsd * simYears;
  const totalRentHorizonBrl = usdToBrl(totalRentHorizonUsd);

  // Piso mínimo garantido pelo Contrato Mestre PropCo-OpCo
  const minAnnualFloorUsd = investedUsd * (simBuilding.minGuaranteedFloorUsdPct / 100);
  const minMonthlyFloorUsd = minAnnualFloorUsd / 12;

  // 2. Cálculo separado de Variação de Valor Justo / Valorização ([CENÁRIO ILUSTRATIVO · NÃO PROMETIDO])
  const compoundFactor = Math.pow(1 + (simScenario.taxaAnualUsdPct / 100), simYears);
  const illustrativeFutureValueUsd = investedUsd * compoundFactor;
  const illustrativeCapitalGainUsd = illustrativeFutureValueUsd - investedUsd;
  const illustrativeCapitalGainBrl = usdToBrl(illustrativeCapitalGainUsd);

  return `
    <div class="layout-sidebar">
      <!-- Coluna Principal: Filtros e Cards dos Edifícios em Villa Morra e Shopping Paseo La Galería -->
      <div>
        <div class="card card-flag-top" style="margin-bottom:18px;">
          <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px;margin-bottom:12px;">
            <div>
              <span class="screen-tag">MARKETPLACE ASSUNÇÃO · VILLA MORRA &amp; PASEO LA GALERÍA</span>
              <h3 class="card-title" style="margin-top:4px;">Prédios Inteiros Tokenizados (Matrícula Única na PropCo PY)</h3>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              <select class="form-control" style="min-height:38px;font-size:0.8rem;" onchange="setRealEstateFilter('regionFilter', this.value)" aria-label="Filtrar por Região de Assunção">
                <option value="ALL" ${realEstateState.regionFilter === 'ALL' ? 'selected' : ''}>📍 Todas as Zonas Nobres (Assunção)</option>
                <option value="PASEO_GALERIA" ${realEstateState.regionFilter === 'PASEO_GALERIA' ? 'selected' : ''}>🛍️ Eixo Paseo La Galería / Av. Santa Teresa</option>
                <option value="VILLA_MORRA_MCAL" ${realEstateState.regionFilter === 'VILLA_MORRA_MCAL' ? 'selected' : ''}>🏛️ Villa Morra / Av. Mariscal López</option>
                <option value="YKUA_SATI_WTC" ${realEstateState.regionFilter === 'YKUA_SATI_WTC' ? 'selected' : ''}>🏙️ Ykua Sati / WTC Asunción</option>
              </select>

              <select class="form-control" style="min-height:38px;font-size:0.8rem;" onchange="setRealEstateFilter('builderFilter', this.value)" aria-label="Filtrar por Construtora">
                <option value="ALL" ${realEstateState.builderFilter === 'ALL' ? 'selected' : ''}>🏗️ Todas as Construtoras (Rating AAA–A+)</option>
                ${realEstateState.builders.map(b => `
                  <option value="${b.id}" ${realEstateState.builderFilter === b.id ? 'selected' : ''}>${b.name} (${b.creditRating})</option>
                `).join('')}
              </select>
            </div>
          </div>

          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="store-pill ${realEstateState.statusFilter === 'ALL' ? 'active' : ''}" onclick="setRealEstateFilter('statusFilter', 'ALL')">
              Todos os Prédios (${realEstateState.buildings.length})
            </button>
            <button type="button" class="store-pill ${realEstateState.statusFilter === 'EM_OFERTA' ? 'active' : ''}" onclick="setRealEstateFilter('statusFilter', 'EM_OFERTA')">
              🟢 Em Oferta Primária Zuvia (Res. CVM 88)
            </button>
            <button type="button" class="store-pill ${realEstateState.statusFilter === 'EM_OPERACAO' ? 'active' : ''}" onclick="setRealEstateFilter('statusFilter', 'EM_OPERACAO')">
              💎 Prédio Pronto · Pagando Aluguel Mensal US$
            </button>
          </div>
        </div>

        <!-- Lista de Prédios -->
        <div class="grid-2">
          ${filteredBuildings.map(b => {
            const pctCaptado = Math.min(100, Math.round((b.subscribedTokens / b.totalTokens) * 100));
            const captadoBrl = b.subscribedTokens * b.tokenPriceBrl;
            const isSelectedSim = realEstateState.simulator.selectedBuildingId === b.id;

            return `
              <div class="product-card" style="border:${isSelectedSim ? '2px solid var(--py-blue)' : '1px solid var(--border-color)'};">
                <div style="background:linear-gradient(135deg, #050E1D 0%, #0B1E3B 60%, #163360 100%);color:#FFFFFF;padding:16px;position:relative;border-bottom:2px solid var(--py-red);">
                  <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px;">
                    <span class="badge" style="background:rgba(255,255,255,0.14);color:#FDE68A;border:1px solid rgba(212,175,55,0.45);font-family:var(--font-mono);">
                      TOKEN: ${b.symbol} · R$ 25,00
                    </span>
                    <span class="badge ${b.status === 'EM_OPERACAO' ? 'badge-green' : 'badge-red'}">
                      ${b.status === 'EM_OPERACAO' ? '● EM OPERAÇÃO (B3/ZUVIA)' : '● OFERTA ABERTA CVM 88'}
                    </span>
                  </div>

                  <h4 style="font-size:1.12rem;font-weight:800;color:#FFFFFF;margin-bottom:4px;">${b.name}</h4>
                  <div style="font-size:0.78rem;color:#CBD5E1;margin-bottom:10px;">📍 ${b.regionLabel} · ${b.distanceLandmark}</div>

                  <!-- Selo da Construtora e Rating de Crédito/Risco -->
                  <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:6px;background:rgba(255,255,255,0.08);padding:8px 10px;border-radius:8px;border:1px solid rgba(255,255,255,0.12);">
                    <div style="font-size:0.76rem;">
                      🏗️ <strong>${b.builderName}</strong>
                    </div>
                    <div style="display:flex;gap:6px;align-items:center;">
                      <span class="badge badge-gold">Rating ${b.creditRating}</span>
                      <span style="font-family:var(--font-mono);font-size:0.72rem;color:#34D399;font-weight:700;">Score ${b.riskScore}/1000</span>
                    </div>
                  </div>
                </div>

                <div class="product-body">
                  <div style="font-size:0.79rem;color:var(--text-muted);line-height:1.45;">
                    <strong>Configuração do Ativo (PropCo PY):</strong> ${b.unitsCount} unidades (${b.totalAreaM2} m² totais) — ${b.unitsMix}.<br/>
                    <strong>Entrega / Status:</strong> ${b.deliveryDate}<br/>
                    <strong>Matrícula Única:</strong> <code>${b.matriculaPy}</code>
                  </div>

                  <!-- Caixa Dupla: 1. Renda de Aluguel em Dólar vs 2. Cenário Ilustrativo de Valorização -->
                  <div class="grid-2" style="gap:10px;margin:10px 0;">
                    <div style="background:var(--py-blue-soft);border:1px solid var(--py-blue-light);border-left:3px solid var(--py-blue);padding:10px;border-radius:8px;">
                      <div style="font-size:0.68rem;font-weight:800;text-transform:uppercase;color:var(--py-blue-dark);">1. Renda Aluguel (US$ Caixa)</div>
                      <div style="font-family:var(--font-display);font-size:1.2rem;font-weight:800;color:var(--py-blue-dark);margin-top:2px;">
                        ${b.netRentalYieldUsdPct.toFixed(1)}% a.a. em US$
                      </div>
                      <div style="font-size:0.7rem;color:var(--text-muted);">
                        Piso OpCo: <strong>${b.minGuaranteedFloorUsdPct.toFixed(1)}% a.a. US$</strong>
                      </div>
                    </div>

                    <div style="background:#FFFBEB;border:1px solid #FDE68A;border-left:3px solid #D97706;padding:10px;border-radius:8px;">
                      <div style="font-size:0.66rem;font-weight:800;text-transform:uppercase;color:#92400E;">2. Valorização [ILUSTRATIVO]</div>
                      <div style="font-family:var(--font-display);font-size:1.2rem;font-weight:800;color:#B45309;margin-top:2px;">
                        +${b.illustrativeAppreciationUsdPct.toFixed(1)}% a.a. US$
                      </div>
                      <div style="font-size:0.68rem;color:#92400E;">
                        Não prometido · Laudo anual
                      </div>
                    </div>
                  </div>

                  <!-- Mix de Canais de Locação da OpCo (Âncora / Flex / Curta Temporada) -->
                  <div style="font-size:0.73rem;color:var(--text-muted);background:var(--py-surface);padding:8px 10px;border-radius:8px;">
                    <strong>Mix OpCo:</strong> Âncora 6–12m (${b.channelsMix.ancoraPct}%) · Flex 30–90d (${b.channelsMix.flexPct}%) · Curta Temp. (${b.channelsMix.curtaPct}%) · Ocupação ref.: <strong>${b.occupancyPct}%</strong>
                  </div>

                  <!-- Barra de Captação Zuvia -->
                  <div style="margin-top:8px;">
                    <div style="display:flex;justify-content:space-between;font-size:0.75rem;font-weight:700;margin-bottom:4px;">
                      <span>Captação Zuvia: ${formatBRL(captadoBrl)} / ${formatBRL(b.targetCapBrl)}</span>
                      <span style="color:var(--py-red);">${pctCaptado}% (${b.subscribedTokens.toLocaleString('pt-BR')} tokens)</span>
                    </div>
                    <div style="height:8px;background:var(--py-surface-alt);border-radius:999px;overflow:hidden;">
                      <div style="width:${pctCaptado}%;height:100%;background:linear-gradient(90deg,var(--py-blue),var(--py-red));"></div>
                    </div>
                  </div>

                  <div style="display:flex;gap:8px;margin-top:12px;">
                    <button type="button" class="btn btn-sm btn-outline" style="flex:1;" onclick="selectBuildingForSimulation('${b.id}')">
                      🧮 Simular Retorno
                    </button>
                    <button type="button" class="btn btn-sm btn-primary" style="flex:1;" onclick="openZuviaSubscriptionModal('${b.id}')">
                      💠 Investir via Zuvia / Pix
                    </button>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Coluna Lateral: Simulador Interativo de Renda em US$ + Valorização do Token no Brasil -->
      <aside class="card card-flag-red" style="position:sticky;top:140px;">
        <div class="card-header">
          <div>
            <span class="screen-tag red">SIMULADOR · RENDA US$ &amp; TOKEN BR</span>
            <h3 class="card-title" style="margin-top:4px;">Simulador de Investimento (Zuvia / B3)</h3>
          </div>
          <span class="badge badge-blue">${simBuilding.symbol}</span>
        </div>

        <div class="form-group">
          <label for="simSelectBuilding">1. Escolha o Prédio em Assunção (Villa Morra / La Galería)</label>
          <select id="simSelectBuilding" class="form-control" onchange="selectBuildingForSimulation(this.value)">
            ${realEstateState.buildings.map(b => `
              <option value="${b.id}" ${b.id === simBuilding.id ? 'selected' : ''}>
                ${b.symbol} · ${b.name} (Aluguel ${b.netRentalYieldUsdPct}% US$)
              </option>
            `).join('')}
          </select>
        </div>

        <div class="grid-2" style="gap:10px;">
          <div class="form-group">
            <label for="simTokensQty">2. Quantidade de Tokens (R$ 25/un.)</label>
            <input type="number" id="simTokensQty" class="form-control" min="4" max="20000" step="20" value="${simTokens}" onchange="updateRealEstateSimulator('tokensQty', this.value)" />
          </div>
          <div class="form-group">
            <label for="simHorizonYears">3. Horizonte (Anos)</label>
            <select id="simHorizonYears" class="form-control" onchange="updateRealEstateSimulator('horizonYears', this.value)">
              ${[1, 3, 5, 7, 10].map(y => `
                <option value="${y}" ${y === simYears ? 'selected' : ''}>${y} ${y === 1 ? 'ano' : 'anos'}</option>
              `).join('')}
            </select>
          </div>
        </div>

        <div class="form-group">
          <label for="simScenarioSelect">4. Cenário Ilustrativo de Valorização do Imóvel (Seção 4)</label>
          <select id="simScenarioSelect" class="form-control" onchange="updateRealEstateSimulator('scenarioId', this.value)">
            ${Object.values(realEstateState.scenarios).map(sc => `
              <option value="${sc.id}" ${sc.id === simScenario.id ? 'selected' : ''}>
                ${sc.rotulo} (+${sc.taxaAnualUsdPct}% a.a. US$)
              </option>
            `).join('')}
          </select>
        </div>

        <!-- Resumo do Aporte em R$ e Equivalente em US$ (Câmbio Real) -->
        <div style="background:var(--py-surface);padding:12px;border-radius:var(--radius-sm);border:1px solid var(--border-color);margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:4px;">
            <span>Aporte Total (${simTokens.toLocaleString('pt-BR')} tokens × R$ 25):</span>
            <strong style="font-size:0.98rem;color:var(--py-blue-dark);">${formatBRL(investedBrl)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:0.78rem;color:var(--text-muted);">
            <span>Equivalente em Dólar (Câmbio Real R$ ${state.fx.effectiveUsdBrl.toFixed(4)}):</span>
            <strong>${formatUSD(investedUsd)} (${ownershipPct.toFixed(3)}% da PropCo)</strong>
          </div>
        </div>

        <!-- BLOCO A: RENDA DISTRIBUÍVEL DE ALUGUEL (CAIXA) -->
        <div style="background:var(--py-blue-soft);border:1px solid var(--py-blue-light);border-left:4px solid var(--py-blue);padding:12px;border-radius:var(--radius-sm);margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="font-size:0.73rem;font-weight:800;text-transform:uppercase;color:var(--py-blue-dark);">
              💵 A. Renda Distribuível de Locação (Caixa)
            </span>
            <span class="badge badge-blue">Pago via Pix</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:4px;">
            <span>Provento Mensal Estimado (${simBuilding.netRentalYieldUsdPct}% a.a.):</span>
            <strong style="color:var(--py-blue-dark);">${formatUSD(monthlyRentUsd)} / mês (${formatBRL(monthlyRentBrl)})</strong>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:0.76rem;color:var(--text-muted);margin-bottom:4px;">
            <span>Piso Mínimo Contrato Mestre OpCo (${simBuilding.minGuaranteedFloorUsdPct}%):</span>
            <strong>${formatUSD(minMonthlyFloorUsd)} / mês (${formatBRL(usdToBrl(minMonthlyFloorUsd))})</strong>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:0.82rem;padding-top:6px;border-top:1px dashed var(--py-blue-light);">
            <span>Aluguéis Acumulados em ${simYears} anos:</span>
            <strong style="color:#0D9488;">${formatUSD(totalRentHorizonUsd)} (${formatBRL(totalRentHorizonBrl)})</strong>
          </div>
        </div>

        <!-- BLOCO B: VARIAÇÃO DE VALOR JUSTO / VALORIZAÇÃO (SEPARADO DO CAIXA - REGRA SEÇÃO 0 e 2) -->
        <div style="background:#FFFBEB;border:1px solid #FDE68A;border-left:4px solid #D97706;padding:12px;border-radius:var(--radius-sm);margin-bottom:14px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
            <span style="font-size:0.72rem;font-weight:800;text-transform:uppercase;color:#92400E;">
              📈 B. Valorização do Ativo (Patrimonial)
            </span>
            <span class="badge badge-gold">CENÁRIO ILUSTRATIVO</span>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:0.82rem;margin-bottom:4px;">
            <span>Ganho Patrimonial Ilustrativo (${simYears}a a +${simScenario.taxaAnualUsdPct}%):</span>
            <strong style="color:#B45309;">+${formatUSD(illustrativeCapitalGainUsd)} (+${formatBRL(illustrativeCapitalGainBrl)})</strong>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:0.78rem;color:#92400E;margin-bottom:6px;">
            <span>Valor Projetado dos Tokens em ${simYears} anos:</span>
            <strong>${formatBRL(investedBrl + illustrativeCapitalGainBrl)} (R$ ${(simBuilding.tokenPriceBrl * compoundFactor).toFixed(2)}/token)</strong>
          </div>
          <div style="font-size:0.7rem;color:#92400E;line-height:1.35;">
            ${simScenario.aviso}
          </div>
        </div>

        <button type="button" class="btn btn-primary btn-block" onclick="openZuviaSubscriptionModal('${simBuilding.id}', ${simTokens})">
          💠 Subscrever ${simTokens.toLocaleString('pt-BR')} Tokens (${formatBRL(investedBrl)}) via Zuvia Pix
        </button>
      </aside>
    </div>
  `;
}

function setRealEstateFilter(field, value) {
  realEstateState[field] = value;
  renderCurrentView(false);
}

function selectBuildingForSimulation(buildingId) {
  realEstateState.simulator.selectedBuildingId = buildingId;
  renderCurrentView(false);
  showToast('🏢 Edifício selecionado no Simulador de Renda em US$ & Valorização Zuvia!');
}

function updateRealEstateSimulator(field, value) {
  if (field === 'tokensQty' || field === 'horizonYears') {
    realEstateState.simulator[field] = Number(value);
  } else {
    realEstateState.simulator[field] = value;
  }
  renderCurrentView(false);
}

// ============================================================================
// ABA 2: CONSTRUTORAS RENOMADAS, HISTÓRICO DE OBRAS & RATING DE CRÉDITO/RISCO
// ============================================================================

function renderBuildersCreditRiskSubTab() {
  return `
    <div class="card card-flag-top" style="margin-bottom:20px;">
      <div class="card-header">
        <div>
          <span class="screen-tag">DUE DILIGENCE TÉCNICA &amp; CRÉDITO · ASSUNÇÃO</span>
          <h3 class="card-title" style="margin-top:4px;">Construtoras Homologadas em Villa Morra &amp; Paseo La Galería — Obras de Referência e Rating de Risco</h3>
        </div>
        <span class="badge badge-blue">4 Incorporadoras Auditadas</span>
      </div>

      <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:16px;">
        Para mitigar risco de execução e proteger o investidor brasileiro do token (Seção 6.2 e Seção 8), apenas construtoras com histórico comprovado no eixo <strong>Villa Morra / Av. Santa Teresa / Av. Mariscal López</strong>, baixa alavancagem e <strong>Conta Escrow condicionada ao registro da Matrícula Única na PropCo</strong> são admitidas no marketplace.
      </p>

      <div class="grid-2">
        ${realEstateState.builders.map(b => `
          <div class="card" style="border-top:4px solid var(--py-blue);background:var(--py-surface);">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;margin-bottom:10px;">
              <div>
                <h4 style="font-size:1.08rem;font-weight:800;color:var(--py-blue-dark);">${b.name}</h4>
                <div style="font-size:0.76rem;color:var(--text-muted);">Fundada em ${b.founded} · Sede: ${b.hq}</div>
              </div>
              <div style="text-align:right;">
                <span class="badge badge-gold" style="font-size:0.8rem;">Rating ${b.creditRating}</span>
                <div style="font-family:var(--font-mono);font-size:0.74rem;font-weight:700;color:#0D9488;margin-top:3px;">Score ${b.riskScore}/1000</div>
              </div>
            </div>

            <div class="grid-3" style="gap:8px;margin-bottom:12px;">
              <div style="background:#FFFFFF;padding:8px 10px;border-radius:8px;border:1px solid var(--border-color);">
                <div style="font-size:0.68rem;color:var(--text-light);text-transform:uppercase;font-weight:700;">Obras Entregues</div>
                <div style="font-weight:800;font-size:0.95rem;color:var(--py-blue-dark);">${b.deliveredBuildings} Torres (${b.deliveredM2})</div>
              </div>
              <div style="background:#FFFFFF;padding:8px 10px;border-radius:8px;border:1px solid var(--border-color);">
                <div style="font-size:0.68rem;color:var(--text-light);text-transform:uppercase;font-weight:700;">Pontualidade</div>
                <div style="font-weight:800;font-size:0.95rem;color:#0D9488;">${b.onTimeRate}</div>
              </div>
              <div style="background:#FFFFFF;padding:8px 10px;border-radius:8px;border:1px solid var(--border-color);">
                <div style="font-size:0.68rem;color:var(--text-light);text-transform:uppercase;font-weight:700;">Dívida / PL</div>
                <div style="font-weight:800;font-size:0.95rem;color:var(--py-blue-dark);">${b.leverageDte}</div>
              </div>
            </div>

            <div style="font-size:0.8rem;margin-bottom:10px;">
              <strong style="color:var(--py-blue-dark);">🏛️ Obras de Referência Entregues em Assunção:</strong>
              <ul style="margin:6px 0 0 18px;color:var(--text-muted);line-height:1.45;">
                ${b.referenceWorks.map(w => `<li>${w}</li>`).join('')}
              </ul>
            </div>

            <div style="font-size:0.76rem;background:#FFFFFF;padding:10px;border-radius:8px;border-left:3px solid var(--py-red);">
              <strong>🛡️ Garantias &amp; Covenants de Proteção:</strong> ${b.guarantees}<br/>
              <span style="color:var(--text-light);">Bancos Auditores/Financiadores PY: ${b.partnerBanks}</span>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ============================================================================
// ABA 3: ESTRUTURA JURÍDICO-OPERACIONAL (PROPCO / OPCO), GATES 6.2 E PROVENTOS PIX
// ============================================================================

function renderPropcoOpcoOperationsSubTab() {
  const d = realEstateState.monthlyDistributionDemo;
  const receitaBrutaTotalUsd = d.receitaAncoraUsd + d.receitaFlexUsd + d.receitaCurtaUsd;
  const caixaDistribuivelBrl = usdToBrl(d.caixaDistribuivelUsd);
  const valorPorTokenBrl = caixaDistribuivelBrl / 400000;

  return `
    <div class="grid-2" style="margin-bottom:20px;">
      <!-- Coluna 1: Arquitetura Societária Seção 2 + Gate de Aquisição Seção 6.2 -->
      <div class="card card-flag-top">
        <div class="card-header">
          <div>
            <span class="screen-tag">SEÇÃO 2 &amp; SEÇÃO 6.2 DA ESPECIFICAÇÃO</span>
            <h3 class="card-title" style="margin-top:4px;">Estrutura PropCo (PY) ↔ OpCo (PY) &amp; Gate de Matrícula</h3>
          </div>
          <span class="badge badge-blue">Proteção do Investidor</span>
        </div>

        <div style="background:linear-gradient(135deg,#050E1D,#0B1E3B);color:#FFFFFF;padding:16px;border-radius:var(--radius-sm);font-family:var(--font-mono);font-size:0.77rem;line-height:1.55;margin-bottom:16px;">
          [Investidores BR] ──(CIC Tokenizado via Zuvia / Infra B3 · Pix R$)──► [Emissor BR]<br/>
          &nbsp;&nbsp;&nbsp;&nbsp;│<br/>
          &nbsp;&nbsp;&nbsp;&nbsp;▼ (100% Capital / Contrato Protegido)<br/>
          [PropCo PY] ──► Dona do Prédio Inteiro em Villa Morra (Matrícula Única)<br/>
          &nbsp;&nbsp;&nbsp;&nbsp;▲<br/>
          &nbsp;&nbsp;&nbsp;&nbsp;│ (Contrato Mestre 10 anos: Aluguel Mínimo Fixo US$ + % Receita)<br/>
          [OpCo PY] ──► Administra Locação Mobiliada (Âncora · Flex · Curta Temp.)
        </div>

        <h4 style="font-size:0.95rem;font-weight:800;color:var(--py-blue-dark);margin-bottom:8px;">
          🔒 Gate de Aquisição do Imóvel (Seção 6.2 — Nunca liberar recursos antes da Matrícula)
        </h4>
        <div style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">
          <div class="cascade-step active-step">
            <span class="badge badge-green">PASSO 1 · OK</span>
            <div style="font-size:0.8rem;"><strong>Contrato de compra assinado</strong> condicionado ao sucesso da captação na Zuvia.</div>
          </div>
          <div class="cascade-step active-step">
            <span class="badge badge-green">PASSO 2 · OK</span>
            <div style="font-size:0.8rem;"><strong>Captação encerrada na Zuvia</strong> com recursos segregados.</div>
          </div>
          <div class="cascade-step active-step">
            <span class="badge badge-blue">PASSO 3 · GATE ATIVO</span>
            <div style="font-size:0.8rem;"><strong>Transferência Escrow para PropCo PY</strong> travada até cláusula de registro da matrícula única.</div>
          </div>
          <div class="cascade-step">
            <span class="badge badge-gold">PASSO 4 · VERIFICAÇÃO</span>
            <div style="font-size:0.8rem;"><strong>Certidão da Matrícula Única</strong> anexada ao Serviço de Ativo com hash SHA-256.</div>
          </div>
        </div>

        <button type="button" class="btn btn-sm btn-outline-red btn-block" onclick="testGate62Block()">
          🛡️ Testar Trava de Segurança 6.2 (Tentar liberar recursos sem Matrícula Registrada)
        </button>
      </div>

      <!-- Coluna 2: Motor de Apuração Mensal OpCo -> PropCo -> Distribuição Pix (Seção 6.3 e Seção 9) -->
      <div class="card card-flag-red">
        <div class="card-header">
          <div>
            <span class="screen-tag red">SEÇÃO 6.3 &amp; SEÇÃO 9 · SERVIÇO DE DISTRIBUIÇÃO</span>
            <h3 class="card-title" style="margin-top:4px;">Apuração Mensal de Aluguel (US$) &amp; Dupla Aprovação Pix</h3>
          </div>
          <span class="badge ${d.statusPagamento === 'PAGO_CONCILIADO_PIX' ? 'badge-green' : 'badge-gold'}">${d.statusPagamento}</span>
        </div>

        <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:12px;">
          <strong>Ativo em Operação:</strong> ${d.buildingSymbol} · <strong>Mês de Referência:</strong> ${d.mesRef}
        </div>

        <div class="table-wrap" style="margin-bottom:14px;">
          <table>
            <thead>
              <tr>
                <th>Etapa do Fluxo de Caixa (Seção 6.3)</th>
                <th>Valor em US$</th>
                <th>Valor em R$ (Câmbio Real)</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>1. Receita OpCo · Canal Âncora (6–12 meses)</td>
                <td>${formatUSD(d.receitaAncoraUsd)}</td>
                <td>${formatBRL(usdToBrl(d.receitaAncoraUsd))}</td>
              </tr>
              <tr>
                <td>2. Receita OpCo · Canal Flex Corporativo (30–90 dias)</td>
                <td>${formatUSD(d.receitaFlexUsd)}</td>
                <td>${formatBRL(usdToBrl(d.receitaFlexUsd))}</td>
              </tr>
              <tr>
                <td>3. Receita OpCo · Curta Temporada (Diárias Executivas)</td>
                <td>${formatUSD(d.receitaCurtaUsd)}</td>
                <td>${formatBRL(usdToBrl(d.receitaCurtaUsd))}</td>
              </tr>
              <tr>
                <td><strong>(=) Receita Bruta Locação Mobiliada OpCo</strong></td>
                <td><strong>${formatUSD(receitaBrutaTotalUsd)}</strong></td>
                <td><strong>${formatBRL(usdToBrl(receitaBrutaTotalUsd))}</strong></td>
              </tr>
              <tr>
                <td>(-) Despesas Operacionais &amp; Manutenção OpCo</td>
                <td style="color:var(--py-red);">-${formatUSD(d.despesasOpcoUsd)}</td>
                <td>-${formatBRL(usdToBrl(d.despesasOpcoUsd))}</td>
              </tr>
              <tr style="background:var(--py-blue-soft);">
                <td><strong>(=) Aluguel Repassado OpCo → PropCo (Contrato Mestre)</strong></td>
                <td><strong>${formatUSD(d.aluguelPagoPropcoUsd)}</strong></td>
                <td><strong>${formatBRL(usdToBrl(d.aluguelPagoPropcoUsd))}</strong></td>
              </tr>
              <tr>
                <td>(-) Despesas PropCo (Seguro, Contabilidade, Taxa Zuvia/B3) + Impostos PY</td>
                <td style="color:var(--py-red);">-${formatUSD(d.despesasPropcoUsd + d.impostosPyUsd)}</td>
                <td>-${formatBRL(usdToBrl(d.despesasPropcoUsd + d.impostosPyUsd))}</td>
              </tr>
              <tr style="background:var(--py-emerald-light);">
                <td><strong>(=) CAIXA LÍQUIDO DISTRIBUÍVEL AOS TOKENS</strong></td>
                <td><strong style="color:#115E59;">${formatUSD(d.caixaDistribuivelUsd)}</strong></td>
                <td><strong style="color:#115E59;">${formatBRL(caixaDistribuivelBrl)} (R$ ${valorPorTokenBrl.toFixed(4)}/token)</strong></td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- Gate de Dupla Aprovação (Financeiro + Compliance - Seção 6.3 item 5 e Seção 9) -->
        <div style="background:var(--py-surface);padding:12px;border-radius:var(--radius-sm);border:1px solid var(--border-color);margin-bottom:12px;">
          <div style="font-size:0.78rem;font-weight:800;color:var(--py-blue-dark);margin-bottom:8px;">
            🔐 Controle de Segregação de Funções (Seção 9): Aprovação em Dupla Obrigatória
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">
            <span class="badge ${d.approvalFinanceiro ? 'badge-green' : 'badge-gray'}">
              1ª Assinatura (Diretoria Financeira): ${d.approvalFinanceiro ? 'APROVADO ✓' : 'PENDENTE'}
            </span>
            <span class="badge ${d.approvalCompliance ? 'badge-green' : 'badge-gold'}">
              2ª Assinatura (Compliance &amp; Auditoria): ${d.approvalCompliance ? 'APROVADO ✓' : 'AGUARDANDO'}
            </span>
          </div>
        </div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;">
          <button type="button" class="btn btn-sm btn-blue" style="flex:1;" onclick="approveComplianceAndDistributePix()">
            ✅ Assinar como Compliance (2/2) &amp; Disparar Proventos Pix
          </button>
        </div>
      </div>
    </div>
  `;
}

function testGate62Block() {
  const now = new Date().toLocaleTimeString('pt-BR');
  realEstateState.auditEvents.unshift({
    id: 'AUD-GATE-' + Date.now().toString().slice(-3),
    ts: `17/10/2026 ${now}`,
    actor: 'Gate de Segurança 6.2',
    action: 'BLOQUEIO_LIBERACAO_ANTECIPADA',
    entity: 'Ativo ZUV-GAL01',
    detail: 'Tentativa de liberação de recursos bloqueada: Certidão de matrícula única em nome da PropCo PY é condição obrigatória.'
  });
  showToast('🛑 [GATE 6.2 ATIVADO] Operação bloqueada! Recursos só podem ser liberados com cláusula de registro da matrícula em nome da PropCo PY.');
}

function approveComplianceAndDistributePix() {
  realEstateState.monthlyDistributionDemo.approvalCompliance = true;
  realEstateState.monthlyDistributionDemo.statusPagamento = 'PAGO_CONCILIADO_PIX';
  const d = realEstateState.monthlyDistributionDemo;
  const totalBrl = usdToBrl(d.caixaDistribuivelUsd);

  // Credita proporcionalmente na carteira do investidor logado se ele tiver ZUV-WTC03
  const myPos = realEstateState.investorPositions.find(p => p.symbol === 'ZUV-WTC03');
  const myShareBrl = myPos ? (myPos.qtyTokens / 400000) * totalBrl : 0;

  if (myShareBrl > 0) {
    state.wallet.cashbackBrl = Number((state.wallet.cashbackBrl + myShareBrl).toFixed(2));
    state.wallet.history.unshift({
      id: 'mov-div-' + Date.now(),
      date: '17/10/2026 ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      desc: `Provento Aluguel PY (ZUV-WTC03 · Out/2026 · Câmbio Real)`,
      type: 'PROVENTO_IMOBILIARIO_PIX',
      amountBrl: Number(myShareBrl.toFixed(2))
    });
  }

  realEstateState.auditEvents.unshift({
    id: 'AUD-PIX-' + Date.now().toString().slice(-3),
    ts: '17/10/2026 ' + new Date().toLocaleTimeString('pt-BR'),
    actor: 'Compliance + Adaptador Zuvia/B3',
    action: 'DISTRIBUICAO_PROVENTOS_PIX_APROVADA',
    entity: 'ZUV-WTC03 · Out/2026',
    detail: `Dupla aprovação concluída. ${formatBRL(totalBrl)} (${formatUSD(d.caixaDistribuivelUsd)}) liquidados via Pix Câmbio Real.`
  });

  renderCurrentView(false);
  showToast(`💠 Dupla aprovação concluída! Proventos de ${formatBRL(totalBrl)} enviados via Pix Câmbio Real (sua cota: ${formatBRL(myShareBrl)}).`);
}

// ============================================================================
// ABA 4: CARTEIRA DO INVESTIDOR, LAUDOS ANUAIS E MERCADO SUBSEQUENTE B3 / ZUVIA
// ============================================================================

function renderInvestorPortfolioB3SubTab() {
  return `
    <div class="grid-2" style="margin-bottom:20px;">
      <!-- Espelho da Posição no Ledger B3/Zuvia -->
      <div class="card card-flag-top">
        <div class="card-header">
          <div>
            <span class="screen-tag">ESPELHO DO LEDGER B3 / ZUVIA (TABELA POSICAO)</span>
            <h3 class="card-title" style="margin-top:4px;">Meus Tokens Imobiliários &amp; Conciliação de Titularidade</h3>
          </div>
          <span class="badge badge-green">Sincronizado c/ B3</span>
        </div>

        <div class="quota-alert" style="margin-top:0;">
          📌 <strong>Regra da Seção 6.4 (Mercado Subsequente):</strong> O sistema exibe com rótulos estritamente distintos o <strong>Valor Patrimonial por Token (Laudo Independente)</strong> e o <strong>Último Preço Negociado no Ambiente B3/Zuvia</strong>. Liquidez no mercado secundário não é garantida.
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Token / Prédio</th>
                <th>Qtd. Tokens</th>
                <th>Custo Médio</th>
                <th>Valor Patrimonial (Laudo NAV)</th>
                <th>Último Preço B3/Zuvia</th>
                <th>Renda Aluguel US$/mês</th>
                <th>Status Ledger</th>
              </tr>
            </thead>
            <tbody>
              ${realEstateState.investorPositions.map(p => `
                <tr>
                  <td>
                    <strong>${p.symbol}</strong><br/>
                    <span style="font-size:0.72rem;color:var(--text-muted);">${p.buildingName}</span>
                  </td>
                  <td><strong>${p.qtyTokens.toLocaleString('pt-BR')}</strong></td>
                  <td>${formatBRL(p.avgCostBrl)}</td>
                  <td><span class="badge badge-blue">${formatBRL(p.navPerTokenBrl)}</span></td>
                  <td><span class="badge badge-gold">${formatBRL(p.lastMarketPriceBrl)}</span></td>
                  <td>
                    <strong style="color:#0D9488;">${formatUSD(p.monthlyDividendUsd)}</strong><br/>
                    <span style="font-size:0.7rem;color:var(--text-light);">${formatBRL(usdToBrl(p.monthlyDividendUsd))}/mês</span>
                  </td>
                  <td><code>${p.ledgerSyncStatus}</code></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Livro de Negociação Subsequente B3 / Zuvia + Laudos Independentes -->
      <div class="card card-flag-red">
        <div class="card-header">
          <div>
            <span class="screen-tag red">SEÇÃO 6.4 &amp; 6.5 · MERCADO SUBSEQUENTE B3 &amp; LAUDOS</span>
            <h3 class="card-title" style="margin-top:4px;">Ambiente de Negociação Subsequente (Zuvia / Tecnologia B3)</h3>
          </div>
          <span class="badge badge-blue">Liquidação Pix</span>
        </div>

        <div class="table-wrap" style="margin-bottom:16px;">
          <table>
            <thead>
              <tr>
                <th>Ordem B3</th>
                <th>Token</th>
                <th>Tipo</th>
                <th>Qtd.</th>
                <th>Preço Negociado</th>
                <th>Ação</th>
              </tr>
            </thead>
            <tbody>
              ${realEstateState.secondaryOrders.map(o => `
                <tr>
                  <td><code>${o.id}</code></td>
                  <td><strong>${o.symbol}</strong></td>
                  <td><span class="badge ${o.side === 'VENDA' ? 'badge-red' : 'badge-green'}">${o.side}</span></td>
                  <td>${o.qty} tokens</td>
                  <td><strong>${formatBRL(o.priceBrl)}</strong></td>
                  <td>
                    ${o.side === 'VENDA' ? `
                      <button type="button" class="btn btn-sm btn-primary" onclick="executeSecondaryB3Order('${o.id}')">
                        Comprar via Pix B3
                      </button>
                    ` : `<span class="badge badge-gray">Oferta de Compra</span>`}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <h4 style="font-size:0.92rem;font-weight:800;color:var(--py-blue-dark);margin-bottom:8px;">
          📑 Laudos Anuais Independentes de Valor Justo (Seção 6.5 — Separado do Caixa)
        </h4>
        ${realEstateState.appraisalReports.map(l => `
          <div style="background:var(--py-surface);padding:12px;border-radius:var(--radius-sm);border:1px solid var(--border-color);font-size:0.79rem;">
            <div style="display:flex;justify-content:space-between;font-weight:700;margin-bottom:4px;">
              <span>${l.buildingSymbol} · ${l.evaluator} (${l.date})</span>
              <span style="color:#0D9488;">${l.variationPct}</span>
            </div>
            <div style="color:var(--text-muted);margin-bottom:4px;">
              Aquisição: <strong>${formatUSD(l.acquisitionUsd)}</strong> → Laudo Valor Justo: <strong>${formatUSD(l.fairValueUsd)}</strong> · Método: ${l.method}
            </div>
            <div>Hash Imutável: <code>${l.fileHash}</code></div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

function executeSecondaryB3Order(orderId) {
  const orderIdx = realEstateState.secondaryOrders.findIndex(o => o.id === orderId);
  if (orderIdx === -1) return;
  const order = realEstateState.secondaryOrders[orderIdx];
  const totalBrl = order.qty * order.priceBrl;

  const existingPos = realEstateState.investorPositions.find(p => p.symbol === order.symbol);
  if (existingPos) {
    existingPos.qtyTokens += order.qty;
    existingPos.investedBrl += totalBrl;
    existingPos.monthlyDividendUsd = Number((existingPos.qtyTokens * 0.0319).toFixed(2));
  }

  realEstateState.secondaryOrders.splice(orderIdx, 1);
  realEstateState.auditEvents.unshift({
    id: 'AUD-B3-' + Date.now().toString().slice(-3),
    ts: '17/10/2026 ' + new Date().toLocaleTimeString('pt-BR'),
    actor: 'Adaptador B3 / Ledger',
    action: 'TRANSFERENCIA_MERCADO_SUBSEQUENTE',
    entity: `${order.symbol} (${order.qty} tokens)`,
    detail: `Ordem ${order.id} liquidada via Pix por ${formatBRL(totalBrl)}. Titularidade atualizada no Ledger B3.`
  });

  renderCurrentView(false);
  showToast(`📈 Ordem ${order.id} executada no ambiente B3/Zuvia! +${order.qty} tokens ${order.symbol} adicionados à sua posição.`);
}

// ============================================================================
// ABA 5: GOVERNANÇA CVM RES. 88, CHECKLIST (P1 A P6) E TRILHA DE AUDITORIA
// ============================================================================

function renderGovernanceCvmChecklistSubTab() {
  return `
    <div class="grid-2">
      <div class="card card-flag-top">
        <div class="card-header">
          <div>
            <span class="screen-tag">SEÇÃO 0 &amp; SEÇÃO 7 · PREMISSAS REGULATÓRIAS</span>
            <h3 class="card-title" style="margin-top:4px;">Status de Verificação Jurídica, Zuvia, CVM Res. 88 &amp; B3 (P1 a P6)</h3>
          </div>
          <span class="badge badge-gold">Fase 0 Discovery</span>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Ponto de Verificação</th>
                <th>Responsável</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${realEstateState.regulatoryChecks.map(c => `
                <tr>
                  <td><strong>${c.code}</strong></td>
                  <td>
                    <strong>${c.title}</strong><br/>
                    <span style="font-size:0.74rem;color:var(--text-muted);">${c.detail}</span>
                  </td>
                  <td>${c.owner}</td>
                  <td><span class="badge badge-blue">${c.status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <div class="card card-flag-red">
        <div class="card-header">
          <div>
            <span class="screen-tag red">SEÇÃO 4 &amp; SEÇÃO 9 · TRILHA DE AUDITORIA IMUTÁVEL</span>
            <h3 class="card-title" style="margin-top:4px;">Logs de Reconciliação Ledger B3/Zuvia &amp; Eventos de Domínio</h3>
          </div>
          <button type="button" class="btn btn-sm btn-outline" onclick="runDailyB3Reconciliation()">
            🔄 Rodar Conciliação Diária B3
          </button>
        </div>

        <div style="display:flex;flex-direction:column;gap:10px;">
          ${realEstateState.auditEvents.map(ev => `
            <div style="background:var(--py-surface);padding:11px 14px;border-radius:var(--radius-sm);border-left:4px solid var(--py-blue);font-size:0.79rem;">
              <div style="display:flex;justify-content:space-between;font-weight:700;color:var(--py-blue-dark);margin-bottom:3px;">
                <span>[${ev.id}] ${ev.action} · ${ev.entity}</span>
                <span style="font-family:var(--font-mono);font-size:0.72rem;color:var(--text-light);">${ev.ts}</span>
              </div>
              <div style="color:var(--text-muted);">${ev.detail} (Ator: <strong>${ev.actor}</strong>)</div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function runDailyB3Reconciliation() {
  const now = new Date().toLocaleTimeString('pt-BR');
  realEstateState.auditEvents.unshift({
    id: 'AUD-SYNC-' + Date.now().toString().slice(-3),
    ts: `17/10/2026 ${now}`,
    actor: 'Rotina Conciliação Seção 9',
    action: 'CONCILIACAO_POSICOES_X_LEDGER_B3',
    entity: '4 Prédios (ZUV-GAL01 a ZUV-PACH04)',
    detail: 'Posições locais × Ledger B3/Zuvia, Pagamentos Pix × Extrato Câmbio Real e Receita OpCo × Contrato Mestre 100% conciliados.'
  });
  renderCurrentView(false);
  showToast('✅ Conciliação diária (Posições Locais × Ledger B3/Zuvia × Extrato Pix Câmbio Real) concluída sem divergências!');
}

// ============================================================================
// MODAL DE SUBSCRIÇÃO DE TOKENS VIA ZUVIA (RES. CVM 88) + PIX CÂMBIO REAL
// ============================================================================

function openZuviaSubscriptionModal(buildingId, defaultTokens = 200) {
  const b = realEstateState.buildings.find(x => x.id === buildingId) || realEstateState.buildings[0];
  const dialog = document.getElementById('zuviaInvestDialog');
  const body = document.getElementById('zuviaDialogBody');
  if (!dialog || !body) return;

  const qty = Number(defaultTokens) || 200;
  const totalBrl = qty * b.tokenPriceBrl;
  const totalUsd = brlToUsd(totalBrl);
  const monthlyUsd = (totalUsd * (b.netRentalYieldUsdPct / 100)) / 12;
  const qrSvg = generateQrSvg(`ZUVIA-B3-${b.symbol}-${qty}-${totalBrl.toFixed(2)}`, 148);

  body.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:14px;">
      <div>
        <span class="badge badge-red">${b.symbol} · ${b.lifecycleStage}</span>
        <h4 style="font-size:1.15rem;font-weight:800;color:var(--py-blue-dark);margin-top:4px;">${b.name}</h4>
        <div style="font-size:0.78rem;color:var(--text-muted);">Construtora: <strong>${b.builderName}</strong> (Rating ${b.creditRating} · Score ${b.riskScore}/1000)</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:0.72rem;color:var(--text-light);">Preço Unitário do Token</div>
        <div style="font-family:var(--font-display);font-size:1.3rem;font-weight:800;color:var(--py-blue-dark);">R$ 25,00</div>
      </div>
    </div>

    <div class="grid-2" style="gap:16px;align-items:center;">
      <div>
        <div class="form-group">
          <label for="modalZuviaQty">Quantidade de Tokens para Subscrição (Mín. 4 tokens = R$ 100)</label>
          <input type="number" id="modalZuviaQty" class="form-control" value="${qty}" min="4" max="20000" step="20"
            onchange="openZuviaSubscriptionModal('${b.id}', this.value)" />
        </div>

        <div style="background:var(--py-surface);padding:12px;border-radius:var(--radius-sm);border:1px solid var(--border-color);font-size:0.81rem;margin-bottom:12px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span>Total a Liquidar via Pix (Zuvia / B3):</span>
            <strong style="font-size:1rem;color:var(--py-red);">${formatBRL(totalBrl)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span>Lastro Imobiliário em Assunção (Câmbio Real):</span>
            <strong>${formatUSD(totalUsd)}</strong>
          </div>
          <div style="display:flex;justify-content:space-between;color:#0D9488;font-weight:700;">
            <span>Renda Mensal Aluguel Projetada (${b.netRentalYieldUsdPct}% a.a. US$):</span>
            <span>${formatUSD(monthlyUsd)}/mês (${formatBRL(usdToBrl(monthlyUsd))})</span>
          </div>
        </div>

        <div style="font-size:0.74rem;color:var(--text-muted);background:var(--py-blue-soft);padding:10px;border-radius:8px;border-left:3px solid var(--py-blue);">
          <strong> Termos de Proteção CVM 88 &amp; Seção 6.2:</strong><br/>
          • Investidor Logado: <strong>${state.customer.nome}</strong> (CPF ${state.customer.cpf} · KYC ${state.customer.kycStatus})<br/>
          • Segregação na Zuvia até atingir captação mínima; transferência à PropCo PY condicionada ao registro da matrícula única (<code>${b.matriculaPy}</code>).
        </div>
      </div>

      <div class="qr-box">
        <span class="badge badge-blue">LIQUIDAÇÃO PIX · ZUVIA &amp; CÂMBIO REAL</span>
        ${qrSvg}
        <div style="font-size:0.74rem;color:var(--text-muted);">
          Escaneie o QR Pix para liquidar <strong>${qty.toLocaleString('pt-BR')} tokens ${b.symbol}</strong> com registro de titularidade na infraestrutura B3.
        </div>
        <button type="button" class="btn btn-primary btn-block" onclick="confirmZuviaTokenSubscription('${b.id}', ${qty})">
          ✅ Confirmar Pagamento Pix &amp; Emitir Tokens (${formatBRL(totalBrl)})
        </button>
      </div>
    </div>
  `;

  if (!dialog.open) {
    dialog.showModal();
  }
}

function confirmZuviaTokenSubscription(buildingId, qtyTokens) {
  const b = realEstateState.buildings.find(x => x.id === buildingId);
  if (!b) return;
  const qty = Math.max(1, Number(qtyTokens) || 200);
  const totalBrl = qty * b.tokenPriceBrl;
  const totalUsd = brlToUsd(totalBrl);
  const monthlyUsd = Number(((totalUsd * (b.netRentalYieldUsdPct / 100)) / 12).toFixed(2));

  b.subscribedTokens = Math.min(b.totalTokens, b.subscribedTokens + qty);

  const existing = realEstateState.investorPositions.find(p => p.buildingId === b.id);
  if (existing) {
    existing.qtyTokens += qty;
    existing.investedBrl += totalBrl;
    existing.monthlyDividendUsd = Number((existing.monthlyDividendUsd + monthlyUsd).toFixed(2));
  } else {
    realEstateState.investorPositions.unshift({
      buildingId: b.id,
      symbol: b.symbol,
      buildingName: b.name,
      qtyTokens: qty,
      avgCostBrl: b.tokenPriceBrl,
      investedBrl: totalBrl,
      navPerTokenBrl: b.navPerTokenBrl,
      lastMarketPriceBrl: b.lastMarketPriceBrl,
      monthlyDividendUsd: monthlyUsd,
      ledgerSyncStatus: 'EMITIDO_B3_ZUVIA',
      ledgerRefHash: '0x' + Math.random().toString(16).slice(2, 10)
    });
  }

  realEstateState.auditEvents.unshift({
    id: 'AUD-SUB-' + Date.now().toString().slice(-3),
    ts: '17/10/2026 ' + new Date().toLocaleTimeString('pt-BR'),
    actor: `Investidor ${state.customer.nome} via Zuvia`,
    action: 'SUBSCRICAO_TOKEN_IMOBILIARIO_PIX',
    entity: `${b.symbol} (+${qty} tokens)`,
    detail: `Aporte de ${formatBRL(totalBrl)} (${formatUSD(totalUsd)}) liquidado via Pix Câmbio Real e espelhado no Ledger B3.`
  });

  document.getElementById('zuviaInvestDialog')?.close();
  realEstateState.subTab = 'carteira_b3';
  renderCurrentView(true);
  showToast(`🏛️ Parabéns! ${qty.toLocaleString('pt-BR')} tokens ${b.symbol} (${b.name}) subscritos via Zuvia/B3 com sucesso!`);
}
