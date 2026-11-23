export const ACCOUNT_TYPES = {
  debito: 'Débito / ahorros',
  billetera: 'Billetera virtual',
  efectivo: 'Efectivo',
  credito: 'Tarjeta de crédito',
  ahorro: 'Ahorro / cajita',
  inversion: 'Inversión',
};

// Ids fijos: si dos dispositivos las crean, se fusionan en vez de duplicarse.
export const DEFAULT_CATEGORIES = [
  { id: 'cat-g-comida', name: 'Comida y restaurantes', kind: 'gasto' },
  { id: 'cat-g-mercado', name: 'Mercado', kind: 'gasto' },
  { id: 'cat-g-transporte', name: 'Transporte', kind: 'gasto' },
  { id: 'cat-g-vivienda', name: 'Vivienda y servicios', kind: 'gasto' },
  { id: 'cat-g-salud', name: 'Salud', kind: 'gasto' },
  { id: 'cat-g-educacion', name: 'Educación', kind: 'gasto' },
  { id: 'cat-g-ocio', name: 'Ocio y salidas', kind: 'gasto' },
  { id: 'cat-g-ropa', name: 'Ropa y compras', kind: 'gasto' },
  { id: 'cat-g-suscripciones', name: 'Suscripciones', kind: 'gasto' },
  { id: 'cat-g-regalos', name: 'Regalos', kind: 'gasto' },
  { id: 'cat-g-otros', name: 'Otros gastos', kind: 'gasto' },
  { id: 'cat-i-ingresos', name: 'Ingresos', kind: 'ingreso' },
  { id: 'cat-i-otros', name: 'Otros ingresos', kind: 'ingreso' },
];

export const SUGGESTED_ACCOUNTS = [
  { name: 'Nequi', type: 'billetera', currency: 'COP' },
  { name: 'Nubank débito', type: 'debito', currency: 'COP' },
  { name: 'Nubank crédito', type: 'credito', currency: 'COP' },
  { name: 'Rappi débito', type: 'debito', currency: 'COP' },
  { name: 'Rappi crédito', type: 'credito', currency: 'COP' },
  { name: 'Hapi', type: 'inversion', currency: 'USD' },
];
