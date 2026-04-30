export type Product = {
  id: string;
  name: string;
  price: number;
  active: number;
};

export type CartItem = {
  productId: string;
  name: string;
  qty: number;
  unitPrice: number;
};

export type SalePayload = {
  items: CartItem[];
  total: number;
  paymentMethod: 'cash' | 'transfer';
  cashierId?: string;
  deviceId?: string;
};

export type SaleSummary = {
  id: string;
  total: number;
  payment_method: string | null;
  created_at: string;
  items_count: number;
};

export type ReceiptItem = {
  name: string;
  qty: number;
  subtotal: number;
};

export type ReceiptData = {
  saleId: string;
  createdAt: string;
  paymentMethod: string;
  total: number;
  items: ReceiptItem[];
};
