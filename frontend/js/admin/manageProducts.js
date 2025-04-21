// js/admin/manageProducts.js
let currentProductPage = 1;
let currentProductLimit = 10;
let currentProductSearch = '';
let currentProductSort = 'MaSP';
let currentProductDirection = 'asc';
let totalProductPages = 1;
let isLoadingAdminProducts = false;

function initializeManageProductsPage() {
    console.log("Initializing Manage Products Page...");
    // Role check
    const requiredRoles = ['admin', 'employee'];
    if (!authState.loggedIn || !requiredRoles.includes(authState.role)) {
        document.getElementById('manage-products-content').innerHTML = '<p class="alert alert-danger">Access Denied.</p>';
        return;
    }

    const pageContent = document.getElementById('manage-products-content');
    const productsTableBody = document.getElementById('admin-products-tbody');
    const loadingIndicator = document.getElementById('loading-admin-products');
    const errorMessage = document.getElementById('admin-products-error');
    const searchInput = document.getElementById('admin-product-search');
    const prevPageButton = document.getElementById('admin-prev-page');
    const nextPageButton = document.getElementById('admin-next-page');
    const pageInfo = document.getElementById('admin-page-info');
    const addProductButton = document.getElementById('add-product-btn');
    const modal = document.getElementById('product-modal');
    const productForm = document.getElementById('product-form');
    const closeModalButton = document.querySelector('#product-modal .close-button');
    const modalTitle = document.getElementById('product-modal-title');
    const modalErrorMessage = document.getElementById('modal-error-message');
    const MaSPInput = document.getElementById('product-masp');
    const MaSPFormGroup = document.getElementById('masp-form-group'); // Get the form group div
    if (!productsTableBody || !loadingIndicator || !errorMessage || !modal || !productForm || !closeModalButton) {
        console.error("Required elements for Manage Products page or modal not found.");
        return;
    }
    // --- Render Table ---
    function renderProductsTable(products) {
        productsTableBody.innerHTML = ''; // Clear previous
        if (!products || products.length === 0) {
            productsTableBody.innerHTML = '<tr><td colspan="7">No products found.</td></tr>';
            return;
        }
        products.forEach(product => {
            const row = document.createElement('tr');
            row.dataset.productId = product.MaSP; // Store ID for easy access
            row.dataset.productData = JSON.stringify(product); // Store all data
            row.innerHTML = `
 <td>${product.MaSP}</td>
 <td>${product.name}</td>
 <td>${formatCurrency(product.price)}</td>
 <td>${product.soluong}</td>
 <td>${product.star || 0}</td>
 <td>${new Date(product.created_at || Date.now()).toLocaleDateString()}</td>
 <td class="actions">
 <button class="btn btn-sm btn-warning edit-btn">Edit</button>
 <button class="btn btn-sm btn-danger delete-btn">Delete</button>
 </td>
 `;
            productsTableBody.appendChild(row);
        });
    }

    function updateProductPagination() {
        pageInfo.textContent = `Page ${currentProductPage} of ${totalProductPages}`;
        prevPageButton.disabled = currentProductPage <= 1;
        nextPageButton.disabled = currentProductPage >= totalProductPages;
    }
    // --- Fetch Products ---
    async function fetchAdminProducts() {
        loadingIndicator.style.display = 'block';
        errorMessage.style.display = 'none';
        productsTableBody.innerHTML = ''; // Clear table
        const params = new URLSearchParams({
            page: currentProductPage,
            limit: currentProductLimit,
            search: currentProductSearch,
            sort: currentProductSort, // Add sorting later if needed via table headers
            direction: currentProductDirection
        });
        try {
            // Use the same public endpoint, but rendering includes admin actions
            const response = await fetchWithAuth(`/products?${params.toString()}`);
            if (response.success && response.data) {
                renderProductsTable(response.data.products);
                totalProductPages = response.data.totalPages;
                updateProductPagination();
            } else {
                errorMessage.textContent = `Error loading products: ${response.error || 'Unknown error'}`;
                errorMessage.style.display = 'block';
            }
        } catch (error) {
            console.error("Error fetching products for admin:", error);
            errorMessage.textContent = 'Failed to load products. Network or server error.';
            errorMessage.style.display = 'block';
        } finally {
            loadingIndicator.style.display = 'none';
        }
    }
    // --- Modal Handling ---
    function openModal(mode = 'add', productData = null) {
        productForm.reset();
        hideMessage('modal-error-message'); // Use global hideMessage
        productForm.dataset.mode = mode;
        productForm.dataset.editId = ''; // Clear edit ID for safety

        if (mode === 'edit' && productData) {
            modalTitle.textContent = 'Edit Product';
            productForm.dataset.editId = productData.MaSP;

            // Show and populate MaSP field for editing (read-only)
            if (MaSPFormGroup) MaSPFormGroup.style.display = 'block'; // Show the group
            if (MaSPInput) MaSPInput.value = productData.MaSP;

            // Populate other fields
            document.getElementById('product-name').value = productData.name || '';
            document.getElementById('product-price').value = productData.price ?? '';
            document.getElementById('product-soluong').value = productData.soluong ?? '';
            document.getElementById('product-star').value = productData.star ?? 0;

        } else { // Mode is 'add'
            modalTitle.textContent = 'Add New Product';
            // Hide MaSP field when adding
            if (MaSPFormGroup) MaSPFormGroup.style.display = 'none';
            if (MaSPInput) MaSPInput.value = ''; // Clear any previous value
        }
        modal.style.display = 'block';
    }

    // **MODIFIED:** Global closeModal function for Cancel button
    window.closeModal = function() { // Expose globally for onclick attribute
        if(modal) modal.style.display = 'none';
        if(productForm) productForm.reset();
        hideMessage('modal-error-message');
    }
    // --- Form Submission (Add/Edit) ---
    productForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideMessage('modal-error-message'); // Clear previous errors
        const mode = productForm.dataset.mode;
        const editId = productForm.dataset.editId; // Only relevant for edit mode

        // Get common form data (excluding MaSP initially)
        const commonFormData = {
            name: document.getElementById('product-name').value.trim(),
            price: parseFloat(document.getElementById('product-price').value),
            soluong: parseInt(document.getElementById('product-soluong').value),
            star: parseFloat(document.getElementById('product-star').value) || 0
        };

        // --- Frontend Validation ---
        if (!commonFormData.name || isNaN(commonFormData.price) || isNaN(commonFormData.soluong)) {
             showModalError('Name, Price, and Quantity are required and must be valid numbers.');
             return;
        }
        if (commonFormData.price < 0 || commonFormData.soluong < 0 || commonFormData.star < 0 || commonFormData.star > 5) {
            showModalError('Price/Quantity cannot be negative. Star rating must be 0-5.');
            return;
        }
        // Add other specific validations if needed

        const submitButton = productForm.querySelector('button[type="submit"]');
        submitButton.disabled = true;
        submitButton.textContent = 'Saving...';

        let url = '/products'; // Base URL for POST (add)
        let method = 'POST';
        let bodyData = commonFormData; // Use common data for POST

        if (mode === 'edit') {
            url = `/products/${editId}`; // URL for PUT (edit)
            method = 'PUT';
            // Body for PUT doesn't need MaSP (it's in the URL)
            // Backend PUT handler already expects only fields to update
            bodyData = commonFormData;
        }

        // --- API Call ---
        try {
            console.log(`[Manage Products] Submitting form - Mode: ${mode}, URL: ${url}, Method: ${method}, Data:`, bodyData);
            const response = await fetchWithAuth(url, {
                method: method,
                body: JSON.stringify(bodyData)
            });

            if (response.success) {
                console.log(`[Manage Products] Form submission successful. Response:`, response.data);
                closeModal();
                fetchAdminProducts(); // Refresh the table
                // Show success message on main page area
                showMessage('admin-products-error', `Product ${mode === 'add' ? 'added' : 'updated'} successfully!`, 'success');
            } else {
                 console.error(`[Manage Products] Error ${mode === 'add' ? 'adding' : 'updating'} product:`, response.error);
                 showModalError(`Error: ${response.error || 'Server error'}`); // Show error in modal
            }
        } catch (error) {
             // Should be caught by fetchWithAuth, but for safety
             console.error(`[Manage Products] Unexpected error submitting form (${mode}):`, error);
             showModalError(`An unexpected error occurred. Please try again.`);
        } finally {
            submitButton.disabled = false;
            submitButton.textContent = 'Save Product';
        }
    });

    function showModalError(message) {
        showMessage('modal-error-message', message, 'danger');
    }
    // --- Delete Product ---
    async function deleteProduct(productId) {
        if (!confirm(`Are you sure you want to delete product ${productId}? This cannot be undone and might fail if the product has associated orders.`)) {
            return;
        }
        try {
            const response = await fetchWithAuth(`/products/${productId}`, {
                method: 'DELETE'
            });
            // fetchWithAuth handles 204 correctly now
            if (response.success && response.status === 204) {
                showMessage('admin-products-error', `Product ${productId} deleted successfully.`, 'success');
                fetchAdminProducts(); // Refresh table
            } else {
                showMessage('admin-products-error', `Error deleting product ${productId}: ${response.error || 'Server error'}`, 'danger');
            }
        } catch (error) {
            console.error("Error deleting product:", error);
            showMessage('admin-products-error', `Failed to delete product ${productId}. Network or server error.`, 'danger');
        }
    }
    // --- Event Listeners ---
    if (addProductButton) {
        addProductButton.addEventListener('click', () => openModal('add'));
    }
    if (closeModalButton) {
        closeModalButton.addEventListener('click', closeModal);
    }
    // Close modal if clicking outside of it
    window.addEventListener('click', (event) => {
        if (event.target === modal) {
            closeModal();
        }
    });
    // Edit and Delete button listeners (using event delegation)
    productsTableBody.addEventListener('click', (event) => {
        const target = event.target;
        const row = target.closest('tr');
        if (!row) return;
        const productId = row.dataset.productId;
        if (target.classList.contains('edit-btn')) {
            try {
                const productData = JSON.parse(row.dataset.productData);
                openModal('edit', productData);
            } catch (e) {
                console.error("Could not parse product data for editing:", e);
                showMessage('admin-products-error', 'Error preparing product data for editing.', 'danger');
            }
        } else if (target.classList.contains('delete-btn')) {
            deleteProduct(productId);
        }
    });
    // Pagination and Search listeners
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                currentProductSearch = e.target.value.trim();
                currentProductPage = 1;
                fetchAdminProducts();
            }, 500);
        });
    }
    if (prevPageButton) {
        prevPageButton.addEventListener('click', () => {
            if (currentProductPage > 1) {
                currentProductPage--;
                fetchAdminProducts();
            }
        });
    }
    if (nextPageButton) {
        nextPageButton.addEventListener('click', () => {
            if (currentProductPage < totalProductPages) {
                currentProductPage++;
                fetchAdminProducts();
            }
        });
    }
    // --- Initial Load ---
    fetchAdminProducts();
}
// Make sure main.js calls initializeManageProductsPage on DOMContentLoaded
// document.addEventListener('DOMContentLoaded', initializeManageProductsPage); // Or called from main.js