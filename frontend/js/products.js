// === PRODUCTS PAGE LOGIC ===
let currentProductPage = 1;
let currentProductLimit = 12;
let currentProductSearch = '';
let currentProductSort = 'created_at'; // Default sort by newest
let currentProductDirection = 'desc';
let totalProductPages = 1;
let isLoadingProducts = false;
window.initializeProductsPage = function() {
    console.log("[Products Page] Initializing...");
    const productsGrid = document.getElementById('products-grid');
    const loadingIndicator = document.getElementById('loading-products');
    const noProductsMessage = document.getElementById('no-products-message');
    const searchInput = document.getElementById('product-search');
    const sortSelect = document.getElementById('product-sort');
    const prevPageButton = document.getElementById('prev-page');
    const nextPageButton = document.getElementById('next-page');
    const pageInfo = document.getElementById('page-info');
    const messagePlaceholder = document.getElementById('cart-message-placeholder');

    if (!productsGrid || !loadingIndicator || !pageInfo || !prevPageButton || !nextPageButton || !noProductsMessage || !sortSelect) {
        console.error("[Products Page] Critical elements missing. Aborting initialization.");
        return;
    }

    // --- Render Functions ---
    function renderProducts(products) {
        productsGrid.innerHTML = ''; // Clear previous products
        if (!products || products.length === 0) {
            noProductsMessage.style.display = 'block'; // Show no products message
            productsGrid.style.display = 'none';
            return;
        }
        noProductsMessage.style.display = 'none'; // Hide message
        productsGrid.style.display = 'grid'; // Ensure grid is visible
        products.forEach(product => {
            const card = document.createElement('div');
            card.className = 'product-card';
            let stockClass = '';
            let stockText = `Stock: ${product.soluong}`;
            let isOutOfStock = false;
            if (product.soluong === 0) {
                stockClass = 'out-of-stock';
                stockText = 'Out of Stock';
                isOutOfStock = true;
            } else if (product.soluong <= 10) {
                stockClass = 'low-stock';
                stockText = `Low Stock (${product.soluong})`;
            }
            const rating = Math.round(product.star || 0);
            const fullStars = '★'.repeat(rating);
            const emptyStars = '☆'.repeat(5 - rating);
            card.innerHTML = `
                <h3>${product.name || 'Unnamed Product'}</h3>
                <div class="price">${formatCurrency(product.price)}</div>
                <div class="stock-rating-line">
                    <span class="stock ${stockClass}">${stockText}</span>
                    <span class="stars" title="${product.star?.toFixed(1) || '0.0'}/5.0 Rating">
                        ${fullStars}<span class="muted-star">${emptyStars}</span>
                    </span>
                </div>
                <button
                    class="btn btn-sm btn-add-to-cart"
                    data-product-id="${product.MaSP}"
                    data-product-name="${product.name || 'Product'}"
                    data-product-price="${product.price}"
                    ${isOutOfStock ? 'disabled' : ''}>
                    ${isOutOfStock ? 'Out of Stock' : 'Add to Cart'}
                </button>
            `;
            productsGrid.appendChild(card);
        });
    }

    // **CORRECTED** updatePaginationControls: Use correct state variables
    function updatePaginationControls() {
        pageInfo.textContent = `Page ${currentProductPage} of ${totalProductPages || 1}`;
        // Use the component's state variables
        prevPageButton.disabled = currentProductPage <= 1 || isLoadingProducts;
        nextPageButton.disabled = currentProductPage >= totalProductPages || isLoadingProducts;
    }

    // --- Fetch Products --- **CORRECTED** API Params & Error Handling
    async function fetchProducts() {
        if (isLoadingProducts) return;
        isLoadingProducts = true;
        console.log(`[Products Page] Fetching - Page: ${currentProductPage}, Sort: ${currentProductSort} ${currentProductDirection}, Search: '${currentProductSearch}'`);

        loadingIndicator.style.display = 'block';
        noProductsMessage.style.display = 'none';
        productsGrid.style.display = 'none';
        updatePaginationControls(); // Disable buttons

        // **CORRECTED**: Use correct state variable for 'page' parameter
        const params = new URLSearchParams({
            page: currentProductPage, // USE currentProductPage
            limit: currentProductLimit,
            search: currentProductSearch,
            sort: currentProductSort,
            direction: currentProductDirection
        });

        try {
            const response = await fetchWithAuth(`/products?${params.toString()}`);

            if (response.success && response.data) {
                // **CORRECTED**: Use correct property name from backend response
                totalPages = response.data.totalPages; // Get totalPages from response
                totalProductPages = totalPages; // Update global state
                console.log(`[Products Page] Total pages: ${totalProductPages}`);
                renderProducts(response.data.products);
            } else {
                console.error("Error loading products:", response.error);
                showMessage(messagePlaceholder?.id || 'cart-message-placeholder', `Error loading products: ${response.error || 'Server error'}`, 'danger');
                renderProducts([]); // Render empty state
                totalPages = 1; // Reset pagination state on error
                currentProductPage = 1; // Reset page number
            }
        } catch (error) {
            console.error("Unexpected error fetching products:", error);
            showMessage(messagePlaceholder?.id || 'cart-message-placeholder', 'Failed to load products. Please try again later.', 'danger');
            renderProducts([]);
            totalPages = 1;
            currentProductPage = 1; // Reset page number
        } finally {
            isLoadingProducts = false;
            loadingIndicator.style.display = 'none';
            updatePaginationControls(); // Update buttons based on final state
        }
     }

    // --- Event Listeners --- (Corrected logic - update state BEFORE fetch)
    if (searchInput) {
        let searchTimeout;
        searchInput.addEventListener('input', (e) => {
            clearTimeout(searchTimeout);
            searchTimeout = setTimeout(() => {
                // Update state *before* fetching
                currentProductSearch = e.target.value.trim();
                currentProductPage = 1; // Reset page on new search
                console.log(`[Products Page] Search input changed to: ${currentProductSearch}`);
                fetchProducts(); // Fetch with new state
            }, 400);
        });
    }

    if (sortSelect) {
        sortSelect.value = `${currentProductSort}-${currentProductDirection}`; // Set initial value
        sortSelect.addEventListener('change', (e) => {
            const [sortField, sortDir] = e.target.value.split('-');
            // Update state *before* fetching
            currentProductSort = sortField;
            currentProductDirection = sortDir;
            currentProductPage = 1; // Reset page on sort change
            console.log(`[Products Page] Sort changed to: ${currentProductSort} ${currentProductDirection}`);
            fetchProducts(); // Fetch with new state
        });
    }

    if (prevPageButton) {
        prevPageButton.addEventListener('click', () => {
            // Check state *before* fetching
            if (currentProductPage > 1 && !isLoadingProducts) {
                currentProductPage--; // Update state
                console.log(`[Products Page] Prev button clicked. New page: ${currentProductPage}`);
                fetchProducts(); // Fetch with new state
            }
        });
    }

    if (nextPageButton) {
        nextPageButton.addEventListener('click', () => {
            // Check state *before* fetching
            if (currentProductPage < totalProductPages && !isLoadingProducts) {
                currentProductPage++; // Update state
                console.log(`[Products Page] Next button clicked. New page: ${currentProductPage}`);
                fetchProducts(); // Fetch with new state
            }
        });
    }
    // Event delegation for "Add to Cart" buttons
    productsGrid.addEventListener('click', (event) => {
        const button = event.target.closest('.btn-add-to-cart'); // Find button even if icon inside is clicked
        if (button && !button.disabled) {
            // Check if user is logged in AND has 'user' role
            if (!authState.loggedIn) {
                showMessage(messagePlaceholder?.id || 'cart-message-placeholder', 'Please log in to add items to your cart.', 'warning');
                // Optional: Redirect to login with redirect back parameter
                // window.location.href = `/login?redirect=${window.location.pathname}${window.location.search}`;
                return;
            }
            if (authState.role !== 'user') {
                showMessage(messagePlaceholder?.id || 'cart-message-placeholder', 'Only registered customers can add items to the cart.', 'warning');
                return;
            }
            const productId = button.dataset.productId;
            const productName = button.dataset.productName;
            const productPrice = parseFloat(button.dataset.productPrice);
            if (typeof addItemToCart === 'function') {
                addItemToCart({
                    id: productId,
                    name: productName,
                    price: productPrice,
                    quantity: 1 // Add one at a time
                });
                // Visual feedback
                button.textContent = 'Added ✔';
                button.classList.add('added'); // Add class for potential styling
                button.disabled = true; // Temporarily disable
                setTimeout(() => {
                    // Reset button after a short delay
                    button.textContent = 'Add to Cart';
                    button.classList.remove('added');
                    // Re-enable only if product is still in stock (fetchProducts might update this)
                    // For simplicity, we re-enable here. A more robust solution would check stock again.
                    button.disabled = false;
                }, 1500); // Reset after 1.5 seconds
            } else {
                console.error("[Products Page] addItemToCart function is not available.");
                showMessage(messagePlaceholder?.id || 'cart-message-placeholder', 'Error: Could not add item to cart.', 'danger');
            }
        }
    });
    // --- Initial Load ---
    fetchProducts();
}
// Expose globally if called directly, but main.js handles it now
// window.initializeProductsPage = initializeProductsPage;