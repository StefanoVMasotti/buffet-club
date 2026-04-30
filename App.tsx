import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import {
  createProduct,
  getActiveProducts,
  getLastSaleId,
  getProducts,
  getReceiptDataBySaleId,
  getTodaySalesSummary,
  getTodaySalesTotal,
  initDb,
  registerTicketPrint,
  saveSale,
  seedProducts,
  setProductActive,
} from './src/db/database';
import {
  getPrinterState,
  PrinterConnectionType,
  printReceipt,
  setPrinterConnectionStatus,
  setPrinterConnectionType,
} from './src/modules/printing/printerService';
import { formatCurrency } from './src/modules/sales/utils';
import { useCartStore } from './src/store/useCartStore';
import { Product, SaleSummary } from './src/types/models';

type ScreenMode = 'caja' | 'productos' | 'ventas';

function formatTime(dateText: string): string {
  const date = new Date(dateText);
  return date.toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function App() {
  const [screen, setScreen] = useState<ScreenMode>('caja');
  const [products, setProducts] = useState<Product[]>([]);
  const [allProducts, setAllProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<SaleSummary[]>([]);
  const [salesTotal, setSalesTotal] = useState(0);
  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [printerOnline, setPrinterOnline] = useState(true);
  const [connectionType, setConnectionType] = useState<PrinterConnectionType>('usb');

  const { items, addProduct, clearCart, total } = useCartStore();

  const reloadProducts = () => {
    setProducts(getActiveProducts());
    setAllProducts(getProducts());
  };

  const reloadSales = () => {
    setSales(getTodaySalesSummary());
    setSalesTotal(getTodaySalesTotal());
  };

  useEffect(() => {
    initDb();
    seedProducts();
    reloadProducts();
    reloadSales();
    const printer = getPrinterState();
    setPrinterOnline(printer.connected);
    setConnectionType(printer.connectionType);
  }, []);

  const totalAmount = total();

  const lines = useMemo(() => items.map((item) => `${item.qty}x ${item.name}`), [items]);

  const printSaleTicketById = async (saleId: string, isReprint: boolean) => {
    const receipt = getReceiptDataBySaleId(saleId);

    if (!receipt) {
      Alert.alert('Error', 'No se encontro la venta para imprimir ticket.');
      return;
    }

    try {
      const result = await printReceipt(receipt);
      registerTicketPrint(saleId, isReprint);
      Alert.alert('Ticket impreso', `Via: ${result.via.toUpperCase()}\n\n${result.preview}`);
    } catch (_error) {
      Alert.alert(
        'Impresora desconectada',
        connectionType === 'usb'
          ? 'No se pudo imprimir. Revisa cable USB/OTG y reintenta.'
          : 'No se pudo imprimir. Revisa Bluetooth y reintenta.',
      );
    }
  };

  const onCharge = async () => {
    if (!items.length) {
      Alert.alert('Carrito vacio', 'Agrega al menos un producto para cobrar.');
      return;
    }

    try {
      const { saleId } = saveSale({
        items,
        total: totalAmount,
        paymentMethod: 'cash',
      });

      clearCart();
      reloadSales();

      await printSaleTicketById(saleId, false);

      Alert.alert('Venta registrada', `Operacion: ${saleId}\nTotal: ${formatCurrency(totalAmount)}`);
    } catch (_error) {
      Alert.alert('Error', 'No se pudo guardar la venta en la base local.');
    }
  };

  const onReprintLast = async () => {
    const lastSaleId = getLastSaleId();

    if (!lastSaleId) {
      Alert.alert('Sin ventas', 'Todavia no hay operaciones para reimprimir.');
      return;
    }

    await printSaleTicketById(lastSaleId, true);
  };

  const onTogglePrinter = () => {
    const next = !printerOnline;
    setPrinterConnectionStatus(next);
    setPrinterOnline(next);
  };

  const onSelectConnectionType = (nextType: PrinterConnectionType) => {
    setPrinterConnectionType(nextType);
    setConnectionType(nextType);
  };

  const onCreateProduct = () => {
    const parsedPrice = Number(newPrice);

    if (!newName.trim()) {
      Alert.alert('Dato faltante', 'Ingresa el nombre del producto.');
      return;
    }

    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      Alert.alert('Precio invalido', 'Ingresa un precio mayor a 0.');
      return;
    }

    try {
      createProduct(newName, Math.round(parsedPrice));
      setNewName('');
      setNewPrice('');
      reloadProducts();
      Alert.alert('Producto creado', 'El producto ya esta disponible en Caja.');
    } catch (_error) {
      Alert.alert('Error', 'No se pudo crear el producto.');
    }
  };

  const onToggleProduct = (product: Product) => {
    try {
      const nextActive: 0 | 1 = product.active === 1 ? 0 : 1;
      setProductActive(product.id, nextActive);
      reloadProducts();
    } catch (_error) {
      Alert.alert('Error', 'No se pudo actualizar el estado del producto.');
    }
  };

  const header = (
    <View style={styles.headerRow}>
      <Text style={styles.title}>
        {screen === 'caja' ? 'Caja Buffet' : screen === 'productos' ? 'Productos' : 'Ventas'}
      </Text>
      <View style={styles.headerActions}>
        <Pressable style={styles.modeBtn} onPress={() => setScreen('caja')}>
          <Text style={styles.modeBtnText}>Caja</Text>
        </Pressable>
        <Pressable style={styles.modeBtn} onPress={() => setScreen('productos')}>
          <Text style={styles.modeBtnText}>Productos</Text>
        </Pressable>
        <Pressable
          style={styles.modeBtn}
          onPress={() => {
            reloadSales();
            setScreen('ventas');
          }}
        >
          <Text style={styles.modeBtnText}>Ventas</Text>
        </Pressable>
      </View>
    </View>
  );

  if (screen === 'productos') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        {header}
        <View style={styles.formBox}><Text style={styles.formTitle}>Nuevo producto</Text>
          <TextInput value={newName} onChangeText={setNewName} placeholder="Nombre (ej: Hamburguesa)" style={styles.input} />
          <TextInput value={newPrice} onChangeText={setNewPrice} placeholder="Precio (ej: 4500)" keyboardType="numeric" style={styles.input} />
          <Pressable style={styles.createBtn} onPress={onCreateProduct}><Text style={styles.createBtnText}>Crear producto</Text></Pressable>
        </View>
        <FlatList data={allProducts} keyExtractor={(item) => item.id} contentContainerStyle={styles.productList}
          renderItem={({ item }) => (
            <View style={styles.productRow}><View><Text style={styles.productRowName}>{item.name}</Text><Text style={styles.productRowPrice}>{formatCurrency(item.price)}</Text></View>
              <Pressable style={[styles.toggleBtn, item.active === 1 ? styles.disableBtn : styles.enableBtn]} onPress={() => onToggleProduct(item)}>
                <Text style={styles.toggleText}>{item.active === 1 ? 'Desactivar' : 'Activar'}</Text>
              </Pressable>
            </View>
          )}
        />
      </SafeAreaView>
    );
  }

  if (screen === 'ventas') {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="dark" />
        {header}
        <View style={styles.salesSummaryBox}><Text style={styles.salesSummaryText}>Ventas del dia: {sales.length}</Text><Text style={styles.salesSummaryTotal}>Total: {formatCurrency(salesTotal)}</Text></View>
        <FlatList data={sales} keyExtractor={(item) => item.id} contentContainerStyle={styles.salesList}
          ListEmptyComponent={<Text style={styles.emptyText}>Todavia no hay ventas hoy.</Text>}
          renderItem={({ item }) => (
            <View style={styles.saleRow}><View><Text style={styles.saleId}>Op: {item.id}</Text><Text style={styles.saleMeta}>{formatTime(item.created_at)} | Items: {item.items_count} | {item.payment_method ?? 'cash'}</Text></View><Text style={styles.saleTotal}>{formatCurrency(item.total)}</Text></View>
          )}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="dark" />
      {header}

      <View style={styles.printerBar}>
        <Text style={styles.printerStatus}>Conexion: {connectionType === 'usb' ? 'USB OTG' : 'Bluetooth'}</Text>
        <View style={styles.connectionRow}>
          <Pressable
            style={[styles.connectionBtn, connectionType === 'usb' && styles.connectionBtnActive]}
            onPress={() => onSelectConnectionType('usb')}
          >
            <Text style={styles.connectionText}>USB</Text>
          </Pressable>
          <Pressable
            style={[styles.connectionBtn, connectionType === 'bluetooth' && styles.connectionBtnActive]}
            onPress={() => onSelectConnectionType('bluetooth')}
          >
            <Text style={styles.connectionText}>BT</Text>
          </Pressable>
        </View>
        <Text style={styles.printerStatus}>Impresora: {printerOnline ? 'Conectada' : 'Desconectada'}</Text>
        <Pressable style={[styles.printerBtn, printerOnline ? styles.printerOn : styles.printerOff]} onPress={onTogglePrinter}>
          <Text style={styles.printerBtnText}>{printerOnline ? 'Simular corte' : 'Reconectar'}</Text>
        </Pressable>
        <Pressable style={styles.reprintBtn} onPress={onReprintLast}><Text style={styles.reprintBtnText}>Reimprimir ultima</Text></Pressable>
      </View>

      <FlatList data={products} keyExtractor={(item) => item.id} numColumns={2} contentContainerStyle={styles.grid} columnWrapperStyle={styles.row}
        renderItem={({ item }) => (
          <Pressable style={styles.productBtn} onPress={() => addProduct(item)}><Text style={styles.productName}>{item.name}</Text><Text style={styles.productPrice}>{formatCurrency(item.price)}</Text></Pressable>
        )}
      />

      <View style={styles.cartBox}>
        <Text style={styles.cartTitle}>Resumen</Text>
        <Text style={styles.cartItems}>{lines.length ? lines.join(' | ') : 'Sin items'}</Text>
        <Text style={styles.total}>Total: {formatCurrency(totalAmount)}</Text>
        <View style={styles.actions}>
          <Pressable style={[styles.actionBtn, styles.clearBtn]} onPress={clearCart}><Text style={styles.actionText}>Limpiar</Text></Pressable>
          <Pressable style={[styles.actionBtn, styles.chargeBtn]} onPress={() => void onCharge()}><Text style={styles.actionText}>Cobrar e Imprimir</Text></Pressable>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f6f8', paddingHorizontal: 12, paddingTop: 8 },
  headerRow: { gap: 8, marginBottom: 8 },
  headerActions: { flexDirection: 'row', gap: 8 },
  title: { fontSize: 24, fontWeight: '700', color: '#0f172a' },
  modeBtn: { backgroundColor: '#0f172a', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
  modeBtnText: { color: '#f8fafc', fontWeight: '700' },
  printerBar: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#dbe2ea', padding: 10, marginBottom: 8, gap: 6 },
  printerStatus: { fontWeight: '700', color: '#334155' },
  connectionRow: { flexDirection: 'row', gap: 8 },
  connectionBtn: { backgroundColor: '#e2e8f0', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 14 },
  connectionBtnActive: { backgroundColor: '#93c5fd' },
  connectionText: { fontWeight: '700', color: '#1e293b' },
  printerBtn: { borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  printerOn: { backgroundColor: '#fde68a' },
  printerOff: { backgroundColor: '#86efac' },
  printerBtnText: { fontWeight: '700', color: '#1f2937' },
  reprintBtn: { backgroundColor: '#bfdbfe', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  reprintBtnText: { fontWeight: '700', color: '#1e3a8a' },
  grid: { paddingBottom: 12 },
  row: { gap: 8 },
  productBtn: { flex: 1, backgroundColor: '#ffffff', borderRadius: 10, padding: 14, marginVertical: 4, borderWidth: 1, borderColor: '#dbe2ea', minHeight: 86, justifyContent: 'space-between' },
  productName: { fontSize: 16, fontWeight: '600', color: '#111827' },
  productPrice: { fontSize: 18, fontWeight: '700', color: '#0f766e' },
  cartBox: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#dbe2ea', padding: 12, marginBottom: 12 },
  cartTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a' },
  cartItems: { marginTop: 6, fontSize: 13, color: '#334155', minHeight: 18 },
  total: { marginTop: 10, fontSize: 24, fontWeight: '800', color: '#111827' },
  actions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  actionBtn: { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  clearBtn: { backgroundColor: '#cbd5e1' },
  chargeBtn: { backgroundColor: '#16a34a' },
  actionText: { color: '#0f172a', fontWeight: '700', fontSize: 16 },
  formBox: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#dbe2ea', padding: 12, marginBottom: 12 },
  formTitle: { fontSize: 16, fontWeight: '700', color: '#0f172a', marginBottom: 8 },
  input: { backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 10, marginBottom: 8 },
  createBtn: { backgroundColor: '#0ea5e9', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  createBtnText: { color: '#f8fafc', fontWeight: '700' },
  productList: { paddingBottom: 16, gap: 8 },
  productRow: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#dbe2ea', borderRadius: 10, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  productRowName: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  productRowPrice: { marginTop: 2, color: '#0f766e', fontWeight: '700' },
  toggleBtn: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  disableBtn: { backgroundColor: '#fca5a5' },
  enableBtn: { backgroundColor: '#86efac' },
  toggleText: { color: '#1e293b', fontWeight: '700' },
  salesSummaryBox: { backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#dbe2ea', padding: 12, marginBottom: 12 },
  salesSummaryText: { fontSize: 16, color: '#0f172a', fontWeight: '600' },
  salesSummaryTotal: { marginTop: 4, fontSize: 22, color: '#111827', fontWeight: '800' },
  salesList: { paddingBottom: 16, gap: 8 },
  saleRow: { backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#dbe2ea', borderRadius: 10, padding: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  saleId: { fontSize: 13, color: '#334155' },
  saleMeta: { marginTop: 4, fontSize: 13, color: '#475569' },
  saleTotal: { fontSize: 18, fontWeight: '800', color: '#0f766e' },
  emptyText: { color: '#64748b', textAlign: 'center', marginTop: 18 },
});
