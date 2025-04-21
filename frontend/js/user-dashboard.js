// === USER DASHBOARD PAGE LOGIC ===
function initializeUserDashboardPage() {
    console.log("[User Dashboard] Initializing...");
    // Get DOM Elements
    const loadingIndicator = document.getElementById('loading-user-dashboard');
    const errorDisplay = document.getElementById('user-dashboard-error');
    const contentArea = document.getElementById('user-dashboard-content');
    const usernameDisplay = document.getElementById('user-dashboard-username');
    const totalOrdersEl = document.getElementById('user-total-orders');
    const totalSpentEl = document.getElementById('user-total-spent');
    const recentOrdersTbody = document.getElementById('user-recent-orders-tbody');
    const noRecentOrdersMsg = document.getElementById('no-recent-orders-message');
    const monthlySpendingChartCtx = document.getElementById('userMonthlySpendingChart')?.getContext('2d');
    const noSpendingChartMsg = document.getElementById('no-spending-chart-message');
    if (!loadingIndicator || !errorDisplay || !contentArea || !usernameDisplay || !totalOrdersEl || !totalSpentEl || !recentOrdersTbody || !noRecentOrdersMsg || !monthlySpendingChartCtx || !noSpendingChartMsg) {
        console.error("[User Dashboard] Critical elements missing. Aborting initialization.");
        contentArea.innerHTML = '<p class="alert alert-danger container">Error: Could not initialize dashboard elements.</p>';
        return;
    }
    // Check login state
    if (!authState.loggedIn || !authState.MaKH || authState.role !== 'user') {
        console.warn(`[User Dashboard] Access denied based on current authState. LoggedIn: ${authState.loggedIn}, MaKH: ${authState.MaKH}, Role: ${authState.role}`);
        contentArea.innerHTML = '<p class="alert alert-warning container">Access Denied: Please log in as a customer to view your dashboard.</p>';
        return;
    }
    console.log(`[User Dashboard] Auth check passed for user: ${authState.username}`);

    usernameDisplay.textContent = authState.username;
    // --- Fetch User Analysis Data ---
    async function fetchUserAnalysisData() {
        console.log("[User Dashboard] Fetching user analysis data...");
        loadingIndicator.style.display = 'block';
        errorDisplay.style.display = 'none'; // Hide previous errors
        // Hide content sections while loading? Optional.
        // recentOrdersTbody.closest('.admin-table-container').style.display = 'none';
        // document.getElementById('user-charts-section').style.display = 'none';
        try {
            const response = await fetchWithAuth('/user-analysis'); // Use the dedicated endpoint
            if (response.success && response.data) {
                console.log("[User Dashboard] Data received:", response.data);
                renderUserDashboard(response.data);
                // Show content sections after rendering
                // recentOrdersTbody.closest('.admin-table-container').style.display = 'block';
                // document.getElementById('user-charts-section').style.display = 'block';
            } else {
                console.error("[User Dashboard] Failed to load data:", response.error);
                showError(`Failed to load dashboard data: ${response.error || 'Server Error'}`);
            }
        } catch (error) {
            // Should be caught by fetchWithAuth
            console.error("[User Dashboard] Unexpected error fetching data:", error);
            showError('Could not connect to the server to load your data.');
        } finally {
            loadingIndicator.style.display = 'none';
        }
    }
    // --- Render Dashboard Content ---
    function renderUserDashboard(data) {
        // Widgets
        totalOrdersEl.textContent = data.totalOrders ?? 0;
        totalSpentEl.textContent = formatCurrency(data.totalSpent ?? 0);
        // Recent Orders Table
        renderRecentOrders(data.recentOrders || []);
        // Monthly Spending Chart
        renderMonthlySpendingChart(data.monthlySpending || []);
    }

    function renderRecentOrders(orders) {
        recentOrdersTbody.innerHTML = ''; // Clear loading/previous
        if (orders.length === 0) {
            noRecentOrdersMsg.style.display = 'block';
            recentOrdersTbody.style.display = 'none'; // Hide tbody if empty
        } else {
            noRecentOrdersMsg.style.display = 'none';
            recentOrdersTbody.style.display = ''; // Show tbody
            orders.forEach(order => {
                const row = document.createElement('tr');
                row.innerHTML = `
 <td>${order.MaDH || 'N/A'}</td>
 <td>${order.NgayDat || 'N/A'}</td>
 <td>${order.product_name || 'N/A'}</td>
 <td class="text-center">${order.SoLuong || 0}</td>
 <td class="text-right">${formatCurrency(order.TongTien)}</td>
 `;
                recentOrdersTbody.appendChild(row);
            });
        }
    }
    // --- Chart Rendering ---
    let monthlyChartInstance = null;

    function renderMonthlySpendingChart(spendingData) {
        const canvas = monthlySpendingChartCtx.canvas;
        if (!canvas) return;
        if (monthlyChartInstance) {
            monthlyChartInstance.destroy(); // Clear previous chart if re-rendering
        }
        if (!spendingData || spendingData.length === 0) {
            noSpendingChartMsg.style.display = 'block';
            canvas.style.display = 'none';
            return;
        }
        noSpendingChartMsg.style.display = 'none';
        canvas.style.display = 'block';
        // Sort data chronologically if needed (backend should ideally do this)
        spendingData.sort((a, b) => a.month.localeCompare(b.month));
        const labels = spendingData.map(item => item.month);
        const data = spendingData.map(item => item.monthly_total);
        monthlyChartInstance = new Chart(monthlySpendingChartCtx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Monthly Spending',
                    data: data,
                    backgroundColor: 'rgba(74, 144, 226, 0.6)', // Primary color with opacity
                    borderColor: 'rgba(74, 144, 226, 1)',
                    borderWidth: 1,
                    borderRadius: 4, // Rounded bars
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false, // Allow chart to fill container height
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: function(value) {
                                return formatCurrency(value);
                            },
                            color: 'var(--text-color-muted)' // Axis text color
                        },
                        grid: {
                            color: 'var(--border-color)', // Grid line color
                            drawBorder: false,
                        }
                    },
                    x: {
                        ticks: {
                            color: 'var(--text-color-muted)'
                        },
                        grid: {
                            display: false // Hide vertical grid lines
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }, // Hide legend for single dataset
                    tooltip: {
                        backgroundColor: 'var(--bg-color)',
                        titleColor: 'var(--text-color-headings)',
                        bodyColor: 'var(--text-color)',
                        borderColor: 'var(--border-color)',
                        borderWidth: 1,
                        callbacks: {
                            label: function(context) {
                                return ` Spending: ${formatCurrency(context.parsed.y)}`;
                            }
                        }
                    }
                }
            }
        });
    }

    function showError(message) {
        errorDisplay.textContent = message;
        errorDisplay.style.display = 'block';
        // Optionally hide other content areas
        document.querySelector('.dashboard-widgets')?.classList.add('d-none');
        document.querySelector('.recent-orders-section')?.classList.add('d-none');
        document.getElementById('user-charts-section')?.classList.add('d-none');
    }
    // --- Initial Fetch ---
    fetchUserAnalysisData();
}
// Expose globally if called directly, but main.js handles it now
window.initializeUserDashboardPage = initializeUserDashboardPage;