import { carregarConfig } from './config.ts';
import { abrirDb, migrar, type Db } from './db.ts';

// Dados de demonstração do piloto (5 lojas de Ciudad del Este), tirados do mockup.
// Só grava em banco vazio, para não misturar com dados reais.

const LOJAS = [
  { id: 'cellshop', nome: 'Cellshop Importados PY', tipo: 'ANEXO', ponto: 'Anexo Portal Paraguai · piso térreo' },
  { id: 'nissei', nome: 'Casa Nissei CDE', tipo: 'DENTRO', ponto: 'Balcão Pick & Go no 2º andar' },
  { id: 'shopping-china', nome: 'Shopping China Importados', tipo: 'ANEXO', ponto: 'Lounge Portal Paraguai · Paris Shopping' },
  { id: 'mega', nome: 'Mega Eletrônicos', tipo: 'ANEXO', ponto: 'Ponto de retirada anexo · Av. Monseñor Rodríguez' },
  { id: 'atacado-games', nome: 'Atacado Games', tipo: 'DENTRO', ponto: 'Balcão rápido no 3º piso' },
] as const;

// Preços em centavos de dólar. A bicicleta dá R$ 60.000,00 de produto a US$ 1 = R$ 5,50 (critério 14.2).
const PRODUTOS = [
  ['cellshop', 'Bicicleta Trek Madone SLR 9 Carbon', 'Ciclismo', 1_090_909, 4, '7899001122334'],
  ['cellshop', 'Capacete Specialized S-Works Prevail 3', 'Ciclismo', 32_000, 10, '7899001122335'],
  ['cellshop', 'Fone Sony WH-1000XM6', 'Áudio', 39_900, 18, '7899001122336'],
  ['nissei', 'iPhone 16 Pro Max 256GB Titânio Natural', 'Smartphones', 112_000, 19, '7899001122001'],
  ['nissei', 'Drone DJI Mini 4 Pro Fly More Combo Plus', 'Drones e foto', 89_000, 9, '7899001122003'],
  ['nissei', 'Câmera Sony Alpha a7 IV (corpo)', 'Drones e foto', 219_000, 5, '7899001122006'],
  ['shopping-china', 'Perfume Dior Sauvage Elixir 100ml', 'Perfumaria', 19_500, 32, '7899001122004'],
  ['shopping-china', 'Whisky Johnnie Walker Blue Label 750ml', 'Bebidas', 21_000, 24, '7899001122007'],
  ['shopping-china', 'Perfume Chanel Coco Mademoiselle 100ml', 'Perfumaria', 16_800, 20, '7899001122008'],
  ['mega', 'MacBook Pro 14" M4 Pro 24GB 512GB', 'Informática', 184_000, 7, '7899001122005'],
  ['mega', 'Monitor LG UltraGear 27" OLED 240Hz', 'Informática', 79_000, 6, '7899001122009'],
  ['mega', 'JBL Charge 6', 'Áudio', 15_900, 30, '7899001122010'],
  ['atacado-games', 'PlayStation 5 Pro 2TB + DualSense', 'Games', 68_500, 14, '7899001122002'],
  ['atacado-games', 'Nintendo Switch 2 + Mario Kart World', 'Games', 49_900, 12, '7899001122011'],
  ['atacado-games', 'Meta Quest 3 512GB', 'Games', 54_900, 8, '7899001122012'],
] as const;

export async function semearDemo(db: Db): Promise<{ lojas: number; produtos: number } | null> {
  const ja = await db.query<{ n: number }>('select count(*)::int as n from loja');
  if (ja.rows[0]!.n > 0) return null;
  await db.tx(async (q) => {
    for (const l of LOJAS) {
      await q.query(
        `insert into loja (id, nome, ponto_retirada_tipo, ponto_retirada_descricao) values ($1, $2, $3, $4)`,
        [l.id, l.nome, l.tipo, l.ponto],
      );
    }
    for (const [loja, nome, categoria, preco, estoque, ean] of PRODUTOS) {
      // Como se tivesse vindo do sistema da loja: código interno e estoque informado.
      const codigoLoja = `${loja.slice(0, 3).toUpperCase()}-${ean.slice(-5)}`;
      await q.query(
        `insert into produto (loja_id, nome, categoria, preco_usd_centavos, estoque, estoque_loja, codigo_barras, codigo_loja, descricao, sincronizado_em)
         values ($1, $2, $3, $4, $5, $5, $6, $7, $8, now())`,
        [loja, nome, categoria, preco, estoque, ean, codigoLoja, `${nome}. Produto original com nota fiscal da loja e garantia.`],
      );
    }
  });
  return { lojas: LOJAS.length, produtos: PRODUTOS.length };
}

if (import.meta.main) {
  const config = carregarConfig();
  const db = await abrirDb(config);
  await migrar(db);
  const r = await semearDemo(db);
  console.log(r ? `gravados ${r.lojas} lojas e ${r.produtos} produtos` : 'o banco já tem lojas; nada foi gravado');
  await db.fechar();
}
