// js/admin/manageOrders.js
let currentOrderPage = 1;
let currentOrderLimit = 15;
let currentOrderSearch = '';
// Add sorting if needed (e.g., by NgayDat)
let totalOrderPages = 1;

function initializeManageOrdersPage() {
    console.log("Initializing Manage Orders Page...");
    // Role check
    if (!authState.loggedIn || !['admin', 'employee'].includes(authState.role)) {
        document.getElementById('manage-orders-content').innerHTML = '<p class="alert alert-danger">Access Denied.</p>';
        return;
    }
    const ordersTableBody = document.getElementById('admin-orders-tbody');
    const loadingIndicator = document.getElementById('loading-admin-orders');
    const errorMessage = document.getElementById('admin-orders-error');
    const searchInput = document.getElementById('admin-order-search');
    const prevPageButton = document.getElementById('admin-order-prev-page');
    const nextPageButton = document.getElementById('admin-order-next-page');
    const pageInfo = document.getElementById('admin-order-page-info');
    if (!ordersTableBody || !loadingIndicator || !errorMessage || !pageInfo) {
        console.error("Required elements for Manage Orders page not found.");
        return;
    }
    // --- Render Table ---
    function renderOrdersTable(orders) {
        ordersTableBody.innerHTML = ''; // Clear previous
        if (!orders || orders.length === 0) {
            ordersTableBody.innerHTML = '<tr><td colspan="7">No orders found.</td></tr>';
            return;
        }
        orders.forEach(order => {
            const row = document.createElement('tr');
            // Add data attributes if actions like 'view details' or 'update status' were needed
            row.innerHTML = `
 <td>${order.MaDH}</td>
 <td>${order.NgayDat}</td>
 <td>${order.TenKH || 'N/A'}</td>
 <td>${order.product_name || 'N/A'}</td>
 <td>${order.SoLuong}</td>
 <td>${formatCurrency(order.TongTien)}</td>
 <td class="actions">
 <!-- Add actions if needed, e.g., View Details, Update Status -->
 <button class="btn btn-sm btn-info view-details-btn" data-order-id="${order.MaDH}" disabled title="Details not implemented">Details</button>
 </td>
 `;
            ordersTableBody.appendChild(row);
        });
    }

    function updateOrderPagination() {
        pageInfo.textContent = `Page ${currentOrderPage} of ${totalOrderPages}`;
        prevPageButton.disabled = currentOrderPage <= 1;
        nextPageButton.disabled = currentOrderPage >= totalOrderPages;
    }
    // --- Fetch Orders ---
    async function fetchAdminOrders() {
        loadingIndicator.style.display = 'block';
        errorMessage.style.display = 'none';
        ordersTableBody.innerHTML = '';
        const params = new URLSearchParams({
            page: currentOrderPage,
            limit: currentOrderLimit,
            search: currentOrderSearch,
            // sort: 'NgayDat', // Default sort might be handled by backend
            // direction: 'desc'
        });
        try {
            // Use the existing /api/orders endpoint which has pagination/search
            const response = await fetchWithAuth(`/orders?${params.toString()}`); // Requires auth
            if (response.success && response.data) {
                renderOrdersTable(response.data.orders);
                totalOrderPages = response.data.totalPages;
                updateOrderPagination();
            } else {
                errorMessage.textContent = `Error loading orders: ${response.error || 'Unknown error'}`;
                errorMessage.style.display = 'block';
            }
        } catch (error) {
            console.error("Error fetching orders for admin:", error);
            errorMessage.textContent = 'Failed to load orders. Network or server error.';
            errorMessage.style.display = 'block';
        } finally {
            loadingIndicator.style.display = 'none';
        }
    }
    // --- Event Listeners ---
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                currentOrderSearch = e.target.value.trim();
                currentOrderPage = 1;
                fetchAdminOrders();
            }, 500);
        });
    }
    if (prevPageButton) {
        prevPageButton.addEventListener('click', () => {
            if (currentOrderPage > 1) {
                currentOrderPage--;
                fetchAdminOrders();
            }
        });
    }
    if (nextPageButton) {
        nextPageButton.addEventListener('click', () => {
            if (currentOrderPage < totalOrderPages) {
                currentOrderPage++;
                fetchAdminOrders();
            }
        });
    }
    // Listener for actions (if any added later)
    ordersTableBody.addEventListener('click', (event) => {
        if (event.target.classList.contains('view-details-btn')) {
            const orderId = event.target.dataset.orderId;
            alert(`Order details view for ${orderId} is not yet implemented.`);
            // Future: Open a modal or navigate to a detail page with orderId
        }
    });
    // --- Initial Load ---
    fetchAdminOrders();
}
// Make sure main.js calls initializeManageOrdersPage on DOMContentLoaded
// document.addEventListener('DOMContentLoaded', initializeManageOrdersPage); // Or called from main.js