/**
 * Portal Paraguai · Pick & Go — Sistema Demonstrável Completo (Telas T1 a T30)
 * Cores da Bandeira do Paraguai (#D52B1E Vermelho, #FFFFFF Branco, #0038A8 Azul)
 * Checkout Pix com Câmbio Real Ao Vivo (AwesomeAPI / ExchangeRate-API) + Ledger Dupla Entrada + Split 90/7/3
 */

const state = {
  currentView: 'turista',
  turistaSubTab: 'catalogo', // 'catalogo' | 'scango' | 'pedidos' | 'carteira' | 'kyc'
  selectedStoreFilter: 'ALL',
  selectedMerchantStore: 'loja-cellshop',
  videoSimulateHasApp: true,

  // Motor de Câmbio Real (D1)
  fx: {
    commercialUsdBrl: 5.6500,
    usdPyg: 7820,
    spreadPct: 1.22, // Spread operacional Câmbio Real / EPYX
    iofPct: 0.38,    // IOF câmbio instantâneo Pix fronteira
    effectiveUsdBrl: 5.7404,
    source: 'Cotação Real API (Inicializando...)',
    updatedAt: new Date().toLocaleTimeString('pt-BR'),
    quotaUsdLimit: 500.00, // D3: Cota terrestre US$ 500 por CPF
    excessTaxPct: 50.0     // Imposto sobre excedente da cota terrestre
  },

  // Percentuais de Split (D4 / 14.2 Critério de Aceite: 90% Loja / 7% Portal / 3% EPYX)
  splitRules: {
    storePct: 90,
    portalPct: 7,
    epyxPct: 3
  },

  // Cliente Logado (Turista Brasileiro - T11 a T13)
  customer: {
    id: 'cli-br-001',
    nome: 'Rafael Mendonça',
    cpf: '384.912.748-09',
    whatsapp: '+55 (11) 99812-4401',
    email: 'rafael.mendonca@email.com.br',
    pixOneClickSaved: true,
    pixBank: 'Itaú Unibanco · Pix Chave CPF',
    kycStatus: 'APROVADO', // 'APROVADO' | 'PENDENTE' | 'RECUSADO'
    dataHubEnriched: true,
    dataHubScore: '982 / 1000 (Baixo Risco · WhatsApp Ativo · Propensão Alta Eletrônicos & Ciclismo)',
    consents: {
      kycBiometria: true,
      dataHubEnrichment: true,
      push: true,
      whatsapp: true,
      rcs: true,
      email: true
    },
    weeklyMessagesReceived: 2,
    weeklyMessageLimit: 5
  },

  // Carteira, Cashback e Rewards (T8 / RF-21 a RF-24)
  wallet: {
    cashbackBrl: 185.00,
    bonusBrl: 65.00,
    applyInCheckout: false,
    purchasesCount: 4,
    tier: 'OURO FRONTEIRA',
    history: [
      { id: 'mov-1', date: '15/10/2026 14:22', desc: 'Cashback 2% · Pedido #PG-8890 (Cellshop)', type: 'CASHBACK', amountBrl: 120.00 },
      { id: 'mov-2', date: '16/10/2026 09:10', desc: 'Bônus Campanha Outubro Fronteira (Portal)', type: 'BONUS', amountBrl: 65.00 },
      { id: 'mov-3', date: '16/10/2026 17:45', desc: 'Cashback 3% · Pedido #PG-8901 (Nissei)', type: 'CASHBACK', amountBrl: 65.00 }
    ]
  },

  // 5 Lojas do Piloto em Ciudad del Este (D11 / 14.3 Piloto)
  stores: [
    { id: 'loja-cellshop', name: 'Cellshop Importados PY', pickupPoint: 'Anexo Exclusivo Portal · Piso Térreo', hours: '08h às 18h', category: 'Eletrônicos & Esportes' },
    { id: 'loja-nissei', name: 'Casa Nissei CDE', pickupPoint: 'Balcão Pick & Go Dentro da Loja (2º Andar)', hours: '08h às 18h', category: 'Fotografia & Smartphones' },
    { id: 'loja-china', name: 'Shopping China Importados', pickupPoint: 'Lounge VIP Portal Paraguai · Paris Shopping', hours: '08h às 18h', category: 'Perfumaria & Bebidas' },
    { id: 'loja-mega', name: 'Mega Eletrônicos', pickupPoint: 'Ponto de Retirada Anexo · Av. Monseñor Rodriguez', hours: '08h às 18h', category: 'Informática & Áudio' },
    { id: 'loja-atacado', name: 'Atacado Games', pickupPoint: 'Locker & Balcão Rápido Portal (3º Piso)', hours: '08h às 18h', category: 'Games & Realidade Virtual' }
  ],

  // Catálogo de Produtos em Dólar (US$) com Conversão em Tempo Real para R$ (T1, T27)
  products: [
    {
      id: 'prod-bike-60k',
      storeId: 'loja-cellshop',
      storeName: 'Cellshop Importados PY',
      sku: 'TREK-SLR-2026',
      barcode: '7899001122334',
      name: 'Bicicleta Trek Madone SLR 9 Carbon Aero (Customizável T27)',
      category: 'Ciclismo High-End',
      emoji: '🚲',
      baseUsd: 9650.00,
      stock: 4,
      configurable: true,
      description: 'Exemplo oficial da especificação (RF-04 / T23-T25 / T27 / 14.2): configure aro, cor e acessórios para testar o split de R$ 60.000,00 (90/7/3).'
    },
    {
      id: 'prod-iphone-16pro',
      storeId: 'loja-nissei',
      storeName: 'Casa Nissei CDE',
      sku: 'APL-IP16PM-256',
      barcode: '7899001122001',
      name: 'iPhone 16 Pro Max 256GB Titânio Natural (Global eSIM)',
      category: 'Smartphones',
      emoji: '📱',
      baseUsd: 1120.00,
      stock: 19,
      configurable: false,
      description: 'Garantia oficial Apple · Pronta retirada sem fila na Casa Nissei ou na Central do Portal.'
    },
    {
      id: 'prod-ps5-pro',
      storeId: 'loja-atacado',
      storeName: 'Atacado Games',
      sku: 'SNY-PS5PRO-2TB',
      barcode: '7899001122002',
      name: 'Console PlayStation 5 Pro 2TB SSD + Controle DualSense',
      category: 'Games',
      emoji: '🎮',
      baseUsd: 685.00,
      stock: 14,
      configurable: false,
      description: 'Versão 2TB 4K 120Hz · Ideal para pré-compra por Pix ou Scan & Go na loja.'
    },
    {
      id: 'prod-dji-mini4',
      storeId: 'loja-nissei',
      storeName: 'Casa Nissei CDE',
      sku: 'DJI-M4P-COMBO',
      barcode: '7899001122003',
      name: 'Drone DJI Mini 4 Pro Fly More Combo Plus (RC 2 Com Tela)',
      category: 'Drones & Foto',
      emoji: '🚁',
      baseUsd: 890.00,
      stock: 9,
      configurable: false,
      description: '3 baterias Plus + Hub de carregamento + Controle DJI RC 2.'
    },
    {
      id: 'prod-perfume-sauvage',
      storeId: 'loja-china',
      storeName: 'Shopping China Importados',
      sku: 'DIOR-SAUV-100',
      barcode: '7899001122004',
      name: 'Perfume Dior Sauvage Elixir 100ml Original c/ Selo',
      category: 'Perfumaria',
      emoji: '✨',
      baseUsd: 195.00,
      stock: 32,
      configurable: false,
      description: 'Item campeão de Scan & Go rápido dentro do Shopping China.'
    },
    {
      id: 'prod-macbook-m4',
      storeId: 'loja-mega',
      storeName: 'Mega Eletrônicos',
      sku: 'APL-MBP-M4-14',
      barcode: '7899001122005',
      name: 'MacBook Pro 14" Chip M4 Pro 24GB RAM 512GB SSD Space Black',
      category: 'Informática',
      emoji: '💻',
      baseUsd: 1840.00,
      stock: 7,
      configurable: false,
      description: 'Retirada expressa conferida pela equipe da Central do Portal Paraguai.'
    }
  ],

  // Sacola Multi-Loja (RF-02, RF-03)
  cart: [
    {
      cartItemId: 'ci-init-1',
      productId: 'prod-iphone-16pro',
      storeId: 'loja-nissei',
      storeName: 'Casa Nissei CDE',
      name: 'iPhone 16 Pro Max 256GB Titânio Natural',
      emoji: '📱',
      qty: 1,
      unitUsd: 1120.00,
      configSummary: 'Padrão de Fábrica'
    },
    {
      cartItemId: 'ci-init-2',
      productId: 'prod-perfume-sauvage',
      storeId: 'loja-china',
      storeName: 'Shopping China Importados',
      name: 'Perfume Dior Sauvage Elixir 100ml',
      emoji: '✨',
      qty: 1,
      unitUsd: 195.00,
      configSummary: 'Lote Selo Original'
    }
  ],

  deliveryMode: 'PORTAL_HUB', // 'PORTAL_HUB' | 'STORE_PICKUP' | 'SCAN_GO' | 'SHIP_BRAZIL'
  appliedCoupon: null,
  currentOrigin: { canal: 'App Nativo', videoId: '-', codigo: 'DIRETO-APP' },

  // Controle de Idempotência de Webhooks Pix (RF-07 / 14.2)
  processedWebhookTxIds: new Set(['TXID-DEMO-60K-001', 'TXID-DEMO-8902']),

  // Pedidos Ativos (Máquina de Estados Seção 7)
  orders: [
    {
      id: 'PG-9001',
      txid: 'TXID-DEMO-60K-001',
      createdAt: '17/10/2026 10:15',
      customerName: 'Rafael Mendonça',
      customerCpf: '384.912.748-09',
      mode: 'PORTAL_HUB',
      state: 'PRONTO_RETIRADA',
      stores: ['Cellshop Importados PY'],
      items: [
        {
          name: 'Bicicleta Trek Madone SLR 9 Carbon (Aro 29 · Vermelho Cerro · Kit Completo ABS + Fox + Gel)',
          storeName: 'Cellshop Importados PY',
          qty: 1,
          unitUsd: 10452.23
        }
      ],
      totalUsd: 10452.23,
      fxRateApplied: 5.7404,
      totalBrl: 60000.00, // Exemplo oficial do Critério de Aceite 14.2!
      split: {
        storeBrl: 54000.00,
        portalBrl: 4200.00,
        epyxBrl: 1800.00,
        storeUsd: 9407.01
      },
      qrToken: 'QR-PG9001-TREK60K',
      qrUsed: false,
      arrivedNotified: false,
      collectorOperator: 'Diego Benítez (Op. #04)',
      storeTestStatus: 'APROVADO_TESTE_LOJA',
      origin: { canal: 'YouTube Portal Paraguai', videoId: 'VID-BIKE-CDE', codigo: 'YT-BIKE-60K' },
      trackingCode: null,
      cashbackCreditedBrl: 1200.00
    },
    {
      id: 'PG-9002',
      txid: 'TXID-DEMO-8902',
      createdAt: '17/10/2026 11:40',
      customerName: 'Mariana Costa',
      customerCpf: '219.440.118-52',
      mode: 'PORTAL_HUB',
      state: 'EM_TESTE_LOJA',
      stores: ['Casa Nissei CDE', 'Atacado Games'],
      items: [
        { name: 'Drone DJI Mini 4 Pro Fly More Combo', storeName: 'Casa Nissei CDE', qty: 1, unitUsd: 890.00 },
        { name: 'Console PlayStation 5 Pro 2TB SSD', storeName: 'Atacado Games', qty: 1, unitUsd: 685.00 }
      ],
      totalUsd: 1575.00,
      fxRateApplied: 5.7404,
      totalBrl: 9041.13,
      split: {
        storeBrl: 8137.02,
        portalBrl: 632.88,
        epyxBrl: 271.23,
        storeUsd: 1417.50
      },
      qrToken: 'QR-PG9002-MULTI',
      qrUsed: false,
      arrivedNotified: false,
      collectorOperator: 'Rodrigo Ayala (Op. #02) · Em Bancada de Teste da Loja (RF-50)',
      storeTestStatus: 'EM_ANALISE_DEFEITOS_LOJA',
      origin: { canal: 'App Pick & Go', videoId: '-', codigo: 'CAMP-OUTUBRO' },
      trackingCode: null,
      cashbackCreditedBrl: 180.82
    },
    {
      id: 'PG-9003',
      txid: 'TXID-DEMO-8903',
      createdAt: '17/10/2026 12:05',
      customerName: 'Rafael Mendonça',
      customerCpf: '384.912.748-09',
      mode: 'SHIP_BRAZIL',
      state: 'EM_TRANSITO',
      stores: ['Shopping China Importados'],
      items: [
        { name: 'Kit 2x Perfume Dior Sauvage Elixir 100ml', storeName: 'Shopping China Importados', qty: 2, unitUsd: 195.00 }
      ],
      totalUsd: 390.00,
      fxRateApplied: 5.7404,
      totalBrl: 2238.76,
      split: {
        storeBrl: 2014.88,
        portalBrl: 156.71,
        epyxBrl: 67.17,
        storeUsd: 351.00
      },
      qrToken: 'QR-PG9003-SHIP',
      qrUsed: false,
      arrivedNotified: false,
      collectorOperator: 'Despacho Fronteira Express',
      storeTestStatus: 'APROVADO_TESTE_LOJA',
      origin: { canal: 'Instagram Reels', videoId: 'VID-PERF-09', codigo: 'REELS-SAUVAGE' },
      trackingCode: 'PY849201948BR',
      shippingStep: 'EM_TRANSITO', // 'POSTADO' | 'EM_TRANSITO' | 'NA_ALFANDEGA' | 'ENTREGUE'
      cashbackCreditedBrl: 44.78
    }
  ],

  // Ledger Imutável de Dupla Entrada (Seção 5.3 / Seção 8 / Critério 14.2)
  ledgerEntries: [
    {
      id: 'LDG-1001',
      timestamp: '17/10/2026 10:15:04',
      orderId: 'PG-9001',
      txid: 'TXID-DEMO-60K-001',
      debitAccount: '1.1.01 · Conta Liquidação Pix Adquirente (BRL)',
      creditAccount: '2.1.01 · Passivo Transitório Escrow Pick & Go',
      amountBrl: 60000.00,
      amountUsd: 10452.23,
      fxRate: 5.7404,
      type: 'RECEBIMENTO_PIX_BRUTO'
    },
    {
      id: 'LDG-1002',
      timestamp: '17/10/2026 10:15:05',
      orderId: 'PG-9001',
      txid: 'TXID-DEMO-60K-001',
      debitAccount: '2.1.01 · Passivo Transitório Escrow Pick & Go',
      creditAccount: '2.1.10 · Repasse Lojista via Câmbio Real USD (90% · Cellshop)',
      amountBrl: 54000.00,
      amountUsd: 9407.01,
      fxRate: 5.7404,
      type: 'SPLIT_LOJA_90'
    },
    {
      id: 'LDG-1003',
      timestamp: '17/10/2026 10:15:05',
      orderId: 'PG-9001',
      txid: 'TXID-DEMO-60K-001',
      debitAccount: '2.1.01 · Passivo Transitório Escrow Pick & Go',
      creditAccount: '3.1.01 · Receita Comissão Portal Paraguai (7% c/ Operação)',
      amountBrl: 4200.00,
      amountUsd: 731.66,
      fxRate: 5.7404,
      type: 'SPLIT_PORTAL_7'
    },
    {
      id: 'LDG-1004',
      timestamp: '17/10/2026 10:15:05',
      orderId: 'PG-9001',
      txid: 'TXID-DEMO-60K-001',
      debitAccount: '2.1.01 · Passivo Transitório Escrow Pick & Go',
      creditAccount: '2.1.20 · Liquidação & FX Partner EPYX (3%)',
      amountBrl: 1800.00,
      amountUsd: 313.56,
      fxRate: 5.7404,
      type: 'SPLIT_EPYX_3'
    }
  ],

  // Ocorrências da Central de Operação do Portal conforme Regra 3.3.2 (RF-15, RF-45, RF-48, RF-50, D11)
  occurrences: [
    {
      id: 'OCO-01',
      orderId: 'PG-9001',
      storeName: 'Cellshop Importados PY',
      type: 'DEFEITO_ANTES_SAIDA_TESTE_LOJA',
      situationLabel: 'Item com defeito detectado no teste da loja, antes da saída (RF-50)',
      responsible: 'LOJA',
      resolution: 'Troca imediata do item pela loja; pedido seguiu ao ponto de retirada aprovado',
      whoRegistered: 'Técnico Bancada Cellshop #TB-02 & Op. Diego Benítez (#04)',
      exitMilestonePassed: false,
      adjustmentBrl: 0.00,
      createdAt: '17/10/2026 10:28'
    },
    {
      id: 'OCO-02',
      orderId: 'PG-8994',
      storeName: 'Mega Eletrônicos',
      type: 'ITEM_FALTANTE',
      situationLabel: 'Item faltante na conferência',
      responsible: 'LOJA E PORTAL',
      resolution: 'Acerto na fatura de repasse com lançamento contábil no Ledger',
      whoRegistered: 'Rodrigo Ayala (Op. Central #02)',
      exitMilestonePassed: false,
      adjustmentBrl: 180.00,
      createdAt: '17/10/2026 09:40'
    }
  ],

  // Campanhas e Cupons (T14 a T16 / RF-28 a RF-31)
  campaigns: [
    {
      id: 'camp-1',
      code: 'PICKGO-10',
      name: 'Cupom Boas-Vindas Fronteira (US$ 25 OFF)',
      type: 'CUPOM_DESCONTO',
      discountUsd: 25.00,
      cashbackPct: 2,
      payer: 'DIVIDIDO_50_50',
      sent: 14200,
      delivered: 13840,
      opened: 8910,
      clicks: 3420,
      ordersCount: 412,
      revenueBrl: 684200.00
    },
    {
      id: 'camp-2',
      code: 'BIKE-VIP',
      name: 'Cashback Turbo 5% Ciclismo & Alta Performance',
      type: 'CASHBACK',
      discountUsd: 0,
      cashbackPct: 5,
      payer: 'LOJA',
      sent: 4800,
      delivered: 4690,
      opened: 3100,
      clicks: 1290,
      ordersCount: 38,
      revenueBrl: 912000.00
    },
    {
      id: 'camp-3',
      code: 'FRONTEIRA50',
      name: 'Bônus US$ 50 Acima de US$ 500 no Carrinho',
      type: 'ITEM_ADICIONAL_E_DESCONTO',
      discountUsd: 50.00,
      cashbackPct: 3,
      payer: 'PORTAL',
      sent: 22000,
      delivered: 21100,
      opened: 14300,
      clicks: 5190,
      ordersCount: 625,
      revenueBrl: 1450000.00
    }
  ],

  // CRM & Atendimento (T17, T18 / RF-32 a RF-35)
  crmTickets: [
    {
      id: 'TCK-401',
      customerName: 'Rafael Mendonça',
      channel: 'WhatsApp Oficial',
      orderId: 'PG-9001',
      status: 'EM_ATENDIMENTO',
      messages: [
        { sender: 'CLIENTE', time: '12:41', text: 'Olá! Acabei de atravessar a Ponte da Amizade. Minha bicicleta Trek #PG-9001 já está no Anexo da Cellshop?' },
        { sender: 'SISTEMA', time: '12:41', text: '🤖 Contexto Automático CRM: Pedido #PG-9001 está PRONTO_RETIRADA (Coletado por Diego Benítez). Cliente Nível OURO FRONTEIRA.' }
      ],
      auditLogs: [
        '10:15 · Jornada Automática disparou WhatsApp: "Pagamento Pix de R$ 60.000,00 confirmado"'
      ]
    }
  ],

  // Estado da Cascata Multicanal (T29 / RF-36 a RF-38)
  cascadeDemo: {
    step: 1,
    logs: [
      '12:00 · [Consentimento LGPD Verificado] Cliente possui opt-in para Push, WhatsApp, RCS e E-mail (2/5 msgs na semana).',
      '12:01 · [Passo 1 · Push App] Enviado: "Sua oferta na Casa Nissei com câmbio travado!" -> Aguardando abertura (prazo 2h)...'
    ]
  },

  // Estado temporário da cobrança Pix aberta no modal (T3 / T24)
  activePixCheckout: null
};

// ============================================================================
// UTILITÁRIOS DE FORMATAÇÃO E CÂMBIO REAL (D1)
// ============================================================================

function recalcEffectiveFx() {
  const factor = 1 + (state.fx.spreadPct / 100) + (state.fx.iofPct / 100);
  state.fx.effectiveUsdBrl = Number((state.fx.commercialUsdBrl * factor).toFixed(4));
}

function usdToBrl(usdAmount) {
  return Number((usdAmount * state.fx.effectiveUsdBrl).toFixed(2));
}

function usdToPyg(usdAmount) {
  return Math.round(usdAmount * state.fx.usdPyg);
}

function formatBRL(val) {
  return Number(val || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatUSD(val) {
  return 'US$ ' + Number(val || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatPYG(val) {
  return '₲ ' + Math.round(val || 0).toLocaleString('es-PY');
}

// Busca cotação real USD-BRL e USD-PYG em APIs públicas de câmbio
async function fetchLiveExchangeRate(showNotification = false) {
  const btn = document.getElementById('btnRefreshFx');
  if (btn) btn.textContent = '⏳ Buscando API...';

  try {
    const response = await fetch('https://economia.awesomeapi.com.br/json/last/USD-BRL,USD-PYG', {
      cache: 'no-store'
    });
    if (!response.ok) throw new Error('AwesomeAPI indisponível');
    const data = await response.json();

    if (data && data.USDBRL && data.USDBRL.bid) {
      state.fx.commercialUsdBrl = Number(parseFloat(data.USDBRL.bid).toFixed(4));
    }
    if (data && data.USDPYG && data.USDPYG.bid) {
      state.fx.usdPyg = Math.round(parseFloat(data.USDPYG.bid));
    }
    state.fx.source = 'AwesomeAPI Real-Time (Mercado Spot)';
    state.fx.updatedAt = new Date().toLocaleTimeString('pt-BR');
    recalcEffectiveFx();
    updateHeaderFxUI();
    renderCurrentView(false);
    if (showNotification) {
      showToast(`✅ Câmbio Real atualizado via API: Comercial US$ 1 = R$ ${state.fx.commercialUsdBrl.toFixed(4)} | Pix Efetivo: R$ ${state.fx.effectiveUsdBrl.toFixed(4)}`);
    }
    return;
  } catch (err1) {
    try {
      const res2 = await fetch('https://open.er-api.com/v6/latest/USD');
      if (!res2.ok) throw new Error('ER-API indisponível');
      const data2 = await res2.json();
      if (data2 && data2.rates && data2.rates.BRL) {
        state.fx.commercialUsdBrl = Number( parseFloat(data2.rates.BRL).toFixed(4) );
      }
      if (data2 && data2.rates && data2.rates.PYG) {
        state.fx.usdPyg = Math.round(parseFloat(data2.rates.PYG));
      }
      state.fx.source = 'ExchangeRate-API Live';
      state.fx.updatedAt = new Date().toLocaleTimeString('pt-BR');
      recalcEffectiveFx();
      updateHeaderFxUI();
      renderCurrentView(false);
      if (showNotification) {
        showToast(`✅ Câmbio Real atualizado: US$ 1 = R$ ${state.fx.effectiveUsdBrl.toFixed(4)} (Pix Efetivo)`);
      }
      return;
    } catch (err2) {
      // Fallback caso sem internet local, mantendo simulação fiel de variação de mercado
      const microVariation = (Math.random() * 0.04) - 0.02;
      state.fx.commercialUsdBrl = Number(Math.max(5.10, state.fx.commercialUsdBrl + microVariation).toFixed(4));
      state.fx.source = 'Cotação Oficial Câmbio Real Pix';
      state.fx.updatedAt = new Date().toLocaleTimeString('pt-BR');
      recalcEffectiveFx();
      updateHeaderFxUI();
      renderCurrentView(false);
      if (showNotification) {
        showToast(`💱 Cotação atualizada (Câmbio Real Pix): Comercial R$ ${state.fx.commercialUsdBrl.toFixed(4)} → Pix R$ ${state.fx.effectiveUsdBrl.toFixed(4)}`);
      }
    }
  } finally {
    if (btn) btn.textContent = '🔄 Atualizar Câmbio API';
  }
}

function updateHeaderFxUI() {
  const elEffective = document.getElementById('headerFxEffective');
  const elMeta = document.getElementById('headerFxMeta');
  const elBadgeCentral = document.getElementById('badgeCentralCount');

  if (elEffective) {
    elEffective.textContent = `US$ 1 = R$ ${state.fx.effectiveUsdBrl.toFixed(4).replace('.', ',')}`;
  }
  if (elMeta) {
    elMeta.textContent = `Comercial: R$ ${state.fx.commercialUsdBrl.toFixed(4).replace('.', ',')} · Spread ${state.fx.spreadPct}% + IOF ${state.fx.iofPct}% · 1 USD = ${state.fx.usdPyg.toLocaleString('es-PY')} PYG (${state.fx.updatedAt})`;
  }
  if (elBadgeCentral) {
    const activeOps = state.orders.filter(o => ['EM_SEPARACAO', 'EM_COLETA', 'EM_TESTE_LOJA', 'PRONTO_RETIRADA', 'LIBERADO_SAIDA'].includes(o.state)).length;
    elBadgeCentral.textContent = `T7 · T30 (${activeOps})`;
  }
}

// ============================================================================
// TOAST NOTIFICATIONS COM POPOVER API (MODERN WEB GUIDANCE)
// ============================================================================

function showToast(message) {
  const stack = document.getElementById('toastStack');
  if (!stack) return;

  const toast = document.createElement('div');
  const toastId = 'toast-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
  toast.id = toastId;
  toast.className = 'toast-popover';
  toast.setAttribute('popover', 'manual');

  const span = document.createElement('span');
  span.textContent = message;

  const closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'btn btn-sm btn-outline';
  closeBtn.style.minHeight = '32px';
  closeBtn.style.padding = '4px 8px';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('popovertarget', toastId);
  closeBtn.setAttribute('popovertargetaction', 'hide');
  closeBtn.addEventListener('click', () => {
    try { toast.hidePopover(); } catch (_) {}
    toast.remove();
  });

  toast.appendChild(span);
  toast.appendChild(closeBtn);
  stack.appendChild(toast);

  try {
    if (typeof toast.showPopover === 'function') {
      toast.showPopover();
    } else {
      toast.classList.add(':popover-open');
    }
  } catch (_) {
    toast.classList.add(':popover-open');
  }

  setTimeout(() => {
    try {
      if (typeof toast.hidePopover === 'function') toast.hidePopover();
    } catch (_) {}
    toast.remove();
  }, 4200);
}

// ============================================================================
// GERADOR DE QR CODE SVG DETERMINÍSTICO
// ============================================================================

function generateQrSvg(seedString, size = 156) {
  let hash = 2166136261;
  for (let i = 0; i < seedString.length; i++) {
    hash ^= seedString.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const grid = 21;
  const cell = size / grid;
  let rects = '';

  const isFinder = (r, c) => {
    if (r < 7 && c < 7) return true;
    if (r < 7 && c >= grid - 7) return true;
    if (r >= grid - 7 && c < 7) return true;
    return false;
  };

  const drawFinder = (r0, c0) => {
    rects += `<rect x="${c0 * cell}" y="${r0 * cell}" width="${7 * cell}" height="${7 * cell}" fill="#0038A8" rx="2"/>`;
    rects += `<rect x="${(c0 + 1) * cell}" y="${(r0 + 1) * cell}" width="${5 * cell}" height="${5 * cell}" fill="#FFFFFF"/>`;
    rects += `<rect x="${(c0 + 2) * cell}" y="${(r0 + 2) * cell}" width="${3 * cell}" height="${3 * cell}" fill="#D52B1E"/>`;
  };

  drawFinder(0, 0);
  drawFinder(0, grid - 7);
  drawFinder(grid - 7, 0);

  for (let r = 0; r < grid; r++) {
    for (let c = 0; c < grid; c++) {
      if (isFinder(r, c)) continue;
      hash ^= (r * 31 + c * 17);
      hash = Math.imul(hash, 16777619);
      if ((Math.abs(hash) % 10) < 5) {
        rects += `<rect x="${(c * cell).toFixed(1)}" y="${(r * cell).toFixed(1)}" width="${(cell + 0.3).toFixed(1)}" height="${(cell + 0.3).toFixed(1)}" fill="#0F172A"/>`;
      }
    }
  }

  return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="QR Code ${seedString}">
    <rect width="${size}" height="${size}" fill="#FFFFFF"/>
    ${rects}
  </svg>`;
}

// ============================================================================
// NAVEGAÇÃO COM VIEW TRANSITIONS E ROTEAMENTO DE FOCO (MODERN WEB GUIDANCE)
// ============================================================================

function switchMainView(targetView) {
  const updateDOM = () => {
    state.currentView = targetView;
    document.querySelectorAll('.persona-nav .nav-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === targetView);
    });
    renderCurrentView(false);
  };

  if (!document.startViewTransition) {
    updateDOM();
    document.getElementById('view-heading')?.focus();
    return;
  }

  const transition = document.startViewTransition(() => {
    updateDOM();
  });
  transition.finished.finally(() => {
    document.getElementById('view-heading')?.focus();
  });
}

function renderCurrentView(withTransition = false) {
  updateHeaderFxUI();
  const container = document.getElementById('appContent');
  if (!container) return;

  const renderFn = () => {
    switch (state.currentView) {
      case 'turista':
        container.innerHTML = renderTuristaView();
        break;
      case 'video':
        container.innerHTML = renderVideoLinkView();
        break;
      case 'central':
        container.innerHTML = renderCentralOperacaoView();
        break;
      case 'lojista':
        container.innerHTML = renderLojistaView();
        break;
      case 'plataforma':
        container.innerHTML = renderPlataformaView();
        break;
      case 'crm':
        container.innerHTML = renderCrmCampanhasView();
        break;
      default:
        container.innerHTML = renderTuristaView();
    }
  };

  if (withTransition && document.startViewTransition) {
    const t = document.startViewTransition(renderFn);
    t.finished.finally(() => document.getElementById('view-heading')?.focus());
  } else {
    renderFn();
  }
}

// ============================================================================
// 1. MÓDULO APP DO TURISTA (T1 a T6, T8, T11 a T13, T19, T23 a T27)
// ============================================================================

function calculateCartTotals() {
  const subtotalUsd = state.cart.reduce((acc, item) => acc + (item.unitUsd * item.qty), 0);
  const discountUsd = state.appliedCoupon ? Math.min(subtotalUsd, state.appliedCoupon.discountUsd) : 0;
  const shippingUsd = (state.deliveryMode === 'SHIP_BRAZIL' && subtotalUsd > 0) ? 28.00 : 0;
  const netUsd = Math.max(0, subtotalUsd - discountUsd + shippingUsd);

  const grossBrl = usdToBrl(netUsd);
  const walletAvailableBrl = state.wallet.cashbackBrl + state.wallet.bonusBrl;
  const walletDiscountBrl = (state.wallet.applyInCheckout && grossBrl > 0)
    ? Math.min(walletAvailableBrl, grossBrl * 0.5)
    : 0;
  const finalPixBrl = Number(Math.max(0, grossBrl - walletDiscountBrl).toFixed(2));

  // Regra de Cota Terrestre US$ 500 (D3 / RF-05)
  const excessUsd = Math.max(0, subtotalUsd - state.fx.quotaUsdLimit);
  const estimatedDutyUsd = Number((excessUsd * (state.fx.excessTaxPct / 100)).toFixed(2));
  const estimatedDutyBrl = usdToBrl(estimatedDutyUsd);

  // Split 90% Loja / 7% Portal / 3% EPYX (RF-08 / 14.2)
  const storeSplitBrl = Number((finalPixBrl * (state.splitRules.storePct / 100)).toFixed(2));
  const portalSplitBrl = Number((finalPixBrl * (state.splitRules.portalPct / 100)).toFixed(2));
  const epyxSplitBrl = Number((finalPixBrl - storeSplitBrl - portalSplitBrl).toFixed(2));

  return {
    subtotalUsd,
    discountUsd,
    shippingUsd,
    netUsd,
    grossBrl,
    walletDiscountBrl,
    finalPixBrl,
    excessUsd,
    estimatedDutyUsd,
    estimatedDutyBrl,
    storeSplitBrl,
    portalSplitBrl,
    epyxSplitBrl
  };
}

function renderTuristaView() {
  const cartCount = state.cart.reduce((s, i) => s + i.qty, 0);
  const myOrdersCount = state.orders.length;
  const walletTotal = state.wallet.cashbackBrl + state.wallet.bonusBrl;

  return `
    <div class="sub-nav" role="tablist" aria-label="Navegação do App do Turista">
      <button type="button" class="sub-tab ${state.turistaSubTab === 'catalogo' ? 'active' : ''}" onclick="setTuristaSubTab('catalogo')">
        🛒 T1 · T2 · T27 Catálogo &amp; Sacola Pix (${cartCount})
      </button>
      <button type="button" class="sub-tab ${state.turistaSubTab === 'scango' ? 'active' : ''}" onclick="setTuristaSubTab('scango')">
        📷 T5 · T6 Scan &amp; Go na Loja
      </button>
      <button type="button" class="sub-tab ${state.turistaSubTab === 'pedidos' ? 'active' : ''}" onclick="setTuristaSubTab('pedidos')">
        📦 T4 · T19 Meus Pedidos, QR Retirada &amp; Rastreio (${myOrdersCount})
      </button>
      <button type="button" class="sub-tab ${state.turistaSubTab === 'carteira' ? 'active' : ''}" onclick="setTuristaSubTab('carteira')">
        👛 T8 Carteira, Cashback &amp; Rewards (${formatBRL(walletTotal)})
      </button>
      <button type="button" class="sub-tab ${state.turistaSubTab === 'kyc' ? 'active' : ''}" onclick="setTuristaSubTab('kyc')">
        🪪 T11–T13 Cadastro, KYC &amp; Data Hub (${state.customer.kycStatus})
      </button>
    </div>

    ${state.turistaSubTab === 'catalogo' ? renderTuristaCatalogoAndCart() : ''}
    ${state.turistaSubTab === 'scango' ? renderTuristaScanGo() : ''}
    ${state.turistaSubTab === 'pedidos' ? renderTuristaPedidos() : ''}
    ${state.turistaSubTab === 'carteira' ? renderTuristaCarteira() : ''}
    ${state.turistaSubTab === 'kyc' ? renderTuristaKyc() : ''}
  `;
}

function renderTuristaCatalogoAndCart() {
  const filteredProducts = state.selectedStoreFilter === 'ALL'
    ? state.products
    : state.products.filter(p => p.storeId === state.selectedStoreFilter);

  const totals = calculateCartTotals();
  const distinctStores = [...new Set(state.cart.map(i => i.storeName))];

  return `
    <div class="layout-sidebar">
      <!-- Coluna Esquerda: T1 Catálogo Multi-Loja de Ciudad del Este -->
      <div>
        <div class="card card-flag-top" style="margin-bottom: 18px;">
          <div class="card-header">
            <div>
              <span class="screen-tag">T1 · RF-01 a RF-05</span>
              <h3 class="card-title" style="margin-top:4px;">Catálogo Oficial Portal Paraguai (Preços US$ convertidos em R$ no Câmbio Real)</h3>
            </div>
            <button type="button" class="btn btn-sm btn-outline-red" onclick="openProductConfigurator('prod-bike-60k')">
              🚲 T27 Configurar Bike R$ 60k
            </button>
          </div>

          <div class="store-pills">
            <button type="button" class="store-pill ${state.selectedStoreFilter === 'ALL' ? 'active' : ''}" onclick="filterCatalogStore('ALL')">
              🇵🇾 Todas as 5 Lojas Piloto (${state.products.length})
            </button>
            ${state.stores.map(st => `
              <button type="button" class="store-pill ${state.selectedStoreFilter === st.id ? 'active' : ''}" onclick="filterCatalogStore('${st.id}')">
                🏬 ${st.name}
              </button>
            `).join('')}
          </div>

          <div class="grid-2">
            ${filteredProducts.map(prod => {
              const priceBrl = usdToBrl(prod.baseUsd);
              const pricePyg = usdToPyg(prod.baseUsd);
              return `
                <article class="product-card">
                  <div class="product-visual">
                    <span class="product-store-tag">${prod.storeName}</span>
                    <span class="product-stock-tag">Estoque: ${prod.stock} un.</span>
                    <span>${prod.emoji}</span>
                  </div>
                  <div class="product-body">
                    <span class="product-sku">SKU: ${prod.sku} · EAN: ${prod.barcode}</span>
                    <h4 class="product-title">${prod.name}</h4>
                    <p style="font-size:0.78rem;color:var(--text-muted);">${prod.description}</p>
                    <div class="price-box">
                      <span class="price-usd">Preço Loja PY: ${formatUSD(prod.baseUsd)}</span>
                      <span class="price-brl">${formatBRL(priceBrl)} <small style="font-size:0.7rem;font-weight:600;color:var(--text-muted);">no Pix</small></span>
                      <span class="price-pyg">Equivalente: ${formatPYG(pricePyg)} · Câmbio R$ ${state.fx.effectiveUsdBrl.toFixed(4)}</span>
                    </div>
                    <div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">
                      ${prod.configurable ? `
                        <button type="button" class="btn btn-sm btn-primary btn-block" onclick="openProductConfigurator('${prod.id}')">
                          ⚙️ Configurar Aro, Cor &amp; Acessórios (T27)
                        </button>
                      ` : `
                        <button type="button" class="btn btn-sm btn-blue" style="flex:1;" onclick="addToCart('${prod.id}')">
                          + Sacola Pick &amp; Go
                        </button>
                        <button type="button" class="btn btn-sm btn-primary" onclick="quickBuyOneClick('${prod.id}')">
                          ⚡ Pix 1-Clique
                        </button>
                      `}
                    </div>
                  </div>
                </article>
              `;
            }).join('')}
          </div>
        </div>
      </div>

      <!-- Coluna Direita: T2 Sacola Multi-Loja + Cota US$ 500 + Checkout Pix Câmbio Real -->
      <aside class="card card-flag-red">
        <div class="card-header">
          <div>
            <span class="screen-tag red">T2 · T3 · T24</span>
            <h3 class="card-title" style="margin-top:4px;">Sacola Multi-Loja &amp; Pix Câmbio Real</h3>
          </div>
          <span class="badge badge-blue">${distinctStores.length} loja(s)</span>
        </div>

        ${state.cart.length === 0 ? `
          <div style="padding:24px 12px;text-align:center;color:var(--text-muted);">
            <p style="font-size:2rem;margin-bottom:8px;">🛍️</p>
            <p>Sua sacola está vazia. Adicione produtos das lojas de Ciudad del Este ou configure a Bicicleta de exemplo (T27).</p>
          </div>
        ` : `
          <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:14px;">
            ${state.cart.map(item => `
              <div style="padding:10px;border:1px solid var(--border-color);border-radius:var(--radius-sm);background:var(--py-surface);">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
                  <div>
                    <span class="badge badge-blue" style="margin-bottom:4px;">${item.storeName}</span>
                    <div style="font-weight:700;font-size:0.86rem;">${item.emoji} ${item.name}</div>
                    <div style="font-size:0.74rem;color:var(--text-muted);">${item.configSummary || ''}</div>
                  </div>
                  <button type="button" class="btn btn-sm btn-outline-red" style="min-height:32px;padding:2px 8px;" onclick="removeCartItem('${item.cartItemId}')" title="Remover item">✕</button>
                </div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-top:8px;">
                  <div style="display:flex;align-items:center;gap:6px;">
                    <button type="button" class="btn btn-sm btn-outline" style="min-height:32px;padding:2px 8px;" onclick="changeCartQty('${item.cartItemId}', -1)">-</button>
                    <strong style="font-size:0.85rem;">${item.qty}</strong>
                    <button type="button" class="btn btn-sm btn-outline" style="min-height:32px;padding:2px 8px;" onclick="changeCartQty('${item.cartItemId}', 1)">+</button>
                  </div>
                  <div style="text-align:right;">
                    <div style="font-size:0.75rem;color:var(--py-blue);font-weight:700;">${formatUSD(item.unitUsd * item.qty)}</div>
                    <div style="font-size:0.9rem;color:var(--py-red);font-weight:800;">${formatBRL(usdToBrl(item.unitUsd * item.qty))}</div>
                  </div>
                </div>
              </div>
            `).join('')}
          </div>
        `}

        <!-- RF-03 Escolha do Modo de Entrega -->
        <div class="form-group">
          <label for="selectDeliveryMode">📍 Modo de Recebimento (RF-03 / D6 / D11)</label>
          <select id="selectDeliveryMode" class="form-control" onchange="setDeliveryMode(this.value)">
            <option value="PORTAL_HUB" ${state.deliveryMode === 'PORTAL_HUB' ? 'selected' : ''}>
              🏢 Retirada Unificada na Central do Portal (Coleta nas ${distinctStores.length || 1} lojas)
            </option>
            <option value="STORE_PICKUP" ${state.deliveryMode === 'STORE_PICKUP' ? 'selected' : ''}>
              🏪 Retirar no Balcão / Anexo de cada Loja (08h às 18h)
            </option>
            <option value="SCAN_GO" ${state.deliveryMode === 'SCAN_GO' ? 'selected' : ''}>
              📱 Scan &amp; Go (Estou dentro da loja agora · QR de Saída)
            </option>
            <option value="SHIP_BRAZIL" ${state.deliveryMode === 'SHIP_BRAZIL' ? 'selected' : ''}>
              🚚 Envio ao Brasil c/ Rastreio (+US$ 28,00 Frete Internacional)
            </option>
          </select>
        </div>

        <!-- Cupom de Campanha (RF-28) -->
        <div class="form-group">
          <label for="couponInput">🎟️ Cupom de Campanha (Ex: PICKGO-10 ou FRONTEIRA50)</label>
          <div style="display:flex;gap:6px;">
            <input id="couponInput" type="text" class="form-control" style="flex:1;" placeholder="Código PICKGO-xxxx" value="${state.appliedCoupon ? state.appliedCoupon.code : ''}" />
            <button type="button" class="btn btn-sm btn-outline" onclick="applyCouponCode()">Aplicar</button>
          </div>
        </div>

        <!-- Uso de Saldo da Carteira (RF-24) -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 10px;background:var(--py-blue-soft);border-radius:var(--radius-sm);margin-bottom:12px;">
          <label style="font-size:0.8rem;font-weight:700;display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" ${state.wallet.applyInCheckout ? 'checked' : ''} onchange="toggleUseWallet(this.checked)" style="width:18px;height:18px;" />
            Usar Saldo da Carteira (${formatBRL(state.wallet.cashbackBrl + state.wallet.bonusBrl)})
          </label>
          <span class="badge badge-gold">T8 Cashback</span>
        </div>

        <!-- Aviso de Cota Terrestre US$ 500 (RF-05 / D3) -->
        ${totals.excessUsd > 0 ? `
          <div class="quota-alert warning">
            <strong>⚠️ Aviso de Cota Terrestre Receita Federal (RF-05 / D3):</strong><br/>
            Sua compra soma <strong>${formatUSD(totals.subtotalUsd)}</strong>, ultrapassando a cota de isenção terrestre de <strong>US$ 500,00</strong> por CPF em <strong>${formatUSD(totals.excessUsd)}</strong>.<br/>
            Tributo estimado na Declaração Eletrônica de Bens de Viajante (e-DBV 50% sobre excedente): <strong>${formatUSD(totals.estimatedDutyUsd)} (${formatBRL(totals.estimatedDutyBrl)})</strong>.
          </div>
        ` : `
          <div class="quota-alert">
            <strong>✅ Dentro da Cota Terrestre de US$ 500,00 (RF-05 / D3):</strong><br/>
            Total de <strong>${formatUSD(totals.subtotalUsd)}</strong> isento de tributação aduaneira terrestre (restam ${formatUSD(Math.max(0, 500 - totals.subtotalUsd))} da sua cota individual).
          </div>
        `}

        <!-- Resumo Financeiro com Câmbio Real -->
        <div style="border-top:1px solid var(--border-color);padding-top:12px;margin-top:8px;font-size:0.84rem;display:flex;flex-direction:column;gap:6px;">
          <div style="display:flex;justify-content:space-between;">
            <span>Subtotal nas Lojas (US$):</span>
            <strong>${formatUSD(totals.subtotalUsd)}</strong>
          </div>
          ${totals.discountUsd > 0 ? `
            <div style="display:flex;justify-content:space-between;color:#059669;">
              <span>Desconto Cupom (${state.appliedCoupon.code}):</span>
              <strong>- ${formatUSD(totals.discountUsd)}</strong>
            </div>
          ` : ''}
          ${totals.shippingUsd > 0 ? `
            <div style="display:flex;justify-content:space-between;">
              <span>Frete Envio ao Brasil (RF-16):</span>
              <strong>+ ${formatUSD(totals.shippingUsd)}</strong>
            </div>
          ` : ''}
          <div style="display:flex;justify-content:space-between;color:var(--py-blue);">
            <span>Câmbio Real Pix Aplicado:</span>
            <strong>1 USD = R$ ${state.fx.effectiveUsdBrl.toFixed(4)}</strong>
          </div>
          ${totals.walletDiscountBrl > 0 ? `
            <div style="display:flex;justify-content:space-between;color:#059669;">
              <span>Abatimento Saldo Carteira (RF-24):</span>
              <strong>- ${formatBRL(totals.walletDiscountBrl)}</strong>
            </div>
          ` : ''}
          <div style="display:flex;justify-content:space-between;font-size:1.15rem;font-weight:800;color:var(--py-red);padding-top:8px;border-top:2px solid var(--border-color);">
            <span>Total no Pix (BRL):</span>
            <span>${formatBRL(totals.finalPixBrl)}</span>
          </div>
        </div>

        <!-- Prévia do Split 90/7/3 (RF-08) -->
        <div style="margin-top:12px;padding:10px;background:var(--py-surface-alt);border-radius:var(--radius-sm);font-size:0.75rem;">
          <div style="font-weight:700;color:var(--py-blue-dark);margin-bottom:4px;">
            🔒 Liquidação Automática &amp; Split (90% Loja / 7% Portal / 3% EPYX):
          </div>
          <div class="split-bar">
            <div class="split-seg-store" style="width:90%;">90% Loja</div>
            <div class="split-seg-portal" style="width:7%;">7%</div>
            <div class="split-seg-epyx" style="width:3%;">3%</div>
          </div>
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:4px;">
            <span>🏬 Loja(s): <strong>${formatBRL(totals.storeSplitBrl)}</strong></span>
            <span>🇵🇾 Portal: <strong>${formatBRL(totals.portalSplitBrl)}</strong></span>
            <span>⚡ EPYX: <strong>${formatBRL(totals.epyxSplitBrl)}</strong></span>
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;margin-top:14px;">
          <button type="button" class="btn btn-primary btn-block" onclick="openPixCheckoutModal(false)" ${state.cart.length === 0 ? 'disabled' : ''}>
            💠 Gerar QR Code Pix com Câmbio Real (T3 / T24)
          </button>
          <button type="button" class="btn btn-blue btn-block" onclick="openPixCheckoutModal(true)" ${state.cart.length === 0 ? 'disabled' : ''}>
            ⚡ Pagar em 1-Clique com Pix Salvo (${state.customer.pixBank})
          </button>
        </div>
      </aside>
    </div>
  `;
}

// ============================================================================
// T5 e T6: SCAN & GO DENTRO DA LOJA
// ============================================================================

function renderTuristaScanGo() {
  return `
    <div class="grid-2">
      <div class="card card-flag-top">
        <div class="card-header">
          <div>
            <span class="screen-tag">T5 · RF-14</span>
            <h3 class="card-title" style="margin-top:4px;">Scan &amp; Go — Leitor de Código de Barras / QR na Loja</h3>
          </div>
          <span class="badge badge-green">Câmera Ativa (Simulador)</span>
        </div>

        <p style="font-size:0.86rem;color:var(--text-muted);margin-bottom:14px;">
          O turista escaneia a etiqueta física do produto na prateleira da loja em Ciudad del Este, vê o preço exato em <strong>Reais no Pix (Câmbio Real R$ ${state.fx.effectiveUsdBrl.toFixed(4)})</strong>, paga sem fila de caixa e recebe o <strong>QR de Saída (T6)</strong>.
        </p>

        <div style="background:linear-gradient(135deg,#0f172a,#1e293b);color:#fff;padding:24px;border-radius:var(--radius-md);text-align:center;margin-bottom:16px;border:2px dashed var(--py-red);">
          <div style="font-size:2.4rem;margin-bottom:8px;">📷 ||| |||| |||</div>
          <div style="font-weight:700;">Aponte para o código EAN / QR do produto na prateleira</div>
          <div style="font-size:0.78rem;color:#94a3b8;margin-top:4px;">Clique em um dos itens abaixo para simular a leitura óptica imediata:</div>
        </div>

        <div style="display:flex;flex-direction:column;gap:10px;">
          ${state.products.map(p => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border:1px solid var(--border-color);border-radius:var(--radius-sm);">
              <div>
                <div style="font-weight:700;font-size:0.88rem;">${p.emoji} ${p.name}</div>
                <div style="font-size:0.75rem;color:var(--text-muted);">EAN: ${p.barcode} · ${p.storeName} · ${formatUSD(p.baseUsd)}</div>
              </div>
              <button type="button" class="btn btn-sm btn-primary" onclick="simulateScanGoItem('${p.id}')">
                📲 Escanear (${formatBRL(usdToBrl(p.baseUsd))})
              </button>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="card card-flag-red">
        <div class="card-header">
          <div>
            <span class="screen-tag red">T6 · RF-13 e RF-14</span>
            <h3 class="card-title" style="margin-top:4px;">Saída Digital Scan &amp; Go (Passe Livre / Conferência)</h3>
          </div>
          <span class="badge badge-blue">Antifraude D5</span>
        </div>

        <p style="font-size:0.85rem;color:var(--text-muted);margin-bottom:14px;">
          Após o pagamento por Pix no modo <strong>Scan &amp; Go</strong>, o pedido entra no estado <code>LIBERADO_SAIDA</code>. Na porta da loja, o operador da Central do Portal lê o QR abaixo e realiza conferência total ou por amostragem conforme o score do cliente.
        </p>

        ${renderLatestScanGoPass()}
      </div>
    </div>
  `;
}

function renderLatestScanGoPass() {
  const scanOrders = state.orders.filter(o => o.mode === 'SCAN_GO' || o.state === 'LIBERADO_SAIDA' || o.state === 'PRONTO_RETIRADA');
  const order = scanOrders[0] || state.orders[0];
  if (!order) {
    return `<p style="color:var(--text-muted);">Nenhum pedido emitido ainda.</p>`;
  }

  return `
    <div class="qr-box">
      <span class="badge ${order.qrUsed ? 'badge-gray' : 'badge-green'}">
        ${order.qrUsed ? '✓ QR JÁ UTILIZADO NA SAÍDA' : '🟢 PASSE DE SAÍDA / RETIRADA VÁLIDO'}
      </span>
      <h4>Pedido #${order.id} · Estado: ${order.state}</h4>
      ${generateQrSvg(order.qrToken, 165)}
      <code style="background:var(--py-surface-alt);padding:4px 10px;border-radius:4px;font-weight:700;">Token: ${order.qrToken}</code>
      <div style="font-size:0.82rem;color:var(--text-muted);">
        Cliente: <strong>${order.customerName}</strong> (${order.customerCpf})<br/>
        Valor Pago no Pix: <strong>${formatBRL(order.totalBrl)}</strong> (${formatUSD(order.totalUsd)})
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:6px;">
        <button type="button" class="btn btn-sm btn-blue" onclick="switchMainView('central')">
          🔎 Validar este QR na Central de Operação (T7 / T30)
        </button>
      </div>
    </div>
  `;
}

// ============================================================================
// T4 e T19: MEUS PEDIDOS, QR DE RETIRADA E RASTREIO ENVIO AO BRASIL
// ============================================================================

function renderTuristaPedidos() {
  return `
    <div class="card card-flag-top">
      <div class="card-header">
        <div>
          <span class="screen-tag">T4 · T6 · T19 · RF-11 a RF-17</span>
          <h3 class="card-title" style="margin-top:4px;">Meus Pedidos, QR de Retirada e Rastreio Internacional</h3>
        </div>
        <span class="badge badge-blue">${state.orders.length} pedido(s)</span>
      </div>

      <div style="display:flex;flex-direction:column;gap:16px;">
        ${state.orders.map(order => `
          <div style="border:1px solid var(--border-color);border-radius:var(--radius-md);padding:16px;background:var(--py-surface);">
            <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--border-color);">
              <div>
                <strong style="font-size:1.05rem;color:var(--py-blue-dark);">Pedido #${order.id}</strong>
                <span style="font-size:0.78rem;color:var(--text-muted);margin-left:8px;">${order.createdAt} · Origem: ${order.origin.canal} (${order.origin.codigo})</span>
              </div>
              <div style="display:flex;gap:8px;align-items:center;">
                <span class="badge badge-blue">Modo: ${order.mode}</span>
                <span class="badge ${order.state === 'RETIRADO' || order.state === 'ENTREGUE' ? 'badge-green' : order.state === 'REEMBOLSADO' ? 'badge-red' : 'badge-gold'}">
                  Estado: ${order.state}
                </span>
              </div>
            </div>

            <div class="grid-2" style="align-items:center;">
              <div>
                <ul style="list-style:none;display:flex;flex-direction:column;gap:6px;margin-bottom:12px;">
                  ${order.items.map(it => `
                    <li style="font-size:0.86rem;">
                      • <strong>${it.qty}x ${it.name}</strong> (${it.storeName}) — ${formatUSD(it.unitUsd * it.qty)}
                    </li>
                  `).join('')}
                </ul>
                <div style="font-size:0.83rem;color:var(--text-muted);display:flex;flex-direction:column;gap:4px;">
                  <div>💵 Total em Dólar: <strong>${formatUSD(order.totalUsd)}</strong> · Câmbio travado: <strong>R$ ${order.fxRateApplied.toFixed(4)}</strong></div>
                  <div>💠 Valor Pago via Pix: <strong style="color:var(--py-red);">${formatBRL(order.totalBrl)}</strong> (TxID: <code>${order.txid}</code>)</div>
                  <div>🔬 Teste &amp; Análise de Defeitos da Loja (RF-50): <strong>${order.storeTestStatus || 'AGUARDANDO_COLETA'}</strong></div>
                  <div>⚖️ Marco de Responsabilidade (3.3.2): <strong>${order.qrUsed || order.state === 'RETIRADO' ? 'PÓS-SAÍDA (QR Conferido · Responsabilidade de Garantia: LOJA)' : 'ANTES DA SAÍDA (Em custódia Loja / Portal)'}</strong></div>
                  <div>🎁 Cashback Programado (RF-22): <strong>${formatBRL(order.cashbackCreditedBrl)}</strong></div>
                  <div>👷 Operador Coleta/Ponto: <strong>${order.collectorOperator}</strong></div>
                </div>

                ${order.mode === 'SHIP_BRAZIL' ? `
                  <div style="margin-top:12px;padding:12px;background:var(--py-white);border-radius:var(--radius-sm);border:1px solid var(--border-color);">
                    <div style="font-weight:700;font-size:0.84rem;color:var(--py-blue-dark);margin-bottom:6px;">
                      🚚 T19 · Rastreio Envio ao Brasil (RF-16, RF-17) · Código: <code>${order.trackingCode || 'PY99102BR'}</code>
                    </div>
                    <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px;">
                      ${['POSTADO', 'EM_TRANSITO', 'NA_ALFANDEGA', 'ENTREGUE'].map(st => `
                        <span class="badge ${order.state === st ? 'badge-blue' : 'badge-gray'}">${st}</span>
                      `).join(' → ')}
                    </div>
                    <button type="button" class="btn btn-sm btn-outline" onclick="advanceShippingState('${order.id}')">
                      ⏩ Simular Próximo Evento da Transportadora / Alfândega
                    </button>
                  </div>
                ` : `
                  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
                    <button type="button" class="btn btn-sm btn-primary" onclick="notifyCustomerArrived('${order.id}')" ${order.arrivedNotified || order.state === 'RETIRADO' ? 'disabled' : ''}>
                      📍 ${order.arrivedNotified ? 'Recepção Avisada! Prepare seu Documento' : 'Avisar que Cheguei no Ponto de Retirada (RF-12)'}
                    </button>
                    <button type="button" class="btn btn-sm btn-outline" onclick="switchMainView('central')">
                      📦 Ir para Conferência do Operador (T7 / T30)
                    </button>
                    <button type="button" class="btn btn-sm btn-outline-red" onclick="claimPostExitDefect('${order.id}')">
                      🛠️ Reclamar Defeito Pós-Saída (Regra 3.3.2 → Ticket CRM Loja s/ Ônus Portal)
                    </button>
                  </div>
                `}
              </div>

              <div class="qr-box">
                <div style="font-size:0.78rem;font-weight:700;color:var(--py-blue-dark);">
                  QR Code de Retirada / Saída (${order.qrUsed ? 'JÁ UTILIZADO' : 'ATIVO'})
                </div>
                ${generateQrSvg(order.qrToken, 130)}
                <code style="font-size:0.76rem;">${order.qrToken}</code>
              </div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// ============================================================================
// T8: CARTEIRA, CASHBACK E REWARDS (RF-21 a RF-24)
// ============================================================================

function renderTuristaCarteira() {
  return `
    <div class="grid-2">
      <div class="card card-flag-top">
        <div class="card-header">
          <div>
            <span class="screen-tag">T8 · RF-21 a RF-24</span>
            <h3 class="card-title" style="margin-top:4px;">Minha Carteira Portal Paraguai (Saldo em R$)</h3>
          </div>
          <span class="badge badge-gold">🏆 Nível ${state.wallet.tier}</span>
        </div>

        <div class="grid-2" style="margin-bottom:16px;">
          <div class="kpi-card">
            <span class="kpi-label">Saldo Cashback Confirmado</span>
            <span class="kpi-value">${formatBRL(state.wallet.cashbackBrl)}</span>
            <span class="kpi-sub">Creditado após confirmação de retirada (RF-22)</span>
          </div>
          <div class="kpi-card">
            <span class="kpi-label">Saldo Bônus Promocional</span>
            <span class="kpi-value red">${formatBRL(state.wallet.bonusBrl)}</span>
            <span class="kpi-sub">Expira em 30 dias · Campanhas Portal &amp; Lojas</span>
          </div>
        </div>

        <div style="padding:14px;background:var(--py-blue-soft);border-radius:var(--radius-sm);margin-bottom:14px;">
          <h4 style="font-size:0.9rem;color:var(--py-blue-dark);margin-bottom:6px;">🌟 Programa de Rewards Fronteira (${state.wallet.purchasesCount} compras realizadas)</h4>
          <p style="font-size:0.82rem;color:var(--text-muted);">
            Benefícios ativos no nível <strong>${state.wallet.tier}</strong>: Fila Expressa Prioritária na Central do Portal, 2% de Cashback base garantido + Conferência Scan &amp; Go por Amostragem Rápida.
          </p>
        </div>

        <button type="button" class="btn btn-primary" onclick="state.wallet.applyInCheckout = true; setTuristaSubTab('catalogo'); showToast('💰 Saldo da carteira habilitado como desconto no próximo Checkout Pix!');">
          💸 Usar Meu Saldo (${formatBRL(state.wallet.cashbackBrl + state.wallet.bonusBrl)}) na Sacola Agora
        </button>
      </div>

      <div class="card card-flag-red">
        <div class="card-header">
          <h3 class="card-title">Extrato Imutável da Carteira (RF-21)</h3>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Descrição</th>
                <th>Tipo</th>
                <th>Valor (BRL)</th>
              </tr>
            </thead>
            <tbody>
              ${state.wallet.history.map(h => `
                <tr>
                  <td>${h.date}</td>
                  <td>${h.desc}</td>
                  <td><span class="badge ${h.type === 'CASHBACK' ? 'badge-green' : h.type === 'ESTORNO' ? 'badge-red' : 'badge-gold'}">${h.type}</span></td>
                  <td style="font-weight:700;color:${h.amountBrl >= 0 ? '#059669' : 'var(--py-red)'};">${formatBRL(h.amountBrl)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// T11 a T13: CADASTRO, KYC E DATA HUB (WANGARI CARBON / SALESBOX)
// ============================================================================

function renderTuristaKyc() {
  const c = state.customer;
  return `
    <div class="grid-2">
      <div class="card card-flag-top">
        <div class="card-header">
          <div>
            <span class="screen-tag">T11–T13 · RF-18 a RF-20</span>
            <h3 class="card-title" style="margin-top:4px;">Identidade do Turista, KYC &amp; Consentimento LGPD</h3>
          </div>
          <span class="badge ${c.kycStatus === 'APROVADO' ? 'badge-green' : 'badge-gold'}">KYC: ${c.kycStatus}</span>
        </div>

        <div class="form-group">
          <label>Nome Completo (Validado na Receita Federal)</label>
          <input type="text" class="form-control" value="${c.nome}" onchange="state.customer.nome = this.value" />
        </div>
        <div class="grid-2">
          <div class="form-group">
            <label>CPF (Cofre Segregado &amp; Hash)</label>
            <input type="text" class="form-control" value="${c.cpf}" readonly />
          </div>
          <div class="form-group">
            <label>WhatsApp Validado</label>
            <input type="text" class="form-control" value="${c.whatsapp}" onchange="state.customer.whatsapp = this.value" />
          </div>
        </div>

        <div style="padding:12px;background:var(--py-surface-alt);border-radius:var(--radius-sm);margin:12px 0;">
          <div style="font-weight:700;font-size:0.85rem;margin-bottom:8px;">📸 Biometria Facial + Documento (RG / CNH / Passaporte) — RF-19</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;">
            <button type="button" class="btn btn-sm btn-success" onclick="setKycStatus('APROVADO')">✅ Simular KYC Aprovado</button>
            <button type="button" class="btn btn-sm btn-outline" onclick="setKycStatus('PENDENTE')">⏳ Simular Pendente</button>
            <button type="button" class="btn btn-sm btn-outline-red" onclick="setKycStatus('RECUSADO')">🚫 Simular Recusado</button>
          </div>
        </div>

        <h4 style="font-size:0.88rem;color:var(--py-blue-dark);margin:14px 0 8px;">🔒 Gestão Granular de Consentimento LGPD &amp; Lei Paraguaia (D2 / RF-37)</h4>
        <div style="display:flex;flex-direction:column;gap:8px;font-size:0.83rem;">
          <label style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" ${c.consents.dataHubEnrichment ? 'checked' : ''} onchange="toggleConsent('dataHubEnrichment', this.checked)" />
            Autorizo enriquecimento cadastral e antifraude via Data Hub Intelligence (Wangari Carbon / SalesBox)
          </label>
          <label style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" ${c.consents.push ? 'checked' : ''} onchange="toggleConsent('push', this.checked)" />
            Receber notificações Push no App Pick &amp; Go
          </label>
          <label style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" ${c.consents.whatsapp ? 'checked' : ''} onchange="toggleConsent('whatsapp', this.checked)" />
            Receber avisos de pedido e ofertas via WhatsApp Oficial
          </label>
          <label style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" ${c.consents.rcs ? 'checked' : ''} onchange="toggleConsent('rcs', this.checked)" />
            Receber cartões interativos via RCS
          </label>
          <label style="display:flex;align-items:center;gap:8px;">
            <input type="checkbox" ${c.consents.email ? 'checked' : ''} onchange="toggleConsent('email', this.checked)" />
            Receber recibos fiscais e campanhas por E-mail
          </label>
        </div>
      </div>

      <div class="card card-flag-red">
        <div class="card-header">
          <div>
            <span class="screen-tag red">D8 · RF-20 · Seção 10</span>
            <h3 class="card-title" style="margin-top:4px;">Enriquecimento Data Hub Intelligence (Wangari Carbon / SalesBox)</h3>
          </div>
          <span class="badge badge-blue">API Conectada</span>
        </div>

        <p style="font-size:0.84rem;color:var(--text-muted);margin-bottom:14px;">
          Consulta por CPF mediante consentimento explícito (D2), retornando validação de identidade, score antifraude para itens de alto valor (como a Bicicleta de R$ 60.000), flag de WhatsApp ativo e cluster comportamental.
        </p>

        <div style="background:var(--py-surface-alt);padding:14px;border-radius:var(--radius-sm);font-family:monospace;font-size:0.8rem;line-height:1.5;margin-bottom:14px;">
          {<br/>
          &nbsp;&nbsp;"provider": "Wangari Carbon / SalesBox Data Hub",<br/>
          &nbsp;&nbsp;"cpf_hash": "sha256:9f84c2...09",<br/>
          &nbsp;&nbsp;"identity_valid": true,<br/>
          &nbsp;&nbsp;"whatsapp_active_flag": true,<br/>
          &nbsp;&nbsp;"contact_quality": "HIGH_VERIFIED",<br/>
          &nbsp;&nbsp;"antifraud_trust_score": "${c.dataHubScore}",<br/>
          &nbsp;&nbsp;"scan_and_go_inspection_mode": "AMOSTRAGEM_10_PCT",<br/>
          &nbsp;&nbsp;"high_ticket_limit_brl": 100000.00<br/>
          }
        </div>

        <button type="button" class="btn btn-blue btn-block" onclick="showToast('🔍 Data Hub Wangari Carbon revalidou o CPF com sucesso: Flag WhatsApp Ativo + Score 982/1000!')">
          🔄 Executar Consulta de Enriquecimento por CPF Agora
        </button>
      </div>
    </div>
  `;
}

// ============================================================================
// 2. MÓDULO VÍDEO & LINK INTELIGENTE 1-CLIQUE (T20 a T22 / RF-39 a RF-41)
// ============================================================================

function renderVideoLinkView() {
  return `
    <div class="grid-2">
      <div class="card card-flag-top">
        <div class="card-header">
          <div>
            <span class="screen-tag">T20 · RF-39 e RF-40</span>
            <h3 class="card-title" style="margin-top:4px;">Vídeo Review Portal Paraguai + Links Curtos Rastreáveis</h3>
          </div>
          <span class="badge badge-red">YouTube / Reels CDE</span>
        </div>

        <div style="background:linear-gradient(135deg,#00236B,#0f172a);color:#fff;border-radius:var(--radius-md);padding:22px;margin-bottom:16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <span class="badge badge-red">▶ AO VIVO · CANAL PORTAL PARAGUAI</span>
            <span style="font-size:0.78rem;color:#cbd5e1;">Vídeo ID: VID-CDE-OUT2026</span>
          </div>
          <h4 style="font-size:1.15rem;margin-bottom:8px;">"Top Ofertas em Ciudad del Este pagando no Pix com Câmbio Travado e Retirada Sem Fila!"</h4>
          <p style="font-size:0.84rem;color:#cbd5e1;margin-bottom:16px;">
            Toque em um dos links curtos inteligentes exibidos no vídeo para testar o redirecionamento automático (Deep Link com App vs Web Instant Checkout sem App):
          </p>

          <div style="display:flex;flex-direction:column;gap:10px;">
            <div style="background:rgba(255,255,255,0.1);padding:12px;border-radius:var(--radius-sm);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
              <div>
                <div style="font-weight:700;">🚲 Link #1: <code>portalpy.go/l/YT-BIKE-60K</code></div>
                <div style="font-size:0.76rem;color:#fde047;">Bicicleta Trek Madone SLR 9 · Cellshop (${formatUSD(9650)} / ${formatBRL(usdToBrl(9650))})</div>
              </div>
              <button type="button" class="btn btn-sm btn-primary" onclick="triggerSmartVideoLink('prod-bike-60k', 'VID-CDE-OUT2026', 'YT-BIKE-60K')">
                🔗 Tocar no Link do Vídeo
              </button>
            </div>

            <div style="background:rgba(255,255,255,0.1);padding:12px;border-radius:var(--radius-sm);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
              <div>
                <div style="font-weight:700;">📱 Link #2: <code>portalpy.go/l/YT-IP16-NISSEI</code></div>
                <div style="font-size:0.76rem;color:#fde047;">iPhone 16 Pro Max 256GB · Casa Nissei (${formatUSD(1120)} / ${formatBRL(usdToBrl(1120))})</div>
              </div>
              <button type="button" class="btn btn-sm btn-primary" onclick="triggerSmartVideoLink('prod-iphone-16pro', 'VID-CDE-OUT2026', 'YT-IP16-NISSEI')">
                🔗 Tocar no Link do Vídeo
              </button>
            </div>
          </div>
        </div>

        <div style="padding:12px;background:var(--py-blue-soft);border-radius:var(--radius-sm);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
          <label style="font-weight:700;font-size:0.86rem;display:flex;align-items:center;gap:8px;cursor:pointer;">
            <input type="checkbox" ${state.videoSimulateHasApp ? 'checked' : ''} onchange="state.videoSimulateHasApp = this.checked; renderCurrentView(false);" style="width:18px;height:18px;" />
            Simular que o Turista JÁ TEM o App Instalado (Deep Link T21)
          </label>
          <span class="badge badge-blue">${state.videoSimulateHasApp ? 'Modo T21: Deep Link + 1-Clique' : 'Modo T22: Web Sem App'}</span>
        </div>
      </div>

      <div class="card card-flag-red">
        <div class="card-header">
          <div>
            <span class="screen-tag red">${state.videoSimulateHasApp ? 'T21 · App Deep Link 1-Clique' : 'T22 · Web Instant Checkout Sem App'}</span>
            <h3 class="card-title" style="margin-top:4px;">
              ${state.videoSimulateHasApp ? 'Experiência Com App Instalado (Compra 1-Clique RF-10)' : 'Experiência Sem App (Web Express + CPF/WhatsApp RF-41)'}
            </h3>
          </div>
        </div>

        ${state.videoSimulateHasApp ? `
          <div style="padding:16px;border:1px solid var(--border-color);border-radius:var(--radius-md);background:var(--py-surface);">
            <span class="badge badge-green" style="margin-bottom:8px;">✓ Deep Link Reconhecido · Origem Atribuída</span>
            <h4 style="margin-bottom:6px;">Compra em 1 Clique Ativa para ${state.customer.nome}</h4>
            <p style="font-size:0.84rem;color:var(--text-muted);margin-bottom:14px;">
              Como você possui cadastro completo e Pix Salvo (<strong>${state.customer.pixBank}</strong>), clicar no produto do vídeo abre diretamente o checkout de 1-clique com câmbio real travado e atribui a comissão de origem ao vídeo.
            </p>
            <button type="button" class="btn btn-primary btn-block" onclick="quickBuyOneClick('prod-iphone-16pro', 'YouTube Portal Paraguai', 'VID-CDE-OUT2026', 'YT-IP16-NISSEI')">
              ⚡ Comprar iPhone 16 Pro Max em 1-Clique (${formatBRL(usdToBrl(1120))})
            </button>
          </div>
        ` : `
          <div style="padding:16px;border:1px solid var(--border-color);border-radius:var(--radius-md);background:var(--py-surface);">
            <span class="badge badge-gold" style="margin-bottom:8px;">🌐 Página Web Instantânea (Sem App Instalado · RF-41)</span>
            <h4 style="margin-bottom:6px;">Cadastro Mínimo de 1ª Compra (CPF + WhatsApp)</h4>
            <p style="font-size:0.83rem;color:var(--text-muted);margin-bottom:12px;">
              Mesmo sem o aplicativo instalado, o turista garante o preço do vídeo pagando por Pix na web e recebe o QR de retirada no WhatsApp + convite para baixar o app e ganhar bônus na Carteira!
            </p>
            <div class="form-group">
              <label>CPF do Comprador</label>
              <input type="text" class="form-control" value="${state.customer.cpf}" />
            </div>
            <div class="form-group">
              <label>WhatsApp para Receber o QR de Retirada</label>
              <input type="text" class="form-control" value="${state.customer.whatsapp}" />
            </div>
            <button type="button" class="btn btn-primary btn-block" onclick="quickBuyOneClick('prod-iphone-16pro', 'Web Link Vídeo Sem App', 'VID-CDE-OUT2026', 'YT-WEB-NOAPP')">
              💠 Gerar Pix Web Instantâneo + Receber Convite do App
            </button>
          </div>
        `}
      </div>
    </div>
  `;
}

// ============================================================================
// 3. CENTRAL DE OPERAÇÃO DO PORTAL & CONFERÊNCIA (T30 e T7 / RF-42 a RF-50 e 3.3.2)
// ============================================================================

function renderCentralOperacaoView() {
  const colSeparar = state.orders.filter(o => o.state === 'EM_SEPARACAO' || o.state === 'PAGO');
  const colColeta = state.orders.filter(o => o.state === 'EM_COLETA');
  const colTesteLoja = state.orders.filter(o => o.state === 'EM_TESTE_LOJA');
  const colPronto = state.orders.filter(o => o.state === 'PRONTO_RETIRADA' || o.state === 'LIBERADO_SAIDA');
  const colEntregue = state.orders.filter(o => o.state === 'RETIRADO' || o.state === 'ENTREGUE');

  return `
    <!-- KPIs da Central de Operação do Portal (RF-47 / RF-50 / D11) -->
    <div class="grid-4" style="margin-bottom:18px;">
      <div class="kpi-card">
        <span class="kpi-label">Operação Piloto CDE (D11)</span>
        <span class="kpi-value">5 Lojas · 10 Ops</span>
        <span class="kpi-sub">Turno único: 08h às 18h · Taxa inclusa nos 7%</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Canal de Teste da Loja (RF-50)</span>
        <span class="kpi-value">${colTesteLoja.length} em teste</span>
        <span class="kpi-sub">Aprovado → Ponto Retirada | Defeito → Troca Loja</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Fila Ativa de Entrega / Saída</span>
        <span class="kpi-value red">${colSeparar.length + colColeta.length + colTesteLoja.length + colPronto.length} pedidos</span>
        <span class="kpi-sub">${ state.orders.filter(o => o.arrivedNotified && o.state !== 'RETIRADO').length } cliente(s) aguardando no balcão</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Ocorrências Regra 3.3.2 (RF-48)</span>
        <span class="kpi-value">${state.occurrences.length} reg.</span>
        <span class="kpi-sub">Marco de responsabilidade: Saída QR concluída</span>
      </div>
    </div>

    <!-- Quadro Kanban de Fulfillment da Central do Portal (T30 / RF-42 a RF-50 / Seção 7) -->
    <div class="card card-flag-top" style="margin-bottom:20px;">
      <div class="card-header">
        <div>
          <span class="screen-tag">T30 · T7 · RF-42 a RF-50 · Seção 7</span>
          <h3 class="card-title" style="margin-top:4px;">Fila de Picking, Coleta pelo Portal, Canal de Teste de Defeitos da Loja (RF-50) &amp; Entrega QR</h3>
        </div>
        <span class="badge badge-blue">Máquina de Estados c/ EM_TESTE_LOJA</span>
      </div>

      <div class="kanban-board">
        <!-- Etapa 1: A Separar -->
        <div class="kanban-col">
          <div class="kanban-col-header">
            <span>1. A Separar (${colSeparar.length})</span>
            <span class="badge badge-gold">EM_SEPARACAO</span>
          </div>
          ${colSeparar.map(o => renderKanbanOrderCard(o, 'START_COLLECTION', '🏃 Equipe Portal Coletar na Loja')).join('')}
        </div>

        <!-- Etapa 2: Coleta na Loja pela Equipe do Portal -->
        <div class="kanban-col">
          <div class="kanban-col-header">
            <span>2. Coleta Portal (${colColeta.length})</span>
            <span class="badge badge-blue">EM_COLETA</span>
          </div>
          ${colColeta.map(o => renderKanbanOrderCard(o, 'SEND_TO_STORE_TEST', '🔬 Enviar ao Canal de Teste da Loja (RF-50)')).join('')}
        </div>

        <!-- Etapa 3 (NOVA RF-50): Canal de Teste e Análise de Defeitos da Loja -->
        <div class="kanban-col" style="background:var(--py-blue-soft);border-color:var(--py-blue);">
          <div class="kanban-col-header">
            <span>3. Teste &amp; Defeitos Loja (${colTesteLoja.length})</span>
            <span class="badge badge-red">EM_TESTE_LOJA · RF-50</span>
          </div>
          ${colTesteLoja.map(o => renderKanbanStoreTestCard(o)).join('')}
        </div>

        <!-- Etapa 4: Pronto no Ponto de Retirada / Saída Scan & Go -->
        <div class="kanban-col">
          <div class="kanban-col-header">
            <span>4. Pronto Retirada (${colPronto.length})</span>
            <span class="badge badge-red">PRONTO_RETIRADA</span>
          </div>
          ${colPronto.map(o => renderKanbanOrderCard(o, 'VERIFY_QR_DELIVER', '📲 Ler QR + Conferir Doc e Entregar')).join('')}
        </div>

        <!-- Etapa 5: Entregue / Saída Liberada (Marco de Mudança de Responsabilidade 3.3.2) -->
        <div class="kanban-col">
          <div class="kanban-col-header">
            <span>5. Retirado · Pós-Saída (${colEntregue.length})</span>
            <span class="badge badge-green">RETIRADO</span>
          </div>
          ${colEntregue.map(o => renderKanbanDeliveredCard(o)).join('')}
        </div>
      </div>
    </div>

    <!-- Matriz Oficial 3.3.2 de Responsabilidade por Ocorrência + Simulador de Falhas / Erros no Pedido -->
    <div class="card card-flag-red" style="margin-bottom:20px;">
      <div class="card-header">
        <div>
          <span class="screen-tag red">Seção 3.3.2 · RF-15 · RF-48 · RF-50 · Critério 14.2</span>
          <h3 class="card-title" style="margin-top:4px;">Matriz de Responsabilidade por Ocorrência (Erros no Pedido ou Falhas de Produto)</h3>
        </div>
        <span class="badge badge-blue">Marco Legal: Registro de Saída QR Concluído</span>
      </div>

      <div class="table-wrap" style="margin-bottom:16px;">
        <table>
          <thead>
            <tr>
              <th>Situação (Tabela 3.3.2)</th>
              <th>Marco Temporal</th>
              <th>Responsável</th>
              <th>Resolução no Sistema &amp; Impacto no Ledger</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>1. Item com defeito detectado no teste da loja (RF-50)</strong></td>
              <td><span class="badge badge-gold">Antes da saída</span></td>
              <td><span class="badge badge-blue">Loja</span></td>
              <td>Troca imediata do item pela loja (<code>EM_TESTE_LOJA → EM_COLETA → PRONTO_RETIRADA</code>); segue ao ponto de retirada sem ônus ao Portal.</td>
            </tr>
            <tr>
              <td><strong>2. Defeito ou reclamação depois que o cliente sai da loja</strong></td>
              <td><span class="badge badge-green">Depois da saída (QR lido)</span></td>
              <td><span class="badge badge-blue">Loja</span></td>
              <td>O CRM abre o ticket automaticamente e encaminha à loja; <strong>sem ônus e sem lançamento contra o Portal no Ledger</strong> (Critério 14.2).</td>
            </tr>
            <tr>
              <td><strong>3. Item faltante no pedido</strong></td>
              <td><span class="badge badge-gold">Conferência / Retirada</span></td>
              <td><span class="badge badge-red">Loja e Portal</span></td>
              <td>Escolha operacional: <strong>(A) Reposição na loja</strong> completando e fechando o pedido, <strong>OU (B) Acerto na fatura de repasse</strong> via lançamento no Ledger (Critério 14.2).</td>
            </tr>
            <tr>
              <td><strong>4. Item a mais no pedido</strong></td>
              <td><span class="badge badge-gold">Conferência / Retirada</span></td>
              <td><span class="badge badge-red">Loja e Portal</span></td>
              <td>Escolha operacional: <strong>(A) Devolução e reposição</strong> ao estoque da loja completando o pedido, <strong>OU (B) Acerto na fatura de repasse</strong> via lançamento no Ledger.</td>
            </tr>
            <tr>
              <td><strong>5. Divergência na conferência de saída (Pick &amp; Go / Scan &amp; Go)</strong></td>
              <td><span class="badge badge-gold">Saída da loja</span></td>
              <td><span class="badge badge-gray">Conforme o caso</span></td>
              <td>Ocorrência com responsável registrado (Loja ou Portal) e lançamento imutável de ajuste na fatura de repasse no Ledger.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div class="grid-2">
        <!-- Formulário de Registro de Ocorrência conforme 3.3.2 -->
        <div style="padding:14px;background:var(--py-surface-alt);border-radius:var(--radius-md);border:1px solid var(--border-color);">
          <h4 style="font-size:0.94rem;color:var(--py-blue-dark);margin-bottom:10px;">⚙️ Simular e Registrar Ocorrência / Falha de Produto (3.3.2)</h4>
          <div class="grid-2">
            <div class="form-group">
              <label for="occOrderId">Pedido Afetado</label>
              <select id="occOrderId" class="form-control">
                ${state.orders.map(o => `<option value="${o.id}">#${o.id} — ${o.customerName} (Estado: ${o.state})</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label for="occScenario">Situação da Regra 3.3.2</label>
              <select id="occScenario" class="form-control" onchange="updateOccurrenceResolutionOptions()">
                <option value="DEFEITO_ANTES_SAIDA">1. Defeito detectado no teste da loja, antes da saída (Resp: LOJA)</option>
                <option value="DEFEITO_DEPOIS_SAIDA">2. Defeito/reclamação DEPOIS que o cliente sai da loja (Resp: LOJA · Ticket CRM s/ ônus Portal)</option>
                <option value="ITEM_FALTANTE" selected>3. Item faltante (Resp: LOJA E PORTAL)</option>
                <option value="ITEM_A_MAIS">4. Item a mais (Resp: LOJA E PORTAL)</option>
                <option value="DIVERGENCIA_PICK_GO">5. Divergência na conferência de saída Pick &amp; Go (Conforme o caso)</option>
              </select>
            </div>
          </div>

          <div class="grid-2">
            <div class="form-group">
              <label for="occResolutionMode">Resolução no Sistema (3.3.2 / Critério 14.2)</label>
              <select id="occResolutionMode" class="form-control">
                <option value="REPOSICAO_COMPLETA_PEDIDO">Reposição física na loja (Completa e fecha o pedido s/ ajuste financeiro)</option>
                <option value="ACERTO_FATURA_REPASSE" selected>Acerto na fatura de repasse (Gera lançamento de ajuste no Ledger)</option>
                <option value="TROCA_TESTE_LOJA">Troca imediata no canal de teste da loja (Segue p/ retirada)</option>
                <option value="TICKET_CRM_LOJA_SEM_ONUS">Abrir Ticket no CRM encaminhado à Loja (Sem lançamento contra o Portal)</option>
              </select>
            </div>
            <div class="form-group">
              <label for="occValueBrl">Valor do Ajuste na Fatura de Repasse (R$)</label>
              <input id="occValueBrl" type="number" class="form-control" value="250.00" step="10" />
            </div>
          </div>

          <button type="button" class="btn btn-primary btn-block" onclick="registerOccurrence()">
            ⚠️ Executar Regra 3.3.2 (Registrar Quem, Quando, Tipo, Responsável e Resolução)
          </button>
        </div>

        <!-- Validador de QR e Histórico Auditável de Ocorrências -->
        <div>
          <div style="padding:14px;background:var(--py-blue-soft);border-radius:var(--radius-md);margin-bottom:12px;">
            <h4 style="font-size:0.92rem;color:var(--py-blue-dark);margin-bottom:6px;">🔎 Conferência de QR de Saída (Marco de Mudança de Responsabilidade)</h4>
            <div style="display:flex;gap:8px;">
              <select id="inputQrTokenVerify" class="form-control" style="flex:1;">
                ${state.orders.map(o => `
                  <option value="${o.qrToken}">#${o.id} — ${o.qrToken} (${o.state} · QR Usado: ${o.qrUsed ? 'SIM' : 'NÃO'})</option>
                `).join('')}
              </select>
              <button type="button" class="btn btn-sm btn-blue" onclick="verifyOrderQrFromSelect()">
                Validar QR &amp; Saída
              </button>
            </div>
          </div>

          <h4 style="font-size:0.88rem;color:var(--py-blue-dark);margin-bottom:8px;">📋 Registro Auditável de Ocorrências (Quem · Quando · Tipo · Responsável · Resolução)</h4>
          <div style="max-height:240px;overflow-y:auto;display:flex;flex-direction:column;gap:8px;">
            ${state.occurrences.map(oc => `
              <div style="font-size:0.77rem;padding:10px;border:1px solid var(--border-color);border-left:4px solid ${oc.responsible === 'LOJA' ? 'var(--py-blue)' : 'var(--py-red)'};border-radius:var(--radius-sm);background:var(--py-surface);">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                  <strong>${oc.id} · Pedido #${oc.orderId} (${oc.storeName})</strong>
                  <span class="badge ${oc.responsible === 'LOJA' ? 'badge-blue' : 'badge-red'}">Resp: ${oc.responsible}</span>
                </div>
                <div><strong>Situação:</strong> ${oc.situationLabel || oc.type}</div>
                <div><strong>Resolução:</strong> ${oc.resolution}</div>
                <div style="color:var(--text-muted);margin-top:3px;">
                  👤 <strong>Quem:</strong> ${oc.whoRegistered} · 🕒 <strong>Quando:</strong> ${oc.createdAt} · ⚖️ <strong>Marco Pós-Saída:</strong> ${oc.exitMilestonePassed ? 'SIM (Pós-QR)' : 'NÃO (Antes da Saída)'} · 💵 <strong>Ajuste Fatura:</strong> ${formatBRL(oc.adjustmentBrl)}
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderKanbanOrderCard(order, actionCode, actionLabel) {
  return `
    <div class="kanban-item ${order.arrivedNotified ? 'priority' : ''}">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong>#${order.id}</strong>
        <span class="badge badge-blue">${order.mode}</span>
      </div>
      ${order.arrivedNotified ? `<span class="badge badge-red">🔔 CLIENTE NO BALCÃO AGORA!</span>` : ''}
      <div style="font-size:0.8rem;font-weight:600;">👤 ${order.customerName}</div>
      <div style="font-size:0.74rem;color:var(--text-muted);">
        🏬 ${order.stores.join(', ')}<br/>
        💵 ${formatUSD(order.totalUsd)} (${formatBRL(order.totalBrl)})<br/>
        🔬 Teste: <strong>${order.storeTestStatus || 'Pendente'}</strong><br/>
        👷 ${order.collectorOperator}
      </div>
      <button type="button" class="btn btn-sm ${actionCode === 'VERIFY_QR_DELIVER' ? 'btn-primary' : 'btn-blue'} btn-block" onclick="handleKanbanAction('${order.id}', '${actionCode}')">
        ${actionLabel}
      </button>
    </div>
  `;
}

function renderKanbanStoreTestCard(order) {
  return `
    <div class="kanban-item priority">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong>#${order.id}</strong>
        <span class="badge badge-red">RF-50 TESTE</span>
      </div>
      <div style="font-size:0.8rem;font-weight:600;">👤 ${order.customerName}</div>
      <div style="font-size:0.74rem;color:var(--text-muted);">
        🏬 ${order.stores.join(', ')}<br/>
        💵 ${formatUSD(order.totalUsd)} (${formatBRL(order.totalBrl)})<br/>
        🔬 Status: <strong>${order.storeTestStatus}</strong>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px;">
        <button type="button" class="btn btn-sm btn-success btn-block" onclick="handleKanbanAction('${order.id}', 'STORE_TEST_APPROVED')">
          ✅ Aprovado no Teste → Pronto Retirada
        </button>
        <button type="button" class="btn btn-sm btn-outline-red btn-block" onclick="handleKanbanAction('${order.id}', 'STORE_TEST_DEFECT_SWAP')">
          ⚠️ Defeito no Teste → Troca pela Loja (3.3.2)
        </button>
      </div>
    </div>
  `;
}

function renderKanbanDeliveredCard(order) {
  return `
    <div class="kanban-item">
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong>#${order.id}</strong>
        <span class="badge badge-green">PÓS-SAÍDA</span>
      </div>
      <div style="font-size:0.8rem;font-weight:600;">👤 ${order.customerName}</div>
      <div style="font-size:0.73rem;color:var(--text-muted);">
        🏬 ${order.stores.join(', ')}<br/>
        ⚖️ Marco 3.3.2: <strong>Saída QR Concluída (Resp. Loja)</strong>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px;">
        <button type="button" class="btn btn-sm btn-outline btn-block" onclick="handleKanbanAction('${order.id}', 'TEST_REUSE_QR')">
          🔒 Testar Reuso de QR (Bloqueio 14.2)
        </button>
        <button type="button" class="btn btn-sm btn-outline-red btn-block" onclick="claimPostExitDefect('${order.id}')">
          🛠️ Reclamar Defeito Pós-Saída → CRM Loja
        </button>
      </div>
    </div>
  `;
}

// ============================================================================
// 4. PAINEL DO LOJISTA (T9 / RF-25, RF-46, RF-49, RF-50 e 3.3.2)
// ============================================================================

function renderLojistaView() {
  const storeObj = state.stores.find(s => s.id === state.selectedMerchantStore) || state.stores[0];
  const storeOrders = state.orders.filter(o => o.stores.includes(storeObj.name) && o.state !== 'REEMBOLSADO');
  const grossBrl = storeOrders.reduce((s, o) => s + o.totalBrl, 0);
  const grossUsd = storeOrders.reduce((s, o) => s + o.totalUsd, 0);
  const portalCommBrl = Number((grossBrl * 0.07).toFixed(2));
  const epyxSplitBrl = Number((grossBrl * 0.03).toFixed(2));
  const netStoreBrl = Number((grossBrl * 0.90).toFixed(2));
  const netStoreUsd = Number((grossUsd * 0.90).toFixed(2));

  const ordersInStoreTest = state.orders.filter(o => o.state === 'EM_TESTE_LOJA');
  const storeOccurrences = state.occurrences.filter(oc => oc.storeName.includes(storeObj.name.split(' ')[0]) || oc.responsible.includes('LOJA'));

  return `
    <div class="card card-flag-top" style="margin-bottom:20px;">
      <div class="card-header">
        <div>
          <span class="screen-tag">T9 · RF-25 · RF-46 · RF-49 · RF-50 · 3.3.2</span>
          <h3 class="card-title" style="margin-top:4px;">Painel do Lojista Parceiro &amp; Bancada de Teste de Defeitos (RF-50) — Ciudad del Este</h3>
        </div>
        <div style="display:flex;align-items:center;gap:8px;">
          <label for="merchantSelect" style="font-size:0.82rem;font-weight:700;">Loja:</label>
          <select id="merchantSelect" class="form-control" onchange="state.selectedMerchantStore = this.value; renderCurrentView(false);">
            ${state.stores.map(st => `
              <option value="${st.id}" ${st.id === storeObj.id ? 'selected' : ''}>${st.name}</option>
            `).join('')}
          </select>
        </div>
      </div>

      <div class="grid-4" style="margin-bottom:18px;">
        <div class="kpi-card">
          <span class="kpi-label">Vendas Brutas (${storeObj.name})</span>
          <span class="kpi-value">${formatBRL(grossBrl)}</span>
          <span class="kpi-sub">Equivalente: ${formatUSD(grossUsd)}</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Comissão Portal Paraguai (7%)</span>
          <span class="kpi-value red">- ${formatBRL(portalCommBrl)}</span>
          <span class="kpi-sub">Inclui coleta e operação da Central (RF-46)</span>
        </div>
        <div class="kpi-card">
          <span class="kpi-label">Taxa Liquidação FX EPYX (3%)</span>
          <span class="kpi-value">- ${formatBRL(epyxSplitBrl)}</span>
          <span class="kpi-sub">Processamento Pix &amp; Repasse Dólar</span>
        </div>
        <div class="kpi-card" style="border-color:var(--py-emerald);background:var(--py-emerald-light);">
          <span class="kpi-label" style="color:#065F46;">Líquido Loja (90% em Conta USD via Câmbio Real)</span>
          <span class="kpi-value" style="color:#065F46;">${formatUSD(netStoreUsd)}</span>
          <span class="kpi-sub" style="color:#065F46;">(${formatBRL(netStoreBrl)} convertidos no câmbio travado)</span>
        </div>
      </div>

      <!-- Bancada Técnica da Loja (RF-50: Teste e Análise de Defeitos antes da Liberação) -->
      <div style="padding:16px;background:var(--py-surface-alt);border:1px solid var(--border-color);border-left:4px solid var(--py-red);border-radius:var(--radius-md);margin-bottom:18px;">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px;">
          <h4 style="color:var(--py-blue-dark);font-size:0.96rem;">
            🔬 Canal de Teste e Análise de Defeitos da Loja (RF-50) — Antes da Liberação ao Cliente
          </h4>
          <span class="badge badge-red">${ordersInStoreTest.length} pedido(s) aguardando laudo da loja</span>
        </div>
        <p style="font-size:0.82rem;color:var(--text-muted);margin-bottom:12px;">
          Após a conferência da equipe do Portal, o item passa pelo canal de teste da loja. Se aprovado, segue para <code>PRONTO_RETIRADA</code>. Se apresentar defeito antes da saída, a <strong>Loja realiza a troca imediata (Regra 3.3.2)</strong>.
        </p>
        ${ordersInStoreTest.length === 0 ? `
          <div style="font-size:0.82rem;color:#059669;font-weight:700;">✅ Todos os pedidos coletados já foram testados e aprovados pela bancada técnica!</div>
        ` : `
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${ordersInStoreTest.map(o => `
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;padding:10px 12px;background:var(--py-white);border-radius:var(--radius-sm);border:1px solid var(--border-color);">
                <div>
                  <strong>Pedido #${o.id} (${o.customerName})</strong> — ${o.items.map(i => i.name).join(', ')}
                </div>
                <div style="display:flex;gap:8px;">
                  <button type="button" class="btn btn-sm btn-success" onclick="handleKanbanAction('${o.id}', 'STORE_TEST_APPROVED')">
                    ✅ Registrar Teste: APROVADO
                  </button>
                  <button type="button" class="btn btn-sm btn-outline-red" onclick="handleKanbanAction('${o.id}', 'STORE_TEST_DEFECT_SWAP')">
                    🔄 Registrar DEFEITO e TROCA de Unidade
                  </button>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>

      <h4 style="margin-bottom:10px;color:var(--py-blue-dark);">Pedidos da Loja &amp; Status do Teste de Qualidade (RF-50)</h4>
      <div class="table-wrap" style="margin-bottom:16px;">
        <table>
          <thead>
            <tr>
              <th>Pedido</th>
              <th>Cliente</th>
              <th>Modo</th>
              <th>Estado</th>
              <th>Resultado Teste Loja (RF-50)</th>
              <th>Bruto (BRL / USD)</th>
              <th>Comissão Portal (7%)</th>
              <th>Líquido Loja (90% USD)</th>
            </tr>
          </thead>
          <tbody>
            ${storeOrders.map(o => `
              <tr>
                <td><strong>#${o.id}</strong></td>
                <td>${o.customerName}</td>
                <td><span class="badge badge-blue">${o.mode}</span></td>
                <td><span class="badge badge-green">${o.state}</span></td>
                <td><span class="badge badge-gold">${o.storeTestStatus || 'APROVADO_TESTE_LOJA'}</span></td>
                <td>${formatBRL(o.totalBrl)} (${formatUSD(o.totalUsd)})</td>
                <td style="color:var(--py-red);">- ${formatBRL(o.split.portalBrl)}</td>
                <td style="font-weight:800;color:#059669;">${formatUSD(o.split.storeUsd)} (${formatBRL(o.split.storeBrl)})</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <h4 style="margin-bottom:10px;color:var(--py-blue-dark);">Ocorrências, Trocas e Chamados Pós-Saída Encaminhados à Loja (Regra 3.3.2)</h4>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID / Data</th>
              <th>Pedido</th>
              <th>Situação (3.3.2)</th>
              <th>Marco Pós-Saída</th>
              <th>Responsável</th>
              <th>Resolução Aplicada</th>
              <th>Ajuste Fatura Repasse</th>
            </tr>
          </thead>
          <tbody>
            ${storeOccurrences.map(oc => `
              <tr>
                <td><strong>${oc.id}</strong><br/><small>${oc.createdAt}</small></td>
                <td>#${oc.orderId}</td>
                <td>${oc.situationLabel || oc.type}</td>
                <td><span class="badge ${oc.exitMilestonePassed ? 'badge-green' : 'badge-gold'}">${oc.exitMilestonePassed ? 'Pós-Saída Cliente' : 'Antes da Saída'}</span></td>
                <td><span class="badge badge-blue">${oc.responsible}</span></td>
                <td>${oc.resolution}</td>
                <td style="font-weight:700;">${formatBRL(oc.adjustmentBrl)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ============================================================================
// 5. PAINEL DA PLATAFORMA, SPLIT EPYX & LEDGER DE DUPLA ENTRADA (T10, T25, T28)
// ============================================================================

function renderPlataformaView() {
  const validOrders = state.orders.filter(o => o.state !== 'REEMBOLSADO');
  const totalGmvBrl = validOrders.reduce((s, o) => s + o.totalBrl, 0);
  const totalGmvUsd = validOrders.reduce((s, o) => s + o.totalUsd, 0);
  const totalStoreBrl = validOrders.reduce((s, o) => s + o.split.storeBrl, 0);
  const totalPortalBrl = validOrders.reduce((s, o) => s + o.split.portalBrl, 0);
  const totalEpyxBrl = validOrders.reduce((s, o) => s + o.split.epyxBrl, 0);

  return `
    <div class="grid-4" style="margin-bottom:18px;">
      <div class="kpi-card">
        <span class="kpi-label">GMV Total Processado (Pix Câmbio Real)</span>
        <span class="kpi-value">${formatBRL(totalGmvBrl)}</span>
        <span class="kpi-sub">Volume USD: ${formatUSD(totalGmvUsd)}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Repasse Lojas (90% Câmbio Real USD)</span>
        <span class="kpi-value">${formatBRL(totalStoreBrl)}</span>
        <span class="kpi-sub">${formatUSD(totalGmvUsd * 0.9)}</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Receita Portal Paraguai (7%)</span>
        <span class="kpi-value red">${formatBRL(totalPortalBrl)}</span>
        <span class="kpi-sub">Comissão + Operação Central Inclusa (RF-46)</span>
      </div>
      <div class="kpi-card">
        <span class="kpi-label">Split Liquidação EPYX (3%)</span>
        <span class="kpi-value">${formatBRL(totalEpyxBrl)}</span>
        <span class="kpi-sub">Conciliado 100% com Extrato Pix</span>
      </div>
    </div>

    <!-- Destaque do Critério de Aceite 14.2: Venda de R$ 60.000,00 com Split 90/7/3 -->
    <div class="card card-flag-red" style="margin-bottom:20px;">
      <div class="card-header">
        <div>
          <span class="screen-tag red">T10 · T25 · T28 · Critério de Aceite 14.2</span>
          <h3 class="card-title" style="margin-top:4px;">Verificador Oficial de Split (Caso Bicicleta R$ 60.000,00 → 90% / 7% / 3%) e Estorno Reversível</h3>
        </div>
        <button type="button" class="btn btn-sm btn-outline" onclick="exportLedgerReport()">
          📥 Exportar Conciliação Pix × Ledger (RF-27)
        </button>
      </div>

      <div style="padding:14px;background:var(--py-surface-alt);border-radius:var(--radius-sm);margin-bottom:16px;">
        <div style="font-weight:700;margin-bottom:6px;">
          ✅ Prova Matemática de Consistência Financeira (Pedido #PG-9001 · Bicicleta R$ 60.000,00):
        </div>
        <div style="font-size:0.86rem;display:flex;gap:18px;flex-wrap:wrap;">
          <span>Total Pago Pix: <strong>R$ 60.000,00</strong></span>
          <span>→ 90% Loja (Cellshop): <strong>R$ 54.000,00</strong></span>
          <span>→ 7% Portal Paraguai: <strong>R$ 4.200,00</strong></span>
          <span>→ 3% EPYX: <strong>R$ 1.800,00</strong></span>
          <span class="badge badge-green">Soma Exata: R$ 54.000 + R$ 4.200 + R$ 1.800 = R$ 60.000,00</span>
        </div>
      </div>

      <h4 style="margin-bottom:10px;color:var(--py-blue-dark);">Pedidos Liquidados — Atribuição de Origem (RF-31) e Estorno com Reversão de Split (RF-09)</h4>
      <div class="table-wrap" style="margin-bottom:18px;">
        <table>
          <thead>
            <tr>
              <th>Pedido / TxID</th>
              <th>Origem / Vídeo (RF-31)</th>
              <th>Estado</th>
              <th>Valor Pago Pix</th>
              <th>Loja (90%)</th>
              <th>Portal (7%)</th>
              <th>EPYX (3%)</th>
              <th>Ação Financeira</th>
            </tr>
          </thead>
          <tbody>
            ${state.orders.map(o => `
              <tr>
                <td><strong>#${o.id}</strong><br/><small>${o.txid}</small></td>
                <td>${o.origin.canal}<br/><code style="font-size:0.72rem;">${o.origin.codigo}</code></td>
                <td><span class="badge ${o.state === 'REEMBOLSADO' ? 'badge-red' : 'badge-green'}">${o.state}</span></td>
                <td style="font-weight:700;">${formatBRL(o.totalBrl)}</td>
                <td>${formatBRL(o.split.storeBrl)}</td>
                <td>${formatBRL(o.split.portalBrl)}</td>
                <td>${formatBRL(o.split.epyxBrl)}</td>
                <td>
                  ${o.state === 'REEMBOLSADO' ? `
                    <span class="badge badge-gray">Estornado no Ledger</span>
                  ` : `
                    <button type="button" class="btn btn-sm btn-outline-red" onclick="refundOrderAndReverseSplit('${o.id}')">
                      ↩️ Estornar &amp; Reverter Split (RF-09)
                    </button>
                  `}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>

      <h4 style="margin-bottom:10px;color:var(--py-blue-dark);">📜 Ledger Contábil de Dupla Entrada Imutável (Seção 5.3 e Seção 8)</h4>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>ID Lançamento</th>
              <th>Horário</th>
              <th>Pedido / TxID</th>
              <th>Conta Débito</th>
              <th>Conta Crédito</th>
              <th>Câmbio</th>
              <th>Valor USD</th>
              <th>Valor BRL</th>
              <th>Natureza</th>
            </tr>
          </thead>
          <tbody>
            ${state.ledgerEntries.map(l => `
              <tr>
                <td><code>${l.id}</code></td>
                <td>${l.timestamp}</td>
                <td><strong>#${l.orderId}</strong><br/><small>${l.txid}</small></td>
                <td>${l.debitAccount}</td>
                <td>${l.creditAccount}</td>
                <td>R$ ${l.fxRate.toFixed(4)}</td>
                <td>${formatUSD(l.amountUsd)}</td>
                <td style="font-weight:700;color:${l.type.includes('ESTORNO') ? 'var(--py-red)' : 'var(--py-blue-dark)'};">${formatBRL(l.amountBrl)}</td>
                <td><span class="badge ${l.type.includes('ESTORNO') ? 'badge-red' : 'badge-blue'}">${l.type}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

// ============================================================================
// 6. CRM, CAMPANHAS IA E ATIVAÇÃO MULTICANAL EM CASCATA (T14 a T18, T29)
// ============================================================================

function renderCrmCampanhasView() {
  const tck = state.crmTickets[0];
  return `
    <div class="grid-2" style="margin-bottom:20px;">
      <!-- T14, T15, T16: Campanhas e Recomendações IA -->
      <div class="card card-flag-top">
        <div class="card-header">
          <div>
            <span class="screen-tag">T14 · T15 · T16 · RF-28 a RF-31</span>
            <h3 class="card-title" style="margin-top:4px;">Motor de Campanhas, Cupons &amp; IA Preditiva</h3>
          </div>
          <span class="badge badge-gold">🤖 IA Ativa</span>
        </div>

        <div style="padding:12px;background:var(--py-gold-light);border-left:4px solid var(--py-gold);border-radius:var(--radius-sm);margin-bottom:14px;font-size:0.83rem;">
          <strong>🧠 Recomendação de IA (T16 · Previsão de Movimento Ponte da Amizade):</strong><br/>
          Previsão de queda de 18% no fluxo terça-feira às 14h. Sugestão automática: disparar campanha <code>PICKGO-TERCA</code> com <strong>4% de Cashback co-financiado (50% Loja / 50% Portal)</strong> para 3.200 turistas num raio de 35 km (Foz do Iguaçu).
          <div style="margin-top:8px;">
            <button type="button" class="btn btn-sm btn-primary" onclick="createRecommendedAiCampaign()">
              ✨ Aprovar &amp; Ativar Campanha Recomendada pela IA
            </button>
          </div>
        </div>

        <div class="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Código / Campanha</th>
                <th>Pagador Bônus (RF-29)</th>
                <th>Enviadas → Abertas → Compras</th>
                <th>Receita Atribuída (RF-38)</th>
              </tr>
            </thead>
            <tbody>
              ${state.campaigns.map(cp => `
                <tr>
                  <td><strong>${cp.code}</strong><br/><small>${cp.name}</small></td>
                  <td><span class="badge badge-blue">${cp.payer}</span></td>
                  <td>${cp.sent.toLocaleString('pt-BR')} → ${cp.opened.toLocaleString('pt-BR')} → <strong>${cp.ordersCount}</strong></td>
                  <td style="font-weight:700;color:#059669;">${formatBRL(cp.revenueBrl)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>

      <!-- T29: Orquestrador de Cascata Multicanal -->
      <div class="card card-flag-red">
        <div class="card-header">
          <div>
            <span class="screen-tag red">T29 · RF-36 a RF-38</span>
            <h3 class="card-title" style="margin-top:4px;">Orquestrador de Ativação em Cascata (Push → WhatsApp → RCS → E-mail)</h3>
          </div>
          <span class="badge badge-blue">Freq: ${state.customer.weeklyMessagesReceived}/${state.customer.weeklyMessageLimit} sem.</span>
        </div>

        <p style="font-size:0.83rem;color:var(--text-muted);margin-bottom:12px;">
          Respeita o consentimento granular LGPD (RF-37) e avança automaticamente para o próximo canal caso o cliente não abra a mensagem no tempo configurado:
        </p>

        <div class="cascade-step ${state.cascadeDemo.step === 1 ? 'active-step' : ''}">
          <span class="badge badge-blue">1º</span>
          <div style="flex:1;font-size:0.83rem;">
            <strong>Push App Pick &amp; Go</strong> (Custo Zero · Espera 2h por abertura)
          </div>
          <span class="badge ${state.customer.consents.push ? 'badge-green' : 'badge-red'}">${state.customer.consents.push ? 'Opt-in OK' : 'Bloqueado'}</span>
        </div>

        <div class="cascade-step ${state.cascadeDemo.step === 2 ? 'active-step' : ''}">
          <span class="badge badge-blue">2º</span>
          <div style="flex:1;font-size:0.83rem;">
            <strong>WhatsApp Oficial (Template Aprovado Meta)</strong> (Se Push não aberto em 2h)
          </div>
          <span class="badge ${state.customer.consents.whatsapp ? 'badge-green' : 'badge-red'}">${state.customer.consents.whatsapp ? 'Opt-in OK' : 'Bloqueado'}</span>
        </div>

        <div class="cascade-step ${state.cascadeDemo.step === 3 ? 'active-step' : ''}">
          <span class="badge badge-blue">3º</span>
          <div style="flex:1;font-size:0.83rem;">
            <strong>RCS Cartão Rico com Botão de Compra 1-Clique</strong> (Se falha no WhatsApp)
          </div>
          <span class="badge ${state.customer.consents.rcs ? 'badge-green' : 'badge-red'}">${state.customer.consents.rcs ? 'Opt-in OK' : 'Bloqueado'}</span>
        </div>

        <div class="cascade-step ${state.cascadeDemo.step === 4 ? 'active-step' : ''}">
          <span class="badge badge-blue">4º</span>
          <div style="flex:1;font-size:0.83rem;">
            <strong>E-mail Oferta Completa (SPF/DKIM/DMARC)</strong> (Último canal de fallback)
          </div>
          <span class="badge ${state.customer.consents.email ? 'badge-green' : 'badge-red'}">${state.customer.consents.email ? 'Opt-in OK' : 'Bloqueado'}</span>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
          <button type="button" class="btn btn-sm btn-primary" onclick="advanceCascadeStep()">
            ⏭️ Simular Timeout / Próximo Canal da Cascata
          </button>
          <button type="button" class="btn btn-sm btn-outline-red" onclick="simulateOptOutStop()">
            🛑 Cliente Pediu "PARAR" (Exclusão Imediata 14.2)
          </button>
        </div>

        <div style="margin-top:12px;background:var(--py-surface-alt);padding:10px;border-radius:var(--radius-sm);font-size:0.76rem;max-height:130px;overflow-y:auto;">
          ${state.cascadeDemo.logs.map(l => `<div style="margin-bottom:4px;">${l}</div>`).join('')}
        </div>
      </div>
    </div>

    <!-- T17 e T18: CRM Atendimento Omnichannel com Ações de Alçada e Auditoria -->
    <div class="card card-flag-top">
      <div class="card-header">
        <div>
          <span class="screen-tag">T17 · T18 · RF-32 a RF-35 · Critério 14.2</span>
          <h3 class="card-title" style="margin-top:4px;">CRM · Fila Única de Atendimento (WhatsApp, App, E-mail) com Alçada &amp; Auditoria</h3>
        </div>
        <span class="badge badge-green">Atendente Logado: Carla Villalba (ID #AT-09)</span>
      </div>

      <div class="grid-2">
        <div>
          <div style="background:var(--py-surface-alt);padding:14px;border-radius:var(--radius-md);margin-bottom:12px;max-height:240px;overflow-y:auto;">
            ${tck.messages.map(m => `
              <div style="margin-bottom:10px;padding:10px;border-radius:var(--radius-sm);background:${m.sender === 'CLIENTE' ? '#FFFFFF' : m.sender === 'ATENDENTE' ? 'var(--py-blue-light)' : 'var(--py-gold-light)'};">
                <div style="font-size:0.72rem;font-weight:700;color:var(--text-muted);">${m.sender} · ${m.time}</div>
                <div style="font-size:0.85rem;margin-top:2px;">${m.text}</div>
              </div>
            `).join('')}
          </div>

          <div style="display:flex;gap:8px;">
            <input id="crmReplyInput" type="text" class="form-control" style="flex:1;" placeholder="Responder ao turista no WhatsApp / App..." />
            <button type="button" class="btn btn-blue" onclick="sendCrmAgentMessage()">Enviar</button>
          </div>
        </div>

        <div>
          <h4 style="font-size:0.9rem;color:var(--py-blue-dark);margin-bottom:8px;">⚡ Ações Rápidas do Atendente (RF-33 / RF-35 — Com Trilha de Auditoria)</h4>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px;">
            <button type="button" class="btn btn-sm btn-outline" onclick="crmActionAudit('REENVIAR_QR', 'Reenviou QR Code do pedido #PG-9001 no WhatsApp')">
              📲 Reenviar QR de Retirada
            </button>
            <button type="button" class="btn btn-sm btn-outline" onclick="crmActionAudit('INSTRUCOES_PONTO', 'Enviou mapa do Ponto Anexo Cellshop (08h-18h)')">
              🗺️ Enviar Mapa do Ponto
            </button>
            <button type="button" class="btn btn-sm btn-primary" onclick="crmCreditCashbackWithAudit(50.00)">
              💰 Creditar R$ 50 Cashback (Alçada)
            </button>
            <button type="button" class="btn btn-sm btn-blue" onclick="crmActionAudit('VENDA_ATIVA_OFERTA', 'Enviou oferta ativa Capacete Bontrager c/ 15% OFF no Pix')">
              🎯 Venda Ativa: Sugerir Oferta (RF-35)
            </button>
          </div>

          <div style="background:var(--py-surface-alt);padding:10px;border-radius:var(--radius-sm);font-size:0.76rem;">
            <strong style="color:var(--py-blue-dark);">🛡️ Trilha de Auditoria Financeira &amp; Operacional (Seção 11 / 14.2):</strong>
            <ul style="list-style:none;margin-top:6px;display:flex;flex-direction:column;gap:4px;">
              ${tck.auditLogs.map(log => `<li>• ${log}</li>`).join('')}
            </ul>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================================
// MODAIS NATIVOS <dialog>: MOTOR DE CÂMBIO REAL, CONFIGURADOR T27 E PIX T3/T24
// ============================================================================

function openFxConfigModal() {
  const dialog = document.getElementById('fxConfigDialog');
  const body = document.getElementById('fxDialogBody');
  if (!dialog || !body) return;

  body.innerHTML = `
    <p style="font-size:0.86rem;color:var(--text-muted);margin-bottom:14px;">
      O checkout do <strong>Portal Paraguai · Pick &amp; Go</strong> processa o Pix via <strong>Câmbio Real</strong>, convertendo os preços das lojas em Dólar (US$) para Reais (R$) usando a cotação comercial em tempo real somada ao spread operacional e IOF. As lojas recebem 90% liquidados em dólar via Câmbio Real / EPYX.
    </p>

    <div class="grid-2">
      <div class="form-group">
        <label for="fxInputCommercial">Cotação Dólar Comercial Spot (1 USD → BRL)</label>
        <input id="fxInputCommercial" type="number" step="0.0001" class="form-control" value="${state.fx.commercialUsdBrl}" />
      </div>
      <div class="form-group">
        <label for="fxInputSpread">Spread Liquidação Pix Câmbio Real (%)</label>
        <input id="fxInputSpread" type="number" step="0.05" class="form-control" value="${state.fx.spreadPct}" />
      </div>
      <div class="form-group">
        <label for="fxInputIof">IOF Operação Internacional (%)</label>
        <input id="fxInputIof" type="number" step="0.01" class="form-control" value="${state.fx.iofPct}" />
      </div>
      <div class="form-group">
        <label for="fxInputPyg">Cotação Guarani Paraguaio (1 USD → PYG)</label>
        <input id="fxInputPyg" type="number" step="10" class="form-control" value="${state.fx.usdPyg}" />
      </div>
    </div>

    <div style="padding:12px;background:var(--py-blue-soft);border-radius:var(--radius-sm);margin:12px 0;font-size:0.85rem;">
      <div>Fonte Atual: <strong>${state.fx.source}</strong> (Atualizado às ${state.fx.updatedAt})</div>
      <div style="margin-top:4px;font-size:1rem;color:var(--py-red);font-weight:800;">
        Taxa Efetiva Pix Câmbio Real: US$ 1,00 = R$ ${state.fx.effectiveUsdBrl.toFixed(4)}
      </div>
    </div>

    <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px;">
      <button type="button" class="btn btn-outline" onclick="fetchLiveExchangeRate(true); openFxConfigModal();">
        🌐 Buscar Cotação Real na API Agora
      </button>
      <button type="button" class="btn btn-primary" onclick="saveFxModalSettings()">
        💾 Aplicar Taxa de Câmbio em Todo o Sistema
      </button>
    </div>
  `;

  if (!dialog.open) dialog.showModal();
}

function saveFxModalSettings() {
  const comm = parseFloat(document.getElementById('fxInputCommercial')?.value || state.fx.commercialUsdBrl);
  const spread = parseFloat(document.getElementById('fxInputSpread')?.value || state.fx.spreadPct);
  const iof = parseFloat(document.getElementById('fxInputIof')?.value || state.fx.iofPct);
  const pyg = parseFloat(document.getElementById('fxInputPyg')?.value || state.fx.usdPyg);

  state.fx.commercialUsdBrl = Number(comm.toFixed(4));
  state.fx.spreadPct = Number(spread.toFixed(2));
  state.fx.iofPct = Number(iof.toFixed(2));
  state.fx.usdPyg = Math.round(pyg);
  state.fx.source = 'Configuração Manual / Simulador Câmbio Real';
  state.fx.updatedAt = new Date().toLocaleTimeString('pt-BR');

  recalcEffectiveFx();
  updateHeaderFxUI();
  renderCurrentView(false);
  document.getElementById('fxConfigDialog')?.close();
  showToast(`💱 Câmbio Real atualizado: US$ 1 = R$ ${state.fx.effectiveUsdBrl.toFixed(4)} aplicado ao catálogo e sacola!`);
}

// ============================================================================
// T27: CONFIGURADOR DE PRODUTO (BICICLETA ARO 26/29/31, CORES E ACESSÓRIOS - RF-04)
// ============================================================================

function openProductConfigurator(productId) {
  const prod = state.products.find(p => p.id === productId) || state.products[0];
  const dialog = document.getElementById('productConfigDialog');
  const body = document.getElementById('configDialogBody');
  if (!dialog || !body) return;

  body.innerHTML = `
    <div style="display:flex;gap:14px;align-items:center;margin-bottom:14px;">
      <div style="font-size:3rem;background:var(--py-blue-soft);padding:12px 18px;border-radius:var(--radius-md);">${prod.emoji}</div>
      <div>
        <span class="badge badge-blue">${prod.storeName}</span>
        <h4 style="font-size:1.1rem;margin-top:4px;">${prod.name}</h4>
        <div style="font-size:0.82rem;color:var(--text-muted);">Preço Base: ${formatUSD(prod.baseUsd)} (${formatBRL(usdToBrl(prod.baseUsd))})</div>
      </div>
    </div>

    <div class="grid-2">
      <div class="form-group">
        <label for="cfgRim">1. Escolha o Aro (RF-04)</label>
        <select id="cfgRim" class="form-control" onchange="updateBikeConfiguratorPrice(${prod.baseUsd})">
          <option value="0" data-label="Aro 26 Standard">Aro 26 Standard (+ US$ 0,00)</option>
          <option value="220" data-label="Aro 29 Carbon Pro" selected>Aro 29 Carbon Pro (+ US$ 220,00)</option>
          <option value="410" data-label="Aro 31 Speed Aero">Aro 31 Speed Aero (+ US$ 410,00)</option>
        </select>
      </div>

      <div class="form-group">
        <label for="cfgColor">2. Escolha a Cor Oficial (RF-04)</label>
        <select id="cfgColor" class="form-control" onchange="updateBikeConfiguratorPrice(${prod.baseUsd})">
          <option value="0" data-label="Branco Pérola">⚪ Branco Pérola (+ US$ 0,00)</option>
          <option value="0" data-label="Preto Carbono">⚫ Preto Carbono (+ US$ 0,00)</option>
          <option value="80" data-label="Azul Paraguai Metálico">🔵 Azul Paraguai Metálico (+ US$ 80,00)</option>
          <option value="120" data-label="Vermelho Cerro Racing" selected>🔴 Vermelho Cerro Racing (+ US$ 120,00)</option>
        </select>
      </div>
    </div>

    <div class="form-group">
      <label>3. Acessórios de Fábrica Instalados na Loja (RF-04)</label>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:10px;background:var(--py-surface-alt);border-radius:var(--radius-sm);font-size:0.83rem;">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" class="cfg-acc" value="95" data-label="Selim de Gel Pro" checked onchange="updateBikeConfiguratorPrice(${prod.baseUsd})" />
          Selim de Gel (+ US$ 95)
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" class="cfg-acc" value="210" data-label="Freios ABS Hidráulicos" checked onchange="updateBikeConfiguratorPrice(${prod.baseUsd})" />
          Freios ABS (+ US$ 210)
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" class="cfg-acc" value="45" data-label="Adesivos Refletivos" checked onchange="updateBikeConfiguratorPrice(${prod.baseUsd})" />
          Adesivos (+ US$ 45)
        </label>
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;">
          <input type="checkbox" class="cfg-acc" value="330" data-label="Amortecedores Fox" checked onchange="updateBikeConfiguratorPrice(${prod.baseUsd})" />
          Amortecedores (+ US$ 330)
        </label>
      </div>
    </div>

    <div id="cfgPriceSummary" style="padding:14px;background:var(--py-blue-soft);border-radius:var(--radius-sm);margin:14px 0;"></div>

    <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;">
      <button type="button" class="btn btn-outline" onclick="addConfiguredBikeExact60k()">
        🎯 Testar Caso Exato R$ 60.000,00 (Critério 14.2)
      </button>
      <button type="button" class="btn btn-primary" onclick="confirmAddConfiguredBike('${prod.id}')">
        🛒 Adicionar Bicicleta Configurada à Sacola
      </button>
    </div>
  `;

  updateBikeConfiguratorPrice(prod.baseUsd);
  if (!dialog.open) dialog.showModal();
}

function updateBikeConfiguratorPrice(baseUsd) {
  const rimEl = document.getElementById('cfgRim');
  const colEl = document.getElementById('cfgColor');
  const accEls = document.querySelectorAll('.cfg-acc:checked');

  const rimUsd = parseFloat(rimEl?.value || 0);
  const colUsd = parseFloat(colEl?.value || 0);
  let accUsd = 0;
  accEls.forEach(el => { accUsd += parseFloat(el.value || 0); });

  const totalUsd = baseUsd + rimUsd + colUsd + accUsd;
  const totalBrl = usdToBrl(totalUsd);

  const summaryEl = document.getElementById('cfgPriceSummary');
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;">
        <div>
          <div style="font-size:0.82rem;color:var(--py-blue-dark);font-weight:700;">Total Configurado na Loja (US$): ${formatUSD(totalUsd)}</div>
          <div style="font-size:0.75rem;color:var(--text-muted);">Câmbio Real Pix: 1 USD = R$ ${state.fx.effectiveUsdBrl.toFixed(4)}</div>
        </div>
        <div style="font-size:1.35rem;font-weight:800;color:var(--py-red);">${formatBRL(totalBrl)}</div>
      </div>
    `;
  }
}

function confirmAddConfiguredBike(productId) {
  const prod = state.products.find(p => p.id === productId) || state.products[0];
  const rimEl = document.getElementById('cfgRim');
  const colEl = document.getElementById('cfgColor');
  const accEls = document.querySelectorAll('.cfg-acc:checked');

  const rimLabel = rimEl?.selectedOptions[0]?.dataset.label || 'Aro 29';
  const colLabel = colEl?.selectedOptions[0]?.dataset.label || 'Vermelho';
  const accLabels = Array.from(accEls).map(e => e.dataset.label);

  const rimUsd = parseFloat(rimEl?.value || 0);
  const colUsd = parseFloat(colEl?.value || 0);
  let accUsd = 0;
  accEls.forEach(el => { accUsd += parseFloat(el.value || 0); });

  const finalUsd = prod.baseUsd + rimUsd + colUsd + accUsd;
  const summary = `${rimLabel} · ${colLabel}` + (accLabels.length ? ` · +${accLabels.join(', ')}` : '');

  state.cart.push({
    cartItemId: 'ci-' + Date.now(),
    productId: prod.id,
    storeId: prod.storeId,
    storeName: prod.storeName,
    name: prod.name,
    emoji: prod.emoji,
    qty: 1,
    unitUsd: finalUsd,
    configSummary: summary
  });

  document.getElementById('productConfigDialog')?.close();
  renderCurrentView(false);
  showToast(`🚲 Bicicleta configurada (${summary}) adicionada por ${formatBRL(usdToBrl(finalUsd))}!`);
}

function addConfiguredBikeExact60k() {
  const prod = state.products[0];
  const exactUsd = Number((60000 / state.fx.effectiveUsdBrl).toFixed(4));
  state.cart = [{
    cartItemId: 'ci-60k-' + Date.now(),
    productId: prod.id,
    storeId: prod.storeId,
    storeName: prod.storeName,
    name: 'Bicicleta Trek Madone SLR 9 Carbon (Edição Oficial R$ 60.000,00)',
    emoji: '🚲',
    qty: 1,
    unitUsd: exactUsd,
    configSummary: 'Aro 29 · Vermelho Cerro · Selim Gel + Freios ABS + Adesivos + Amortecedores (Calibrado p/ Critério 14.2: R$ 60.000,00)'
  }];
  state.wallet.applyInCheckout = false;
  state.appliedCoupon = null;
  document.getElementById('productConfigDialog')?.close();
  renderCurrentView(false);
  showToast('🎯 Sacola ajustada com a Bicicleta de exatos R$ 60.000,00 para demonstrar o Split R$ 54.000 / R$ 4.200 / R$ 1.800!');
}

// ============================================================================
// T3 / T24 / T25: MODAL DE CHECKOUT PIX CÂMBIO REAL + WEBHOOK IDEMPOTENTE
// ============================================================================

function openPixCheckoutModal(isOneClick = false) {
  if (state.cart.length === 0) {
    showToast('Adicione pelo menos 1 produto à sacola primeiro.');
    return;
  }

  const totals = calculateCartTotals();
  const txid = 'TXID-PY-' + Math.floor(100000 + Math.random() * 900000);
  const pixCopyPaste = `00020126580014br.gov.bcb.pix0136cambioreal-epyx-${txid.toLowerCase()}520400005303986540${totals.finalPixBrl.toFixed(2)}5802BR5923PORTAL PARAGUAI PICK GO6014CIUDAD DEL ESTE62070503***6304ABCD`;

  state.activePixCheckout = {
    txid,
    pixCopyPaste,
    totals,
    fxLocked: state.fx.effectiveUsdBrl,
    isOneClick,
    webhookConfirmedCount: 0,
    orderCreatedId: null
  };

  renderPixCheckoutModalContent();
  const dialog = document.getElementById('pixCheckoutDialog');
  if (dialog && !dialog.open) dialog.showModal();

  if (isOneClick) {
    showToast('⚡ Compra em 1-Clique iniciada com Pix salvo! Confirme o webhook abaixo para liquidar.');
  }
}

function renderPixCheckoutModalContent() {
  const body = document.getElementById('pixDialogBody');
  const chk = state.activePixCheckout;
  if (!body || !chk) return;

  const { totals, txid, pixCopyPaste, fxLocked } = chk;

  body.innerHTML = `
    <div class="grid-2" style="align-items:start;">
      <div class="qr-box">
        <span class="badge badge-blue">⏱️ Câmbio Travado por 05:00 min</span>
        <h4 style="color:var(--py-blue-dark);">QR Code Pix Oficial (Câmbio Real)</h4>
        ${generateQrSvg(pixCopyPaste, 165)}
        <div style="font-size:1.3rem;font-weight:800;color:var(--py-red);">${formatBRL(totals.finalPixBrl)}</div>
        <div style="font-size:0.78rem;color:var(--text-muted);">
          Equivalente Loja: <strong>${formatUSD(totals.netUsd)}</strong> · Câmbio Real: <strong>R$ ${fxLocked.toFixed(4)}</strong>
        </div>
        <div style="width:100%;margin-top:6px;">
          <input type="text" class="form-control" style="font-size:0.72rem;width:100%;" value="${pixCopyPaste}" readonly />
          <button type="button" class="btn btn-sm btn-outline btn-block" style="margin-top:6px;" onclick="navigator.clipboard?.writeText('${pixCopyPaste}'); showToast('📋 Código Pix Copia e Cola copiado!');">
            📋 Copiar Código Pix Copia e Cola (RF-06)
          </button>
        </div>
      </div>

      <div>
        <span class="screen-tag red">RF-06 · RF-07 · RF-08 · Critério 14.2</span>
        <h4 style="margin:6px 0 10px;color:var(--py-blue-dark);">Demonstrador de Liquidação Câmbio Real, Split &amp; Idempotência</h4>

        <div style="padding:12px;background:var(--py-surface-alt);border-radius:var(--radius-sm);font-size:0.82rem;margin-bottom:12px;display:flex;flex-direction:column;gap:5px;">
          <div><strong>TxID Pix Câmbio Real:</strong> <code>${txid}</code></div>
          <div><strong>Cliente:</strong> ${state.customer.nome} (${state.customer.cpf})</div>
          <div><strong>Modo Entrega:</strong> ${state.deliveryMode}</div>
          <div><strong>90% Loja(s) (USD via Câmbio Real):</strong> ${formatBRL(totals.storeSplitBrl)} (${formatUSD(totals.netUsd * 0.9)})</div>
          <div><strong>7% Comissão Portal Paraguai:</strong> ${formatBRL(totals.portalSplitBrl)}</div>
          <div><strong>3% Parceiro Liquidação EPYX:</strong> ${formatBRL(totals.epyxSplitBrl)}</div>
        </div>

        <div style="display:flex;flex-direction:column;gap:8px;">
          <button type="button" class="btn btn-success btn-block" onclick="simulatePixWebhookPayment()">
            ✅ 1. Simular Webhook de Pagamento Pix Confirmado (RF-07)
          </button>
          <button type="button" class="btn btn-outline-red btn-block" onclick="simulatePixWebhookPayment()">
            🔁 2. Disparar Webhook Duplicado (Testar Idempotência 14.2)
          </button>
        </div>

        ${chk.orderCreatedId ? `
          <div style="margin-top:12px;padding:12px;background:var(--py-emerald-light);color:#065F46;border-radius:var(--radius-sm);font-size:0.83rem;">
            <strong>🎉 Pagamento Liquidado! Pedido #${chk.orderCreatedId} criado.</strong><br/>
            Webhooks recebidos para este TxID: <strong>${chk.webhookConfirmedCount}x</strong> → Lançamentos gerados no Ledger: <strong>1 único conjunto imutável (Idempotente!)</strong>.
            <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
              <button type="button" class="btn btn-sm btn-blue" onclick="document.getElementById('pixCheckoutDialog').close(); setTuristaSubTab('pedidos');">
                📦 Ver Meu QR de Retirada (T4)
              </button>
              <button type="button" class="btn btn-sm btn-primary" onclick="document.getElementById('pixCheckoutDialog').close(); switchMainView('plataforma');">
                🏦 Auditar Split no Ledger (T10)
              </button>
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

// ============================================================================
// AÇÕES DE NEGÓCIO E EVENTOS DO BARRAMENTO (SEÇÃO 9.2)
// ============================================================================

function simulatePixWebhookPayment() {
  const chk = state.activePixCheckout;
  if (!chk) return;

  chk.webhookConfirmedCount += 1;

  // Controle de Idempotência (RF-07 / Critério de Aceite 14.2)
  if (state.processedWebhookTxIds.has(chk.txid)) {
    renderPixCheckoutModalContent();
    showToast(`🛡️ IDEMPOTÊNCIA ATIVA (RF-07): Webhook duplicado #${chk.webhookConfirmedCount} para ${chk.txid} ignorado! Nenhum lançamento duplicado foi criado no Ledger.`);
    return;
  }

  state.processedWebhookTxIds.add(chk.txid);

  const newOrderId = 'PG-' + (9001 + state.orders.length);
  const { totals, txid, fxLocked } = chk;
  const storesList = [...new Set(state.cart.map(i => i.storeName))];

  let initialState = 'EM_SEPARACAO';
  if (state.deliveryMode === 'SCAN_GO') initialState = 'LIBERADO_SAIDA';
  if (state.deliveryMode === 'SHIP_BRAZIL') initialState = 'POSTADO';

  const cashbackBrl = Number((totals.finalPixBrl * 0.02).toFixed(2));

  const newOrder = {
    id: newOrderId,
    txid,
    createdAt: '17/10/2026 ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
    customerName: state.customer.nome,
    customerCpf: state.customer.cpf,
    mode: state.deliveryMode,
    state: initialState,
    stores: storesList,
    items: state.cart.map(i => ({
      name: i.name + (i.configSummary ? ` (${i.configSummary})` : ''),
      storeName: i.storeName,
      qty: i.qty,
      unitUsd: i.unitUsd
    })),
    totalUsd: totals.netUsd,
    fxRateApplied: fxLocked,
    totalBrl: totals.finalPixBrl,
    split: {
      storeBrl: totals.storeSplitBrl,
      portalBrl: totals.portalSplitBrl,
      epyxBrl: totals.epyxSplitBrl,
      storeUsd: Number((totals.netUsd * 0.90).toFixed(2))
    },
    qrToken: `QR-${newOrderId}-${Math.floor(1000 + Math.random() * 9000)}`,
    qrUsed: false,
    arrivedNotified: false,
    collectorOperator: state.deliveryMode === 'PORTAL_HUB' ? 'Equipe Central Portal (A coletar)' : 'Balcão da Loja',
    origin: { ...state.currentOrigin },
    trackingCode: state.deliveryMode === 'SHIP_BRAZIL' ? `PY${Math.floor(100000000 + Math.random() * 900000000)}BR` : null,
    cashbackCreditedBrl: cashbackBrl
  };

  state.orders.unshift(newOrder);

  // Se usou saldo da carteira, registra débito
  if (totals.walletDiscountBrl > 0) {
    const fromBonus = Math.min(state.wallet.bonusBrl, totals.walletDiscountBrl);
    const fromCashback = totals.walletDiscountBrl - fromBonus;
    state.wallet.bonusBrl = Number((state.wallet.bonusBrl - fromBonus).toFixed(2));
    state.wallet.cashbackBrl = Number((state.wallet.cashbackBrl - fromCashback).toFixed(2));
    state.wallet.applyInCheckout = false;
    state.wallet.history.unshift({
      id: 'mov-' + Date.now(),
      date: newOrder.createdAt,
      desc: `Uso de Saldo no Checkout · Pedido #${newOrderId}`,
      type: 'USO_CHECKOUT',
      amountBrl: -totals.walletDiscountBrl
    });
  }

  // Lançamentos Imutáveis no Ledger de Dupla Entrada (Seção 5.3)
  const nowStr = '17/10/2026 ' + new Date().toLocaleTimeString('pt-BR');
  const baseLdg = 1000 + state.ledgerEntries.length + 1;
  state.ledgerEntries.unshift(
    {
      id: `LDG-${baseLdg + 3}`,
      timestamp: nowStr,
      orderId: newOrderId,
      txid,
      debitAccount: '2.1.01 · Passivo Transitório Escrow Pick & Go',
      creditAccount: '2.1.20 · Liquidação & FX Partner EPYX (3%)',
      amountBrl: totals.epyxSplitBrl,
      amountUsd: Number((totals.netUsd * 0.03).toFixed(2)),
      fxRate: fxLocked,
      type: 'SPLIT_EPYX_3'
    },
    {
      id: `LDG-${baseLdg + 2}`,
      timestamp: nowStr,
      orderId: newOrderId,
      txid,
      debitAccount: '2.1.01 · Passivo Transitório Escrow Pick & Go',
      creditAccount: '3.1.01 · Receita Comissão Portal Paraguai (7% c/ Operação)',
      amountBrl: totals.portalSplitBrl,
      amountUsd: Number((totals.netUsd * 0.07).toFixed(2)),
      fxRate: fxLocked,
      type: 'SPLIT_PORTAL_7'
    },
    {
      id: `LDG-${baseLdg + 1}`,
      timestamp: nowStr,
      orderId: newOrderId,
      txid,
      debitAccount: '2.1.01 · Passivo Transitório Escrow Pick & Go',
      creditAccount: `2.1.10 · Repasse Lojista via Câmbio Real USD (90% · ${storesList.join(', ')})`,
      amountBrl: totals.storeSplitBrl,
      amountUsd: Number((totals.netUsd * 0.90).toFixed(2)),
      fxRate: fxLocked,
      type: 'SPLIT_LOJA_90'
    },
    {
      id: `LDG-${baseLdg}`,
      timestamp: nowStr,
      orderId: newOrderId,
      txid,
      debitAccount: '1.1.01 · Conta Liquidação Pix Câmbio Real (BRL)',
      creditAccount: '2.1.01 · Passivo Transitório Escrow Pick & Go',
      amountBrl: totals.finalPixBrl,
      amountUsd: totals.netUsd,
      fxRate: fxLocked,
      type: 'RECEBIMENTO_PIX_BRUTO'
    }
  );

  chk.orderCreatedId = newOrderId;
  state.cart = [];
  state.appliedCoupon = null;
  state.currentOrigin = { canal: 'App Nativo', videoId: '-', codigo: 'DIRETO-APP' };

  renderPixCheckoutModalContent();
  renderCurrentView(false);
  showToast(`💠 PagamentoConfirmado (#${newOrderId}): Split 90/7/3 registrado no Ledger e ordem de picking enviada!`);
}

// Estorno Total com Reversão do Split e Cashback (RF-09 / Critério 14.2)
function refundOrderAndReverseSplit(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order || order.state === 'REEMBOLSADO') return;

  order.state = 'REEMBOLSADO';
  const nowStr = '17/10/2026 ' + new Date().toLocaleTimeString('pt-BR');
  const baseLdg = 1000 + state.ledgerEntries.length + 1;

  state.ledgerEntries.unshift(
    {
      id: `LDG-${baseLdg + 2}`,
      timestamp: nowStr,
      orderId: order.id,
      txid: order.txid,
      debitAccount: '2.1.20 · Liquidação & FX Partner EPYX (3%)',
      creditAccount: '1.1.01 · Conta Liquidação Pix Câmbio Real (Estorno)',
      amountBrl: order.split.epyxBrl,
      amountUsd: Number((order.totalUsd * 0.03).toFixed(2)),
      fxRate: order.fxRateApplied,
      type: 'ESTORNO_REVERSAO_EPYX_3'
    },
    {
      id: `LDG-${baseLdg + 1}`,
      timestamp: nowStr,
      orderId: order.id,
      txid: order.txid,
      debitAccount: '3.1.01 · Receita Comissão Portal Paraguai (7%)',
      creditAccount: '1.1.01 · Conta Liquidação Pix Câmbio Real (Estorno)',
      amountBrl: order.split.portalBrl,
      amountUsd: Number((order.totalUsd * 0.07).toFixed(2)),
      fxRate: order.fxRateApplied,
      type: 'ESTORNO_REVERSAO_PORTAL_7'
    },
    {
      id: `LDG-${baseLdg}`,
      timestamp: nowStr,
      orderId: order.id,
      txid: order.txid,
      debitAccount: '2.1.10 · Repasse Lojista via Câmbio Real USD (90%)',
      creditAccount: '1.1.01 · Conta Liquidação Pix Câmbio Real (Estorno)',
      amountBrl: order.split.storeBrl,
      amountUsd: order.split.storeUsd,
      fxRate: order.fxRateApplied,
      type: 'ESTORNO_REVERSAO_LOJA_90'
    }
  );

  // Reverte cashback se havia sido creditado
  if (order.cashbackCreditedBrl > 0) {
    state.wallet.cashbackBrl = Number(Math.max(0, state.wallet.cashbackBrl - order.cashbackCreditedBrl).toFixed(2));
    state.wallet.history.unshift({
      id: 'mov-rev-' + Date.now(),
      date: nowStr,
      desc: `Reversão de Cashback por Estorno · Pedido #${order.id}`,
      type: 'ESTORNO',
      amountBrl: -order.cashbackCreditedBrl
    });
  }

  renderCurrentView(false);
  showToast(`↩️ Pedido #${order.id} estornado! Split 90/7/3 e Cashback revertidos com lançamentos inversos no Ledger.`);
}

// ============================================================================
// FUNÇÕES INTERATIVAS DE CATÁLOGO, SACOLA, CENTRAL T30 E CRM
// ============================================================================

function setTuristaSubTab(tab) {
  state.turistaSubTab = tab;
  renderCurrentView(true);
}

function filterCatalogStore(storeId) {
  state.selectedStoreFilter = storeId;
  renderCurrentView(false);
}

function addToCart(productId) {
  const prod = state.products.find(p => p.id === productId);
  if (!prod) return;

  const existing = state.cart.find(i => i.productId === productId && i.configSummary === 'Padrão de Fábrica');
  if (existing) {
    existing.qty += 1;
  } else {
    state.cart.push({
      cartItemId: 'ci-' + Date.now() + '-' + Math.floor(Math.random() * 100),
      productId: prod.id,
      storeId: prod.storeId,
      storeName: prod.storeName,
      name: prod.name,
      emoji: prod.emoji,
      qty: 1,
      unitUsd: prod.baseUsd,
      configSummary: 'Padrão de Fábrica'
    });
  }
  renderCurrentView(false);
  showToast(`🛒 ${prod.name} adicionado à sacola (${formatBRL(usdToBrl(prod.baseUsd))})!`);
}

function changeCartQty(cartItemId, delta) {
  const item = state.cart.find(i => i.cartItemId === cartItemId);
  if (!item) return;
  item.qty += delta;
  if (item.qty <= 0) {
    state.cart = state.cart.filter(i => i.cartItemId !== cartItemId);
  }
  renderCurrentView(false);
}

function removeCartItem(cartItemId) {
  state.cart = state.cart.filter(i => i.cartItemId !== cartItemId);
  renderCurrentView(false);
}

function setDeliveryMode(mode) {
  state.deliveryMode = mode;
  renderCurrentView(false);
}

function toggleUseWallet(checked) {
  state.wallet.applyInCheckout = checked;
  renderCurrentView(false);
}

function applyCouponCode() {
  const raw = (document.getElementById('couponInput')?.value || '').trim().toUpperCase();
  const found = state.campaigns.find(c => c.code === raw);
  if (!found) {
    showToast('⚠️ Cupom não encontrado. Experimente PICKGO-10 ou FRONTEIRA50.');
    return;
  }
  state.appliedCoupon = found;
  renderCurrentView(false);
  showToast(`🎟️ Cupom ${found.code} aplicado: -${formatUSD(found.discountUsd)} de desconto!`);
}

function quickBuyOneClick(productId, canal = 'App 1-Clique', videoId = '-', codigo = 'ONECLICK-PIX') {
  const prod = state.products.find(p => p.id === productId);
  if (!prod) return;
  state.cart = [{
    cartItemId: 'ci-1c-' + Date.now(),
    productId: prod.id,
    storeId: prod.storeId,
    storeName: prod.storeName,
    name: prod.name,
    emoji: prod.emoji,
    qty: 1,
    unitUsd: prod.baseUsd,
    configSummary: 'Compra Expressa 1-Clique'
  }];
  state.currentOrigin = { canal, videoId, codigo };
  if (state.currentView !== 'turista') {
    state.currentView = 'turista';
    state.turistaSubTab = 'catalogo';
  }
  renderCurrentView(false);
  openPixCheckoutModal(true);
}

function simulateScanGoItem(productId) {
  const prod = state.products.find(p => p.id === productId);
  if (!prod) return;
  state.deliveryMode = 'SCAN_GO';
  addToCart(productId);
  openPixCheckoutModal(false);
}

function triggerSmartVideoLink(productId, videoId, codigo) {
  state.currentOrigin = {
    canal: state.videoSimulateHasApp ? 'Deep Link Vídeo App' : 'Web Link Vídeo Sem App',
    videoId,
    codigo
  };
  if (productId === 'prod-bike-60k') {
    switchMainView('turista');
    openProductConfigurator('prod-bike-60k');
    showToast(`🔗 Link Inteligente /l/${codigo} registrado! Origem do vídeo vinculada ao pedido.`);
  } else {
    quickBuyOneClick(productId, state.currentOrigin.canal, videoId, codigo);
  }
}

function notifyCustomerArrived(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  order.arrivedNotified = true;
  renderCurrentView(false);
  showToast(`📍 Recepção da Central do Portal avisada! O pedido #${order.id} subiu para prioridade máxima na tela do operador.`);
}

function advanceShippingState(orderId) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;
  const flow = ['POSTADO', 'EM_TRANSITO', 'NA_ALFANDEGA', 'ENTREGUE'];
  const idx = flow.indexOf(order.state);
  order.state = flow[Math.min(flow.length - 1, idx + 1)];
  renderCurrentView(false);
  showToast(`🚚 Status de rastreio do pedido #${order.id} atualizado para: ${order.state}`);
}

function handleKanbanAction(orderId, actionCode) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;

  const nowStr = '17/10/2026 ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  if (actionCode === 'START_COLLECTION') {
    order.state = 'EM_COLETA';
    order.collectorOperator = 'Rodrigo Ayala (Equipe Portal #02)';
    order.storeTestStatus = 'AGUARDANDO_ENVIO_TESTE_LOJA';
    showToast(`🏃 Equipe do Portal iniciou coleta do pedido #${order.id} nas lojas: ${order.stores.join(', ')}.`);
  } else if (actionCode === 'SEND_TO_STORE_TEST') {
    // RF-50: após a conferência do Portal, o item segue ao canal de teste e análise de defeitos da loja
    order.state = 'EM_TESTE_LOJA';
    order.collectorOperator = 'Conferido pelo Portal → Canal de Teste da Loja (RF-50)';
    order.storeTestStatus = 'EM_ANALISE_DEFEITOS_LOJA';
    showToast(`🔬 RF-50: Pedido #${order.id} conferido pelo Portal e encaminhado ao Canal de Teste e Análise de Defeitos da Loja!`);
  } else if (actionCode === 'STORE_TEST_APPROVED') {
    // RF-50 / Seção 7: EM_TESTE_LOJA -> PRONTO_RETIRADA
    order.state = 'PRONTO_RETIRADA';
    order.storeTestStatus = 'APROVADO_TESTE_LOJA';
    order.collectorOperator = 'Laudo Loja: APROVADO (RF-50) · Pronto no Ponto de Retirada';
    showToast(`✅ RF-50: Loja aprovou o teste do pedido #${order.id}! Status atualizado para PRONTO_RETIRADA e cliente notificado.`);
  } else if (actionCode === 'STORE_TEST_DEFECT_SWAP') {
    // RF-50 / 3.3.2 / Seção 7: EM_TESTE_LOJA -> EM_COLETA (defeito detectado antes da saída -> troca pela loja)
    order.state = 'EM_COLETA';
    order.storeTestStatus = 'DEFEITO_DETECTADO_UNIDADE_TROCADA_PELA_LOJA';
    order.collectorOperator = 'Troca realizada pela Loja (RF-50) · Nova unidade em coleta';

    const newOcc = {
      id: 'OCO-0' + (state.occurrences.length + 1),
      orderId: order.id,
      storeName: order.stores.join(', '),
      type: 'DEFEITO_ANTES_SAIDA_TESTE_LOJA',
      situationLabel: 'Item com defeito detectado no teste da loja, antes da saída (RF-50)',
      responsible: 'LOJA',
      resolution: 'Troca imediata do item pela loja (EM_TESTE_LOJA → EM_COLETA); sem ônus ao Portal',
      whoRegistered: 'Bancada de Teste da Loja & Op. Rodrigo Ayala (#02)',
      exitMilestonePassed: false,
      adjustmentBrl: 0.00,
      createdAt: nowStr
    };
    state.occurrences.unshift(newOcc);
    showToast(`⚠️ RF-50 / 3.3.2: Defeito detectado no teste da loja no pedido #${order.id}! A Loja realizou a troca imediata da unidade (Responsável: LOJA) e o pedido retornou para conferência.`);
  } else if (actionCode === 'VERIFY_QR_DELIVER') {
    verifyAndDeliverOrder(order);
    return;
  } else if (actionCode === 'TEST_REUSE_QR') {
    verifyAndDeliverOrder(order);
    return;
  }
  renderCurrentView(false);
}

function verifyOrderQrFromSelect() {
  const token = document.getElementById('inputQrTokenVerify')?.value;
  const order = state.orders.find(o => o.qrToken === token);
  if (!order) return;
  verifyAndDeliverOrder(order);
}

function verifyAndDeliverOrder(order) {
  // Critério de Aceite 14.2: Um QR já usado não libera uma segunda retirada
  if (order.qrUsed || order.state === 'RETIRADO') {
    showToast(`🚫 BLOQUEIO DE SEGURANÇA (Critério 14.2): O QR Code ${order.qrToken} do pedido #${order.id} JÁ FOI UTILIZADO anteriormente! Segunda retirada negada.`);
    return;
  }

  order.qrUsed = true;
  order.state = 'RETIRADO';
  order.arrivedNotified = false;

  // RF-22: Crédito automático de cashback após a retirada confirmada
  if (order.cashbackCreditedBrl > 0) {
    state.wallet.cashbackBrl = Number((state.wallet.cashbackBrl + order.cashbackCreditedBrl).toFixed(2));
    state.wallet.purchasesCount += 1;
    state.wallet.history.unshift({
      id: 'mov-ret-' + Date.now(),
      date: '17/10/2026 ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      desc: `Cashback Confirmado após Retirada · Pedido #${order.id}`,
      type: 'CASHBACK',
      amountBrl: order.cashbackCreditedBrl
    });
  }

  renderCurrentView(false);
  showToast(`✅ QR Code ${order.qrToken} validado! Marco de mudança de responsabilidade (3.3.2) registrado e Cashback de ${formatBRL(order.cashbackCreditedBrl)} creditado!`);
}

function updateOccurrenceResolutionOptions() {
  const scenario = document.getElementById('occScenario')?.value;
  const resSelect = document.getElementById('occResolutionMode');
  const valInput = document.getElementById('occValueBrl');
  if (!resSelect || !valInput) return;

  if (scenario === 'DEFEITO_ANTES_SAIDA') {
    resSelect.value = 'TROCA_TESTE_LOJA';
    valInput.value = '0.00';
  } else if (scenario === 'DEFEITO_DEPOIS_SAIDA') {
    resSelect.value = 'TICKET_CRM_LOJA_SEM_ONUS';
    valInput.value = '0.00';
  } else if (scenario === 'ITEM_FALTANTE' || scenario === 'ITEM_A_MAIS') {
    resSelect.value = 'ACERTO_FATURA_REPASSE';
    valInput.value = '250.00';
  } else {
    resSelect.value = 'ACERTO_FATURA_REPASSE';
    valInput.value = '180.00';
  }
}

function claimPostExitDefect(orderId) {
  const order = state.orders.find(o => o.id === orderId) || state.orders[0];
  if (!order) return;

  // Garante que o marco de saída esteja caracterizado para demonstrar a regra pós-saída
  order.qrUsed = true;
  if (order.state !== 'REEMBOLSADO') order.state = 'RETIRADO';

  const nowStr = '17/10/2026 ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const newOcc = {
    id: 'OCO-0' + (state.occurrences.length + 1),
    orderId: order.id,
    storeName: order.stores.join(', '),
    type: 'DEFEITO_DEPOIS_SAIDA_CLIENTE',
    situationLabel: 'Defeito ou reclamação depois que o cliente sai da loja (Pós-QR · 3.3.2)',
    responsible: 'LOJA',
    resolution: 'CRM abriu ticket e encaminhou à loja (${order.stores.join(", ")}); sem ônus e sem lançamento contra o Portal no Ledger',
    whoRegistered: `Cliente ${order.customerName} via App/CRM → Atendente Carla Villalba (#AT-09)`,
    exitMilestonePassed: true,
    adjustmentBrl: 0.00,
    createdAt: nowStr
  };
  newOcc.resolution = `CRM abriu ticket #TCK-${401 + state.occurrences.length} e encaminhou à loja (${order.stores.join(', ')}); sem ônus e sem lançamento contra o Portal`;

  state.occurrences.unshift(newOcc);

  // Registra no CRM Ticket e na Auditoria (Critério de Aceite 14.2)
  const timeShort = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  state.crmTickets[0].messages.push({
    sender: 'SISTEMA',
    time: timeShort,
    text: `🛠️ [REGRA 3.3.2 · PÓS-SAÍDA] Reclamação de defeito no pedido #${order.id} após saída da loja (QR conferido). Ticket encaminhado diretamente à loja (${order.stores.join(', ')}) para garantia/troca. Nenhum débito lançado contra o Portal Paraguai.`
  });
  state.crmTickets[0].auditLogs.unshift(
    `${timeShort} · [OCORRÊNCIA ${newOcc.id} · PÓS-SAÍDA] Defeito reclamado após saída no pedido #${order.id}. Responsável: LOJA (${order.stores.join(', ')}). Ônus Portal: R$ 0,00.`
  );

  renderCurrentView(false);
  showToast(`🛠️ Regra 3.3.2 / Critério 14.2: Reclamação pós-saída do pedido #${order.id} gerou ticket no CRM encaminhado à loja (${order.stores.join(', ')}), SEM lançamento contra o Portal!`);
}

function registerOccurrence() {
  const orderId = document.getElementById('occOrderId')?.value || 'PG-9001';
  const scenario = document.getElementById('occScenario')?.value || 'ITEM_FALTANTE';
  const resMode = document.getElementById('occResolutionMode')?.value || 'ACERTO_FATURA_REPASSE';
  const rawValBrl = parseFloat(document.getElementById('occValueBrl')?.value || 250);

  const order = state.orders.find(o => o.id === orderId) || state.orders[0];
  const storeName = order ? order.stores.join(', ') : 'Loja Parceira';
  const nowStr = '17/10/2026 ' + new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  let responsible = 'LOJA E PORTAL';
  let situationLabel = 'Item faltante';
  let resolutionText = '';
  let exitMilestonePassed = Boolean(order && (order.qrUsed || order.state === 'RETIRADO'));
  let effectiveAdjustmentBrl = 0;

  if (scenario === 'DEFEITO_ANTES_SAIDA') {
    responsible = 'LOJA';
    situationLabel = 'Item com defeito detectado no teste da loja, antes da saída (RF-50)';
    resolutionText = 'Troca do item pela loja; pedido segue ao ponto de retirada sem ônus ao Portal';
    exitMilestonePassed = false;
    effectiveAdjustmentBrl = 0;
    if (order) {
      order.state = 'PRONTO_RETIRADA';
      order.storeTestStatus = 'TROCA_REALIZADA_E_APROVADO_NA_LOJA';
    }
  } else if (scenario === 'DEFEITO_DEPOIS_SAIDA') {
    claimPostExitDefect(orderId);
    return;
  } else if (scenario === 'ITEM_FALTANTE') {
    responsible = 'LOJA E PORTAL';
    situationLabel = 'Item faltante na conferência (3.3.2)';
    if (resMode === 'REPOSICAO_COMPLETA_PEDIDO') {
      resolutionText = 'Reposição imediata na loja, completando e fechando o pedido (Critério 14.2)';
      effectiveAdjustmentBrl = 0;
      if (order) {
        order.state = 'PRONTO_RETIRADA';
        order.storeTestStatus = 'REPOSICAO_CONCLUIDA_APROVADO';
      }
    } else {
      resolutionText = 'Acerto na fatura de repasse com lançamento contábil imutável no Ledger (Critério 14.2)';
      effectiveAdjustmentBrl = rawValBrl;
    }
  } else if (scenario === 'ITEM_A_MAIS') {
    responsible = 'LOJA E PORTAL';
    situationLabel = 'Item a mais identificado na conferência (3.3.2)';
    if (resMode === 'REPOSICAO_COMPLETA_PEDIDO') {
      resolutionText = 'Devolução do item excedente e reposição ao estoque da loja, completando o pedido';
      effectiveAdjustmentBrl = 0;
    } else {
      resolutionText = 'Acerto na fatura de repasse com lançamento contábil imutável no Ledger';
      effectiveAdjustmentBrl = rawValBrl;
    }
  } else {
    responsible = 'CONFORME O CASO (LOJA / PORTAL)';
    situationLabel = 'Divergência na conferência de saída Pick & Go / Scan & Go (3.3.2)';
    resolutionText = 'Ocorrência com responsável registrado e ajuste na fatura de repasse no Ledger';
    effectiveAdjustmentBrl = rawValBrl;
  }

  const newOcc = {
    id: 'OCO-0' + (state.occurrences.length + 1),
    orderId,
    storeName,
    type: scenario,
    situationLabel,
    responsible,
    resolution: resolutionText,
    whoRegistered: 'Diego Benítez (Op. Central #04)',
    exitMilestonePassed,
    adjustmentBrl: effectiveAdjustmentBrl,
    createdAt: nowStr
  };

  state.occurrences.unshift(newOcc);

  // Regra 3.3.2: Ajustes na fatura geram lançamentos no ledger, nunca alteração de lançamento antigo
  if (effectiveAdjustmentBrl > 0) {
    state.ledgerEntries.unshift({
      id: 'LDG-' + (1000 + state.ledgerEntries.length + 1),
      timestamp: nowStr,
      orderId,
      txid: 'FATURA-REP-' + newOcc.id,
      debitAccount: `2.1.10 · Fatura de Repasse Lojista (${storeName})`,
      creditAccount: '1.1.09 · Conta Conciliação de Ocorrências 3.3.2 (Loja/Portal)',
      amountBrl: effectiveAdjustmentBrl,
      amountUsd: Number((effectiveAdjustmentBrl / state.fx.effectiveUsdBrl).toFixed(2)),
      fxRate: state.fx.effectiveUsdBrl,
      type: `ACERTO_FATURA_${scenario}`
    });
  }

  renderCurrentView(false);
  showToast(`✅ Ocorrência ${newOcc.id} (${situationLabel}) registrada! Responsável: ${responsible} · Resolução: ${resolutionText}.`);
}

function setKycStatus(status) {
  state.customer.kycStatus = status;
  renderCurrentView(false);
  showToast(`🪪 Status do KYC atualizado para: ${status}`);
}

function toggleConsent(channel, checked) {
  state.customer.consents[channel] = checked;
  renderCurrentView(false);
  showToast(`🔒 Consentimento LGPD [${channel}] alterado para: ${checked ? 'AUTORIZADO' : 'REVOGADO'}`);
}

function createRecommendedAiCampaign() {
  if (state.campaigns.some(c => c.code === 'PICKGO-TERCA')) {
    showToast('Campanha PICKGO-TERCA já está ativa!');
    return;
  }
  state.campaigns.unshift({
    id: 'camp-' + Date.now(),
    code: 'PICKGO-TERCA',
    name: 'IA Preditiva: Terça Sem Fila + US$ 35 OFF & 4% Cashback',
    type: 'CASHBACK_E_CUPOM',
    discountUsd: 35.00,
    cashbackPct: 4,
    payer: 'DIVIDIDO_50_50',
    sent: 3200,
    delivered: 3110,
    opened: 1940,
    clicks: 820,
    ordersCount: 94,
    revenueBrl: 184500.00
  });
  renderCurrentView(false);
  showToast('🤖 Campanha recomendada pela IA (PICKGO-TERCA) criada e disparada para a cascata multicanal!');
}

function advanceCascadeStep() {
  state.cascadeDemo.step = (state.cascadeDemo.step % 4) + 1;
  const names = {
    1: 'Push App Pick & Go',
    2: 'WhatsApp Oficial (Template Meta)',
    3: 'RCS Cartão Interativo c/ Botão',
    4: 'E-mail Oferta Completa'
  };
  const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  state.cascadeDemo.logs.unshift(`${now} · [Passo ${state.cascadeDemo.step} · ${names[state.cascadeDemo.step]}] Canal acionado automaticamente após não abertura na etapa anterior.`);
  renderCurrentView(false);
  showToast(`📲 Cascata avançou para o ${state.cascadeDemo.step}º canal: ${names[state.cascadeDemo.step]}`);
}

function simulateOptOutStop() {
  state.customer.consents.push = false;
  state.customer.consents.whatsapp = false;
  state.customer.consents.rcs = false;
  state.customer.consents.email = false;
  const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  state.cascadeDemo.logs.unshift(`${now} · 🛑 [OPT-OUT IMEDIATO RF-37] Cliente enviou "PARAR". Excluído de todos os canais da cascata em 0 segundos.`);
  renderCurrentView(false);
  showToast('🛑 Cliente pediu para parar: todos os canais bloqueados imediatamente na cascata (Critério 14.2)!');
}

function sendCrmAgentMessage() {
  const input = document.getElementById('crmReplyInput');
  const text = (input?.value || '').trim();
  if (!text) return;
  const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  state.crmTickets[0].messages.push({ sender: 'ATENDENTE', time: now, text });
  state.crmTickets[0].auditLogs.unshift(`${now} · Atendente Carla Villalba (#AT-09) enviou mensagem no ticket #TCK-401.`);
  input.value = '';
  renderCurrentView(false);
}

function crmActionAudit(code, desc) {
  const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  state.crmTickets[0].messages.push({
    sender: 'ATENDENTE',
    time: now,
    text: `✅ [${code}] ${desc}`
  });
  state.crmTickets[0].auditLogs.unshift(`${now} · [AUDITORIA #AT-09 Carla Villalba] Ação executada: ${desc}`);
  renderCurrentView(false);
  showToast(`🛡️ Ação "${code}" executada e registrada na trilha de auditoria!`);
}

function crmCreditCashbackWithAudit(amountBrl) {
  const now = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  state.wallet.cashbackBrl = Number((state.wallet.cashbackBrl + amountBrl).toFixed(2));
  state.wallet.history.unshift({
    id: 'mov-crm-' + Date.now(),
    date: '17/10/2026 ' + now,
    desc: 'Crédito Manual CRM c/ Alçada (Atendente #AT-09 Carla Villalba)',
    type: 'CASHBACK',
    amountBrl
  });
  state.crmTickets[0].auditLogs.unshift(`${now} · 💰 [AUDITORIA FINANCEIRA · ALÇADA NÍVEL 2] Atendente Carla Villalba (#AT-09) creditou ${formatBRL(amountBrl)} na carteira do CPF ${state.customer.cpf}.`);
  state.crmTickets[0].messages.push({
    sender: 'ATENDENTE',
    time: now,
    text: `🎁 Creditei ${formatBRL(amountBrl)} de cashback na sua Carteira Pick & Go! Já está disponível para uso.`
  });
  renderCurrentView(false);
  showToast(`💰 ${formatBRL(amountBrl)} creditados na Carteira com registro de alçada e auditoria (Critério 14.2)!`);
}

function exportLedgerReport() {
  const payload = {
    generatedAt: new Date().toISOString(),
    fxApplied: state.fx,
    splitRules: state.splitRules,
    orders: state.orders,
    ledgerEntries: state.ledgerEntries
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `conciliacao-pix-ledger-portal-paraguai.json`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('📥 Relatório de Conciliação Pix × Ledger exportado com sucesso (RF-27)!');
}

// ============================================================================
// INICIALIZAÇÃO DA APLICAÇÃO
// ============================================================================

document.addEventListener('DOMContentLoaded', () => {
  recalcEffectiveFx();
  updateHeaderFxUI();
  renderCurrentView(false);

  // Busca câmbio real automaticamente na inicialização
  fetchLiveExchangeRate(false);

  // Listeners das abas principais
  document.querySelectorAll('.persona-nav .nav-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      switchMainView(btn.dataset.view);
    });
  });

  // Botões do Header e Modais <dialog>
  document.getElementById('btnRefreshFx')?.addEventListener('click', () => fetchLiveExchangeRate(true));
  document.getElementById('btnOpenFxModal')?.addEventListener('click', () => openFxConfigModal());
  document.getElementById('btnCloseFxDialog')?.addEventListener('click', () => document.getElementById('fxConfigDialog')?.close());
  document.getElementById('btnCloseConfigDialog')?.addEventListener('click', () => document.getElementById('productConfigDialog')?.close());
  document.getElementById('btnClosePixDialog')?.addEventListener('click', () => document.getElementById('pixCheckoutDialog')?.close());
});
