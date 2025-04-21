// === SHOPPING CART LOGIC ===
const CART_STORAGE_KEY = 'userCart';
// --- Core Cart Management Functions ---
function getCart() {
    const cartJson = localStorage.getItem(CART_STORAGE_KEY);
    try {
        const cart = JSON.parse(cartJson || '[]');
        // Basic validation: ensure it's an array of objects with required fields
        if (Array.isArray(cart) && cart.every(item => item && typeof item.id !== 'undefined' && typeof item.quantity === 'number')) {
            return cart;
        } else {
            console.warn("[Cart] Invalid cart data found in localStorage. Resetting.");
            localStorage.removeItem(CART_STORAGE_KEY); // Clear invalid data
            return [];
        }
    } catch (e) {
        console.error("[Cart] Error parsing cart from localStorage:", e);
        localStorage.removeItem(CART_STORAGE_KEY); // Clear corrupted data
        return [];
    }
}

function saveCart(cart) {
    if (!Array.isArray(cart)) {
        console.error("[Cart] Attempted to save invalid cart data type:", cart);
        return;
    }
    // Ensure basic structure before saving
    const validCart = cart.filter(item => item && typeof item.id !== 'undefined' && typeof item.quantity === 'number');
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(validCart));
    // Update header count immediately
    updateCartCountHeader(getCartItemCount()); // Assumes header.js function is available
}

function addItemToCart(productToAdd) {
    if (!productToAdd || typeof productToAdd.id === 'undefined' || isNaN(parseFloat(productToAdd.price))) {
        console.error("[Cart] Invalid product data provided to addItemToCart:", productToAdd);
        return;
    }
    // Sanitize product ID (convert to string for consistent matching)
    const productId = String(productToAdd.id);
    const cart = getCart();
    const existingItemIndex = cart.findIndex(item => String(item.id) === productId);
    const quantityToAdd = Math.max(1, parseInt(productToAdd.quantity || 1)); // Ensure at least 1
    if (existingItemIndex > -1) {
        // Item exists, increase quantity
        cart[existingItemIndex].quantity += quantityToAdd;
        console.log(`[Cart] Increased quantity for item ${productId} by ${quantityToAdd}. New quantity: ${cart[existingItemIndex].quantity}`);
    } else {
        // Item doesn't exist, add it - ensure necessary info is present
        cart.push({
            id: productId, // Store as string
            name: productToAdd.name || 'Unknown Product',
            price: parseFloat(productToAdd.price),
            quantity: quantityToAdd,
            // Add imageUrl if available/needed
            // imageUrl: productToAdd.imageUrl || 'path/to/default/image.png'
        });
        console.log(`[Cart] Added new item ${productId} with quantity ${quantityToAdd}.`);
    }
    saveCart(cart);
    showCartUpdateMessage(`${productToAdd.name || 'Item'} added to cart!`); // Provide feedback
}

function updateCartItemQuantity(productId, newQuantity) {
    const cart = getCart();
    const idStr = String(productId);
    const itemIndex = cart.findIndex(item => String(item.id) === idStr);

    if (itemIndex > -1) {
        const quantity = parseInt(newQuantity, 10);
        if (!isNaN(quantity) && quantity > 0) {
            cart[itemIndex].quantity = quantity;
            console.log(`[Cart] Updated quantity for item ${idStr} to ${quantity}.`);
            saveCart(cart);
        } else {
            console.log(`[Cart] Removing item ${idStr} due to invalid/zero quantity (${newQuantity}).`);
            removeItemFromCart(idStr); // Let removeItemFromCart handle save, message, and conditional render
            return; // Exit early
        }
        // **MODIFIED**: Conditional Render - Check if on cart page before rendering
        if (document.getElementById('cart-content-area')) { // Check for a reliable cart page element
            renderCartPage();
        } else {
            console.log("[Cart] updateCartItemQuantity: Not on cart page, skipping re-render.");
        }

        
        // **MODIFIED**: Conditional Render
        if (isOnCartPage()) { // Use helper function
            renderCartPage();
        }
    } else {
        console.warn(`[Cart] updateCartItemQuantity: Item with ID ${idStr} not found in cart.`);
    }
}

function removeItemFromCart(productId) {
    const idStr = String(productId);
    let cart = getCart();
    const initialLength = cart.length;
    cart = cart.filter(item => String(item.id) !== idStr);

    if (cart.length < initialLength) {
        console.log(`[Cart] Removed item ${idStr} from cart.`);
        saveCart(cart);
        showCartUpdateMessage(`Item removed from cart.`);
        // **MODIFIED**: Conditional Render - Check if on cart page before rendering
        if (document.getElementById('cart-content-area')) { // Check for a reliable cart page element
            renderCartPage();
        } else {
            console.log("[Cart] removeItemFromCart: Not on cart page, skipping re-render.");
        }
        if (isOnCartPage()) { // Use helper function
            renderCartPage();
        }
    } else {
         console.warn(`[Cart] removeItemFromCart: Item with ID ${idStr} not found.`);
    }
}

function clearCart() {
    saveCart([]);
    console.log("[Cart] Cart cleared.");
    showCartUpdateMessage('Cart has been cleared.');

    // **MODIFIED**: Conditional Render - Check if on cart page before rendering
    if (document.getElementById('cart-content-area')) { // Check for a reliable cart page element
        renderCartPage();
    } else {
         console.log("[Cart] clearCart: Not on cart page, skipping re-render.");
    }
}

function getCartTotal() {
    const cart = getCart();
    return cart.reduce((total, item) => {
        // Ensure price and quantity are valid numbers before calculation
        const price = parseFloat(item.price);
        const quantity = parseInt(item.quantity);
        if (!isNaN(price) && !isNaN(quantity)) {
            return total + (price * quantity);
        }
        return total; // Skip invalid items
    }, 0);
}

function getCartItemCount() {
    // Counts the number of *unique* items in the cart
    return getCart().length;
    // Or, to count total *quantity* of all items:
    // return getCart().reduce((count, item) => count + (parseInt(item.quantity) || 0), 0);
}
// --- Cart Page Rendering ---
function initializeCartPage() {
    const cartContentArea = document.getElementById('cart-content-area');
    const cartContainer = document.getElementById('cart-items-container');
    const cartSummary = document.getElementById('cart-summary');
    const cartEmptyMessage = document.getElementById('cart-empty-message');
    const checkoutButton = document.getElementById('checkout-button');
    const loadingIndicator = document.getElementById('cart-loading'); // Added loading indicator
    if (!cartContentArea || !cartContainer || !cartSummary || !cartEmptyMessage || !checkoutButton || !loadingIndicator) {
        console.warn("[Cart Page] Not on cart page or essential elements missing.");
        return;
    }
    console.log("[Cart Page] Initializing...");
    // Add listener for checkout button
    checkoutButton.addEventListener('click', handleCheckout);
    // Add listeners for quantity/remove using event delegation on the container
    cartContainer.addEventListener('change', handleCartAction);
    cartContainer.addEventListener('click', handleCartAction);
    // Initial render
    renderCartPage();
}

function renderCartPage() {
    console.log("[Cart Page] Rendering cart content...");
    const cart = getCart();
    const cartContainer = document.getElementById('cart-items-container');
    const cartSummary = document.getElementById('cart-summary');
    const cartEmptyMessage = document.getElementById('cart-empty-message');
    const cartContentArea = document.getElementById('cart-content-area'); // Wrapper
    const loadingIndicator = document.getElementById('cart-loading');
    const summarySubtotal = document.getElementById('summary-subtotal');
    const summaryTotal = document.getElementById('summary-total');
    if (!cartContainer || !cartSummary || !cartEmptyMessage || !cartContentArea || !loadingIndicator || !summarySubtotal || !summaryTotal) {
        console.warn("[Cart Page] renderCartPage: One or more required cart elements not found in the DOM. Skipping render.");
        return;
    }
    // Hide messages initially
    hideMessage('cart-page-messages');
    hideMessage('checkout-message');
    loadingIndicator.style.display = 'none'; // Hide loading indicator initially
    if (cart.length === 0) {
        cartEmptyMessage.style.display = 'block';
        cartContentArea.style.display = 'none'; // Hide table and summary area
        console.log("[Cart Page] Cart is empty.");
    } else {
        cartEmptyMessage.style.display = 'none';
        cartContentArea.style.display = 'block'; // Show table/summary area
        cartSummary.style.display = 'block'; // Ensure summary is visible
        // Build table content
        const tableHTML = `
 <table class="w-100">
 <thead>
 <tr>
 <th style="width: 50%;">Product</th>
 <th class="text-center">Price</th>
 <th class="text-center" style="width: 120px;">Quantity</th>
 <th class="text-right">Subtotal</th>
 <th></th> <!-- Remove action column header text -->
 </tr>
 </thead>
 <tbody>
 ${cart.map(item => `
 <tr>
 <td>
 <div class="product-info">
 <!-- <div class="product-image"><img src="${item.imageUrl || '/images/placeholder.png'}" alt="${item.name}"></div> -->
 <div class="product-details">
 <span class="product-name">${item.name}</span>
 <span class="product-id">ID: ${item.id}</span>
 </div>
 </div>
 </td>
 <td class="text-center">${formatCurrency(item.price)}</td>
 <td class="text-center item-quantity">
 <input type="number" value="${item.quantity}" min="1" max="999" data-product-id="${item.id}" class="quantity-input" aria-label="Quantity for ${item.name}">
 </td>
 <td class="text-right">${formatCurrency(item.price * item.quantity)}</td>
 <td class="text-center">
 <button class="remove-item-btn" data-product-id="${item.id}" title="Remove ${item.name} from cart">×</button>
 </td>
 </tr>
 `).join('')}
 </tbody>
 </table>
 `;
        cartContainer.innerHTML = tableHTML;
        // Update summary details
        const total = getCartTotal();
        if (summarySubtotal) summarySubtotal.textContent = formatCurrency(total); // Assuming subtotal = total for now
        if (summaryTotal) summaryTotal.textContent = formatCurrency(total);
        console.log(`[Cart Page] Rendered ${cart.length} items. Total: ${formatCurrency(total)}`);
    }
}

function handleCartAction(event) {
    const target = event.target;
    // Quantity Input Change
    if (target.classList.contains('quantity-input') && event.type === 'change') {
        const productId = target.dataset.productId;
        const newQuantity = parseInt(target.value, 10);
        // Let updateCartItemQuantity handle validation and removal if needed
        updateCartItemQuantity(productId, newQuantity);
    }
    // Remove Button Click
    if (target.classList.contains('remove-item-btn') && event.type === 'click') {
        const productId = target.dataset.productId;
        const productName = target.closest('tr')?.querySelector('.product-name')?.textContent || 'this item';
        // Optional: Confirmation dialog
        if (confirm(`Are you sure you want to remove "${productName}" from your cart?`)) {
            removeItemFromCart(productId);
        }
    }
}
// --- Checkout Logic ---
async function handleCheckout() {
    console.log("[Cart] Checkout process initiated.");
    const cart = getCart();
    // 1. Validations
    if (cart.length === 0) {
        showMessage('cart-page-messages', "Your cart is empty. Add some items before checking out.", "warning");
        return;
    }
    if (!authState.loggedIn || !authState.MaKH) {
        showMessage('cart-page-messages', "Please log in as a customer to place an order.", "warning");
        // Optional redirect: window.location.href = `/login?redirect=/cart`;
        return;
    }
    // 2. UI Preparation
    const checkoutButton = document.getElementById('checkout-button');
    const cartContainer = document.getElementById('cart-items-container');
    checkoutButton.disabled = true;
    checkoutButton.textContent = 'Processing Order...';
    hideMessage('checkout-message');
    hideMessage('cart-page-messages');
    // Disable cart interactions during checkout
    cartContainer.querySelectorAll('input, button').forEach(el => el.disabled = true);
    // *** IMPORTANT: Backend Limitation Handling ***
    // The current backend /api/orders only accepts ONE item per call.
    // We will make multiple calls sequentially.
    // A better backend would accept an array of items for a single transaction.
    console.log("[Cart] Placing orders individually due to backend structure...");
    let allSucceeded = true;
    let errorMessages = [];
    let successfulOrderIds = [];
    // 3. Process Each Cart Item
    for (const item of cart) {
        console.log(` Processing item: ${item.name} (ID: ${item.id}), Qty: ${item.quantity}`);
        try {
            const response = await fetchWithAuth('/orders', {
                method: 'POST',
                body: JSON.stringify({
                    MaSP: item.id, // Backend expects number, ensure conversion if needed
                    SoLuong: item.quantity
                }),
            });
            if (response.success && response.data?.orderId) {
                console.log(` ✅ Order successful for item ${item.id}. Order ID: ${response.data.orderId}`);
                successfulOrderIds.push(response.data.orderId);
            } else {
                // Order failed for this item
                allSucceeded = false;
                const errorText = response.error || `Failed to order item ${item.id}`;
                console.error(` ❌ Order failed for item ${item.id}: ${errorText}`);
                errorMessages.push(`- ${item.name}: ${errorText}`);
                // Decide whether to continue or stop on first error
                // break; // Uncomment to stop on first error
            }
        } catch (error) {
            // Network or unexpected fetch error
            allSucceeded = false;
            const errorText = error.message || 'Network error';
            console.error(` ❌ Network/fetch error for item ${item.id}: ${errorText}`);
            errorMessages.push(`- ${item.name}: ${errorText}`);
            break; // Stop processing on major fetch error
        }
        // Optional small delay between API calls
        // await new Promise(resolve => setTimeout(resolve, 150));
    }
    // 4. Process Checkout Result
    if (allSucceeded) {
        console.log("[Cart] Checkout fully successful!");
        showMessage('checkout-message', `Checkout successful! Your order(s) have been placed.`, 'success', null); // Persist success message
        clearCart(); // Clear cart on full success
        // Optionally redirect to orders page after delay
        setTimeout(() => {
            window.location.href = '/orders';
        }, 3000);
    } else {
        console.warn("[Cart] Checkout partially or fully failed.");
        let finalMessage = "There were issues placing your order.\n\nErrors:\n" + errorMessages.join("\n");
        if (successfulOrderIds.length > 0) {
            finalMessage += `\n\nSuccessfully ordered items (IDs: ${successfulOrderIds.join(', ')}) can be viewed in 'My Orders'. Items that failed remain in your cart.`;
            // Remove ONLY successfully ordered items (more complex) - For now, just inform user.
            // Consider implementing removal logic here if needed.
        } else {
            finalMessage += "\n\nNo items were successfully ordered.";
        }
        showMessage('checkout-message', finalMessage, 'danger', null); // Show persistent error message
        // Re-render cart to show remaining items (if partial failure and we didn't remove successful ones)
        renderCartPage();
    }
    // 5. Restore UI
    checkoutButton.disabled = false;
    checkoutButton.textContent = 'Place Order';
    // Re-enable cart interactions only if checkout failed completely or partially
    if (!allSucceeded) {
        cartContainer.querySelectorAll('input, button').forEach(el => el.disabled = false);
    }
}
// --- Helper for temporary "Item Added/Removed" messages ---
function showCartUpdateMessage(message) {
    // Use a dedicated toast/temporary message area if available, otherwise log
    console.log(`[Cart Update] ${message}`);
    // Example using a simple div (create #cart-toast in HTML or dynamically)
    let toast = document.getElementById('cart-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'cart-toast';
        // Basic styling (improve with CSS)
        toast.style.position = 'fixed';
        toast.style.bottom = '20px';
        toast.style.right = '20px';
        toast.style.padding = '12px 20px';
        toast.style.backgroundColor = 'var(--success-color)'; // Use success color
        toast.style.color = 'white';
        toast.style.borderRadius = 'var(--border-radius)';
        toast.style.zIndex = '1100';
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        toast.style.transform = 'translateY(20px)';
        document.body.appendChild(toast);
    }
    toast.textContent = message;
    // Show with animation
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateY(0)';
    });
    // Clear previous timer if any
    if (toast.hideTimeout) clearTimeout(toast.hideTimeout);
    // Hide after delay
    toast.hideTimeout = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(20px)';
        // Optional: remove element after hiding?
        // setTimeout(() => toast.remove(), 500);
    }, 3500); // Hide after 3.5 seconds
}
// Expose globally if called directly, but main.js handles it now
window.initializeCartPage = initializeCartPage;