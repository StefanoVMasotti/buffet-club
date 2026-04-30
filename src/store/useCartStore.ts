import { create } from 'zustand';
import { CartItem, Product } from '../types/models';

type CartState = {
  items: CartItem[];
  addProduct: (product: Product) => void;
  clearCart: () => void;
  total: () => number;
};

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  addProduct: (product) =>
    set((state) => {
      const found = state.items.find((i) => i.productId === product.id);
      if (found) {
        return {
          items: state.items.map((i) =>
            i.productId === product.id ? { ...i, qty: i.qty + 1 } : i,
          ),
        };
      }

      return {
        items: [
          ...state.items,
          {
            productId: product.id,
            name: product.name,
            qty: 1,
            unitPrice: product.price,
          },
        ],
      };
    }),
  clearCart: () => set({ items: [] }),
  total: () =>
    get().items.reduce((acc, item) => acc + item.qty * item.unitPrice, 0),
}));
