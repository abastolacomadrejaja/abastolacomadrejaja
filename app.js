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
const defaultSettings = { usd: 1, cop: 4000, ves: 40 };
let data = {
    settings: JSON.parse(localStorage.getItem('settings')) || defaultSettings,
    products: JSON.parse(localStorage.getItem('products')) || [],
    transactions: JSON.parse(localStorage.getItem('transactions')) || []
};

// Asegurar integridad inicial
if (!data.settings) data.settings = defaultSettings;
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
const formatVES = (val) => `${(val * data.settings.ves).toLocaleString('es-VE')} VES`;

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
            const cloudProds = [];
            snapshot.forEach(doc => cloudProds.push(doc.data()));
            data.products = cloudProds;
            localStorage.setItem('products', JSON.stringify(data.products));
            renderInventory();
            renderPOSProducts(document.getElementById('pos-search') ? document.getElementById('pos-search').value : '');
        } else if (data.products.length > 0) {
            // Si la nube está vacía pero tenemos datos locales, subirlos
            data.products.forEach(p => db.collection('products').doc(p.id).set(p));
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
            const cloudTx = [];
            snapshot.forEach(doc => cloudTx.push(doc.data()));
            cloudTx.sort((a, b) => b.date - a.date);
            data.transactions = cloudTx;
            localStorage.setItem('transactions', JSON.stringify(data.transactions));
            renderBalance();
        } else if (data.transactions.length > 0) {
            data.transactions.slice(-20).forEach(tx => db.collection('transactions').doc(tx.id).set(tx));
        }
    }, (error) => {
        console.warn("Firestore Transacciones:", error.message);
    });

    // 3. Escuchar tasas de cambio en tiempo real
    db.collection('config').doc('settings').onSnapshot((doc) => {
        if (doc.exists) {
            data.settings = doc.data();
            localStorage.setItem('settings', JSON.stringify(data.settings));
            renderSettings();
            renderBalance();
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
        if (tx.type === 'out') sales += tx.total; // Ventas = Entrada de dinero
        if (tx.type === 'in') expenses += tx.total; // Compras/Gastos = Salida de dinero
    });
    
    const profit = sales - expenses;
    document.getElementById('dash-profit').innerText = formatUSD(profit);
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
        const iconClass = isSale ? 'fa-arrow-down' : 'fa-arrow-up';
        const iconBg = isSale ? 'income' : 'expense';
        
        let desc = tx.desc;
        if (!desc) {
            desc = isSale ? `Venta (Factura ${tx.id.split('-')[0].toUpperCase()})` : `Compra Inventario`;
        }

        const amountColor = isSale ? 'text-green' : 'text-red';
        const sign = isSale ? '+' : '-';
        const dateStr = new Date(tx.date).toLocaleDateString('es-ES', {month:'short', day:'numeric', hour:'2-digit', minute:'2-digit'});
        
        feedList.innerHTML += `
            <div class="feed-item">
                <div class="feed-icon ${iconBg}"><i class="fas ${iconClass}"></i></div>
                <div class="feed-details">
                    <div class="feed-desc">${desc}</div>
                    <div class="feed-date">${dateStr}</div>
                </div>
                <div class="feed-amount ${amountColor}">${sign}${formatUSD(tx.total)}</div>
            </div>
        `;
    });
}

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
                    <button class="btn btn-secondary btn-sm" onclick="editProduct('${p.id}')"><i class="fas fa-edit"></i></button>
                    <button class="btn btn-primary btn-sm" onclick="openAdjustModal('${p.id}')"><i class="fas fa-exchange-alt"></i> Ajuste</button>
                    <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')"><i class="fas fa-trash"></i></button>
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
    if(confirm('¿Está seguro de que desea eliminar este producto?')) {
        data.products = data.products.filter(p => p.id !== id);
        if (db) db.collection('products').doc(id).delete().catch(e => console.warn(e));
        saveData('products');
        updateViews();
    }
};

window.openAdjustModal = (id, isBoxScan = false) => {
    const p = data.products.find(x => x.id === id);
    if(!p) return;
    document.getElementById('adjust-prod-id').value = p.id;
    document.getElementById('adjust-prod-name').innerText = `${p.name} (Stock Actual: ${p.stock})`;
    document.getElementById('form-adjust').reset();
    
    if (isBoxScan && p.unitsPerBox) {
        document.getElementById('adjust-qty').value = p.unitsPerBox;
        document.getElementById('adjust-type').value = 'in';
    }

    document.getElementById('modal-adjust').classList.add('show');
};

document.getElementById('form-adjust').addEventListener('submit', (e) => {
    e.preventDefault();
    const id = document.getElementById('adjust-prod-id').value;
    const type = document.getElementById('adjust-type').value;
    const qty = parseInt(document.getElementById('adjust-qty').value);
    
    const p = data.products.find(x => x.id === id);
    
    if (type === 'out' && qty > p.stock) {
        alert('Error: La cantidad a descontar es mayor al stock disponible.');
        return;
    }

    if (type === 'in') p.stock += qty;
    if (type === 'out') p.stock -= qty;

    if (db) db.collection('products').doc(p.id).update({ stock: p.stock }).catch(e => console.warn(e));

    const valuationPrice = type === 'in' ? p.cost : p.basePrice;
    const txTotal = type === 'out' ? 0 : (valuationPrice * qty);
    const descText = type === 'in' ? `Compra inv: ${p.name}` : `Ajuste/Merma: ${p.name}`;

    const tx = {
        id: generateUUID(),
        type: type,
        desc: descText,
        date: Date.now(),
        items: [{productId: id, qty: qty, priceAtTime: valuationPrice}],
        total: txTotal
    };

    data.transactions.push(tx);
    if (db) db.collection('transactions').doc(tx.id).set(tx).catch(e => console.warn(e));
    saveData();
    updateViews();
    document.getElementById('modal-adjust').classList.remove('show');
});

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

function processPayment() {
    if(cart.length === 0) return;
    
    let totalUSD = 0;
    const txItems = [];
    
    cart.forEach(item => {
        totalUSD += item.product.basePrice * item.qty;
        txItems.push({ productId: item.product.id, qty: item.qty, priceAtTime: item.product.basePrice });
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
        total: totalUSD
    };

    data.transactions.push(tx);
    if (db) db.collection('transactions').doc(tx.id).set(tx).catch(e => console.warn(e));
    saveData();
    
    showReceipt(tx, cart);
    
    cart = [];
    if (document.getElementById('pos-search')) document.getElementById('pos-search').value = '';
    renderCart();
    updateViews();
}

// ==========================================
// Recibo (Impresión)
// ==========================================
function showReceipt(tx, cartItems) {
    const txCode = tx.id.split('-')[0].toUpperCase();
    document.getElementById('rec-id').innerText = `Ref: ${txCode}`;
    document.getElementById('rec-date').innerText = new Date(tx.date).toLocaleString();
    
    const itemsList = document.getElementById('rec-items');
    itemsList.innerHTML = '';
    cartItems.forEach(item => {
        itemsList.innerHTML += `
            <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:5px;">
                <span>${item.qty}x ${item.product.name}</span>
                <span>${formatUSD(item.product.basePrice * item.qty)}</span>
            </div>
        `;
    });

    document.getElementById('rec-usd').innerText = formatUSD(tx.total);
    document.getElementById('rec-cop').innerText = formatCOP(tx.total);
    document.getElementById('rec-ves').innerText = formatVES(tx.total);

    setTimeout(() => {
        window.print();
    }, 500);
}

// ==========================================
// Módulo: Configuración
// ==========================================
function renderSettings() {
    document.getElementById('rate-cop').value = data.settings.cop;
    document.getElementById('rate-ves').value = data.settings.ves;
}

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
    let match = null;
    let isBox = false;

    for (let p of data.products) {
        if (p.sku === barcode) { match = p; isBox = false; break; }
        if (p.boxSku && p.boxSku === barcode) { match = p; isBox = true; break; }
    }

    if (!match) {
        alert('Producto no encontrado con el código: ' + barcode);
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
