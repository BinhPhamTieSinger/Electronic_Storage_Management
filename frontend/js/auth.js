// === AUTHENTICATION PAGE LOGIC ===
function initializeAuthPage() {
    const loginForm = document.getElementById('login-form');
    const registerForm = document.getElementById('register-form');
    const authError = document.getElementById('auth-error');
    const authSuccess = document.getElementById('auth-success'); // For registration
    console.log(`[Auth Page] Initializing. Login form found: ${!!loginForm}, Register form found: ${!!registerForm}`);
    // --- Helper to show messages within the auth container ---
    const showAuthMessage = (message, isSuccess = false) => {
        const targetElement = isSuccess ? authSuccess : authError;
        const otherElement = isSuccess ? authError : authSuccess;
        if (targetElement) {
            showMessage(targetElement.id, message, isSuccess ? 'success' : 'danger', 8000); // Use global showMessage
        }
        if (otherElement) hideMessage(otherElement.id); // Hide the other message area
    };
    const hideAuthMessages = () => {
        if (authError) hideMessage(authError.id);
        if (authSuccess) hideMessage(authSuccess.id);
    };
    // --- Handle Login Form Submission ---
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideAuthMessages();
            const username = loginForm.username.value.trim();
            const password = loginForm.password.value.trim();
            if (!username || !password) {
                showAuthMessage('Please enter both username and password.');
                return;
            }
            const loginButton = loginForm.querySelector('button[type="submit"]');
            loginButton.disabled = true;
            loginButton.textContent = 'Logging in...';
            try {
                const response = await fetchWithAuth('/login', {
                    method: 'POST',
                    body: JSON.stringify({
                        username,
                        password
                    }),
                });
                if (response.success) {
                    handleLoginSuccess(response.data); // Use main.js handler
                    // Redirect after successful login
                    const urlParams = new URLSearchParams(window.location.search);
                    const redirectUrl = urlParams.get('redirect') || '/'; // Redirect to intended or home
                    console.log(`[Auth Page] Login success, redirecting to: ${redirectUrl}`);
                    window.location.href = redirectUrl; // Perform redirect
                } else {
                    // fetchWithAuth handles token errors, show specific login fail message
                    showAuthMessage(response.error || 'Login failed. Please check credentials.');
                    console.warn(`[Auth Page] Login failed: ${response.error}`);
                }
            } catch (error) {
                // Should be caught by fetchWithAuth, but as fallback
                console.error("[Auth Page] Unexpected error during login submission:", error);
                showAuthMessage('An unexpected error occurred. Please try again.');
            } finally {
                loginButton.disabled = false;
                loginButton.textContent = 'Login';
            }
        });
    }
    // --- Handle Register Form Submission ---
    if (registerForm) {
        // Add required stars dynamically for better accessibility/maintenance
        registerForm.querySelectorAll('label span.required-star').forEach(span => span.setAttribute('aria-hidden', 'true'));
        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            hideAuthMessages();
            // Get form data
            const username = registerForm.username.value.trim();
            const password = registerForm.password.value.trim();
            const confirmPassword = registerForm.confirmPassword.value.trim();
            const tenKH = registerForm.tenKH.value.trim();
            const diaChi = registerForm.diaChi.value.trim();
            const soDienThoai = registerForm.soDienThoai.value.trim();
            // Basic frontend validation
            if (!username || !password || !confirmPassword || !tenKH) {
                showAuthMessage('Please fill in all required fields (*).');
                return;
            }
            if (password.length < 6) {
                showAuthMessage('Password must be at least 6 characters long.');
                return;
            }
            if (password !== confirmPassword) {
                showAuthMessage('Passwords do not match.');
                registerForm.confirmPassword.focus(); // Focus confirm password field
                return;
            }
            const registerButton = registerForm.querySelector('button[type="submit"]');
            registerButton.disabled = true;
            registerButton.textContent = 'Registering...';
            try {
                const response = await fetchWithAuth('/register', {
                    method: 'POST',
                    body: JSON.stringify({
                        username,
                        password,
                        confirmPassword, // Send confirmation for potential backend double-check
                        tenKH,
                        diaChi: diaChi || null, // Send null if empty
                        soDienThoai: soDienThoai || null
                    }),
                });
                if (response.success) {
                    console.log("[Auth Page] Registration successful.");
                    showAuthMessage('Registration successful! Redirecting to login...', true);
                    registerForm.reset(); // Clear the form
                    // Redirect to login page after a short delay
                    setTimeout(() => {
                        window.location.href = '/login?message=Registration successful. Please log in.';
                    }, 2500); // ~2.5 seconds delay
                } else {
                    // Display specific error from backend (e.g., username exists)
                    showAuthMessage(response.error || 'Registration failed. Please try again.');
                    console.warn(`[Auth Page] Registration failed: ${response.error}`);
                }
            } catch (error) {
                console.error("[Auth Page] Unexpected error during registration submission:", error);
                showAuthMessage('An unexpected error occurred during registration.');
            } finally {
                registerButton.disabled = false;
                registerButton.textContent = 'Register';
            }
        });
    }
    // --- Check for messages in URL parameters (e.g., after redirect) ---
    const urlParams = new URLSearchParams(window.location.search);
    const message = urlParams.get('message');
    const messageType = urlParams.get('type') || 'info'; // default to info
    if (message) {
        // Display message in the appropriate area (error or success)
        showAuthMessage(message, messageType === 'success');
        // Clean the URL params to avoid showing message on refresh
        // Use try/catch in case history API is not fully supported
        try {
            const cleanUrl = window.location.pathname; // URL without query string
            window.history.replaceState(null, '', cleanUrl);
        } catch (e) {
            console.warn("Could not clean URL parameters using history.replaceState.");
        }
    }
}
// Expose globally if called directly, but main.js handles it now
window.initializeAuthPage = initializeAuthPage;