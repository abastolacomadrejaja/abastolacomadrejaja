// ==========================================
// Configuración de Google Firebase & Firestore
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyAjsXX1nySfKF6jEW51_KjBhy14cbg4qgg",
  authDomain: "abastolacomadrejaja-5f725.firebaseapp.com",
  projectId: "abastolacomadrejaja-5f725",
  storageBucket: "abastolacomadrejaja-5f725.firebasestorage.app",
  messagingSenderId: "568366119296",
  appId: "1:568366119296:web:825660628b12b9a1af6965",
  measurementId: "G-H3NV01G36E"
};

let db = null;

function updateCloudBadge(status, text) {
    const badge = document.getElementById('cloud-status');
    if (!badge) return;
    if (status === 'online') {
        badge.innerHTML = `<i class="fas fa-cloud" style="color:var(--accent-primary);"></i> ${text || 'En la nube (En vivo)'}`;
    } else if (status === 'syncing') {
        badge.innerHTML = `<i class="fas fa-sync fa-spin"></i> ${text || 'Sincronizando...'}`;
    } else {
        badge.innerHTML = `<i class="fas fa-database"></i> ${text || 'Modo local'}`;
    }
}

// Inicializar Firebase Compat SDK si está presente en el navegador
if (typeof firebase !== 'undefined') {
    try {
        if (!firebase.apps.length) {
            firebase.initializeApp(firebaseConfig);
        }
        db = firebase.firestore();
        console.log("Firebase Firestore inicializado exitosamente.");
    } catch (e) {
        console.warn("Firebase no se pudo inicializar:", e);
    }
}

// Utilidad: UUID
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random() * 16 | 0, v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// 1. Estructura de Datos (JSON) para LocalStorage y Memoria
const defaultSettings = { 
    usd: 1, 
    cop: 4000, 
    ves: 876.80,
    bcvFechaValor: "Martes, 13 Octubre 2026",
    bcvLastUpdate: null 
};
let data = {
    settings: JSON.parse(localStorage.getItem('settings')) || defaultSettings,
    products: JSON.parse(localStorage.getItem('products')) || [],
    transactions: JSON.parse(localStorage.getItem('transactions')) || []
};

// Asegurar integridad inicial
if (!data.settings) data.settings = defaultSettings;
if (!data.settings.bcvFechaValor) data.settings.bcvFechaValor = defaultSettings.bcvFechaValor;
if (!data.products) data.products = [];
if (!data.transactions) data.transactions = [];

function saveData(syncTarget = 'all') {
    // 1. Persistencia local inmediata (offline first)
    localStorage.setItem('settings', JSON.stringify(data.settings));
    localStorage.setItem('products', JSON.stringify(data.products));
    localStorage.setItem('transactions', JSON.stringify(data.transactions));

    // 2. Si Firestore está conectado, sincronizar en la nube
    if (db) {
        if (syncTarget === 'all' || syncTarget === 'settings') {
            db.collection('config').doc('settings').set(data.settings).catch(e => console.warn("Firestore settings error:", e));
        }
        if (syncTarget === 'all' || syncTarget === 'products') {
            data.products.forEach(p => {
                db.collection('products').doc(p.id).set(p).catch(e => console.warn("Firestore product set error:", e));
            });
        }
        if (syncTarget === 'all' || syncTarget === 'transactions') {
            data.transactions.slice(-20).forEach(tx => {
                db.collection('transactions').doc(tx.id).set(tx).catch(e => console.warn("Firestore tx set error:", e));
            });
        }
    }
}

// Guardado inicial si es la primera vez
if (!localStorage.getItem('settings')) {
    saveData();
}

let cart = [];

// Formateadores de Moneda
const formatUSD = (val) => `$${parseFloat(val).toFixed(2)}`;
const formatCOP = (val) => `${(val * data.settings.cop).toLocaleString('es-CO')} COP`;
const formatVES = (val) => `${(val * data.settings.ves).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES`;

// DOM y Navegación Bottom Navigation
const navItems = document.querySelectorAll('.nav-item');
const views = document.querySelectorAll('.view');
const modals = document.querySelectorAll('.modal');
const closeBtns = document.querySelectorAll('.close-modal');

navItems.forEach(item => {
    item.addEventListener('click', () => {
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        
        const targetId = item.getAttribute('data-target');
        views.forEach(v => {
            v.classList.remove('active');
            if (v.id === targetId) v.classList.add('active');
        });
        updateViews();
    });
});

closeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const modalId = btn.getAttribute('data-modal');
        if(modalId) document.getElementById(modalId).classList.remove('show');
    });
});

window.onclick = function(event) {
    modals.forEach(m => {
        if (event.target === m) m.classList.remove('show');
    });
}

// Botones de acción del Dashboard (Balance)
document.getElementById('btn-goto-pos').addEventListener('click', () => {
    document.querySelector('.nav-item[data-target="view-pos"]').click();
});

document.getElementById('btn-goto-expense').addEventListener('click', () => {
    document.getElementById('form-expense').reset();
    document.getElementById('modal-expense').classList.add('show');
});

// Inicialización de la App
document.addEventListener('DOMContentLoaded', () => {
    updateViews();
    initFirestoreRealtime();
    fetchBCVRate(false); // Consulta automática silenciosa de la tasa oficial del BCV al abrir la app
    // Actualización periódica en segundo plano cada 30 minutos mientras la app esté abierta
    setInterval(() => {
        fetchBCVRate(false);
    }, 30 * 60 * 1000);
});

function updateViews() {
    renderBalance();
    renderInventory();
    renderPOSProducts(document.getElementById('pos-search') ? document.getElementById('pos-search').value : '');
    renderSettings();
}

// ==========================================
// Sincronización en Tiempo Real con Firestore
// ==========================================
function initFirestoreRealtime() {
    if (!db) {
        updateCloudBadge('local', 'Modo local');
        return;
    }

    updateCloudBadge('syncing', 'Conectando...');

    // 1. Escuchar productos en tiempo real
    db.collection('products').onSnapshot((snapshot) => {
        if (!snapshot.empty) {
            localStorage.setItem('cloud_products_synced', 'true');
            const cloudProds = [];
            snapshot.forEach(doc => cloudProds.push(doc.data()));
            data.products = cloudProds;
            localStorage.setItem('products', JSON.stringify(data.products));
            renderInventory();
            renderPOSProducts(document.getElementById('pos-search') ? document.getElementById('pos-search').value : '');
        } else {
            if (!localStorage.getItem('cloud_products_synced') && data.products.length > 0) {
                // Solo en la primera sincronización si la nube nunca tuvo datos
                localStorage.setItem('cloud_products_synced', 'true');
                data.products.forEach(p => db.collection('products').doc(p.id).set(p));
            } else {
                // Si se eliminaron todos los productos en la nube, vaciar también localmente
                localStorage.setItem('cloud_products_synced', 'true');
                data.products = [];
                localStorage.setItem('products', JSON.stringify(data.products));
                renderInventory();
                renderPOSProducts(document.getElementById('pos-search') ? document.getElementById('pos-search').value : '');
            }
        }
        updateCloudBadge('online', 'En la nube (En vivo)');
    }, (error) => {
        console.warn("Firestore Productos:", error.message);
        if (error.code === 'permission-denied') {
            updateCloudBadge('local', 'Requiere Reglas Firestore');
        } else {
            updateCloudBadge('local', 'Modo local');
        }
    });

    // 2. Escuchar transacciones en tiempo real
    db.collection('transactions').onSnapshot((snapshot) => {
        if (!snapshot.empty) {
            localStorage.setItem('cloud_tx_synced', 'true');
            const cloudTx = [];
            snapshot.forEach(doc => cloudTx.push(doc.data()));
            cloudTx.sort((a, b) => b.date - a.date);
            data.transactions = cloudTx;
            localStorage.setItem('transactions', JSON.stringify(data.transactions));
            renderBalance();
        } else {
            if (!localStorage.getItem('cloud_tx_synced') && data.transactions.length > 0) {
                localStorage.setItem('cloud_tx_synced', 'true');
                data.transactions.slice(-20).forEach(tx => db.collection('transactions').doc(tx.id).set(tx));
            } else {
                // Si se borraron las transacciones en la nube, dejar balance en cero
                localStorage.setItem('cloud_tx_synced', 'true');
                data.transactions = [];
                localStorage.setItem('transactions', JSON.stringify(data.transactions));
                renderBalance();
            }
        }
    }, (error) => {
        console.warn("Firestore Transacciones:", error.message);
    });

    // 3. Escuchar tasas de cambio en tiempo real
    db.collection('config').doc('settings').onSnapshot((doc) => {
        if (doc.exists) {
            const cloudSettings = doc.data();
            const hasRecentBCV = cloudSettings && cloudSettings.bcvFechaValor && cloudSettings.ves && Number(cloudSettings.ves) > 100;

            data.settings = { ...data.settings, ...cloudSettings };
            localStorage.setItem('settings', JSON.stringify(data.settings));
            updateViews();
            renderCart();

            // Si los datos en la nube tienen tasa antigua o no tienen fecha valor del BCV, consultar y actualizar la nube
            if (!hasRecentBCV) {
                console.log("Firestore settings sin sincronización BCV reciente, consultando tasa oficial...");
                fetchBCVRate(false);
            }
        } else {
            db.collection('config').doc('settings').set(data.settings);
        }
    }, (error) => {
        console.warn("Firestore Settings:", error.message);
    });
}

// ==========================================
// 4. Pantalla de Balance / Dashboard
// ==========================================
function renderBalance() {
    let sales = 0;
    let expenses = 0;
    
    data.transactions.forEach(tx => {
        const amount = parseFloat(tx.total) || 0;
        if (tx.type === 'out') sales += amount; // Ventas = Entrada de dinero
        else if (tx.type === 'in') expenses += amount; // Compras/Gastos = Salida de dinero
        else if (tx.type === 'baja') expenses -= amount; // Baja de inventario reversa el gasto
    });
    
    if (sales < 0) sales = 0;
    if (expenses < 0) expenses = 0;

    // Redondear para evitar residuos decimales (-0.00)
    sales = Math.round(sales * 100) / 100;
    expenses = Math.round(expenses * 100) / 100;
    const profit = Math.round((sales - expenses) * 100) / 100;

    document.getElementById('dash-profit').innerText = formatUSD(Object.is(profit, -0) ? 0 : profit);
    document.getElementById('dash-sales').innerText = formatUSD(sales);
    document.getElementById('dash-expenses').innerText = formatUSD(expenses);
    
    // Renderizar Lista de Transacciones (Feed)
    const feedList = document.getElementById('feed-list');
    feedList.innerHTML = '';
    const recent = [...data.transactions].sort((a, b) => b.date - a.date).slice(0, 20);
    
    if(recent.length === 0) {
        feedList.innerHTML = '<p style="text-align:center; color:#888;">No hay movimientos registrados</p>';
    }
    
    recent.forEach(tx => {
        const isSale = tx.type === 'out';
        const isBaja = tx.type === 'baja';
        const iconClass = isSale ? 'fa-arrow-down' : (isBaja ? 'fa-undo' : 'fa-arrow-up');
        const iconBg = (isSale || isBaja) ? 'income' : 'expense';
        
        let desc = tx.desc;
        if (!desc) {
            desc = isSale ? `Venta (Factura ${tx.id.split('-')[0].toUpperCase()})` : `Compra Inventario`;
        }

        const amountColor = isSale ? 'text-green' : (isBaja ? 'text-green' : 'text-red');
        const sign = isSale ? '+' : (isBaja ? 'Reverso ' : '-');
        const dateStr = new Date(tx.date).toLocaleDateString('es-ES', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
        const isOpen = expandedTxIds.has(tx.id);
        
        feedList.innerHTML += `
            <div class="feed-item feed-item-expandable ${isOpen ? 'open' : ''}" style="flex-direction:column; align-items:stretch; gap:0;">
                <div style="display:flex; align-items:center; gap:15px; cursor:pointer;" onclick="toggleTxDetail('${tx.id}')">
                    <div class="feed-icon ${iconBg}"><i class="fas ${iconClass}"></i></div>
                    <div class="feed-details">
                        <div class="feed-desc">${desc}</div>
                        <div class="feed-date">${dateStr}</div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div class="feed-amount ${amountColor}">${sign}${formatUSD(tx.total)}</div>
                        <i class="fas fa-chevron-${isOpen ? 'up' : 'down'}" style="color:#999; font-size:12px; width:14px; text-align:center;"></i>
                    </div>
                </div>
                <div class="feed-detail-panel" style="display:${isOpen ? 'block' : 'none'}; margin-top:12px; padding-top:12px; border-top:1px dashed #ccc; font-size:13px; color:#444;">
                    ${buildTxDetailHtml(tx)}
                </div>
            </div>
        `;
    });
}

const expandedTxIds = new Set();

window.toggleTxDetail = (txId) => {
    if (expandedTxIds.has(txId)) expandedTxIds.delete(txId);
    else expandedTxIds.add(txId);
    renderBalance();
};

function buildTxDetailHtml(tx) {
    const isSale = tx.type === 'out';
    const isBaja = tx.type === 'baja';
    const typeLabel = isSale ? 'Venta (Entrada de dinero)' : (isBaja ? 'Reverso por baja de inventario' : 'Gasto / Compra (Salida de dinero)');
    const fullDate = new Date(tx.date).toLocaleString('es-VE', { dateStyle: 'long', timeStyle: 'short' });
    const vesRate = (tx.ratesAtTime && tx.ratesAtTime.ves) || data.settings.ves;
    const copRate = (tx.ratesAtTime && tx.ratesAtTime.cop) || data.settings.cop;
    const total = parseFloat(tx.total) || 0;

    let itemsHtml = '';
    if (tx.items && tx.items.length > 0) {
        itemsHtml = '<div style="margin:8px 0 4px; font-weight:bold; color:#222;">Productos:</div>';
        tx.items.forEach(item => {
            const prod = data.products.find(p => p.id === item.productId);
            const name = item.name || (prod ? prod.name : 'Producto eliminado');
            const unit = parseFloat(item.priceAtTime) || 0;
            itemsHtml += `
                <div style="display:flex; justify-content:space-between; gap:8px; margin-bottom:3px;">
                    <span>${item.qty} x ${name} <small style="color:#888;">(${formatUSD(unit)} c/u)</small></span>
                    <strong>${formatUSD(unit * item.qty)}</strong>
                </div>`;
        });
    } else {
        itemsHtml = '<div style="margin:6px 0; color:#888;">Sin productos asociados (movimiento directo).</div>';
    }

    return `
        <div style="display:flex; justify-content:space-between; margin-bottom:3px;"><span>Tipo:</span><strong>${typeLabel}</strong></div>
        <div style="display:flex; justify-content:space-between; margin-bottom:3px;"><span>Fecha:</span><strong>${fullDate}</strong></div>
        <div style="display:flex; justify-content:space-between; margin-bottom:3px;"><span>Referencia:</span><strong>${tx.id.split('-')[0].toUpperCase()}</strong></div>
        ${itemsHtml}
        <div style="border-top:1px solid #ddd; margin-top:8px; padding-top:6px;">
            <div style="display:flex; justify-content:space-between;"><span>Total USD:</span><strong>${formatUSD(total)}</strong></div>
            <div style="display:flex; justify-content:space-between;"><span>Equiv. COP:</span><span>${(total * copRate).toLocaleString('es-CO')} COP</span></div>
            <div style="display:flex; justify-content:space-between;"><span>Equiv. VES:</span><span>${(total * vesRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs</span></div>
            <div style="display:flex; justify-content:space-between; color:#888; font-size:11px;"><span>Tasa BCV aplicada:</span><span>${Number(vesRate).toLocaleString('es-VE')} Bs</span></div>
        </div>
        <div style="text-align:right; margin-top:10px;">
            <button type="button" class="btn btn-secondary btn-sm" onclick="deleteTransaction('${tx.id}')" style="font-size:12px; padding:6px 10px;">
                <i class="fas fa-trash" style="color:var(--accent-secondary);"></i> Eliminar movimiento
            </button>
        </div>
    `;
}

window.deleteTransaction = (txId) => {
    if (confirm('¿Deseas eliminar este movimiento del historial y recalcular el balance?')) {
        localStorage.setItem('cloud_tx_synced', 'true');
        data.transactions = data.transactions.filter(t => t.id !== txId);
        if (db) db.collection('transactions').doc(txId).delete().catch(e => console.warn(e));
        localStorage.setItem('transactions', JSON.stringify(data.transactions));
        updateViews();
    }
};

// Registro de Gastos Directos
document.getElementById('form-expense').addEventListener('submit', (e) => {
    e.preventDefault();
    const desc = document.getElementById('exp-desc').value;
    const amount = parseFloat(document.getElementById('exp-amount').value);

    const tx = {
        id: generateUUID(),
        type: 'in', // Gasto
        desc: desc,
        date: Date.now(),
        items: [],
        total: amount
    };

    data.transactions.push(tx);
    if (db) db.collection('transactions').doc(tx.id).set(tx).catch(e => console.warn(e));
    saveData('transactions');
    updateViews();
    document.getElementById('modal-expense').classList.remove('show');
});

// ==========================================
// 2. Módulo de Inventario
// ==========================================
function renderInventory() {
    const list = document.getElementById('inventory-list');
    list.innerHTML = '';
    if (data.products.length === 0) {
        list.innerHTML = `<p style="text-align:center; color:#888; margin-top:20px;">No hay productos registrados.</p>`;
        return;
    }

    data.products.forEach(p => {
        const isLow = p.stock < 5;
        list.innerHTML += `
            <div class="product-card-inv">
                <div class="prod-header">
                    <div>
                        <div class="prod-name">${p.name}</div>
                        <div class="prod-sku">SKU: ${p.sku}</div>
                    </div>
                    <div class="badge-stock ${isLow ? 'low' : ''}">${p.stock} unid.</div>
                </div>
                <div class="prod-prices">
                    <strong>${formatUSD(p.basePrice)}</strong>
                    <span>${formatCOP(p.basePrice)}</span>
                    <span>${formatVES(p.basePrice)}</span>
                </div>
                <div class="prod-actions">
                    <button class="btn btn-secondary btn-sm" onclick="editProduct('${p.id}')" title="Editar producto"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-primary btn-sm" onclick="openAdjustModal('${p.id}')"><i class="fas fa-exchange-alt"></i> Ajuste / Baja</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')" title="Eliminar producto"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `;
    });
}

document.getElementById('btn-new-product').addEventListener('click', () => {
    document.getElementById('form-product').reset();
    document.getElementById('prod-id').value = '';
    document.getElementById('modal-product-title').innerText = 'Nuevo Producto';
    document.getElementById('group-stock').style.display = 'block';
    document.getElementById('modal-product').classList.add('show');
});

document.getElementById('form-product').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('prod-id').value;
    const newProduct = {
        sku: document.getElementById('prod-sku').value,
        boxSku: document.getElementById('prod-box-sku').value.trim(),
        unitsPerBox: parseInt(document.getElementById('prod-box-units').value) || 1,
        name: document.getElementById('prod-name').value,
        cost: parseFloat(document.getElementById('prod-cost').value),
        basePrice: parseFloat(document.getElementById('prod-price').value),
        stock: parseInt(document.getElementById('prod-stock').value) || 0
    };

    if (id) {
        const idx = data.products.findIndex(p => p.id === id);
        newProduct.id = id;
        newProduct.stock = data.products[idx].stock;
        data.products[idx] = newProduct;
    } else {
        newProduct.id = generateUUID();
        data.products.push(newProduct);
        if(newProduct.stock > 0) {
            const initTx = {
                id: generateUUID(),
                type: 'in',
                desc: `Entrada inicial: ${newProduct.name}`,
                date: Date.now(),
                items: [{productId: newProduct.id, qty: newProduct.stock, priceAtTime: newProduct.cost}],
                total: newProduct.cost * newProduct.stock
            };
            data.transactions.push(initTx);
            if (db) db.collection('transactions').doc(initTx.id).set(initTx).catch(e => console.warn(e));
        }
    }

    if (db) db.collection('products').doc(newProduct.id).set(newProduct).catch(e => console.warn(e));
    saveData('products');
    updateViews();
    document.getElementById('modal-product').classList.remove('show');
});

window.editProduct = (id) => {
    const p = data.products.find(x => x.id === id);
    if(!p) return;
    document.getElementById('prod-id').value = p.id;
    document.getElementById('prod-sku').value = p.sku;
    document.getElementById('prod-box-sku').value = p.boxSku || '';
    document.getElementById('prod-box-units').value = p.unitsPerBox || 1;
    document.getElementById('prod-name').value = p.name;
    document.getElementById('prod-cost').value = p.cost;
    document.getElementById('prod-price').value = p.basePrice;
    document.getElementById('group-stock').style.display = 'none'; 
    document.getElementById('modal-product-title').innerText = 'Editar Producto';
    document.getElementById('modal-product').classList.add('show');
};

window.deleteProduct = (id) => {
    const p = data.products.find(x => x.id === id);
    const prodName = p ? p.name : 'este producto';
    if(confirm(`¿Está seguro de que desea eliminar "${prodName}" del inventario?\n\nSe eliminará el producto y se descontarán sus movimientos de inventario para que el balance quede actualizado.`)) {
        localStorage.setItem('cloud_products_synced', 'true');
        localStorage.setItem('cloud_tx_synced', 'true');

        data.products = data.products.filter(item => item.id !== id);
        if (db) db.collection('products').doc(id).delete().catch(e => console.warn(e));

        // Quitar también del carrito si estaba seleccionado
        cart = cart.filter(c => c.id !== id);
        renderCart();

        // Limpiar las transacciones de entrada/ajuste asociadas a este producto
        const txsToDelete = data.transactions.filter(tx => {
            if (tx.type === 'in' || tx.type === 'baja' || (tx.type === 'out' && (!tx.total || tx.total === 0))) {
                if (tx.items && tx.items.some(item => item.productId === id)) return true;
                if (p && tx.desc && tx.desc.includes(p.name)) return true;
            }
            return false;
        });

        txsToDelete.forEach(tx => {
            if (db) db.collection('transactions').doc(tx.id).delete().catch(e => console.warn(e));
        });
        const deleteIds = new Set(txsToDelete.map(t => t.id));
        data.transactions = data.transactions.filter(tx => !deleteIds.has(tx.id));

        // Si ya no queda ningún producto en el inventario, limpiar cualquier movimiento de compra/merma huérfano
        if (data.products.length === 0) {
            const orphanInvTxs = data.transactions.filter(tx => 
                tx.type === 'baja' || 
                (tx.type === 'out' && (!tx.total || tx.total === 0)) ||
                (tx.type === 'in' && ((tx.items && tx.items.length > 0) || (tx.desc && (tx.desc.startsWith('Entrada inicial:') || tx.desc.startsWith('Compra inv:')))))
            );
            orphanInvTxs.forEach(tx => {
                if (db) db.collection('transactions').doc(tx.id).delete().catch(e => console.warn(e));
            });
            const orphanIds = new Set(orphanInvTxs.map(t => t.id));
            data.transactions = data.transactions.filter(tx => !orphanIds.has(tx.id));
        }

        localStorage.setItem('products', JSON.stringify(data.products));
        localStorage.setItem('transactions', JSON.stringify(data.transactions));
        updateViews();
    }
};

function updateAdjustModalUI() {
    const id = document.getElementById('adjust-prod-id').value;
    const p = data.products.find(x => x.id === id);
    const typeSelect = document.getElementById('adjust-type');
    const qtyInput = document.getElementById('adjust-qty');
    const bajaOptions = document.getElementById('adjust-baja-options');
    if (!typeSelect || !qtyInput) return;

    const type = typeSelect.value;
    if (type === 'in') {
        if (bajaOptions) bajaOptions.style.display = 'none';
        qtyInput.readOnly = false;
        qtyInput.min = "1";
    } else if (type === 'out') {
        if (bajaOptions) bajaOptions.style.display = 'block';
        qtyInput.readOnly = false;
        qtyInput.min = "1";
    } else if (type === 'zero') {
        if (bajaOptions) bajaOptions.style.display = 'block';
        qtyInput.value = p ? p.stock : 0;
        qtyInput.min = "0";
        qtyInput.readOnly = true;
    }
}

const adjustTypeSelect = document.getElementById('adjust-type');
if (adjustTypeSelect) {
    adjustTypeSelect.addEventListener('change', updateAdjustModalUI);
}

const btnAdjustMax = document.getElementById('btn-adjust-max');
if (btnAdjustMax) {
    btnAdjustMax.addEventListener('click', () => {
        const id = document.getElementById('adjust-prod-id').value;
        const p = data.products.find(x => x.id === id);
        if (!p) return;
        const typeSelect = document.getElementById('adjust-type');
        if (typeSelect) typeSelect.value = 'zero';
        updateAdjustModalUI();
    });
}

window.openAdjustModal = (id, isBoxScan = false) => {
    const p = data.products.find(x => x.id === id);
    if(!p) return;
    document.getElementById('adjust-prod-id').value = p.id;
    document.getElementById('adjust-prod-name').innerText = `${p.name} (Stock Actual: ${p.stock} unid.)`;
    document.getElementById('form-adjust').reset();
    
    const reverseCheckbox = document.getElementById('adjust-reverse-cost');
    if (reverseCheckbox) reverseCheckbox.checked = true;

    if (isBoxScan && p.unitsPerBox) {
        document.getElementById('adjust-qty').value = p.unitsPerBox;
        document.getElementById('adjust-type').value = 'in';
    } else {
        document.getElementById('adjust-type').value = 'in';
    }

    updateAdjustModalUI();
    document.getElementById('modal-adjust').classList.add('show');
};

document.getElementById('form-adjust').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('adjust-prod-id').value;
    const type = document.getElementById('adjust-type').value;
    let qty = parseInt(document.getElementById('adjust-qty').value);
    const reverseCheckbox = document.getElementById('adjust-reverse-cost');
    const shouldReverseCost = reverseCheckbox ? reverseCheckbox.checked : true;
    
    const p = data.products.find(x => x.id === id);
    if (!p) return;

    if (type === 'zero') {
        qty = p.stock;
    }

    if ((type === 'out' || type === 'zero') && p.stock <= 0) {
        alert('El stock de este producto ya está en 0.');
        document.getElementById('modal-adjust').classList.remove('show');
        return;
    }
    
    if ((type === 'out' || type === 'zero') && qty > p.stock) {
        alert('Error: La cantidad a dar de baja es mayor al stock disponible.');
        return;
    }

    localStorage.setItem('cloud_products_synced', 'true');
    localStorage.setItem('cloud_tx_synced', 'true');

    if (type === 'in') {
        p.stock += qty;
        if (db) db.collection('products').doc(p.id).update({ stock: p.stock }).catch(e => console.warn(e));

        const tx = {
            id: generateUUID(),
            type: 'in',
            desc: `Compra inv: ${p.name}`,
            date: Date.now(),
            items: [{productId: id, qty: qty, priceAtTime: p.cost}],
            total: (parseFloat(p.cost) || 0) * qty
        };
        data.transactions.push(tx);
        if (db) db.collection('transactions').doc(tx.id).set(tx).catch(e => console.warn(e));
    } else {
        // Baja de inventario (parcial o total a 0)
        p.stock -= qty;
        if (p.stock < 0) p.stock = 0;
        if (db) db.collection('products').doc(p.id).update({ stock: p.stock }).catch(e => console.warn(e));

        if (shouldReverseCost) {
            if (p.stock === 0) {
                // Si el producto quedó en 0 unidades, eliminar sus registros de entrada/merma previos para que su gasto quede exactamente en $0.00
                const prodTxs = data.transactions.filter(tx => {
                    if (tx.type === 'in' || tx.type === 'baja' || (tx.type === 'out' && (!tx.total || tx.total === 0))) {
                        if (tx.items && tx.items.some(item => item.productId === id)) return true;
                        if (tx.desc && tx.desc.includes(p.name)) return true;
                    }
                    return false;
                });
                prodTxs.forEach(tx => {
                    if (db) db.collection('transactions').doc(tx.id).delete().catch(e => console.warn(e));
                });
                const prodTxIds = new Set(prodTxs.map(t => t.id));
                data.transactions = data.transactions.filter(tx => !prodTxIds.has(tx.id));
            } else {
                // Si es una baja parcial, descontar el costo de las entradas de este producto
                let remainingToDiscount = (parseFloat(p.cost) || 0) * qty;
                const prodInTxs = data.transactions.filter(tx => 
                    tx.type === 'in' && ((tx.items && tx.items.some(item => item.productId === id)) || (tx.desc && tx.desc.includes(p.name)))
                );

                for (let tx of prodInTxs) {
                    if (remainingToDiscount <= 0) break;
                    if (tx.total <= remainingToDiscount) {
                        remainingToDiscount -= tx.total;
                        tx.total = 0;
                    } else {
                        tx.total = Math.round((tx.total - remainingToDiscount) * 100) / 100;
                        remainingToDiscount = 0;
                        if (db) db.collection('transactions').doc(tx.id).set(tx).catch(e => console.warn(e));
                    }
                }

                // Borrar las entradas que hayan quedado en $0.00
                const zeroTxs = prodInTxs.filter(t => t.total <= 0);
                zeroTxs.forEach(tx => {
                    if (db) db.collection('transactions').doc(tx.id).delete().catch(e => console.warn(e));
                });
                const zeroIds = new Set(zeroTxs.map(t => t.id));
                data.transactions = data.transactions.filter(tx => !zeroIds.has(tx.id));

                // Si aún quedó monto por reversar, registrar un movimiento de reverso
                if (remainingToDiscount > 0.009) {
                    const bajaTx = {
                        id: generateUUID(),
                        type: 'baja',
                        desc: `Baja inv: ${p.name} (-${qty} unid.)`,
                        date: Date.now(),
                        items: [{productId: id, qty: qty, priceAtTime: p.cost}],
                        total: Math.round(remainingToDiscount * 100) / 100
                    };
                    data.transactions.push(bajaTx);
                    if (db) db.collection('transactions').doc(bajaTx.id).set(bajaTx).catch(e => console.warn(e));
                }
            }
        } else {
            // Si el usuario desmarcó descontar del gasto, solo registrar salida informativa en $0.00
            const tx = {
                id: generateUUID(),
                type: 'out',
                desc: `Ajuste/Merma: ${p.name} (-${qty} unid.)`,
                date: Date.now(),
                items: [{productId: id, qty: qty, priceAtTime: p.basePrice}],
                total: 0
            };
            data.transactions.push(tx);
            if (db) db.collection('transactions').doc(tx.id).set(tx).catch(e => console.warn(e));
        }
    }

    localStorage.setItem('products', JSON.stringify(data.products));
    localStorage.setItem('transactions', JSON.stringify(data.transactions));
    updateViews();
    document.getElementById('modal-adjust').classList.remove('show');
});

// ==========================================
// Opciones Globales: Dejar Todo en Cero
// ==========================================
window.openResetZeroModal = () => {
    const modal = document.getElementById('modal-reset-zero');
    if (modal) modal.classList.add('show');
};

async function clearFirestoreCollection(collectionName) {
    if (!db) return;
    try {
        const snapshot = await db.collection(collectionName).get();
        const batchPromises = [];
        snapshot.forEach(doc => {
            batchPromises.push(doc.ref.delete());
        });
        await Promise.all(batchPromises);
    } catch (e) {
        console.warn(`Error limpiando colección ${collectionName}:`, e);
    }
}

// Opción 1: Poner el stock de todos los productos en 0 y el Balance en $0.00
const btnZeroAllStock = document.getElementById('btn-zero-all-stock');
if (btnZeroAllStock) {
    btnZeroAllStock.addEventListener('click', async () => {
        if (!confirm('¿Confirmas dar de baja a todo el stock actual?\n\n• Todos los productos quedarán en 0 unidades (conservando nombres y precios).\n• Utilidad Total, Ventas y Gastos quedarán en $0.00.')) {
            return;
        }
        localStorage.setItem('cloud_products_synced', 'true');
        localStorage.setItem('cloud_tx_synced', 'true');

        // Poner stock en 0 para cada producto
        data.products.forEach(p => {
            p.stock = 0;
            if (db) db.collection('products').doc(p.id).set(p).catch(e => console.warn(e));
        });

        // Limpiar transacciones locales y en la nube
        const oldTxs = [...data.transactions];
        data.transactions = [];
        cart = [];

        localStorage.setItem('products', JSON.stringify(data.products));
        localStorage.setItem('transactions', JSON.stringify([]));
        renderCart();
        updateViews();

        if (db) {
            oldTxs.forEach(tx => db.collection('transactions').doc(tx.id).delete().catch(e => console.warn(e)));
            await clearFirestoreCollection('transactions');
        }

        document.getElementById('modal-reset-zero').classList.remove('show');
        alert('✅ Todo el stock ha sido puesto en 0 unidades y el Balance ha quedado en $0.00.');
    });
}

// Opción 2: Eliminar todos los productos del inventario y dejar todo en $0.00
const btnDeleteAllEverything = document.getElementById('btn-delete-all-everything');
if (btnDeleteAllEverything) {
    btnDeleteAllEverything.addEventListener('click', async () => {
        if (!confirm('⚠️ ¿Estás seguro de ELIMINAR TODO EL INVENTARIO y dejar todas las cuentas en $0.00?\n\nSe borrarán todos los productos y todos los movimientos registrados.')) {
            return;
        }
        localStorage.setItem('cloud_products_synced', 'true');
        localStorage.setItem('cloud_tx_synced', 'true');

        const oldProds = [...data.products];
        const oldTxs = [...data.transactions];

        data.products = [];
        data.transactions = [];
        cart = [];

        localStorage.setItem('products', JSON.stringify([]));
        localStorage.setItem('transactions', JSON.stringify([]));
        renderCart();
        updateViews();

        if (db) {
            oldProds.forEach(p => db.collection('products').doc(p.id).delete().catch(e => console.warn(e)));
            oldTxs.forEach(tx => db.collection('transactions').doc(tx.id).delete().catch(e => console.warn(e)));
            await Promise.all([
                clearFirestoreCollection('products'),
                clearFirestoreCollection('transactions')
            ]);
        }

        document.getElementById('modal-reset-zero').classList.remove('show');
        alert('✅ El inventario ha sido eliminado por completo y todas las cuentas están en $0.00.');
    });
}

// Opción 3: Solo reiniciar Balance y Movimientos a $0.00 (manteniendo inventario intacto)
const btnZeroOnlyBalance = document.getElementById('btn-zero-only-balance');
if (btnZeroOnlyBalance) {
    btnZeroOnlyBalance.addEventListener('click', async () => {
        if (!confirm('¿Deseas reiniciar el Balance (Utilidad, Ventas, Gastos) y los Últimos Movimientos a $0.00?\n\nTus productos y cantidades en inventario se mantendrán intactos.')) {
            return;
        }
        localStorage.setItem('cloud_tx_synced', 'true');

        const oldTxs = [...data.transactions];
        data.transactions = [];

        localStorage.setItem('transactions', JSON.stringify([]));
        updateViews();

        if (db) {
            oldTxs.forEach(tx => db.collection('transactions').doc(tx.id).delete().catch(e => console.warn(e)));
            await clearFirestoreCollection('transactions');
        }

        document.getElementById('modal-reset-zero').classList.remove('show');
        alert('✅ El Balance (Utilidad, Ventas y Gastos) ha quedado en $0.00.');
    });
}

// ==========================================
// 3. Módulo de Facturación (POS)
// ==========================================
function renderPOSProducts(filter = '') {
    const grid = document.getElementById('pos-grid');
    if (!grid) return;
    grid.innerHTML = '';
    const searchTerm = filter.toLowerCase().trim();
    
    const filtered = data.products.filter(p => 
        p.name.toLowerCase().includes(searchTerm) || 
        p.sku.toLowerCase().includes(searchTerm)
    );
    
    if(filtered.length === 0) {
        grid.innerHTML = '<p style="color:#888; grid-column: 1/-1; text-align:center; padding-top:20px;">No se encontraron productos</p>';
        return;
    }

    filtered.forEach(p => {
        const outOfStock = p.stock <= 0;
        grid.innerHTML += `
            <div class="pos-prod-card" style="${outOfStock ? 'opacity:0.5' : ''}" onclick="${outOfStock ? '' : `addToCart('${p.id}')`}">
                <h4>${p.name}</h4>
                <div class="price">${formatUSD(p.basePrice)}</div>
                <div class="price-small">${formatCOP(p.basePrice)}<br>${formatVES(p.basePrice)}</div>
                <div class="stock" style="${outOfStock ? 'color:var(--accent-secondary)' : ''}">Stock: ${p.stock}</div>
            </div>
        `;
    });
}

if (document.getElementById('pos-search')) {
    document.getElementById('pos-search').addEventListener('input', (e) => {
        renderPOSProducts(e.target.value);
    });
}

function addToCart(productId, qtyToAdd = 1) {
    const product = data.products.find(x => x.id === productId);
    const existing = cart.find(item => item.product.id === product.id);
    
    if (existing) {
        if (existing.qty + qtyToAdd <= product.stock) {
            existing.qty += qtyToAdd;
        } else {
            alert(`Solo hay ${product.stock} unidades disponibles.`);
        }
    } else {
        if (product.stock >= qtyToAdd) {
            cart.push({ product: product, qty: qtyToAdd });
        } else {
            alert(`Solo hay ${product.stock} unidades disponibles.`);
        }
    }
    renderCart();
}

window.removeFromCart = (productId) => {
    cart = cart.filter(item => item.product.id !== productId);
    renderCart();
};

window.updateCartQty = (productId, qtyStr) => {
    const item = cart.find(i => i.product.id === productId);
    if(item) {
        let qty = parseInt(qtyStr);
        if (isNaN(qty) || qty <= 0) {
            removeFromCart(productId);
            return;
        }
        if (qty > item.product.stock) {
            alert(`Stock máximo disponible: ${item.product.stock}`);
            item.qty = item.product.stock;
        } else {
            item.qty = qty;
        }
        renderCart();
    }
};

function renderCart() {
    const list = document.getElementById('cart-items');
    if (!list) return;
    list.innerHTML = '';
    let totalUSD = 0;

    if(cart.length === 0) {
        list.innerHTML = '<p style="color:#888; text-align:center; padding-top: 20px;">El carrito está vacío</p>';
    }

    cart.forEach(item => {
        const itemTotal = item.product.basePrice * item.qty;
        totalUSD += itemTotal;
        
        list.innerHTML += `
            <div class="cart-item">
                <div style="flex:1;">
                    <div class="cart-item-name">${item.product.name}</div>
                    <div class="cart-item-price">${formatUSD(item.product.basePrice)} c/u</div>
                </div>
                <div class="cart-qty-ctrl">
                    <input type="number" value="${item.qty}" min="1" max="${item.product.stock}" onchange="updateCartQty('${item.product.id}', this.value)">
                    <button class="btn btn-danger btn-sm" onclick="removeFromCart('${item.product.id}')"><i class="fas fa-times"></i></button>
                </div>
            </div>
        `;
    });

    document.getElementById('cart-total-usd').innerText = formatUSD(totalUSD);
    document.getElementById('cart-total-cop').innerText = formatCOP(totalUSD);
    document.getElementById('cart-total-ves').innerText = formatVES(totalUSD);

    document.getElementById('btn-checkout').disabled = cart.length === 0;
}

document.getElementById('btn-checkout').addEventListener('click', processPayment);

let currentTxForReceipt = null;
let currentCartForReceipt = null;

function processPayment() {
    if(cart.length === 0) return;
    
    let totalUSD = 0;
    const txItems = [];
    
    cart.forEach(item => {
        totalUSD += item.product.basePrice * item.qty;
        txItems.push({ 
            productId: item.product.id, 
            name: item.product.name,
            qty: item.qty, 
            priceAtTime: item.product.basePrice 
        });
        // Descontar inventario
        const p = data.products.find(x => x.id === item.product.id);
        if(p) {
            p.stock -= item.qty;
            if (db) db.collection('products').doc(p.id).update({ stock: p.stock }).catch(e => console.warn(e));
        }
    });

    const tx = {
        id: generateUUID(),
        type: 'out', // Venta
        desc: `Factura POS`,
        date: Date.now(),
        items: txItems,
        total: totalUSD,
        ratesAtTime: {
            cop: data.settings.cop,
            ves: data.settings.ves
        }
    };

    data.transactions.push(tx);
    if (db) db.collection('transactions').doc(tx.id).set(tx).catch(e => console.warn(e));
    saveData();
    
    // Guardar copia del carrito para la factura
    const completedCart = cart.map(item => ({
        qty: item.qty,
        product: { ...item.product }
    }));
    
    cart = [];
    if (document.getElementById('pos-search')) document.getElementById('pos-search').value = '';
    renderCart();
    updateViews();

    // Mostrar modal con opciones de entrega de factura (Imprimir o WhatsApp)
    openSaleCompleteModal(tx, completedCart);
}

// ==========================================
// Módulo: Facturación, Impresión y WhatsApp
// ==========================================
function openSaleCompleteModal(tx, cartItems) {
    currentTxForReceipt = tx;
    currentCartForReceipt = cartItems;

    populateReceiptData(tx, cartItems);

    const txCode = tx.id.split('-')[0].toUpperCase();
    const summaryBadge = document.getElementById('sale-summary-badge');
    if (summaryBadge) {
        summaryBadge.innerText = `Ref: ${txCode} • Total: ${formatUSD(tx.total)} (${formatVES(tx.total)})`;
    }

    const modal = document.getElementById('modal-sale-complete');
    if (modal) modal.classList.add('show');
}

function closeSaleCompleteModal() {
    const modal = document.getElementById('modal-sale-complete');
    if (modal) modal.classList.remove('show');
    const phoneInput = document.getElementById('client-whatsapp-phone');
    if (phoneInput) phoneInput.value = '';
}

function populateReceiptData(tx, cartItems) {
    const txCode = tx.id.split('-')[0].toUpperCase();
    const dateFormatted = new Date(tx.date).toLocaleString('es-VE', {
        dateStyle: 'short',
        timeStyle: 'medium'
    });

    const recId = document.getElementById('rec-id');
    const recDate = document.getElementById('rec-date');
    if (recId) recId.innerText = `Ref: ${txCode}`;
    if (recDate) recDate.innerText = dateFormatted;
    
    const itemsList = document.getElementById('rec-items');
    if (itemsList) {
        itemsList.innerHTML = '';
        cartItems.forEach(item => {
            const itemTotal = item.product.basePrice * item.qty;
            itemsList.innerHTML += `
                <div class="receipt-item">
                    <span class="item-qty">${item.qty}x</span>
                    <span class="item-name">${item.product.name}</span>
                    <span class="item-price">${formatUSD(itemTotal)}</span>
                </div>
            `;
        });
    }

    const vesRate = (tx.ratesAtTime && tx.ratesAtTime.ves) || data.settings.ves;
    const copRate = (tx.ratesAtTime && tx.ratesAtTime.cop) || data.settings.cop;

    const recUsd = document.getElementById('rec-usd');
    const recCop = document.getElementById('rec-cop');
    const recVes = document.getElementById('rec-ves');
    const recBcvRate = document.getElementById('rec-bcv-rate');

    if (recUsd) recUsd.innerText = formatUSD(tx.total);
    if (recCop) recCop.innerText = `${(tx.total * copRate).toLocaleString('es-CO')} COP`;
    if (recVes) recVes.innerText = `${(tx.total * vesRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES`;
    if (recBcvRate) recBcvRate.innerText = `1 USD = ${vesRate.toLocaleString('es-VE')} Bs`;

    // Poblar también el contenedor exclusivo de impresión térmica 58mm (PT-230)
    populateThermalPrintContainer(tx, cartItems);
}

function populateThermalPrintContainer(tx, cartItems) {
    const container = document.getElementById('thermal-print-container');
    if (!container || !tx) return;

    const txCode = tx.id.split('-')[0].toUpperCase();
    const dateFormatted = new Date(tx.date).toLocaleString('es-VE', {
        dateStyle: 'short',
        timeStyle: 'short'
    });
    const vesRate = (tx.ratesAtTime && tx.ratesAtTime.ves) || data.settings.ves;
    const copRate = (tx.ratesAtTime && tx.ratesAtTime.cop) || data.settings.cop;

    let itemsHtml = '';
    (cartItems || tx.items || []).forEach(item => {
        const name = item.product ? item.product.name : (item.name || 'Producto');
        const price = item.product ? item.product.basePrice : (item.priceAtTime || 0);
        const itemTotal = price * item.qty;
        itemsHtml += `
            <div class="tp-item">
                <span class="tp-item-left">${item.qty}x ${name}</span>
                <span class="tp-item-right">${formatUSD(itemTotal)}</span>
            </div>
        `;
    });

    container.innerHTML = `
        <div class="tp-header">
            <img src="LOGOTIPO%20LA%20COMADREJAJA.jpeg" alt="Logo" class="tp-logo">
            <div class="tp-title">Abasto La Comadrejaja</div>
            <div class="tp-info">Lomas Blancas Cordero</div>
            <div class="tp-info">Tel: +58 424-6439639</div>
        </div>
        <div class="tp-divider"></div>
        <div class="tp-meta">
            <div>Fecha: ${dateFormatted}</div>
            <div>Factura Ref: ${txCode}</div>
        </div>
        <div class="tp-divider"></div>
        <div>${itemsHtml}</div>
        <div class="tp-divider"></div>
        <div>
            <div class="tp-total-row tp-main">
                <span>TOTAL USD:</span>
                <span>${formatUSD(tx.total)}</span>
            </div>
            <div class="tp-total-row">
                <span>Equiv. COP:</span>
                <span>${(tx.total * copRate).toLocaleString('es-CO')}</span>
            </div>
            <div class="tp-total-row">
                <span>Equiv. VES:</span>
                <span>${(tx.total * vesRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs</span>
            </div>
            <div class="tp-total-row" style="font-size:9.5px;">
                <span>Tasa BCV:</span>
                <span>${vesRate.toLocaleString('es-VE')} Bs</span>
            </div>
        </div>
        <div class="tp-footer">
            <div>¡Gracias por su compra!</div>
            <div>Abasto La Comadrejaja</div>
        </div>
    `;
}

function printReceipt() {
    if (currentTxForReceipt) {
        populateThermalPrintContainer(currentTxForReceipt, currentCartForReceipt);
    }
    window.print();
}

// ==========================================
// Impresión Térmica Directa Bluetooth (PT-230 ESC/POS 58mm)
// ==========================================
let btPrinterDevice = null;
let btPrinterChar = null;

function cleanAsciiForThermal(str) {
    if (!str) return '';
    return String(str)
        .replace(/[áàäâ]/g, 'a').replace(/[ÁÀÄÂ]/g, 'A')
        .replace(/[éèëê]/g, 'e').replace(/[ÉÈËÊ]/g, 'E')
        .replace(/[íìïî]/g, 'i').replace(/[ÍÌÏÎ]/g, 'I')
        .replace(/[óòöô]/g, 'o').replace(/[ÓÒÖÔ]/g, 'O')
        .replace(/[úùüû]/g, 'u').replace(/[ÚÙÜÛ]/g, 'U')
        .replace(/ñ/g, 'n').replace(/Ñ/g, 'N')
        .replace(/[¡•]/g, '');
}

function formatLine32(leftText, rightText) {
    const left = cleanAsciiForThermal(leftText);
    const right = cleanAsciiForThermal(rightText);
    const maxLen = 32;
    const spaceNeeded = maxLen - left.length - right.length;
    if (spaceNeeded >= 1) {
        return left + ' '.repeat(spaceNeeded) + right + '\n';
    } else {
        // Si el nombre es muy largo, truncar el lado izquierdo para mantener la columna derecha alineada
        const maxLeft = Math.max(1, maxLen - right.length - 1);
        return left.substring(0, maxLeft) + ' ' + right + '\n';
    }
}

function buildEscPosBytes(tx, cartItems) {
    const encoder = new TextEncoder();
    const chunks = [];
    const pushBytes = (arr) => chunks.push(new Uint8Array(arr));
    const pushText = (txt) => chunks.push(encoder.encode(cleanAsciiForThermal(txt)));

    const txCode = tx.id.split('-')[0].toUpperCase();
    const dateStr = new Date(tx.date).toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' });
    const vesRate = (tx.ratesAtTime && tx.ratesAtTime.ves) || data.settings.ves;
    const copRate = (tx.ratesAtTime && tx.ratesAtTime.cop) || data.settings.cop;

    // 1. Inicializar impresora ESC @
    pushBytes([0x1B, 0x40]);
    // 2. Centrar texto ESC a 1
    pushBytes([0x1B, 0x61, 0x01]);
    // 3. Negrita ON
    pushBytes([0x1B, 0x45, 0x01]);
    pushText("ABASTO LA COMADREJAJA\n");
    // Negrita OFF
    pushBytes([0x1B, 0x45, 0x00]);
    pushText("Lomas Blancas Cordero\n");
    pushText("Tel: +58 424-6439639\n");
    pushText("--------------------------------\n");

    // 4. Alinear a la izquierda ESC a 0
    pushBytes([0x1B, 0x61, 0x00]);
    pushText(`Fecha: ${dateStr}\n`);
    pushText(`Factura Ref: ${txCode}\n`);
    pushText("--------------------------------\n");

    // 5. Lista de productos (32 columnas para 58mm)
    (cartItems || tx.items || []).forEach(item => {
        const name = item.product ? item.product.name : (item.name || 'Producto');
        const price = item.product ? item.product.basePrice : (item.priceAtTime || 0);
        const left = `${item.qty}x ${name}`;
        const right = `$${(price * item.qty).toFixed(2)}`;
        pushText(formatLine32(left, right));
    });

    pushText("--------------------------------\n");

    // 6. Totales
    pushBytes([0x1B, 0x45, 0x01]); // Negrita ON
    pushText(formatLine32("TOTAL USD:", `$${tx.total.toFixed(2)}`));
    pushBytes([0x1B, 0x45, 0x00]); // Negrita OFF

    pushText(formatLine32("Equiv. COP:", `${(tx.total * copRate).toLocaleString('es-CO')} COP`));
    pushText(formatLine32("Equiv. VES:", `${(tx.total * vesRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Bs`));
    pushText(formatLine32("Tasa BCV:", `${vesRate.toLocaleString('es-VE')} Bs`));
    pushText("--------------------------------\n");

    // 7. Pie de página centrado y avance exacto de 3 líneas (sin desperdiciar papel)
    pushBytes([0x1B, 0x61, 0x01]);
    pushText("Gracias por su compra!\n");
    pushText("Abasto La Comadrejaja\n\n\n");

    // Unir todos los bloques en un solo Uint8Array
    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const result = new Uint8Array(totalLength);
    let offset = 0;
    for (const c of chunks) {
        result.set(c, offset);
        offset += c.length;
    }
    return result;
}

async function connectBluetoothPrinter() {
    if (btPrinterDevice && btPrinterDevice.gatt && btPrinterDevice.gatt.connected && btPrinterChar) {
        return btPrinterChar;
    }

    const PRINT_SERVICES = [
        '000018f0-0000-1000-8000-00805f9b34fb',
        'e7810a71-73ae-499d-8c15-faa9aef0c3f2',
        '49535343-fe7d-4ae5-8fa9-9fafd205e455',
        '0000ff00-0000-1000-8000-00805f9b34fb',
        '0000ffe0-0000-1000-8000-00805f9b34fb',
        '0000ae30-0000-1000-8000-00805f9b34fb'
    ];

    btPrinterDevice = await navigator.bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: PRINT_SERVICES
    });

    const server = await btPrinterDevice.gatt.connect();
    const services = await server.getPrimaryServices();

    for (const service of services) {
        const characteristics = await service.getCharacteristics();
        for (const char of characteristics) {
            if (char.properties.write || char.properties.writeWithoutResponse) {
                btPrinterChar = char;
                return btPrinterChar;
            }
        }
    }

    throw new Error("No se encontró el canal de escritura en la impresora Bluetooth seleccionada.");
}

async function printViaBluetooth(tx, cartItems, btnEl = null) {
    if (!tx) return;

    if (!navigator.bluetooth) {
        alert("Tu navegador actual no tiene activado Web Bluetooth directo.\n\n• En Android o PC usa Google Chrome.\n• También puedes usar el botón 'Imprimir (Cable/PC)' que ya está ajustado a 58mm para la PT-230.");
        return;
    }

    const originalHtml = btnEl ? btnEl.innerHTML : '';
    if (btnEl) {
        btnEl.innerHTML = `<i class="fas fa-spinner fa-spin" style="font-size:20px;"></i><span>Conectando...</span>`;
        btnEl.disabled = true;
    }

    try {
        const char = await connectBluetoothPrinter();
        const bytes = buildEscPosBytes(tx, cartItems);

        // Enviar en fragmentos de 100 bytes para máxima compatibilidad con el buffer de la PT-230
        const chunkSize = 100;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const slice = bytes.slice(i, i + chunkSize);
            if (char.properties.writeWithoutResponse) {
                await char.writeValueWithoutResponse(slice);
            } else {
                await char.writeValue(slice);
            }
            await new Promise(r => setTimeout(r, 25));
        }
    } catch (err) {
        console.warn("Aviso Bluetooth PT-230:", err);
        btPrinterChar = null;
        if (err.name !== 'NotFoundError') {
            alert("No se pudo enviar a la impresora Bluetooth: " + (err.message || err) + "\n\nVerifica que la PT-230 esté encendida y con el Bluetooth disponible.");
        }
    } finally {
        if (btnEl) {
            btnEl.innerHTML = originalHtml;
            btnEl.disabled = false;
        }
    }
}

function getSampleTestReceipt() {
    const sampleTx = {
        id: 'PRUEBA58-0000',
        date: Date.now(),
        total: 3.50,
        ratesAtTime: {
            cop: data.settings.cop,
            ves: data.settings.ves
        }
    };
    const sampleItems = [
        { qty: 1, product: { name: 'Producto de Prueba 1', basePrice: 1.50 } },
        { qty: 2, product: { name: 'Producto de Prueba 2', basePrice: 1.00 } }
    ];
    return { sampleTx, sampleItems };
}

async function generateReceiptCanvas() {
    const receiptEl = document.getElementById('receipt-area');
    if (!receiptEl) return null;
    
    if (typeof html2canvas === 'undefined') {
        alert("Cargando componente de imagen... Por favor intente en un instante.");
        return null;
    }

    // Clonar el recibo y montarlo directamente en el body sin límites de overflow o max-height
    const clone = receiptEl.cloneNode(true);
    clone.id = 'receipt-render-clone';
    
    clone.style.position = 'fixed';
    clone.style.top = '0';
    clone.style.left = '0';
    clone.style.width = '320px';
    clone.style.minWidth = '320px';
    clone.style.maxWidth = '320px';
    clone.style.height = 'auto';
    clone.style.minHeight = 'auto';
    clone.style.maxHeight = 'none';
    clone.style.overflow = 'visible';
    clone.style.zIndex = '-99999';
    clone.style.background = '#ffffff';
    clone.style.boxShadow = 'none';
    clone.style.margin = '0';
    clone.style.padding = '18px 16px 26px 16px'; // Margen inferior generoso para que nunca se corte el pie

    document.body.appendChild(clone);

    // Esperar a que el navegador procese el renderizado en el layout
    await new Promise(r => setTimeout(r, 60));

    const totalHeight = Math.max(clone.scrollHeight, clone.offsetHeight);

    let canvas = null;
    try {
        canvas = await html2canvas(clone, {
            scale: 2,
            backgroundColor: '#ffffff',
            useCORS: true,
            allowTaint: true,
            logging: false,
            width: 320,
            height: totalHeight,
            windowWidth: 320,
            windowHeight: totalHeight + 100,
            x: 0,
            y: 0,
            scrollX: 0,
            scrollY: 0
        });
    } catch (err) {
        console.error("Error al generar imagen con html2canvas:", err);
    } finally {
        if (clone && clone.parentNode) {
            clone.parentNode.removeChild(clone);
        }
    }

    return canvas;
}

function generateWhatsAppTextMessage(tx, cartItems) {
    if (!tx) return '';
    const txCode = tx.id.split('-')[0].toUpperCase();
    const dateStr = new Date(tx.date).toLocaleString('es-VE');
    const vesRate = (tx.ratesAtTime && tx.ratesAtTime.ves) || data.settings.ves;
    const copRate = (tx.ratesAtTime && tx.ratesAtTime.cop) || data.settings.cop;

    let itemsStr = '';
    (cartItems || tx.items || []).forEach(item => {
        const name = item.product ? item.product.name : (item.name || 'Producto');
        const price = item.product ? item.product.basePrice : (item.priceAtTime || 0);
        itemsStr += `• ${item.qty}x ${name} - $${(price * item.qty).toFixed(2)}\n`;
    });

    return `🧾 *ABASTO LA COMADREJAJA*\n` +
           `📍 Lomas Blancas Cordero\n` +
           `📞 Tel: +58 424-6439639\n` +
           `--------------------------------\n` +
           `📄 *Factura Ref:* ${txCode}\n` +
           `📅 *Fecha:* ${dateStr}\n` +
           `--------------------------------\n` +
           `*Detalle de Compra:*\n` +
           itemsStr +
           `--------------------------------\n` +
           `💵 *Total USD:* $${tx.total.toFixed(2)}\n` +
           `🇨🇴 *COP:* ${(tx.total * copRate).toLocaleString('es-CO')} COP\n` +
           `🇻🇪 *VES (BCV):* ${(tx.total * vesRate).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} VES\n` +
           `--------------------------------\n` +
           `¡Gracias por su compra! 🙏`;
}

async function sendReceiptWhatsAppImage() {
    if (!currentTxForReceipt) return;
    const btn = document.getElementById('btn-action-whatsapp-img');
    const originalText = btn.innerHTML;
    btn.innerHTML = `<i class="fas fa-spinner fa-spin" style="font-size:24px;"></i><span>Generando...</span>`;
    btn.disabled = true;

    try {
        const canvas = await generateReceiptCanvas();
        if (!canvas) {
            btn.innerHTML = originalText;
            btn.disabled = false;
            return;
        }

        const txCode = currentTxForReceipt.id.split('-')[0].toUpperCase();
        const phoneInput = document.getElementById('client-whatsapp-phone');
        let rawPhone = phoneInput ? phoneInput.value.trim() : '';

        let cleanPhone = rawPhone.replace(/\D/g, '');
        if (cleanPhone.startsWith('0')) cleanPhone = '58' + cleanPhone.substring(1);
        else if (cleanPhone.length === 10 && (cleanPhone.startsWith('412') || cleanPhone.startsWith('414') || cleanPhone.startsWith('424') || cleanPhone.startsWith('416') || cleanPhone.startsWith('426'))) {
            cleanPhone = '58' + cleanPhone;
        }

        const textMessage = generateWhatsAppTextMessage(currentTxForReceipt, currentCartForReceipt);
        const fileName = `Factura-La-Comadrejaja-${txCode}.png`;

        canvas.toBlob(async (blob) => {
            const file = new File([blob], fileName, { type: 'image/png' });

            // En dispositivos móviles (Android / iOS) con soporte Web Share API de archivos:
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        title: `Factura ${txCode} - Abasto La Comadrejaja`,
                        text: textMessage,
                        files: [file]
                    });
                    btn.innerHTML = originalText;
                    btn.disabled = false;
                    return;
                } catch (shareErr) {
                    if (shareErr.name !== 'AbortError') {
                        console.warn("Share API error:", shareErr);
                    }
                }
            }

            // En PC o navegadores donde navigator.share no comparte archivos:
            // 1. Descargar la imagen
            downloadReceiptImageFromCanvas(canvas, fileName);

            // 2. Abrir WhatsApp con el detalle
            const waUrl = cleanPhone 
                ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(textMessage)}`
                : `https://api.whatsapp.com/send?text=${encodeURIComponent(textMessage)}`;

            window.open(waUrl, '_blank');

            alert(`✅ La imagen de la factura se descargó como "${fileName}".\n\nSe ha abierto WhatsApp con el detalle de la venta para que puedas adjuntarla.`);

            btn.innerHTML = originalText;
            btn.disabled = false;
        }, 'image/png');

    } catch (err) {
        console.error("Error al procesar WhatsApp Imagen:", err);
        alert("No se pudo generar la imagen automáticamente. Puede imprimirla o enviar el resumen de texto.");
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}

async function downloadReceiptImage() {
    const canvas = await generateReceiptCanvas();
    if (!canvas) return;
    const txCode = currentTxForReceipt ? currentTxForReceipt.id.split('-')[0].toUpperCase() : 'VENTA';
    downloadReceiptImageFromCanvas(canvas, `Factura-La-Comadrejaja-${txCode}.png`);
}

function downloadReceiptImageFromCanvas(canvas, filename) {
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL('image/png');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function sendReceiptWhatsAppText() {
    if (!currentTxForReceipt) return;
    const phoneInput = document.getElementById('client-whatsapp-phone');
    let rawPhone = phoneInput ? phoneInput.value.trim() : '';

    let cleanPhone = rawPhone.replace(/\D/g, '');
    if (cleanPhone.startsWith('0')) cleanPhone = '58' + cleanPhone.substring(1);
    else if (cleanPhone.length === 10 && (cleanPhone.startsWith('412') || cleanPhone.startsWith('414') || cleanPhone.startsWith('424') || cleanPhone.startsWith('416') || cleanPhone.startsWith('426'))) {
        cleanPhone = '58' + cleanPhone;
    }

    const textMessage = generateWhatsAppTextMessage(currentTxForReceipt, currentCartForReceipt);
    const waUrl = cleanPhone 
        ? `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(textMessage)}`
        : `https://api.whatsapp.com/send?text=${encodeURIComponent(textMessage)}`;

    window.open(waUrl, '_blank');
}

// Event Listeners para modal de factura
const btnActionPrint = document.getElementById('btn-action-print');
if (btnActionPrint) btnActionPrint.addEventListener('click', printReceipt);

const btnActionBtPrint = document.getElementById('btn-action-bt-print');
if (btnActionBtPrint) {
    btnActionBtPrint.addEventListener('click', () => {
        printViaBluetooth(currentTxForReceipt, currentCartForReceipt, btnActionBtPrint);
    });
}

const btnTestPrintUsb = document.getElementById('btn-test-print-usb');
if (btnTestPrintUsb) {
    btnTestPrintUsb.addEventListener('click', () => {
        const { sampleTx, sampleItems } = getSampleTestReceipt();
        populateThermalPrintContainer(sampleTx, sampleItems);
        window.print();
    });
}

const btnTestPrintBt = document.getElementById('btn-test-print-bt');
if (btnTestPrintBt) {
    btnTestPrintBt.addEventListener('click', () => {
        const { sampleTx, sampleItems } = getSampleTestReceipt();
        printViaBluetooth(sampleTx, sampleItems, btnTestPrintBt);
    });
}

const btnActionWhatsappImg = document.getElementById('btn-action-whatsapp-img');
if (btnActionWhatsappImg) btnActionWhatsappImg.addEventListener('click', sendReceiptWhatsAppImage);

const btnActionDownloadImg = document.getElementById('btn-action-download-img');
if (btnActionDownloadImg) btnActionDownloadImg.addEventListener('click', downloadReceiptImage);

const btnActionWhatsappText = document.getElementById('btn-action-whatsapp-text');
if (btnActionWhatsappText) btnActionWhatsappText.addEventListener('click', sendReceiptWhatsAppText);

const btnActionDone = document.getElementById('btn-action-done');
if (btnActionDone) btnActionDone.addEventListener('click', closeSaleCompleteModal);

const btnCloseSaleModal = document.getElementById('btn-close-sale-modal');
if (btnCloseSaleModal) btnCloseSaleModal.addEventListener('click', closeSaleCompleteModal);

// ==========================================
// Módulo: Configuración & Tasa BCV Oficial
// ==========================================
function renderSettings() {
    const rateCopInput = document.getElementById('rate-cop');
    const rateVesInput = document.getElementById('rate-ves');
    const bcvDateBadge = document.getElementById('bcv-date-badge');
    const headerBcvVal = document.getElementById('header-bcv-val');
    const posBcvRateText = document.getElementById('pos-bcv-rate-text');

    if (rateCopInput) rateCopInput.value = data.settings.cop;
    if (rateVesInput) rateVesInput.value = data.settings.ves;

    const formattedVes = Number(data.settings.ves).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
    
    if (headerBcvVal) {
        headerBcvVal.innerText = `${formattedVes} Bs`;
    }
    if (posBcvRateText) {
        posBcvRateText.innerText = `${formattedVes} Bs / USD`;
    }
    if (bcvDateBadge) {
        bcvDateBadge.innerText = data.settings.bcvFechaValor ? `Fecha Valor: ${data.settings.bcvFechaValor}` : 'Fecha Valor: Sincronizada';
    }
}

async function fetchBCVRate(manual = false) {
    const spinners = [
        document.getElementById('bcv-spinner'),
        document.getElementById('header-bcv-spinner'),
        document.getElementById('pos-bcv-spinner')
    ];
    spinners.forEach(s => { if (s) s.classList.add('fa-spin'); });

    const badge = document.getElementById('bcv-date-badge');
    const liveIndicator = document.getElementById('bcv-live-indicator');
    if (badge && manual) badge.innerText = "Consultando tasa oficial del BCV...";

    let rate = null;
    let fechaValor = "";

    try {
        // Fuente 1 (Principal): Espejo en tiempo real de la base de datos oficial del BCV (CORS habilitado)
        const res = await fetch('https://datos.cromstudio.com.ve/tasa', { cache: 'no-store' });
        if (res.ok) {
            const json = await res.json();
            if (json && json.tasas && json.tasas.USD) {
                rate = parseFloat(json.tasas.USD);
                fechaValor = json.fecha_valor ? json.fecha_valor.trim() : "";
            }
        }
    } catch (err) {
        console.warn("Fallo cromstudio BCV API, probando fuente de respaldo:", err);
    }

    // Fuente 2 (Respaldo): DolarAPI Oficial BCV
    if (!rate || isNaN(rate)) {
        try {
            const res2 = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', { cache: 'no-store' });
            if (res2.ok) {
                const json2 = await res2.json();
                if (json2 && json2.promedio) {
                    rate = parseFloat(json2.promedio);
                    if (json2.fechaActualizacion) {
                        fechaValor = "Fecha: " + new Date(json2.fechaActualizacion).toLocaleDateString('es-VE');
                    }
                }
            }
        } catch (err2) {
            console.warn("Fallo dolarapi BCV API:", err2);
        }
    }

    spinners.forEach(s => { if (s) s.classList.remove('fa-spin'); });

    if (rate && !isNaN(rate) && rate > 0) {
        data.settings.ves = rate;
        if (fechaValor) data.settings.bcvFechaValor = fechaValor;
        data.settings.bcvLastUpdate = new Date().toISOString();

        saveData('settings');
        updateViews();
        renderCart();

        if (liveIndicator) {
            liveIndicator.innerHTML = '● En línea (BCV)';
            liveIndicator.style.color = '#2ecc71';
        }

        if (manual) {
            alert(`✅ Tasa BCV actualizada exitosamente desde la página oficial:\n\n1 USD = ${rate.toLocaleString('es-VE', {minimumFractionDigits: 2, maximumFractionDigits: 4})} Bs\n${data.settings.bcvFechaValor ? data.settings.bcvFechaValor : ''}`);
        }
        return true;
    } else {
        if (liveIndicator) {
            liveIndicator.innerHTML = '⚠️ Conexión manual';
            liveIndicator.style.color = '#e74c3c';
        }
        if (manual) {
            alert("No se pudo conectar a los servidores del BCV en este momento. Verifique su conexión a Internet o ingrese la tasa manualmente.");
        }
        return false;
    }
}

// Botones para refrescar tasa BCV
const btnFetchBcv = document.getElementById('btn-fetch-bcv');
if (btnFetchBcv) btnFetchBcv.addEventListener('click', () => fetchBCVRate(true));

const btnHeaderRefreshBcv = document.getElementById('btn-header-refresh-bcv');
if (btnHeaderRefreshBcv) btnHeaderRefreshBcv.addEventListener('click', () => fetchBCVRate(true));

const headerBcvBadge = document.getElementById('header-bcv-badge');
if (headerBcvBadge) headerBcvBadge.addEventListener('click', () => fetchBCVRate(true));

const btnPosRefreshBcv = document.getElementById('btn-pos-refresh-bcv');
if (btnPosRefreshBcv) btnPosRefreshBcv.addEventListener('click', () => fetchBCVRate(true));

document.getElementById('btn-save-rates').addEventListener('click', () => {
    const copVal = parseFloat(document.getElementById('rate-cop').value);
    const vesVal = parseFloat(document.getElementById('rate-ves').value);
    if (isNaN(copVal) || isNaN(vesVal) || copVal <= 0 || vesVal <= 0) {
        alert("Por favor, ingrese tasas válidas.");
        return;
    }
    data.settings.cop = copVal;
    data.settings.ves = vesVal;
    if (db) db.collection('config').doc('settings').set(data.settings).catch(e => console.warn(e));
    saveData('settings');
    updateViews();
    renderCart();
    alert('Tasas actualizadas exitosamente.');
});

// ==========================================
// Escáner Físico, de Cámara y de Imagen
// ==========================================
let html5QrCode = null;
let currentScanContext = null;

function showScannerError(msg) {
    const errBox = document.getElementById('scanner-error');
    if (errBox) {
        errBox.innerHTML = msg;
        errBox.style.display = 'block';
    }
}

function hideScannerError() {
    const errBox = document.getElementById('scanner-error');
    if (errBox) {
        errBox.style.display = 'none';
        errBox.innerHTML = '';
    }
}

window.closeScanner = function() {
    hideScannerError();
    if (html5QrCode && html5QrCode.isScanning) {
        html5QrCode.stop().then(() => {
            try { html5QrCode.clear(); } catch(e){}
            document.getElementById('modal-scanner').classList.remove('show');
        }).catch(err => {
            console.error("Error al detener escáner:", err);
            try { html5QrCode.clear(); } catch(e){}
            document.getElementById('modal-scanner').classList.remove('show');
        });
    } else {
        if (html5QrCode) {
            try { html5QrCode.clear(); } catch(e){}
        }
        document.getElementById('modal-scanner').classList.remove('show');
    }
};

window.retryCamera = function() {
    startCameraScanner();
};

function openScanner(context) {
    currentScanContext = context;
    hideScannerError();
    document.getElementById('modal-scanner').classList.add('show');
    startCameraScanner();
}

function startCameraScanner() {
    hideScannerError();

    // Verificación de protocolo file:///
    if (window.location.protocol === 'file:') {
        showScannerError(
            '<strong>⚠️ Los navegadores bloquean la cámara en páginas abiertas con doble clic (file:///).</strong><br><br>' +
            '<b>Para usar la cámara:</b><br>' +
            '1. En tu PC: ejecuta el archivo <code>INICIAR_SISTEMA.bat</code>.<br>' +
            '2. O sube la app a Firebase Hosting y ábrela con HTTPS.<br><br>' +
            '<i>También puedes pulsar <b>"Cargar Foto/Imagen"</b> para escanear directamente una imagen.</i>'
        );
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showScannerError('Tu navegador no permite acceso a la cámara en este modo. Puedes usar el botón "Cargar Foto/Imagen".');
        return;
    }

    if (!html5QrCode) {
        html5QrCode = new Html5Qrcode("reader");
    }

    if (html5QrCode.isScanning) {
        html5QrCode.stop().then(() => {
            initCameraStream();
        }).catch(() => {
            initCameraStream();
        });
    } else {
        initCameraStream();
    }
}

function initCameraStream() {
    const config = {
        fps: 15,
        qrbox: { width: 260, height: 260 },
        aspectRatio: 1.0
    };

    Html5Qrcode.getCameras().then(devices => {
        if (devices && devices.length > 0) {
            const backCamera = devices.find(d => 
                d.label.toLowerCase().includes('back') || 
                d.label.toLowerCase().includes('trasera') || 
                d.label.toLowerCase().includes('rear') ||
                d.label.toLowerCase().includes('environment')
            );
            const cameraId = backCamera ? backCamera.id : devices[0].id;
            return html5QrCode.start(cameraId, config, onScanSuccess, onScanFailure);
        } else {
            return html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, onScanFailure);
        }
    }).catch(err => {
        console.warn("Fallo cámara por ID/trasera, probando cámara genérica:", err);
        return html5QrCode.start({ facingMode: "user" }, config, onScanSuccess, onScanFailure);
    }).catch(err => {
        console.error("Error definitivo cámara:", err);
        let errorMsg = 'No se pudo acceder a la cámara.';
        if (err.name === 'NotAllowedError' || (err.message && err.message.includes('Permission'))) {
            errorMsg = '<strong>Permiso de cámara denegado.</strong> Haz clic en el ícono de permisos de la barra de direcciones del navegador y concede acceso a la cámara.';
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
            errorMsg = 'No se detectó ninguna cámara disponible en tu dispositivo.';
        } else {
            errorMsg += ' Detalle: ' + (err.message || err);
        }
        showScannerError(errorMsg);
    });
}

function onScanSuccess(decodedText) {
    closeScanner();
    handleBarcode(decodedText, currentScanContext);
}

function onScanFailure(error) {
    // Escaneo frame a frame sin código detectado
}

// Carga de archivo de imagen / foto
const fileInput = document.getElementById('scanner-file-input');
if (fileInput) {
    fileInput.addEventListener('change', (e) => {
        if (!e.target.files || e.target.files.length === 0) return;
        const file = e.target.files[0];
        
        if (!html5QrCode) {
            html5QrCode = new Html5Qrcode("reader");
        }

        html5QrCode.scanFile(file, true)
            .then(decodedText => {
                closeScanner();
                handleBarcode(decodedText, currentScanContext);
            })
            .catch(err => {
                alert("No se pudo detectar ningún código de barra o QR en la imagen. Asegúrate de que la foto esté nítida y bien iluminada.");
            });
    });
}

if(document.getElementById('btn-scan-pos')) document.getElementById('btn-scan-pos').addEventListener('click', () => openScanner('pos'));
if(document.getElementById('btn-scan-inv')) document.getElementById('btn-scan-inv').addEventListener('click', () => openScanner('inventory'));
if(document.getElementById('btn-scan-sku')) document.getElementById('btn-scan-sku').addEventListener('click', () => openScanner('form-sku'));
if(document.getElementById('btn-scan-box')) document.getElementById('btn-scan-box').addEventListener('click', () => openScanner('form-box'));

// Lector físico en POS (pistola USB / Bluetooth)
if(document.getElementById('pos-search')) {
    document.getElementById('pos-search').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const val = e.target.value.trim();
            if (val && handleBarcode(val, 'pos')) {
                e.target.value = '';
                renderPOSProducts('');
            }
        }
    });
}

function handleBarcode(barcode, context) {
    barcode = barcode.trim();

    // Si se está escaneando dentro del modal de Nuevo / Editar Producto
    if (context === 'form-sku') {
        const skuInput = document.getElementById('prod-sku');
        if (skuInput) skuInput.value = barcode;
        const existing = data.products.find(p => p.sku === barcode || p.boxSku === barcode);
        if (existing) {
            alert(`Aviso: Este código ya está asignado al producto "${existing.name}".`);
        }
        return true;
    }

    if (context === 'form-box') {
        const boxInput = document.getElementById('prod-box-sku');
        if (boxInput) boxInput.value = barcode;
        return true;
    }

    let match = null;
    let isBox = false;

    for (let p of data.products) {
        if (p.sku === barcode) { match = p; isBox = false; break; }
        if (p.boxSku && p.boxSku === barcode) { match = p; isBox = true; break; }
    }

    if (!match) {
        if (context === 'inventory') {
            const wantToAdd = confirm(`Producto con código "${barcode}" no encontrado en el inventario.\n\n¿Deseas registrarlo como un nuevo producto ahora?`);
            if (wantToAdd) {
                document.getElementById('form-product').reset();
                document.getElementById('prod-id').value = '';
                document.getElementById('modal-product-title').innerText = 'Nuevo Producto';
                const stockGroup = document.getElementById('group-stock');
                if (stockGroup) stockGroup.style.display = 'block';
                const skuInput = document.getElementById('prod-sku');
                if (skuInput) skuInput.value = barcode;
                document.getElementById('modal-product').classList.add('show');
            }
        } else {
            alert('Producto no encontrado con el código: ' + barcode);
        }
        return false;
    }

    if (context === 'pos') {
        const qty = isBox && match.unitsPerBox ? parseInt(match.unitsPerBox) : 1;
        addToCart(match.id, qty);
    } else if (context === 'inventory') {
        openAdjustModal(match.id, isBox);
    }
    return true;
}
