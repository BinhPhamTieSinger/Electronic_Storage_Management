// === MAIN JAVASCRIPT ===
// --- Global State & Configuration ---
const API_BASE_URL = '/api'; // Backend API prefix
let authState = {
    loggedIn: false,
    token: null,
    username: null,
    userId: null,
    MaKH: null,
    role: null,
};
let cartItemCount = 0; // For header display
let authStatePromise = null; 
// --- Theme Management ---
function applyTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
        // Update theme toggle button appearance if it exists
        const themeBtn = document.getElementById('theme-toggle-button');
        if (themeBtn) themeBtn.innerHTML = '☀️'; // Sun icon for switching to light
    } else {
        document.body.classList.remove('dark-theme');
        const themeBtn = document.getElementById('theme-toggle-button');
        if (themeBtn) themeBtn.innerHTML = '🌙'; // Moon icon for switching to dark
    }
    localStorage.setItem('appTheme', theme);
    console.log(`[Theme] Applied ${theme} theme.`);
}

function toggleTheme() {
    const currentTheme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    applyTheme(newTheme);
}

function loadInitialTheme() {
    const savedTheme = localStorage.getItem('appTheme') || 'dark'; // Default to dark
    applyTheme(savedTheme);
}
// --- Utility Functions ---
// Display messages in designated alert elements
function showMessage(elementId, message, type = 'info', autoDismiss = 5000) {
    const element = document.getElementById(elementId);
    if (!element) {
        console.warn(`showMessage: Element with ID '${elementId}' not found.`);
        return;
    }
    element.textContent = message;
    // Ensure base class is present and remove previous type classes
    element.className = 'alert';
    element.classList.add(`alert-${type}`);
    element.style.display = 'block';
    element.style.opacity = 1; // Make sure it's visible
    // Clear any existing timer
    if (element.dismissTimer) {
        clearTimeout(element.dismissTimer);
    }
    // Optional auto-dismiss
    if (autoDismiss && typeof autoDismiss === 'number' && autoDismiss > 0) {
        element.dismissTimer = setTimeout(() => {
            element.style.opacity = 0;
            // Wait for fade out before hiding completely
            setTimeout(() => {
                hideMessage(elementId);
            }, 300); // Match transition duration
        }, autoDismiss);
    }
}

function hideMessage(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.style.display = 'none';
        element.textContent = '';
        element.className = 'alert'; // Reset classes
        if (element.dismissTimer) {
            clearTimeout(element.dismissTimer);
            element.dismissTimer = null;
        }
    }
}
// Format currency (Vietnamese Dong)
function formatCurrency(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) {
        return 'N/A'; // Or return 0₫ or empty string based on preference
    }
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(amount);
}
function formatLargeNumber(num, digits = 1) {
    if (num === null || num === undefined || isNaN(num)) {
        return 'N/A';
    }
    if (num === 0) return '0';

    const lookup = [
        { value: 1, symbol: "" }, // Base case
        { value: 1e3, symbol: " K" }, // Thousand (Nghìn)
        { value: 1e6, symbol: " M" }, // Million (Triệu)
        { value: 1e9, symbol: " B" }, // Billion (Tỷ)
        { value: 1e12, symbol: " T" }, // Trillion (Nghìn Tỷ)
        { value: 1e15, symbol: " P" }, // Quadrillion (Triệu Tỷ) - unlikely but for completeness
        { value: 1e18, symbol: " E" }  // Quintillion (Tỷ Tỷ)
    ];
    // Find the appropriate tier
    const tier = lookup.slice().reverse().find(item => Math.abs(num) >= item.value);

    // Format the number
    const value = (num / tier.value);

    // Determine the number of digits for toFixed based on the integer part
    let effectiveDigits = digits;
    if (Math.abs(value) >= 100) {
        effectiveDigits = 0; // No decimals if number is 100 or more (e.g., 123T)
    } else if (Math.abs(value) >= 10) {
         effectiveDigits = Math.max(0, digits - 1); // Fewer decimals if 10-99 (e.g., 12.3T)
    }

    const formattedValue = value.toFixed(effectiveDigits);

    // Remove trailing .0 if digits=0 or if toFixed resulted in .0
    const finalValue = formattedValue.endsWith('.0') ? formattedValue.slice(0,-2) : formattedValue;

    return finalValue + tier.symbol;
}
// --- Authenticated Fetch Wrapper ---
async function fetchWithAuth(url, options = {}) {
    const token = localStorage.getItem('authToken');
    const headers = {
        'Content-Type': 'application/json', // Default content type
        ...options.headers, // Allow overriding headers
    };
    // Add Authorization header if token exists
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    try {
        const response = await fetch(`${API_BASE_URL}${url}`, {
            ...options,
            headers: headers,
        });
        // Handle 204 No Content (common for DELETE success)
        if (response.status === 204) {
            return {
                success: true,
                data: null,
                status: 204
            };
        }
        // Try to parse response as JSON
        let data;
        try {
            // Check content type before parsing? Maybe too complex. Assume JSON or handle error.
            data = await response.json();
        } catch (jsonError) {
            // Handle cases where response is not valid JSON (e.g., server error page)
            console.error(`[Fetch] Error parsing JSON response from ${url} (Status: ${response.status}):`, jsonError);
            // Throw a custom error indicating non-JSON response
            const formatError = new Error(`Invalid response format from server. Status: ${response.status}`);
            formatError.status = response.status;
            throw formatError;
        }
        // Check if the HTTP request was successful (status 2xx)
        if (!response.ok) {
            console.warn(`[Fetch] API Error Response (${response.status}) for ${url}:`, data);
            // Specific handling for common auth errors
            if (response.status === 401) { // Unauthorized
                const errorMsg = data?.error?.toLowerCase() || '';
                if (errorMsg.includes('token expired') || errorMsg.includes('invalid token') || errorMsg.includes('malformed')) {
                    console.log("[Fetch] Invalid/Expired token detected via 401. Logging out.");
                    // Avoid immediate redirect here, let the calling function decide
                    // But clear the bad state
                    clearAuthState(); // Clear the invalid token/state
                    updateUIBasedOnAuthState(); // Update UI immediately
                } else {
                    // Generic 401 - likely just needs login
                    console.log(`[Fetch] 401 Unauthorized for ${url} - Authentication likely required.`);
                }
            } else if (response.status === 403) { // Forbidden
                console.warn(`[Fetch] 403 Forbidden for ${url}. User Role: ${authState.role}`);
            }
            // Create a structured error object to throw
            const error = new Error(data?.error || `Request failed with status ${response.status}`);
            error.status = response.status;
            error.data = data; // Attach full response data
            throw error;
        }
        // Request was successful (2xx status)
        return {
            success: true,
            data: data,
            status: response.status
        };
    } catch (error) {
        // Handle network errors or errors thrown above
        console.error(`[Fetch] Network or Processing Error for ${url}:`, error);
        // Return a structured error response
        return {
            success: false,
            error: error.message || 'An unexpected network error occurred.',
            status: error.status || null, // Include status if available
            data: error.data || null
        };
    }
}
// --- Authentication Management ---
// **MODIFIED: checkLoginState now returns a promise that resolves when auth state is known**
function checkLoginState() {
    // If promise already exists, return it to avoid multiple checks
    if (authStatePromise) {
        return authStatePromise;
    }

    authStatePromise = new Promise((resolve) => {
        const token = localStorage.getItem('authToken');
        console.log(`[Auth Check] Initiating check. Token found: ${token ? 'Yes' : 'No'}`);

        if (token) {
            fetchWithAuth('/auth/me')
                .then(response => {
                    if (response.success && response.data?.id) {
                        console.log("[Auth Check] /auth/me successful. User data:", response.data);
                        authState.loggedIn = true;
                        authState.token = token;
                        authState.username = response.data.username;
                        authState.userId = response.data.id;
                        authState.MaKH = response.data.MaKH;
                        authState.role = response.data.role;
                    } else {
                        console.warn(`[Auth Check] /auth/me failed or invalid data. Clearing state. Reason: ${response.error || `Status ${response.status}`}`);
                        clearAuthState();
                    }
                })
                .catch(error => {
                    console.error("[Auth Check] Unexpected error during /auth/me call:", error);
                    clearAuthState();
                })
                .finally(() => {
                    console.log("[Auth Check] Check complete. Resolving promise. Final authState:", JSON.stringify(authState));
                    updateUIBasedOnAuthState(); // Update UI *after* state is set
                    loadCartItemCount();
                    resolve(authState); // Resolve the promise with the final state
                });
        } else {
            // No token, ensure logged out state and resolve immediately
            console.log("[Auth Check] No token found. Clearing state and resolving promise.");
            clearAuthState();
            updateUIBasedOnAuthState();
            loadCartItemCount();
            resolve(authState); // Resolve the promise with the logged-out state
        }
    });
    return authStatePromise;
}

function clearAuthState() {
    const wasLoggedIn = authState.loggedIn;
    authState.loggedIn = false;
    authState.token = null;
    authState.username = null;
    authState.userId = null;
    authState.MaKH = null;
    authState.role = null;
    localStorage.removeItem('authToken');
    if (wasLoggedIn) {
        console.log("[Auth] Authentication state cleared.");
    }
}

function handleLoginSuccess(data) {
    console.log("[Auth] Login successful:", data);
    localStorage.setItem('authToken', data.token); // Store token first
    // Update state immediately (checkLoginState will re-verify on next page load)
    authState.loggedIn = true;
    authState.token = data.token;
    authState.username = data.user.username;
    authState.MaKH = data.user.MaKH;
    authState.role = data.user.role;
    authState.userId = null; // Will be populated by checkLoginState via /auth/me if needed elsewhere
    console.log("[Auth] Local authState updated after login.");
    // UI updates will happen on the next page load via checkLoginState
}

function handleLogout() {
    console.log("[Auth] handleLogout initiated.");
    clearAuthState();
    // Redirect to home page and force reload to clear everything
    if (window.location.pathname !== '/') {
        window.location.href = '/';
    } else {
        // If already on home page, just update UI and reload to be safe
        window.location.reload();
        // Or just update UI if reload is too disruptive:
        // updateUIBasedOnAuthState();
        // loadCartItemCount();
    }
}
// --- UI Updates Based on Auth State ---
function updateUIBasedOnAuthState() {
    console.log("[UI Update] Updating UI based on auth state:", JSON.stringify(authState));
    // Dynamic header rendering
    if (typeof renderHeader === 'function') {
        renderHeader(authState); // Let header component handle its internal logic
    }
    // General element visibility (example - adjust classes as needed)
    const loggedInElements = document.querySelectorAll('.logged-in-only');
    const loggedOutElements = document.querySelectorAll('.logged-out-only');
    const userElements = document.querySelectorAll('.user-only');
    const adminElements = document.querySelectorAll('.admin-only');
    const employeeElements = document.querySelectorAll('.employee-only'); // Includes admin
    if (authState.loggedIn) {
        loggedOutElements.forEach(el => el.classList.add('d-none'));
        loggedInElements.forEach(el => el.classList.remove('d-none'));
        const isUser = authState.role === 'user';
        const isEmployee = authState.role === 'employee';
        const isAdmin = authState.role === 'admin';
        userElements.forEach(el => el.style.display = isUser ? '' : 'none');
        adminElements.forEach(el => el.style.display = isAdmin ? '' : 'none');
        // Employees see employee AND admin content (adjust if needed)
        employeeElements.forEach(el => el.style.display = (isAdmin || isEmployee) ? '' : 'none');
    } else {
        loggedInElements.forEach(el => el.classList.add('d-none'));
        loggedOutElements.forEach(el => el.classList.remove('d-none'));
        userElements.forEach(el => el.style.display = 'none');
        adminElements.forEach(el => el.style.display = 'none');
        employeeElements.forEach(el => el.style.display = 'none');
    }
    // Update cart count display (might be called again by cart.js)
    if (typeof getCartItemCount === 'function') {
        updateCartCountHeader(getCartItemCount());
    }
}
// --- Cart Count Update ---
function loadCartItemCount() {
    if (typeof getCartItemCount === 'function') {
        cartItemCount = getCartItemCount();
        updateCartCountHeader(cartItemCount);
    } else {
        // Cart.js might not be loaded yet, especially on initial page load.
        // Header rendering will call this again once cart.js is ready.
    }
}
// --- Global Event Listeners ---
function setupGlobalListeners() {
    document.body.addEventListener('click', (event) => {
        // Logout Button
        if (event.target && event.target.id === 'logout-button') {
            handleLogout();
        }
        // Theme Toggle Button
        if (event.target && event.target.id === 'theme-toggle-button') {
            toggleTheme();
        }
        // Potentially add listeners for closing modals on backdrop click etc.
    });
}

async function initializeApp() {
    console.log("🚀 DOMContentLoaded: Initializing Application...");
    loadInitialTheme(); // Apply theme ASAP

    // **Wait for authentication state to be determined before proceeding**
    try {
        await checkLoginState();
        console.log("   ✅ Auth state resolved. Proceeding with further initialization.");
    } catch (err) {
        console.error("   ❌ Error during initial auth check:", err);
        // Decide if app should proceed even if auth check fails initially
    }

    setupGlobalListeners(); // Set up global click listeners

    // Inject Footer
    const footerPlaceholder = document.getElementById('footer-placeholder');
    if (footerPlaceholder) {
         footerPlaceholder.innerHTML = `<footer class="main-footer"><p>© ${new Date().getFullYear()} ElectroStore. All Rights Reserved.</p></footer>`;
    }

    // Trigger Page-Specific Initializations AFTER auth state is known
    const pageInitializers = {
        '/': ['initializeBannerTitle'],
        '/login': ['initializeAuthPage'],
        '/register': ['initializeAuthPage'],
        '/products': ['initializeProductsPage'],
        '/cart': ['initializeCartPage'],
        '/orders': ['initializeOrdersPage'],
        '/user-dashboard': ['initializeUserDashboardPage'],
        '/admin/dashboard': ['initializeAdminDashboard'],
        '/admin/manage-products': ['initializeManageProductsPage'],
        '/admin/manage-orders': ['initializeManageOrdersPage'],
    };

    const currentPath = window.location.pathname;
    const initializerFunctions = pageInitializers[currentPath] || [];

    console.log(`   Running initializers for path: ${currentPath}`);
    initializerFunctions.forEach(funcName => {
         if (typeof window[funcName] === 'function') {
             console.log(`      Initializing: ${funcName}`);
             try {
                window[funcName]();
             } catch (err) {
                console.error(`      Error during ${funcName} initialization:`, err);
             }
         } else {
             console.warn(`      Initializer function ${funcName} not found.`);
         }
    });

    console.log("✅ Application Initialization Complete.");
}

// --- Initialization ---
document.addEventListener('DOMContentLoaded', initializeApp);