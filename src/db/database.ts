import * as SQLite from 'expo-sqlite';
import { Product, ReceiptData, SalePayload, SaleSummary } from '../types/models';

const db = SQLite.openDatabaseSync('buffetclub.db');

function buildId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

function toProductSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function initDb() {
  db.execSync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      price INTEGER NOT NULL,
      active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY NOT NULL,
      device_id TEXT,
      cashier_id TEXT,
      total INTEGER NOT NULL,
      payment_method TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      synced INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id TEXT PRIMARY KEY NOT NULL,
      sale_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      qty INTEGER NOT NULL,
      unit_price INTEGER NOT NULL,
      subtotal INTEGER NOT NULL,
      FOREIGN KEY (sale_id) REFERENCES sales(id)
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY NOT NULL,
      sale_id TEXT NOT NULL,
      printed_at TEXT DEFAULT CURRENT_TIMESTAMP,
      reprint_count INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (sale_id) REFERENCES sales(id)
    );

    CREATE TABLE IF NOT EXISTS cash_sessions (
      id TEXT PRIMARY KEY NOT NULL,
      cashier_id TEXT,
      opened_at TEXT DEFAULT CURRENT_TIMESTAMP,
      closed_at TEXT,
      opening_amount INTEGER NOT NULL DEFAULT 0,
      closing_amount INTEGER,
      synced INTEGER NOT NULL DEFAULT 0
    );
  `);
}

export function seedProducts() {
  const countResult = db.getFirstSync<{ count: number }>('SELECT COUNT(*) as count FROM products;');

  if (!countResult || countResult.count > 0) {
    return;
  }

  const initialProducts = [
    { id: 'vaso-gaseosa', name: 'Vaso Gaseosa', price: 2000 },
    { id: 'choripan', name: 'Choripan', price: 5000 },
    { id: 'papas-fritas', name: 'Papas Fritas', price: 3500 },
  ];

  for (const product of initialProducts) {
    db.runSync('INSERT INTO products (id, name, price, active) VALUES (?, ?, ?, 1);', [
      product.id,
      product.name,
      product.price,
    ]);
  }
}

export function getProducts(): Product[] {
  return db.getAllSync<Product>('SELECT id, name, price, active FROM products ORDER BY name ASC;');
}

export function getActiveProducts(): Product[] {
  return db.getAllSync<Product>(
    'SELECT id, name, price, active FROM products WHERE active = 1 ORDER BY name ASC;',
  );
}

export function createProduct(name: string, price: number): Product {
  const cleanName = name.trim();
  const productId = `${toProductSlug(cleanName)}-${Math.floor(Math.random() * 1000)}`;

  db.runSync('INSERT INTO products (id, name, price, active) VALUES (?, ?, ?, 1);', [
    productId,
    cleanName,
    price,
  ]);

  return { id: productId, name: cleanName, price, active: 1 };
}

export function setProductActive(productId: string, active: 0 | 1) {
  db.runSync('UPDATE products SET active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;', [
    active,
    productId,
  ]);
}

export function saveSale(payload: SalePayload): { saleId: string } {
  const saleId = buildId('sale');

  db.withTransactionSync(() => {
    db.runSync(
      `INSERT INTO sales (id, device_id, cashier_id, total, payment_method, synced)
       VALUES (?, ?, ?, ?, ?, 0);`,
      [
        saleId,
        payload.deviceId ?? null,
        payload.cashierId ?? null,
        payload.total,
        payload.paymentMethod,
      ],
    );

    for (const item of payload.items) {
      db.runSync(
        `INSERT INTO sale_items (id, sale_id, product_id, qty, unit_price, subtotal)
         VALUES (?, ?, ?, ?, ?, ?);`,
        [
          buildId('item'),
          saleId,
          item.productId,
          item.qty,
          item.unitPrice,
          item.qty * item.unitPrice,
        ],
      );
    }
  });

  return { saleId };
}

export function getTodaySalesSummary(): SaleSummary[] {
  return db.getAllSync<SaleSummary>(`
    SELECT
      s.id,
      s.total,
      s.payment_method,
      s.created_at,
      COALESCE(SUM(si.qty), 0) AS items_count
    FROM sales s
    LEFT JOIN sale_items si ON si.sale_id = s.id
    WHERE date(s.created_at, 'localtime') = date('now', 'localtime')
    GROUP BY s.id, s.total, s.payment_method, s.created_at
    ORDER BY s.created_at DESC;
  `);
}

export function getTodaySalesTotal(): number {
  const row = db.getFirstSync<{ total: number }>(`
    SELECT COALESCE(SUM(total), 0) AS total
    FROM sales
    WHERE date(created_at, 'localtime') = date('now', 'localtime');
  `);

  return row?.total ?? 0;
}

export function getReceiptDataBySaleId(saleId: string): ReceiptData | null {
  const sale = db.getFirstSync<{
    id: string;
    total: number;
    payment_method: string | null;
    created_at: string;
  }>('SELECT id, total, payment_method, created_at FROM sales WHERE id = ?;', [saleId]);

  if (!sale) {
    return null;
  }

  const items = db.getAllSync<{ name: string; qty: number; subtotal: number }>(
    `SELECT p.name, si.qty, si.subtotal
     FROM sale_items si
     INNER JOIN products p ON p.id = si.product_id
     WHERE si.sale_id = ?
     ORDER BY p.name ASC;`,
    [saleId],
  );

  return {
    saleId: sale.id,
    createdAt: sale.created_at,
    paymentMethod: sale.payment_method ?? 'cash',
    total: sale.total,
    items,
  };
}

export function getLastSaleId(): string | null {
  const row = db.getFirstSync<{ id: string }>('SELECT id FROM sales ORDER BY created_at DESC LIMIT 1;');
  return row?.id ?? null;
}

export function registerTicketPrint(saleId: string, isReprint: boolean) {
  const existing = db.getFirstSync<{ id: string; reprint_count: number }>(
    'SELECT id, reprint_count FROM tickets WHERE sale_id = ?;',
    [saleId],
  );

  if (!existing) {
    db.runSync('INSERT INTO tickets (id, sale_id, reprint_count) VALUES (?, ?, ?);', [
      buildId('ticket'),
      saleId,
      isReprint ? 1 : 0,
    ]);
    return;
  }

  db.runSync(
    'UPDATE tickets SET printed_at = CURRENT_TIMESTAMP, reprint_count = ? WHERE id = ?;',
    [isReprint ? existing.reprint_count + 1 : existing.reprint_count, existing.id],
  );
}
