// Modelos das mensagens automáticas (RF-34). No WhatsApp, cada modelo precisa de
// um modelo aprovado na Meta (ContentSid em TWILIO_CONTENT_SIDS) para ser enviado
// fora da janela de 24 h; as variáveis abaixo são as mesmas do modelo aprovado.

export interface Modelo {
  assunto: string;
  texto: (v: Record<string, string>) => string;
}

export const MODELOS = {
  boas_vindas: {
    assunto: 'Bem-vindo ao Pick & Go',
    texto: (v) =>
      `Olá, ${v.nome}! Sua conta no Pick & Go do Portal Paraguai está pronta. Compre nas lojas de Ciudad del Este, pague por Pix e retire sem fila. Responda PARAR para não receber mais mensagens.`,
  },
  pagamento_confirmado: {
    assunto: 'Pagamento confirmado',
    texto: (v) => `Pix de ${v.total} confirmado! Pedido ${v.codigo} em separação. Avisamos quando estiver pronto para retirar.`,
  },
  pedido_pronto: {
    assunto: 'Seu pedido está pronto',
    texto: (v) => `Pedido ${v.codigo} pronto para retirada em ${v.local} (${v.horario}). Leve um documento com foto e mostre o QR no app.`,
  },
  lembrete_retirada: {
    assunto: 'Seu pedido está esperando',
    texto: (v) => `Seu pedido ${v.codigo} está pronto em ${v.local} desde ${v.desde}. Retire até ${v.prazo}. Precisa de ajuda? Responda esta mensagem.`,
  },
  nao_retirado: {
    assunto: 'Pedido não retirado',
    texto: (v) => `O prazo de retirada do pedido ${v.codigo} terminou. Nossa equipe vai falar com você para combinar a retirada ou o reembolso.`,
  },
  pix_expirado: {
    assunto: 'Pix expirado',
    texto: (v) => `O Pix do pedido ${v.codigo} expirou e os itens voltaram ao estoque. Você pode fazer um novo pedido pelo app.`,
  },
  pedido_cancelado: {
    assunto: 'Pedido cancelado',
    texto: (v) => `O pedido ${v.codigo} foi cancelado.`,
  },
  pedido_reembolsado: {
    assunto: 'Reembolso do pedido',
    texto: (v) => `O reembolso do pedido ${v.codigo} foi solicitado. O valor volta pelo Pix para a conta de origem.`,
  },
  chamado_aberto: {
    assunto: 'Recebemos sua mensagem',
    texto: (v) => `Recebemos seu pedido de atendimento (chamado ${v.numero}). Respondemos em breve por aqui.`,
  },
  optout: {
    assunto: 'Mensagens desligadas',
    texto: () => 'Pronto, você não vai mais receber mensagens por este canal. Para voltar, fale com a gente pelo app.',
  },
} satisfies Record<string, Modelo>;

export type IdModelo = keyof typeof MODELOS;
