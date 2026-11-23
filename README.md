# Finanzas personales

App web instalable (PWA) que guarda tus datos en el dispositivo y los sincroniza entre PC y celular mediante **un archivo cifrado en un repositorio privado de GitHub**. No hay servidor propio ni nada encendido 24/7.

## Probar en tu PC antes de publicar

**No abras `index.html` con doble clic**: el navegador bloquea los módulos y el cifrado en `file://` y no funciona nada. En su lugar, dentro de la carpeta:

```
python3 -m http.server 8000
```

(en Windows puede ser `python -m http.server 8000`) y abre `http://localhost:8000`. Para usarla en el celular necesitas publicarla en GitHub Pages (pasos abajo), porque `localhost` solo existe en tu PC.

## Cómo funciona la privacidad

- El código de la app va en un repositorio **público** (para GitHub Pages). No contiene datos.
- Tus datos van en un repositorio **privado** distinto, en un solo archivo (`datos.enc.json`) cifrado en tu dispositivo con AES-GCM. La contraseña nunca se sube.
- Si pierdes la contraseña, los datos no se pueden recuperar. Guárdala en tu gestor de contraseñas.

## Puesta en marcha

### 1. Crear los dos repositorios en GitHub

| Repositorio | Visibilidad | Contenido |
|---|---|---|
| `finanzas-app` | Público | Los archivos de este zip |
| `finanzas-datos` | **Privado** | Solo un README inicial (márcalo al crearlo: "Add a README file") |

### 2. Publicar la app

1. En `finanzas-app`: **Add file → Upload files** y arrastra todos los archivos del zip (sin la carpeta contenedora; `test-sync.mjs` es opcional).
2. **Settings → Pages → Build and deployment**: Source "Deploy from a branch", rama `main`, carpeta `/ (root)`.
3. Espera uno o dos minutos. La app queda en `https://TU-USUARIO.github.io/finanzas-app/`.

### 3. Crear el token de acceso

1. GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained tokens → Generate new token**.
2. **Repository access → Only select repositories** → elige solo `finanzas-datos`.
3. **Permissions → Repository permissions → Contents: Read and write**.
4. Elige una fecha de vencimiento y copia el token (solo se muestra una vez). Anota cuándo vence: ese día habrá que crear otro.

### 4. Configurar el primer dispositivo (PC)

1. Abre la URL de la app → pestaña **Ajustes**.
2. Usuario de GitHub, repositorio `finanzas-datos`, token. Rama y archivo se pueden dejar con sus valores por defecto.
3. **Guardar y sincronizar** → te pedirá crear la contraseña de cifrado.

### 5. Configurar el celular

1. Abre la misma URL y complétala igual: mismo usuario, repositorio y token, y **la misma contraseña**.
2. Instálala:
   - **Android (Chrome):** menú ⋮ → "Instalar app" o "Añadir a pantalla de inicio".
   - **iPhone (Safari):** botón Compartir → "Añadir a pantalla de inicio".

> Importante en iPhone: la app instalada y Safari guardan los datos por separado. Configura y usa siempre la misma (la instalada).

### 6. Probar

Crea una nota en la pestaña **Pruebas** en el PC, toca **Sincronizar**, y en el celular toca **Sincronizar**: debe aparecer. Prueba también marcarla como hecha y borrarla desde el otro lado.

## Cómo se sincroniza

- Al abrir la app, unos segundos después de cada cambio, al recuperar internet, y cuando pulsas **Sincronizar**.
- Cada registro tiene id, fecha de modificación y dispositivo. Al mezclar gana la modificación más reciente de cada registro; los borrados se propagan.
- Como se usan las horas de cada dispositivo, conviene tener la hora automática activada.
- Todo funciona sin internet; los cambios se envían cuando vuelvas a conectarte.

## Respaldo manual

En Ajustes: **Exportar respaldo** descarga un archivo cifrado; **Importar respaldo** lo mezcla con lo que ya tienes. Haz uno de vez en cuando.

## Actualizar la app

Sube los archivos nuevos al repositorio `finanzas-app`. La versión nueva se ve al abrir la app por segunda vez (la primera carga sirve la copia guardada y actualiza por detrás).

## Qué incluye la Fase 1

- **Resumen:** neto, disponible y deuda de tarjetas por moneda (COP y USD por separado), ingresos y gastos del mes, y la lista de cuentas.
- **Cuentas:** débito/ahorros, billetera virtual, efectivo, tarjeta de crédito e inversión, cada una en COP o USD. En las tarjetas pones la *deuda actual* y, si quieres, el *cupo*, y la app te muestra cuánto debes y cuánto te queda disponible.
- **Movimientos:** botón **＋** para registrar gasto, ingreso o transferencia. Las transferencias entre monedas piden también el monto que recibe la cuenta destino (por ejemplo, pesos que pasas a Hapi y los dólares que llegan). Pagar una tarjeta es una transferencia hacia ella.
- **Saldos calculados:** el saldo de cada cuenta es saldo inicial + movimientos; nunca se guarda un saldo, así que dos dispositivos no se pisan.
- **Totales del mes** sin contar transferencias (pagar la tarjeta no es un gasto nuevo: el gasto ya se registró al comprar).
- **Categorías** editables en Ajustes; las archivadas dejan de ofrecerse pero conservan sus movimientos viejos.
- Las "notas de prueba" de la Fase 0 ya no se muestran.

La primera vez, en **Resumen**, el botón *Crear cuentas sugeridas* crea Nequi, Nubank (débito y crédito), Rappi (débito y crédito) y Hapi con saldo en cero; toca cada una para poner su saldo.

## Qué incluye la Fase 2: deudas

Pestaña **Deudas** para lo que te deben (*Me deben*) y lo que debes a personas o entidades (*Debo*). Las tarjetas de crédito siguen en Cuentas.

- **Cada deuda** tiene persona o entidad, moneda, monto, fecha, vencimiento opcional y nota.
- **Abonos parciales:** tocas la deuda y registras abonos (o pagos, si es una deuda tuya) hasta saldarla. No deja abonar más de lo que falta.
- **Cuenta opcional:** si al crear la deuda o al abonar eliges una cuenta, el saldo de esa cuenta se mueve (te prestan: entra; prestas: sale; te pagan: entra; pagas: sale). Si no eliges cuenta, solo se lleva el registro de la deuda.
- **Marcar saldada** cierra una deuda a mano (por ejemplo si te la perdonan); queda en "Saldadas" y se puede reabrir.
- **Resumen:** el neto de cada moneda incluye lo que te deben y lo que debes, y aparece una sección **Vencimientos** con las deudas vencidas o que vencen en los próximos 7 días.
- **Movimientos** también lista los préstamos y abonos que tocan una cuenta, para que cada cambio de saldo tenga explicación. No cuentan como ingreso ni gasto del mes.
- Al **eliminar una deuda** se borran sus abonos y se revierte su efecto en las cuentas.

### Corte y pago de tarjetas

En una tarjeta de crédito (editar cuenta) puedes poner el **día de corte** y el **día límite de pago**. Con eso:

- La fila de la tarjeta muestra el próximo pago y cuánto toca pagar, y la fecha del próximo corte.
- Si el corte de ese pago ya ocurrió, el monto es la deuda que había al corte menos lo que has abonado desde entonces. Las compras posteriores al corte van al siguiente extracto.
- Si el corte aún no ocurre, el monto es un estimado ("aprox."): lo que debes hasta hoy, que puede crecer hasta el corte.
- Si el pago vence en los próximos 7 días, aparece en **Vencimientos** del Resumen. Al tocarlo se abre una transferencia hacia la tarjeta con el monto ya puesto; eliges desde qué cuenta pagas.

## Qué incluye la Fase 3: reportes y presupuesto

Pestaña **Reportes**. Arriba, una sola fila de filtros (mes y moneda) que controla todo lo de abajo:

- **Ingresos, gastos y balance** del mes, con la variación contra el mes anterior (▲/▼ en verde o rojo según si subir es bueno o malo).
- **Gastos por categoría:** barras ordenadas de mayor a menor, con el monto en la punta y el porcentaje. Si hay más de 8 categorías, las más pequeñas se agrupan en "Otras".
- **Presupuesto del mes:** defines un tope mensual por categoría (y por moneda) y ves cuánto llevas. Estados: ✓ holgado, ⚠ cerca del límite (desde el 80%) y ✕ excedido. El monto del presupuesto es el mismo cada mes.
- **Ingresos y gastos** de los últimos 6 meses en columnas.
- **Patrimonio neto** al cierre de cada mes: cuentas + lo que te deben − tarjetas y deudas. Se va llenando con el tiempo: al principio solo verás desde tu primer dato hasta hoy.

Pasa el dedo o el cursor por un gráfico para ver el detalle, y cada gráfico tiene "Ver como tabla" con los mismos datos. Las transferencias, los pagos de tarjeta y los préstamos no cuentan como ingreso ni gasto. Los presupuestos se sincronizan como el resto de tus datos.

## Meta de ahorro (cajita)

Para seguir cuánto ahorras cada mes en tu cajita de Nu:

1. Crea una cuenta de tipo **Ahorro / cajita** (por ejemplo "Nubank cajita"). En **Resumen**, el botón *Definir meta de ahorro* te lleva a crearla si aún no existe.
2. Define la **meta mensual** y, si quieres, la **anual** (si la dejas vacía, será 12 veces la mensual; si solo pones la anual, la mensual es la anual entre 12).
3. Cuando metas plata a la cajita, usa **＋ Aportar** en la tarjeta de ahorro (abre una transferencia hacia la cajita) o registra una transferencia normal.

Cómo se cuenta:
- **Aporte del mes** = lo que entra a la cajita por transferencia, menos lo que sacas de ella (retiros y gastos pagados desde ella).
- Los **rendimientos** (intereses) los registras como *ingreso* en la cajita; se muestran aparte y no cuentan como aporte tuyo, pero sí suben el saldo.
- La tarjeta del Resumen muestra el avance del mes y del año. Para la meta anual te dice cuánto necesitas ahorrar **al mes, de aquí a diciembre**, para llegar (⚠ si es más que tu meta mensual, ✓ si vas bien).
- En **Reportes** hay un gráfico con los aportes de cada mes del año y la línea de la meta.

Si empiezas a ahorrar a mitad de año, pon una meta anual acorde a los meses que quedan; si no, la app te avisará con ⚠ que no alcanzas con tu meta mensual.

## Fase 4: inversiones

Pestaña **Inversiones** para acciones y ETF (VOO, VXUS, NVDA, META, NU…). **Ajustes** pasó al botón ⚙ del encabezado.

- **Operaciones:** compra, venta y dividendo (＋). La cantidad admite fracciones (`0,0153`). El total se calcula con cantidad × precio (+/− comisión); si tu bróker te da otro total exacto, escríbelo y se usa ese.
- **Lo que ya tienes:** regístralo como una compra con fecha aproximada y deja la cuenta en *No afecta ninguna cuenta*. Si eliges una cuenta (por ejemplo Hapi), la compra resta de su saldo y la venta o el dividendo suman.
- **Costo promedio:** al vender se retira del costo la parte proporcional; la diferencia es la *ganancia realizada*. La *ganancia sin vender* es valor actual − costo. Dividendos aparte.
- **Ojo con no contar doble:** el saldo de una cuenta de inversión (Hapi) debe ser solo el efectivo; las acciones se cuentan aquí. En el **Resumen** el neto en USD suma las inversiones a su valor actual. En el gráfico de patrimonio de Reportes se suman **a costo** (no hay precios históricos).
- **Precios:** a mano (toca la posición → *Precio actual*) o automáticos con una clave gratis de [Twelve Data](https://twelvedata.com) (Ajustes → Precios de inversiones). La clave se guarda solo en el dispositivo. El plan gratis permite 8 consultas por minuto; la app pide todos los símbolos en una sola y consulta al entrar a la pestaña (máx. cada 10 min) o con *Actualizar precios*. Si falla (sin clave, límite, sin conexión o el navegador bloquea la consulta) se avisa y queda el último precio. Sin precio, la posición se valora a costo.
- Los precios y operaciones se sincronizan cifrados como lo demás.

### Dólar, ganancia en pesos e inflación

Para saber si de verdad ganas, la app también calcula en pesos (solo posiciones en USD):

- **Dólar de cada compra:** al registrar una compra en USD, el campo *Dólar ese día (TRM)* se llena solo con la TRM oficial de esa fecha (datos abiertos de la Superfinanciera, sin clave). Puedes corregirla a mano. Si no se pudo traer, usa **Buscar TRM faltantes** en la pestaña para completar las compras que no la tienen.
- **Dólar de hoy:** se trae al entrar a Inversiones (o con *Actualizar precios*); toca la tarjeta *Dólar e inflación* para escribirlo a mano.
- **Ganancia en pesos** = valor de hoy en pesos − lo que pagaste en pesos (cada compra al dólar de su día). Así ves el efecto del dólar: puedes ganar en dólares y perder en pesos, o al revés.
- **Ganancia real:** descuenta la inflación. Defines **una tasa anual** (la del IPC que publica el DANE) y la app la aplica a cada compra por los días que lleva. Es una aproximación: no usa el IPC mes a mes. Si pones la inflación en 0, real = nominal.
- La *ganancia realizada* (ventas) sigue en dólares.
- Los lotes se reducen en proporción al vender, igual que el costo promedio.

## Metas de ahorro con nombre

Al crear o editar una meta puedes ponerle un nombre (ej. "Fondo de emergencia"); si lo dejas vacío se usa el de la cuenta.

## Pruebas

- `node test-sync.mjs` (Node 18+): dos dispositivos y un GitHub falso (cifrado, contraseña incorrecta, ediciones, borrados, conflictos y respaldo).
- `node test-invest.mjs`: posiciones, costo promedio, fracciones, ventas sin respaldo, patrimonio y lectura de respuestas de precios.
- `node test-ledger.mjs`: lectura de montos (`12.500`, `1,234.56`…), saldos, totales del mes, filtros y resumen.
