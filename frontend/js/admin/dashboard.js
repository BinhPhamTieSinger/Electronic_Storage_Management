// js/admin/dashboard.js
// IMPORTANT: You'll need to include a charting library like Chart.js
// Add this to your dashboard.html: <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
function initializeAdminDashboard() {
    console.log("Initializing Admin Dashboard...");
    // Check if user has appropriate role (handled by page access, but good for sanity check)
    if (!authState.loggedIn || !['admin', 'employee'].includes(authState.role)) {
        console.warn("User does not have admin/employee role. Dashboard access denied.");
        // Optionally redirect or show message
        document.getElementById('dashboard-content').innerHTML = '<p class="alert alert-danger">Access Denied: You do not have permission to view this page.</p>';
        return;
    }
    fetchDashboardData();
    fetchAnalysisData(); // Fetch data for charts
}
async function fetchDashboardData() {
    const totalProductsEl = document.getElementById('total-products');
    const totalCustomersEl = document.getElementById('total-customers');
    const totalOrdersEl = document.getElementById('total-orders');
    const totalRevenueEl = document.getElementById('total-revenue');
    const recentOrdersTbody = document.getElementById('recent-orders-tbody');
    const loadingWidgets = document.getElementById('loading-widgets');
    const loadingRecentOrders = document.getElementById('loading-recent-orders');
    if (loadingWidgets) loadingWidgets.style.display = 'block';
    if (loadingRecentOrders) loadingRecentOrders.style.display = 'block';
    if (recentOrdersTbody) recentOrdersTbody.innerHTML = ''; // Clear previous
    try {
        const response = await fetchWithAuth('/dashboard'); // Requires auth
        if (response.success && response.data) {
            const data = response.data;
            if (totalProductsEl) totalProductsEl.textContent = data.totalProducts ?? 0;
            if (totalCustomersEl) totalCustomersEl.textContent = data.totalCustomers ?? 0;
            if (totalOrdersEl) totalOrdersEl.textContent = data.totalOrders ?? 0;
            if (totalRevenueEl) {
                totalRevenueEl.textContent = formatCurrency(data.totalRevenue ?? 0);
                totalRevenueEl.textContent = formatLargeNumber(data.totalRevenue, 1) + ' ₫';
            }
            if (recentOrdersTbody) {
                if (data.recentOrders && data.recentOrders.length > 0) {
                    data.recentOrders.forEach(order => {
                        const row = document.createElement('tr');
                        row.innerHTML = `
 <td>${order.MaDH}</td>
 <td>${order.NgayDat}</td>
 <td>${order.TenKH} (KH: ${order.MaKH})</td>
 <td>${order.product_name} (SP: ${order.MaSP})</td>
 <td>${order.SoLuong}</td>
 <td>${formatCurrency(order.TongTien)}</td>
 `;
                        recentOrdersTbody.appendChild(row);
                    });
                } else {
                    recentOrdersTbody.innerHTML = '<tr><td colspan="6">No recent orders found.</td></tr>';
                }
            }
        } else {
            console.error("Failed to load dashboard stats:", response.error);
            // Display error message in the UI
            document.getElementById('dashboard-content').innerHTML = `<p class="alert alert-danger">Error loading dashboard data: ${response.error || 'Server error'}</p>`;
        }
    } catch (error) {
        console.error("Error fetching dashboard data:", error);
        document.getElementById('dashboard-content').innerHTML = '<p class="alert alert-danger">Could not connect to server to load dashboard data.</p>';
    } finally {
        if (loadingWidgets) loadingWidgets.style.display = 'none';
        if (loadingRecentOrders) loadingRecentOrders.style.display = 'none';
    }
}
async function fetchAnalysisData() {
    console.log("Fetching analysis data for charts...");
    const loadingCharts = document.getElementById('loading-charts');
    if (loadingCharts) loadingCharts.style.display = 'block';
    try {
        const response = await fetchWithAuth('/analysis'); // Auth required
        if (response.success && response.data) {
            console.log("Analysis data received:", response.data);
            renderRevenueChart(response.data.revenueByMonth);
            renderTopProductsChart(response.data.topProductsData);
            renderStockLevelChart(response.data.stockLevels);
            renderCustomerDistributionChart(response.data.customerOrdersDistribution);
        } else {
            console.error("Failed to load analysis data:", response.error);
            document.getElementById('charts-row').innerHTML = `<p class="alert alert-danger">Error loading chart data: ${response.error || 'Server error'}</p>`;
        }
    } catch (error) {
        console.error("Error fetching analysis data:", error);
        document.getElementById('charts-row').innerHTML = '<p class="alert alert-danger">Could not connect to server to load chart data.</p>';
    } finally {
        if (loadingCharts) loadingCharts.style.display = 'none';
    }
}
// --- Chart Rendering Functions (using Chart.js) ---
let revenueChartInstance = null;

function renderRevenueChart(data) {
    const ctx = document.getElementById('revenueChart')?.getContext('2d');
    if (!ctx || !data) return;
    if (revenueChartInstance) {
        revenueChartInstance.destroy(); // Destroy previous instance if re-rendering
    }
    const labels = data.map(item => item.month);
    const revenueData = data.map(item => item.revenue);
    revenueChartInstance = new Chart(ctx, {
        type: 'line', // Or 'bar'
        data: {
            labels: labels,
            datasets: [{
                label: 'Monthly Revenue (VND)',
                data: revenueData,
                borderColor: 'rgb(75, 192, 192)',
                backgroundColor: 'rgba(75, 192, 192, 0.2)',
                tension: 0.1,
                fill: true
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value);
                        }
                    }
                }
            }
        }
    });
}
let topProductsChartInstance = null;

function renderTopProductsChart(data) {
    const ctx = document.getElementById('topProductsChart')?.getContext('2d');
    if (!ctx || !data) return;
    if (topProductsChartInstance) {
        topProductsChartInstance.destroy();
    }
    const labels = data.map(item => item.name);
    const salesData = data.map(item => item.sales); // Ensure backend sends 'sales' or 'total_sold'
    topProductsChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Total Units Sold',
                data: salesData,
                backgroundColor: [ // Example colors
                    'rgba(255, 99, 132, 0.6)',
                    'rgba(54, 162, 235, 0.6)',
                    'rgba(255, 206, 86, 0.6)',
                    'rgba(75, 192, 192, 0.6)',
                    'rgba(153, 102, 255, 0.6)',
                    'rgba(255, 159, 64, 0.6)',
                    'rgba(199, 199, 199, 0.6)',
                    'rgba(83, 102, 255, 0.6)',
                    'rgba(40, 159, 64, 0.6)',
                    'rgba(210, 99, 132, 0.6)'
                ],
                borderColor: '#fff', // Optional border
                borderWidth: 1
            }]
        },
        options: {
            indexAxis: 'y', // Horizontal bar chart is often better for product names
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            }, // Hide legend if only one dataset
            scales: {
                x: {
                    beginAtZero: true
                }
            }
        }
    });
}
let stockLevelChartInstance = null;

function renderStockLevelChart(data) {
    const ctx = document.getElementById('stockLevelChart')?.getContext('2d');
    if (!ctx || !data) return;
    if (stockLevelChartInstance) {
        stockLevelChartInstance.destroy();
    }
    stockLevelChartInstance = new Chart(ctx, {
        type: 'doughnut', // Or 'pie'
        data: {
            labels: ['Out of Stock', 'Low Stock (1-10)', 'Adequate Stock (>10)'],
            datasets: [{
                label: 'Stock Levels',
                data: [data.outOfStock, data.lowStock, data.adequateStock],
                backgroundColor: [
                    'rgb(255, 99, 132)', // Red
                    'rgb(255, 205, 86)', // Yellow
                    'rgb(75, 192, 192)' // Green/Blue
                ],
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top'
                },
                title: {
                    display: true,
                    text: 'Product Stock Status'
                }
            }
        }
    });
}
let customerDistChartInstance = null;

function renderCustomerDistributionChart(data) {
    const ctx = document.getElementById('customerDistChart')?.getContext('2d');
    if (!ctx || !data || !data.labels || !data.data) return;
    if (customerDistChartInstance) {
        customerDistChartInstance.destroy();
    }
    customerDistChartInstance = new Chart(ctx, {
        type: 'pie', // Or 'bar'
        data: {
            labels: data.labels, // Expecting ['0-200', '201-400', '400+']
            datasets: [{
                label: 'Customers by Total Order Quantity',
                data: data.data, // Expecting [count1, count2, count3]
                backgroundColor: [
                    'rgba(54, 162, 235, 0.7)',
                    'rgba(255, 159, 64, 0.7)',
                    'rgba(153, 102, 255, 0.7)'
                ],
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'top'
                },
                title: {
                    display: true,
                    text: 'Customer Order Quantity Distribution'
                }
            }
        }
    });
}
// Make sure main.js calls initializeAdminDashboard on DOMContentLoaded
// document.addEventListener('DOMContentLoaded', initializeAdminDashboard); // Or called from main.js