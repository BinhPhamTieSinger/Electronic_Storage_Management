// === USER ORDERS PAGE LOGIC ===
function initializeOrdersPage() {
    
    console.log("[Orders Page] Current Auth State on Init:", JSON.stringify(authState));
    console.log("[Orders Page] Initializing...");
    // Get DOM Elements
    const ordersTableBody = document.getElementById('user-orders-tbody');
    const loadingIndicator = document.getElementById('loading-orders');
    const errorMessage = document.getElementById('orders-error-message');
    const noOrdersMessage = document.getElementById('no-orders-message'); // Message for empty table
    if (!ordersTableBody || !loadingIndicator || !errorMessage || !noOrdersMessage) {
        console.error("[Orders Page] Required elements not found. Aborting initialization.");
        // Optionally display an error in a known container
        const mainContainer = document.querySelector('main.container');
        if (mainContainer) {
            mainContainer.innerHTML = '<p class="alert alert-danger">Error initializing orders page elements.</p>';
        }
        return;
    }
    // --- Fetch User Orders ---
    async function fetchUserOrders() {
        console.log("[Orders Page] Fetching user orders...");
        loadingIndicator.style.display = 'block';
        ordersTableBody.innerHTML = ''; // Clear previous data
        errorMessage.style.display = 'none'; // Hide error message
        noOrdersMessage.style.display = 'none'; // Hide no orders message
        // Check if user is logged in and is a customer
        if (!authState.loggedIn || !authState.MaKH || authState.role !== 'user') {
            console.warn(`[Orders Page] Access denied based on current authState. LoggedIn: ${authState.loggedIn}, MaKH: ${authState.MaKH}, Role: ${authState.role}`);
            loadingIndicator.style.display = 'none';
            showMessage('orders-error-message', 'Access Denied: Please log in as a customer to view orders.', 'danger', null);
            return;
       }
        try {
            const response = await fetchWithAuth('/my-orders'); // Uses token from authState via fetchWithAuth

            if (response.success && Array.isArray(response.data?.orders)) {
                console.log(`[Orders Page] Received ${response.data.orders.length} orders.`);
                if (response.data.orders.length === 0) {
                    noOrdersMessage.style.display = 'block';
                } else {
                    renderOrdersTable(response.data.orders);
                }
            } else {
                 console.error("[Orders Page] Error fetching orders:", response.error || 'Invalid data format');
                 showMessage('orders-error-message', `Failed to load orders: ${response.error || 'Server error'}`, 'danger', null);
            }
        } catch (error) {
            // Should be caught by fetchWithAuth, but as fallback
            console.error("[Orders Page] Unexpected error fetching user orders:", error);
            showMessage('orders-error-message', 'An unexpected error occurred while loading orders.', 'danger', null); // Persistent message
        }
        finally { loadingIndicator.style.display = 'none'; }
    }
    // --- Render Orders Table ---
    function renderOrdersTable(orders) {
        ordersTableBody.innerHTML = ''; // Clear just in case
        orders.forEach(order => {
            const row = document.createElement('tr');
            row.innerHTML = `
 <td>${order.MaDH || 'N/A'}</td>
 <td>${order.NgayDat || 'N/A'}</td>
 <td>
 ${order.product_name || 'Product Not Found'}
 <small class="d-block text-muted">ID: ${order.MaSP || 'N/A'}</small>
 </td>
 <td class="text-center">${order.SoLuong || 0}</td>
 <td class="text-right">${formatCurrency(order.TongTien)}</td>
 <!-- Add status column if applicable -->
 `;
            ordersTableBody.appendChild(row);
        });
    }
    // --- Initial Fetch ---
    fetchUserOrders();
}
// Expose globally if called directly, but main.js handles it now
window.initializeOrdersPage = initializeOrdersPage;