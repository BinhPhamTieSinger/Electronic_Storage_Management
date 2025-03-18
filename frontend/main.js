// Check authentication status
function checkAuth() {
    const token = localStorage.getItem('token');
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    
    if (!token) {
        window.location.href = '/auth.html';
        return null;
    }
    return { token, user };
}

// Logout function
function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/auth.html';
}

// Chart configuration
const chartConfig = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        tooltip: {
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            padding: 10
        },
        legend: {
            display: false
        }
    }
};

// Initialize charts
let topProductsChart, monthlySalesChart, topCustomersChart, dailySalesChart;

// Format currency to VND
function formatCurrency(amount) {
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND'
    }).format(amount);
}

// Truncate text
function truncateText(text, maxLength = 20) {
    return text.length > maxLength ? text.substring(0, maxLength - 3) + '...' : text;
}

// Create and update charts
async function updateCharts() {
    try {
        // Top Products Chart
        const topProductsElement = document.getElementById('topProductsChart');
        if (topProductsElement) {
            const productsResponse = await fetch('/api/top-products');
            const productsData = await productsResponse.json();
            
            if (topProductsChart) topProductsChart.destroy();
            topProductsChart = new Chart(topProductsElement, {
                type: 'bar',
                data: {
                    labels: productsData.map(item => truncateText(item.name)),
                    datasets: [{
                        data: productsData.map(item => item.total_sold),
                        backgroundColor: 'rgba(40, 167, 69, 0.7)',
                        borderColor: 'rgb(40, 167, 69)',
                        borderWidth: 1
                    }]
                },
                options: {
                    ...chartConfig,
                    indexAxis: 'y',
                    scales: {
                        y: {
                            ticks: {
                                callback: function(value) {
                                    return truncateText(this.getLabelForValue(value), 15);
                                }
                            }
                        },
                        x: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Units Sold'
                            }
                        }
                    }
                }
            });
        }

        // Monthly Sales Chart
        const monthlySalesElement = document.getElementById('monthlySalesChart');
        if (monthlySalesElement) {
            const salesResponse = await fetch('/api/monthly-sales');
            const salesData = await salesResponse.json();
            
            if (monthlySalesChart) monthlySalesChart.destroy();
            monthlySalesChart = new Chart(monthlySalesElement, {
                type: 'bar',
                data: {
                    labels: salesData.map(item => {
                        const [year, month] = item.month.split('-');
                        return new Date(year, month - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                    }),
                    datasets: [{
                        data: salesData.map(item => item.total_sales),
                        backgroundColor: 'rgba(255, 193, 7, 0.7)',
                        borderColor: 'rgb(255, 193, 7)',
                        borderWidth: 1
                    }]
                },
                options: {
                    ...chartConfig,
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Total Sales (VND)'
                            },
                            ticks: {
                                callback: function(value) {
                                    return formatCurrency(value);
                                }
                            }
                        }
                    },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return formatCurrency(context.raw);
                                }
                            }
                        }
                    }
                }
            });
        }

        // Top Customers Chart
        const topCustomersElement = document.getElementById('topCustomersChart');
        if (topCustomersElement) {
            const customersResponse = await fetch('/api/top-customers');
            const customersData = await customersResponse.json();
            
            if (topCustomersChart) topCustomersChart.destroy();
            topCustomersChart = new Chart(topCustomersElement, {
                type: 'bar',
                data: {
                    labels: customersData.map(item => truncateText(item.TenKH)),
                    datasets: [{
                        data: customersData.map(item => item.total_quantity),
                        backgroundColor: 'rgba(23, 162, 184, 0.7)',
                        borderColor: 'rgb(23, 162, 184)',
                        borderWidth: 1
                    }]
                },
                options: {
                    ...chartConfig,
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Total Items Purchased'
                            }
                        }
                    },
                    plugins: {
                        tooltip: {
                            callbacks: {
                                afterLabel: function(context) {
                                    const customer = customersData[context.dataIndex];
                                    return `Total Spent: ${formatCurrency(customer.total_spent)}`;
                                }
                            }
                        }
                    }
                }
            });
        }

        // Daily Sales Chart
        const dailySalesElement = document.getElementById('dailySalesChart');
        if (dailySalesElement) {
            const dailyResponse = await fetch('/api/daily-sales');
            const dailyData = await dailyResponse.json();

            if (dailySalesChart) dailySalesChart.destroy();
            dailySalesChart = new Chart(dailySalesElement, {
                type: 'line',
                data: {
                    labels: dailyData.map(item => new Date(item.date).toLocaleDateString()),
                    datasets: [{
                        label: 'Products Sold',
                        data: dailyData.map(item => item.total_products),
                        borderColor: 'rgb(13, 110, 253)',
                        tension: 0.1,
                        fill: false
                    }, {
                        label: 'Revenue',
                        data: dailyData.map(item => item.total_amount),
                        borderColor: 'rgb(40, 167, 69)',
                        tension: 0.1,
                        fill: false,
                        hidden: true
                    }]
                },
                options: {
                    ...chartConfig,
                    plugins: {
                        ...chartConfig.plugins,
                        legend: {
                            display: true,
                            position: 'top'
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    if (context.dataset.label === 'Revenue') {
                                        return `${context.dataset.label}: ${formatCurrency(context.raw)}`;
                                    }
                                    return `${context.dataset.label}: ${context.raw}`;
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            title: {
                                display: true,
                                text: 'Count / VND'
                            },
                            ticks: {
                                callback: function(value, index, ticks) {
                                    if (this.chart.data.datasets[1].hidden) {
                                        return value;
                                    }
                                    return formatCurrency(value);
                                }
                            }
                        }
                    }
                }
            });
        }
    } catch (error) {
        console.error('Error updating charts:', error);
        showToast('Error updating charts', 'danger');
    }
}

// Update out of stock products
async function updateOutOfStock() {
    try {
        const response = await fetch('/api/out-of-stock');
        const data = await response.json();
        
        const tbody = document.querySelector('#outOfStockTable tbody');
        if (tbody) {
            tbody.innerHTML = data.map(item => `
                <tr>
                    <td>${item.MaSP}</td>
                    <td>${truncateText(item.name)}</td>
                    <td>${formatCurrency(item.price)}</td>
                    <td>${item.star} ⭐</td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Error updating out of stock products:', error);
    }
}

// Update top monthly product
async function updateTopMonthlyProduct() {
    const topProductElement = document.getElementById('topMonthlyProduct');
    if (!topProductElement) return;

    try {
        const response = await fetch('/api/top-monthly-product');
        const data = await response.json();
        
        if (data && data.length > 0) {
            const product = data[0];
            topProductElement.querySelector('.product-name').textContent = product.name;
            topProductElement.querySelector('.product-quantity').textContent = product.total_quantity;
            topProductElement.querySelector('.product-revenue').textContent = formatCurrency(product.total_revenue);
        }
    } catch (error) {
        console.error('Error updating top monthly product:', error);
    }
}

// Update inactive customers
async function updateInactiveCustomers() {
    try {
        const response = await fetch('/api/inactive-customers');
        const data = await response.json();
        
        const tbody = document.querySelector('#inactiveCustomersTable tbody');
        if (tbody) {
            tbody.innerHTML = data.map(item => `
                <tr>
                    <td>${item.MaKH}</td>
                    <td>${truncateText(item.TenKH)}</td>
                    <td>${item.SoDienThoai}</td>
                </tr>
            `).join('');
        }
    } catch (error) {
        console.error('Error updating inactive customers:', error);
    }
}

// Update largest order
async function updateLargestOrder() {
    try {
        const response = await fetch('/api/largest-single-order');
        const data = await response.json();
        
        if (data.length > 0) {
            const order = data[0];
            const container = document.getElementById('largestOrder');
            if (container) {
                container.querySelector('.order-id').textContent = `Order #${order.MaDH}`;
                container.querySelector('.customer').textContent = `Customer: ${order.TenKH}`;
                container.querySelector('.product').textContent = `Product: ${order.name}`;
                container.querySelector('.quantity').textContent = `Quantity: ${order.SoLuong}`;
                container.querySelector('.amount').textContent = formatCurrency(order.TongTien);
                container.querySelector('.date').textContent = new Date(order.NgayDat).toLocaleString();
            }
        }
    } catch (error) {
        console.error('Error updating largest order:', error);
    }
}

// Load home data
async function loadHomeData() {
    try {
        const response = await fetch('/api/dashboard');
        const data = await response.json();
        
        // Update statistics
        const totalOrdersElement = document.getElementById('totalOrders');
        const totalRevenueElement = document.getElementById('totalRevenue');
        const totalProductsElement = document.getElementById('totalProducts');
        const totalCustomersElement = document.getElementById('totalCustomers');
        
        if (totalOrdersElement) totalOrdersElement.textContent = data.totalOrders.toLocaleString();
        if (totalRevenueElement) totalRevenueElement.textContent = formatCurrency(data.totalRevenue);
        if (totalProductsElement) totalProductsElement.textContent = data.totalProducts.toLocaleString();
        if (totalCustomersElement) totalCustomersElement.textContent = data.totalCustomers.toLocaleString();

        // Load recent orders
        const recentOrdersTableBody = document.getElementById('recentOrdersTable')?.getElementsByTagName('tbody')[0];
        if (recentOrdersTableBody) {
            const ordersResponse = await fetch('/api/recent-orders');
            const { orders } = await ordersResponse.json();
            
            recentOrdersTableBody.innerHTML = '';
            
            if (Array.isArray(orders)) {
                orders.forEach(order => {
                    const row = recentOrdersTableBody.insertRow();
                    row.insertCell().textContent = order.MaDH;
                    row.insertCell().textContent = new Date(order.NgayDat).toLocaleDateString();
                    row.insertCell().textContent = order.TenKH;
                    row.insertCell().textContent = order.product_name;
                    row.insertCell().textContent = formatCurrency(order.TongTien);
                });
            }
        }

        // Load low stock products
        const lowStockTableBody = document.getElementById('lowStockTable')?.getElementsByTagName('tbody')[0];
        if (lowStockTableBody) {
            const outOfStockResponse = await fetch('/api/out-of-stock');
            const outOfStockData = await outOfStockResponse.json();
            
            lowStockTableBody.innerHTML = '';
            
            if (Array.isArray(outOfStockData)) {
                outOfStockData.forEach(product => {
                    const row = lowStockTableBody.insertRow();
                    row.insertCell().textContent = product.MaSP;
                    row.insertCell().textContent = product.name;
                    row.insertCell().textContent = product.stock;
                    const status = row.insertCell();
                    status.textContent = product.stock === 0 ? 'Out of Stock' : 'Low Stock';
                    status.className = product.stock === 0 ? 'text-danger' : 'text-warning';
                });
            }
        }
    } catch (error) {
        console.error('Error loading home data:', error);
        showToast('Error loading dashboard data', 'error');
    }
}

// Load order history
async function loadOrderHistory(page = 1) {
    const historyTable = document.getElementById('historyTable');
    const pagination = document.getElementById('historyPagination');
    if (!historyTable || !pagination) return;

    try {
        const startDate = document.getElementById('historyStartDate')?.value;
        const endDate = document.getElementById('historyEndDate')?.value;
        
        let url = `/api/order-history?page=${page}&limit=10`;
        if (startDate && endDate) {
            url += `&startDate=${startDate}&endDate=${endDate}`;
        }
        
        const response = await fetch(url);
        const data = await response.json();
        
        const tbody = historyTable.getElementsByTagName('tbody')[0];
        if (!tbody) return;
        
        tbody.innerHTML = '';
        
        if (Array.isArray(data.orders)) {
            data.orders.forEach(order => {
                const row = tbody.insertRow();
                row.insertCell().textContent = order.MaDH;
                row.insertCell().textContent = new Date(order.NgayDat).toLocaleDateString();
                row.insertCell().textContent = order.TenKH;
                row.insertCell().textContent = order.product_name;
                row.insertCell().textContent = order.SoLuong;
                row.insertCell().textContent = formatCurrency(order.TongTien);
            });
        }
        
        // Update pagination
        pagination.innerHTML = '';
        
        if (data.totalPages > 0) {
            // Previous button
            const prevLi = document.createElement('li');
            prevLi.className = `page-item ${data.currentPage === 1 ? 'disabled' : ''}`;
            prevLi.innerHTML = `<a class="page-link" href="#" onclick="event.preventDefault(); loadOrderHistory(${data.currentPage - 1})">Previous</a>`;
            pagination.appendChild(prevLi);
            
            // Calculate page range to display
            let startPage = Math.max(1, data.currentPage - 2);
            let endPage = Math.min(data.totalPages, startPage + 4);
            
            // Adjust start if we're near the end
            if (endPage - startPage < 4) {
                startPage = Math.max(1, endPage - 4);
            }
            
            // First page and ellipsis
            if (startPage > 1) {
                const firstLi = document.createElement('li');
                firstLi.className = 'page-item';
                firstLi.innerHTML = `<a class="page-link" href="#" onclick="event.preventDefault(); loadOrderHistory(1)">1</a>`;
                pagination.appendChild(firstLi);
                
                if (startPage > 2) {
                    const ellipsisLi = document.createElement('li');
                    ellipsisLi.className = 'page-item disabled';
                    ellipsisLi.innerHTML = '<span class="page-link">...</span>';
                    pagination.appendChild(ellipsisLi);
                }
            }
            
            // Page numbers
            for (let i = startPage; i <= endPage; i++) {
                const li = document.createElement('li');
                li.className = `page-item ${i === data.currentPage ? 'active' : ''}`;
                li.innerHTML = `<a class="page-link" href="#" onclick="event.preventDefault(); loadOrderHistory(${i})">${i}</a>`;
                pagination.appendChild(li);
            }
            
            // Last page and ellipsis
            if (endPage < data.totalPages) {
                if (endPage < data.totalPages - 1) {
                    const ellipsisLi = document.createElement('li');
                    ellipsisLi.className = 'page-item disabled';
                    ellipsisLi.innerHTML = '<span class="page-link">...</span>';
                    pagination.appendChild(ellipsisLi);
                }
                
                const lastLi = document.createElement('li');
                lastLi.className = 'page-item';
                lastLi.innerHTML = `<a class="page-link" href="#" onclick="event.preventDefault(); loadOrderHistory(${data.totalPages})">${data.totalPages}</a>`;
                pagination.appendChild(lastLi);
            }
            
            // Next button
            const nextLi = document.createElement('li');
            nextLi.className = `page-item ${data.currentPage === data.totalPages ? 'disabled' : ''}`;
            nextLi.innerHTML = `<a class="page-link" href="#" onclick="event.preventDefault(); loadOrderHistory(${data.currentPage + 1})">Next</a>`;
            pagination.appendChild(nextLi);
        }
    } catch (error) {
        console.error('Error loading order history:', error);
        showToast('Error loading order history', 'error');
    }
}

// Handle order form submission
async function handleOrderSubmit(event) {
    event.preventDefault();
    
    const auth = checkAuth();
    if (!auth) {
        showToast('Please log in to place an order', 'error');
        return;
    }

    const productId = document.getElementById('MaSP').value;
    const quantity = document.getElementById('SoLuong').value;

    if (!productId || !quantity) {
        showToast('Please select a product and quantity', 'error');
        return;
    }

    try {
        const response = await fetch('/api/orders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${auth.token}`
            },
            body: JSON.stringify({
                MaSP: productId,
                SoLuong: parseInt(quantity)
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to place order');
        }

        const data = await response.json();
        showToast('Order placed successfully!', 'success');
        
        // Reset form
        document.getElementById('orderForm').reset();
        
        // Refresh data based on current section
        const currentSection = document.querySelector('.section.active');
        if (currentSection) {
            if (currentSection.id === 'home') {
                loadHomeData();
                updateCharts();
            } else if (currentSection.id === 'history') {
                loadOrderHistory(1); // Reset to first page to show newest order
            } else if (currentSection.id === 'products') {
                loadProducts(currentProductsPage); // Refresh current page to update stock
            }
        } else {
            // If no section is active, refresh home data anyway
            loadHomeData();
            updateCharts();
        }
        
        // Close modal if it exists
        const orderModal = bootstrap.Modal.getInstance(document.getElementById('orderModal'));
        if (orderModal) {
            orderModal.hide();
        }
    } catch (error) {
        console.error('Error placing order:', error);
        showToast(error.message || 'Error placing order', 'error');
    }
}

// Attach event listener to order form
document.addEventListener('DOMContentLoaded', () => {
    const orderForm = document.getElementById('orderForm');
    if (orderForm) {
        orderForm.addEventListener('submit', handleOrderSubmit);
    }
});

// Handle section changes
function showSection(sectionId) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    document.getElementById(sectionId).classList.add('active');
    
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
    });
    document.querySelector(`[onclick="showSection('${sectionId}')"]`).classList.add('active');

    // Load section-specific data
    if (sectionId === 'home') {
        loadHomeData();
    } else if (sectionId === 'history') {
        loadOrderHistory();
    } else if (sectionId === 'products') {
        loadProducts();
    }
}

// Refresh data every 30 seconds
setInterval(() => {
    const currentSection = document.querySelector('.section.active');
    if (currentSection) {
        if (currentSection.id === 'home') {
            loadHomeData();
        } else if (currentSection.id === 'history') {
            loadOrderHistory();
        } else if (currentSection.id === 'products') {
            loadProducts();
        }
    }
}, 30000);

// Toast notification helper
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    const toastBody = toast.querySelector('.toast-body');
    
    toast.classList.remove('bg-success', 'bg-danger');
    toast.classList.add(`bg-${type}`);
    toast.classList.add('text-white');
    
    toastBody.textContent = message;
    
    const bsToast = new bootstrap.Toast(toast);
    bsToast.show();
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    const auth = checkAuth();
    if (auth) {
        const userInfo = document.getElementById('userInfo');
        if (userInfo) {
            userInfo.textContent = `Welcome, ${auth.user.username}`;
        }
        
        // Load initial data
        loadHomeData();
        
        // Set default dates for history filter
        const today = new Date();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(today.getDate() - 30);
        
        const historyStartDate = document.getElementById('historyStartDate');
        const historyEndDate = document.getElementById('historyEndDate');
        if (historyStartDate && historyEndDate) {
            historyStartDate.valueAsDate = thirtyDaysAgo;
            historyEndDate.valueAsDate = today;
        }
        
        // Initialize charts
        updateCharts();
        
        // Update dashboard data
        updateOutOfStock();
        updateTopMonthlyProduct();
        updateInactiveCustomers();
        updateLargestOrder();
    }
});

// Products page variables
let currentProductsPage = 1;
let currentSortBy = 'MaSP';
let currentSortOrder = 'asc';
let currentSearch = '';

// Load products data
async function loadProducts(page = 1) {
    try {
        const url = new URL('/api/products', window.location.origin);
        url.searchParams.set('page', page);
        url.searchParams.set('limit', 10);
        url.searchParams.set('sortBy', currentSortBy);
        url.searchParams.set('sortOrder', currentSortOrder);
        if (currentSearch) {
            url.searchParams.set('search', currentSearch);
        }

        const response = await fetch(url);
        if (!response.ok) {
            throw new Error('Failed to fetch products');
        }

        const data = await response.json();
        displayProducts(data);
    } catch (error) {
        console.error('Error loading products:', error);
        showToast('Error loading products', 'error');
    }
}

// Display products in table
function displayProducts(data) {
    const tbody = document.getElementById('productsTableBody');
    const pagination = document.getElementById('productsPagination');
    
    if (!tbody || !pagination) return;

    // Clear existing content
    tbody.innerHTML = '';
    pagination.innerHTML = '';

    // Display products
    data.products.forEach(product => {
        const row = tbody.insertRow();
        row.innerHTML = `
            <td>${product.MaSP}</td>
            <td>${product.name}</td>
            <td>${truncateText(product.description || '', 50)}</td>
            <td>${formatCurrency(product.price)}</td>
            <td>
                <span class="${product.soluong === 0 ? 'text-danger' : product.soluong < 10 ? 'text-warning' : 'text-success'}">
                    ${product.soluong}
                </span>
            </td>
            <td>${product.category || '-'}</td>
            <td>${product.image_url ? `<img src="${product.image_url}" alt="${product.name}" style="max-height: 50px;">` : '-'}</td>
        `;
    });

    // Update pagination
    if (data.totalPages > 0) {
        // Previous button
        const prevLi = document.createElement('li');
        prevLi.className = `page-item ${data.currentPage === 1 ? 'disabled' : ''}`;
        prevLi.innerHTML = `<a class="page-link" href="#" onclick="event.preventDefault(); loadProducts(${data.currentPage - 1})">Previous</a>`;
        pagination.appendChild(prevLi);

        // Calculate page range
        let startPage = Math.max(1, data.currentPage - 2);
        let endPage = Math.min(data.totalPages, startPage + 4);
        
        if (endPage - startPage < 4) {
            startPage = Math.max(1, endPage - 4);
        }

        // First page and ellipsis
        if (startPage > 1) {
            pagination.appendChild(createPageItem(1));
            if (startPage > 2) {
                const ellipsis = document.createElement('li');
                ellipsis.className = 'page-item disabled';
                ellipsis.innerHTML = '<span class="page-link">...</span>';
                pagination.appendChild(ellipsis);
            }
        }

        // Page numbers
        for (let i = startPage; i <= endPage; i++) {
            pagination.appendChild(createPageItem(i, i === data.currentPage));
        }

        // Last page and ellipsis
        if (endPage < data.totalPages) {
            if (endPage < data.totalPages - 1) {
                const ellipsis = document.createElement('li');
                ellipsis.className = 'page-item disabled';
                ellipsis.innerHTML = '<span class="page-link">...</span>';
                pagination.appendChild(ellipsis);
            }
            pagination.appendChild(createPageItem(data.totalPages));
        }

        // Next button
        const nextLi = document.createElement('li');
        nextLi.className = `page-item ${data.currentPage === data.totalPages ? 'disabled' : ''}`;
        nextLi.innerHTML = `<a class="page-link" href="#" onclick="event.preventDefault(); loadProducts(${data.currentPage + 1})">Next</a>`;
        pagination.appendChild(nextLi);
    }

    currentProductsPage = data.currentPage;
}

// Create pagination item
function createPageItem(pageNum, isActive = false) {
    const li = document.createElement('li');
    li.className = `page-item ${isActive ? 'active' : ''}`;
    li.innerHTML = `<a class="page-link" href="#" onclick="event.preventDefault(); loadProducts(${pageNum})">${pageNum}</a>`;
    return li;
}

// Handle product search
function searchProducts() {
    const searchInput = document.getElementById('productSearch');
    if (!searchInput) return;
    
    currentSearch = searchInput.value.trim();
    currentProductsPage = 1;
    loadProducts(1);
}

// Handle product sorting
function sortProducts(sortBy, sortOrder) {
    currentSortBy = sortBy;
    currentSortOrder = sortOrder;
    currentProductsPage = 1;
    loadProducts(1);
}

// Add debounced search
let searchTimeout;
document.getElementById('productSearch')?.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        currentSearch = e.target.value.trim();
        currentProductsPage = 1;
        loadProducts(1);
    }, 300);
});
