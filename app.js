const SUPABASE_URL = 'https://uxagiaauxfeqagqnbtqo.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_mGhhVdSdt2YRotIshY7nIQ_WBfXxbdG';
const LEGACY_ORDERS_KEY = 'cravehub_orders_v1';
const SESSION_KEY = 'cravehub_supabase_session_v1';
const PAGE_SIZE = 1000;

const menuData = [
    {
        cat: 'Chowmein & Chinese',
        items: [['Chowmein', 30, 60], ['Paneer Chowmein', 45, 90], ['Fried Rice', 30, 60], ['Manchurian', 30, 60], ['Dry Manchurian', 35, 70], ['Paneer Chilli', 60, 110], ['Dry Paneer Chilli', 60, 110]]
    },
    {
        cat: 'Combo',
        items: [['Fried Rice Manchurian', 30, 60], ['Chowmein Manchurian', 30, 60], ['Paneer Chilli Rice', 60, 120], ['Paneer Chilli Chowmein', 60, 120]]
    },
    {
        cat: 'Burger',
        items: [['Veg Burger', 40, null], ['Paneer Burger', 50, null], ['Cheese Burger', 60, null]]
    },
    {
        cat: 'Momos',
        items: [['Veg Momos', 20, null], ['Paneer Momos', 30, null]]
    }
];

let cart = {};
let orders = [];
let session = readSession();

const money = value => '₹' + Number(value || 0).toLocaleString('en-IN');
const displayOrderNumber = value => 'CH' + String(value).padStart(6, '0');

function readSession() {
    try {
        return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
    } catch {
        localStorage.removeItem(SESSION_KEY);
        return null;
    }
}

function saveSession(authSession) {
    session = {
        access_token: authSession.access_token,
        refresh_token: authSession.refresh_token,
        expires_at: Date.now() + Number(authSession.expires_in || 3600) * 1000
    };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

function clearSession() {
    session = null;
    localStorage.removeItem(SESSION_KEY);
}

function responseMessage(payload, fallback) {
    return payload?.msg || payload?.message || payload?.error_description || payload?.error || fallback;
}

async function readResponse(response) {
    const text = await response.text();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

async function sendAuthRequest(path, body) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    const payload = await readResponse(response);
    if (!response.ok) {
        throw new Error(responseMessage(payload, `Sign-in request failed (${response.status}).`));
    }
    return payload;
}

async function refreshSession() {
    if (!session?.refresh_token) {
        clearSession();
        throw new Error('Your sign-in has expired. Please sign in again.');
    }
    try {
        const refreshed = await sendAuthRequest('token?grant_type=refresh_token', {
            refresh_token: session.refresh_token
        });
        saveSession(refreshed);
        return session.access_token;
    } catch (error) {
        clearSession();
        throw new Error(`Your sign-in expired. Please sign in again. ${error.message}`);
    }
}

async function accessToken() {
    if (!session?.access_token) {
        throw new Error('Please sign in to access saved orders.');
    }
    if (session.expires_at > Date.now() + 30000) {
        return session.access_token;
    }
    return refreshSession();
}

async function databaseRequest(path, options = {}) {
    const makeRequest = token => fetch(`${SUPABASE_URL}${path}`, {
        ...options,
        headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            Authorization: `Bearer ${token}`,
            ...(options.body ? { 'Content-Type': 'application/json' } : {}),
            ...options.headers
        }
    });

    let response = await makeRequest(await accessToken());
    if (response.status === 401) {
        response = await makeRequest(await refreshSession());
    }

    const payload = await readResponse(response);
    if (!response.ok) {
        throw new Error(responseMessage(payload, `Database request failed (${response.status}).`));
    }
    return payload;
}

function loadLegacyOrders() {
    const stored = localStorage.getItem(LEGACY_ORDERS_KEY);
    if (!stored) return [];
    let parsed;
    try {
        parsed = JSON.parse(stored);
    } catch {
        throw new Error('Previous on-device orders could not be read. Export or repair the old order data before continuing.');
    }
    if (!Array.isArray(parsed)) {
        throw new Error('Previous on-device order data has an unexpected format and was not imported.');
    }
    return parsed;
}

async function importLegacyOrders() {
    const oldOrders = loadLegacyOrders();
    const oldestFirst = [...oldOrders].reverse();
    for (let offset = 0; offset < oldestFirst.length; offset += 100) {
        const batch = oldestFirst.slice(offset, offset + 100).map(order => {
            if (!order.id || !order.date || !Array.isArray(order.items) || !Number.isFinite(Number(order.total))) {
                throw new Error('A previous on-device order is incomplete. No legacy orders were removed.');
            }
            return {
                legacy_id: String(order.id),
                created_at: order.date,
                customer: order.customer || '',
                items: order.items,
                total: Number(order.total)
            };
        });
        await databaseRequest('/rest/v1/orders?on_conflict=legacy_id', {
            method: 'POST',
            headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
            body: JSON.stringify(batch)
        });
    }
    if (oldOrders.length) {
        localStorage.removeItem(LEGACY_ORDERS_KEY);
    }
}

async function loadOrdersFromDatabase() {
    await importLegacyOrders();
    const loaded = [];
    for (let offset = 0; ; offset += PAGE_SIZE) {
        const page = await databaseRequest(
            `/rest/v1/orders?select=order_number,created_at,customer,items,total&order=order_number.desc`,
            { headers: { Range: `${offset}-${offset + PAGE_SIZE - 1}`, 'Range-Unit': 'items' } }
        );
        loaded.push(...page);
        if (page.length < PAGE_SIZE) break;
    }
    orders = loaded.map(order => ({
        id: String(order.order_number),
        orderNumber: order.order_number,
        date: order.created_at,
        customer: order.customer || '',
        items: order.items,
        total: Number(order.total)
    }));
}

function esc(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[character]));
}

function findItem(name) {
    for (const group of menuData) {
        for (const item of group.items) {
            if (item[0] === name) return item;
        }
    }
    return null;
}

function renderMenu() {
    let html = '';
    menuData.forEach(group => {
        html += `<div class="cat"><span>${group.cat}</span></div><div class="grid">`;
        group.items.forEach(([name, small, large]) => {
            const quantity = Object.values(cart)
                .filter(item => item.name === name)
                .reduce((sum, item) => sum + item.qty, 0);
            html += `<div class="item ${quantity ? 'selected' : ''}"><span class="iname">${esc(name)} ${quantity ? `<span style="color:#e11;font-size:12px">· ${quantity} added</span>` : ''}</span><span class="prices">${large ? `<button class="sizebtn" data-name="${esc(name)}" data-size="small">Small <b>${money(small)}</b></button><button class="sizebtn" data-name="${esc(name)}" data-size="large">Large <b>${money(large)}</b></button>` : `<button class="sizebtn" data-name="${esc(name)}" data-size="single">Add <b>${money(small)}</b></button>`}</span></div>`;
        });
        html += '</div>';
    });
    document.getElementById('menu').innerHTML = html;
    document.querySelectorAll('.sizebtn').forEach(button => {
        button.addEventListener('click', () => chooseItem(button.dataset.name, button.dataset.size));
    });
}

function chooseItem(name, size) {
    const item = findItem(name);
    if (!item) return;
    if (size === 'single') size = 'small';
    const price = size === 'large' ? item[2] : item[1];
    const key = `${name}|${size}`;
    if (!cart[key]) cart[key] = { name, size, price, qty: 0 };
    cart[key].qty++;
    renderMenu();
    renderCart();
}

function totalCart() {
    return Object.values(cart).reduce((sum, item) => sum + item.price * item.qty, 0);
}

function renderCart() {
    const entries = Object.entries(cart).filter(([, item]) => item.qty > 0);
    const total = entries.reduce((sum, [, item]) => sum + item.price * item.qty, 0);
    document.getElementById('total').textContent = money(total);
    document.getElementById('count').textContent =
        `${entries.reduce((sum, [, item]) => sum + item.qty, 0)} items · ${entries.length} menu lines`;
    const target = document.getElementById('cart');
    if (!entries.length) {
        target.innerHTML = '<div class="empty">Tap a menu item above to add it to the bill.</div>';
        return;
    }
    target.innerHTML = entries.map(([key, item]) => `<div class="lineitem"><div><div class="li-name">${esc(item.name)} <span style="font-size:12px;color:#666">${item.size === 'large' ? '(Large)' : item.size === 'small' && findItem(item.name)?.[2] ? '(Small)' : ''}</span></div><div class="li-sub">${money(item.price)} × ${item.qty} = <b>${money(item.price * item.qty)}</b></div></div><div class="qty"><button data-act="minus" data-key="${esc(key)}">−</button><span class="count">${item.qty}</span><button data-act="plus" data-key="${esc(key)}">+</button><button data-act="remove" data-key="${esc(key)}" aria-label="Remove" style="background:#ffe5e5;color:#b00;font-size:16px">×</button></div></div>`).join('');
    target.querySelectorAll('button').forEach(button => {
        button.onclick = () => {
            const key = button.dataset.key;
            if (button.dataset.act === 'plus') cart[key].qty++;
            else if (button.dataset.act === 'minus') cart[key].qty--;
            else delete cart[key];
            if (cart[key] && cart[key].qty <= 0) delete cart[key];
            renderMenu();
            renderCart();
        };
    });
}

async function saveOrder() {
    const items = Object.values(cart).filter(item => item.qty > 0);
    if (!items.length) {
        alert('Please add at least one item before saving.');
        return;
    }
    const button = document.getElementById('save');
    button.disabled = true;
    try {
        const result = await databaseRequest('/rest/v1/orders?select=order_number,created_at,customer,items,total', {
            method: 'POST',
            headers: { Prefer: 'return=representation' },
            body: JSON.stringify({
                customer: document.getElementById('customer').value.trim(),
                items: items.map(item => ({ ...item })),
                total: totalCart()
            })
        });
        if (!Array.isArray(result) || !result[0]) {
            throw new Error('The database did not return the saved order number.');
        }
        const saved = result[0];
        orders.unshift({
            id: String(saved.order_number),
            orderNumber: saved.order_number,
            date: saved.created_at,
            customer: saved.customer || '',
            items: saved.items,
            total: Number(saved.total)
        });
        cart = {};
        document.getElementById('customer').value = '';
        renderMenu();
        renderCart();
        renderOrders();
        renderReports();
        alert(`Order saved!\n${displayOrderNumber(saved.order_number)}\nTotal: ${money(saved.total)}`);
    } catch (error) {
        alert(`Order was not saved. Check your internet connection and try again.\n\n${error.message}`);
    } finally {
        button.disabled = false;
    }
}

function renderOrders() {
    const query = (document.getElementById('searchOrders').value || '').toLowerCase();
    const filtered = orders.filter(order =>
        displayOrderNumber(order.orderNumber).toLowerCase().includes(query) ||
        (order.customer || '').toLowerCase().includes(query)
    );
    document.getElementById('orderList').innerHTML = filtered.length ? filtered.map(order =>
        `<article class="ordercard"><div class="orderhead"><span>${displayOrderNumber(order.orderNumber)}</span><span>${money(order.total)}</span></div><p>${new Date(order.date).toLocaleString()}${order.customer ? ` · ${esc(order.customer)}` : ''}</p><p>${order.items.map(item => `${esc(item.name)}${item.size === 'large' ? ' (L)' : item.size === 'small' && findItem(item.name)?.[2] ? ' (S)' : ''} × ${item.qty}`).join(' · ')}</p><div class="btnrow"><button class="btn light" data-detail="${esc(order.id)}">View bill</button><button class="btn danger" data-del="${esc(order.id)}">Delete</button></div></article>`
    ).join('') : '<div class="empty">No saved orders found.</div>';

    document.querySelectorAll('[data-detail]').forEach(button => {
        button.onclick = () => {
            const order = orders.find(item => item.id === button.dataset.detail);
            if (!order) return;
            alert(`${displayOrderNumber(order.orderNumber)}\n${new Date(order.date).toLocaleString()}\n\n${order.items.map(item => `${item.name} ${item.size === 'large' ? '(Large)' : item.size === 'small' && findItem(item.name)?.[2] ? '(Small)' : ''} × ${item.qty}  ${money(item.price * item.qty)}`).join('\n')}\n\nTOTAL: ${money(order.total)}`);
        };
    });
    document.querySelectorAll('[data-del]').forEach(button => {
        button.onclick = async () => {
            if (!confirm('Delete this saved order?')) return;
            try {
                await databaseRequest(`/rest/v1/orders?order_number=eq.${encodeURIComponent(button.dataset.del)}`, {
                    method: 'DELETE'
                });
                orders = orders.filter(order => order.id !== button.dataset.del);
                renderOrders();
                renderReports();
            } catch (error) {
                alert(`Order was not deleted.\n\n${error.message}`);
            }
        };
    });
}

function renderReports() {
    const today = new Date().toDateString();
    const todaysOrders = orders.filter(order => new Date(order.date).toDateString() === today);
    document.getElementById('todaySales').textContent =
        money(todaysOrders.reduce((sum, order) => sum + order.total, 0));
    document.getElementById('todayOrders').textContent = todaysOrders.length;
    document.getElementById('allSales').textContent =
        money(orders.reduce((sum, order) => sum + order.total, 0));
    document.getElementById('allOrders').textContent = orders.length;
}

function exportOrders() {
    if (!orders.length) {
        alert('No orders to export.');
        return;
    }
    const rows = [
        ['Order Number', 'Date', 'Customer', 'Items', 'Total'],
        ...orders.map(order => [
            displayOrderNumber(order.orderNumber),
            new Date(order.date).toLocaleString(),
            order.customer,
            order.items.map(item => `${item.name} (${item.size}) x${item.qty} @${item.price}`).join('; '),
            order.total
        ])
    ];
    const csv = rows.map(row => row.map(value =>
        '"' + String(value ?? '').replace(/"/g, '""') + '"'
    ).join(',')).join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
    link.download = 'cravehub-orders.csv';
    link.click();
    URL.revokeObjectURL(link.href);
}

async function deleteAllOrders() {
    if (!confirm('Delete ALL saved orders from the shared database? This cannot be undone.')) return;
    try {
        await databaseRequest('/rest/v1/orders?order_number=not.is.null', { method: 'DELETE' });
        orders = [];
        renderOrders();
        renderReports();
    } catch (error) {
        alert(`Orders were not deleted.\n\n${error.message}`);
    }
}

function showSignedIn() {
    document.body.classList.remove('signed-out');
}

async function activateSession() {
    await loadOrdersFromDatabase();
    renderMenu();
    renderCart();
    renderOrders();
    renderReports();
    showSignedIn();
}

async function signIn(event) {
    event.preventDefault();
    const button = document.getElementById('loginButton');
    const error = document.getElementById('loginError');
    error.textContent = '';
    button.disabled = true;
    try {
        const authSession = await sendAuthRequest('token?grant_type=password', {
            email: document.getElementById('loginEmail').value.trim(),
            password: document.getElementById('loginPassword').value
        });
        saveSession(authSession);
        await activateSession();
        document.getElementById('loginPassword').value = '';
    } catch (failure) {
        error.textContent = failure.message;
    } finally {
        button.disabled = false;
    }
}

async function startApp() {
    renderMenu();
    renderCart();
    document.getElementById('loginForm').addEventListener('submit', signIn);
    document.getElementById('save').addEventListener('click', saveOrder);
    document.getElementById('searchOrders').addEventListener('input', renderOrders);
    document.getElementById('export').addEventListener('click', exportOrders);
    document.getElementById('clearOrders').addEventListener('click', deleteAllOrders);
    document.getElementById('clear').addEventListener('click', () => {
        if (Object.keys(cart).length && !confirm('Clear the current bill?')) return;
        cart = {};
        document.getElementById('customer').value = '';
        renderMenu();
        renderCart();
    });

    document.querySelectorAll('.tab[data-screen]').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab[data-screen]').forEach(item =>
                item.classList.toggle('active', item === tab)
            );
            document.querySelectorAll('.screen').forEach(screen =>
                screen.classList.toggle('active', screen.id === tab.dataset.screen)
            );
            if (tab.dataset.screen === 'orders') renderOrders();
            if (tab.dataset.screen === 'reports') renderReports();
        });
    });

    document.getElementById('logout').addEventListener('click', () => {
        clearSession();
        orders = [];
        document.body.classList.add('signed-out');
        document.getElementById('loginError').textContent = '';
    });

    if (session?.access_token) {
        try {
            await activateSession();
        } catch (error) {
            document.getElementById('loginError').textContent =
                `Could not load saved orders. Sign in again or check the connection. ${error.message}`;
        }
    }
}

startApp();

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(error => {
        console.error('Service worker registration failed:', error);
    });
}
