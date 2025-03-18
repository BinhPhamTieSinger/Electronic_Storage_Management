// Handle form display toggling
function toggleForms() {
    const loginCard = document.getElementById('loginCard');
    const registerCard = document.getElementById('registerCard');
    
    if (loginCard.style.display === 'none') {
        loginCard.style.display = 'block';
        registerCard.style.display = 'none';
    } else {
        loginCard.style.display = 'none';
        registerCard.style.display = 'block';
    }
}

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

// Handle registration
document.getElementById('registerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = {
        username: document.getElementById('username').value,
        tenKH: document.getElementById('tenKH').value,
        diaChi: document.getElementById('diaChi').value,
        soDienThoai: document.getElementById('soDienThoai').value,
        password: document.getElementById('password').value,
        confirmPassword: document.getElementById('confirmPassword').value
    };

    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();
        
        if (response.ok) {
            showToast('Registration successful! Please login.');
            toggleForms();
            e.target.reset();
        } else {
            showToast(data.error, 'danger');
        }
    } catch (error) {
        showToast('Error during registration', 'danger');
    }
});

// Handle login
document.getElementById('loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const formData = {
        username: document.getElementById('loginUsername').value,
        password: document.getElementById('loginPassword').value
    };

    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });

        const data = await response.json();
        
        if (response.ok) {
            // Store token and user info
            localStorage.setItem('token', data.token);
            localStorage.setItem('user', JSON.stringify(data.user));
            
            // Redirect to main page
            window.location.href = '/index.html';
        } else {
            showToast(data.error, 'danger');
        }
    } catch (error) {
        showToast('Error during login', 'danger');
    }
});
