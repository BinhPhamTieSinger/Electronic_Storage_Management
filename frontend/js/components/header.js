// === HEADER COMPONENT LOGIC ===
function renderHeader(authState) {
    const headerPlaceholder = document.getElementById('header-placeholder');
    if (!headerPlaceholder) return;
    const isAdmin = authState.loggedIn && authState.role === 'admin';
    const isEmployee = authState.loggedIn && authState.role === 'employee';
    const isUser = authState.loggedIn && authState.role === 'user';
    // Base links (root-relative)
    let navLinks = `
<li><a href="/" class="${location.pathname === '/' ? 'active' : ''}">Home</a></li>
<li><a href="/products" class="${location.pathname === '/products' ? 'active' : ''}">Products</a></li>
`;
    // User specific links
    if (isUser) {
        navLinks += `
<li><a href="/user-dashboard" class="${location.pathname === '/user-dashboard' ? 'active' : ''}">Dashboard</a></li>
<li><a href="/orders" class="${location.pathname === '/orders' ? 'active' : ''}">My Orders</a></li>
<li><a href="/cart" class="${location.pathname === '/cart' ? 'active' : ''}">Cart (<span id="cart-count">0</span>)</a></li>
`;
    }
    // Admin/Employee links
    if (isAdmin || isEmployee) {
        navLinks += `<li class="separator">|</li>`; // Visual separator
        navLinks += `<li><a href="/admin/dashboard" class="${location.pathname.startsWith('/admin/dashboard') ? 'active' : ''}">Admin Dash</a></li>`;
        navLinks += `<li><a href="/admin/manage-products" class="${location.pathname.startsWith('/admin/manage-products') ? 'active' : ''}">Manage Products</a></li>`;
        navLinks += `<li><a href="/admin/manage-orders" class="${location.pathname.startsWith('/admin/manage-orders') ? 'active' : ''}">Manage Orders</a></li>`;
    }
    // Add any Admin-only links here if needed
    // Auth section
    let authSection = '';
    if (authState.loggedIn) {
        authSection = `
<li class="user-info">Hi, ${authState.username}!</li>
<li><button id="logout-button" class="btn btn-sm btn-logout">Logout</button></li>
`;
    } else {
        authSection = `
<li><a href="/login" class="btn btn-sm btn-login">Login</a></li>
<li><a href="/register" class="btn btn-sm btn-register">Register</a></li>
`;
    }
    // Theme Toggle Button (Icon changes based on theme applied in main.js)
    const currentThemeIcon = document.body.classList.contains('dark-theme') ? '☀️' : '🌙';
    const themeToggleButton = `<li><button id="theme-toggle-button" class="btn btn-sm btn-theme-toggle" title="Toggle Theme">${currentThemeIcon}</button></li>`;
    headerPlaceholder.innerHTML = `
<header class="main-header">
<a href="/" class="logo">ElectroStore</a>
<nav>
<ul>
${navLinks}
<li class="separator" style="margin: 0 0.5rem;">|</li> <!-- Separator -->
${authSection}
</ul>
</nav>
</header>
`;
    // Update cart count (might be called again by cart.js later)
    if (typeof getCartItemCount === 'function') {
        updateCartCountHeader(getCartItemCount());
    }
}

function updateCartCountHeader(count) {
    const cartCountSpan = document.getElementById('cart-count');
    if (cartCountSpan) {
        cartCountSpan.textContent = count || 0;
        // Optional: Animate count change
        cartCountSpan.closest('a')?.classList.toggle('has-items', count > 0); // Add class if items exist
    }
}
// Expose globally if called directly, but main.js handles it now
// window.renderHeader = renderHeader;
// window.updateCartCountHeader = updateCartCountHeader;