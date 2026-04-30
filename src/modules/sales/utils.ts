import { CartItem } from '../../types/models';

export function formatCurrency(value: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(value);
}

export function buildPrintableSummary(items: CartItem[], total: number): string {
  const lines = items.map((item) => `${item.qty}x ${item.name} - ${formatCurrency(item.qty * item.unitPrice)}`);

  return `${lines.join('\\n')}\\n----------------\\nTOTAL ${formatCurrency(total)}`;
}
