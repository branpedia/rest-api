// Create floating particles
function createParticles() {
    const particlesContainer = document.getElementById('particles');
    const particleCount = 20;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.classList.add('particle');
        
        // Random size between 5 and 15 pixels
        const size = Math.random() * 10 + 5;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;
        
        // Random position
        particle.style.left = `${Math.random() * 100}vw`;
        particle.style.top = `${Math.random() * 100}vh`;
        
        // Random animation duration between 10 and 30 seconds
        const duration = Math.random() * 20 + 10;
        particle.style.animationDuration = `${duration}s`;
        
        // Random delay
        particle.style.animationDelay = `-${Math.random() * 20}s`;
        
        particlesContainer.appendChild(particle);
    }
}

// Navigation
document.querySelectorAll('.sidebar-menu a, .hero-buttons a').forEach(link => {
    link.addEventListener('click', function(e) {
        e.preventDefault();
        
        // Update active link in sidebar
        document.querySelectorAll('.sidebar-menu a').forEach(l => l.classList.remove('active'));
        const targetId = this.getAttribute('data-target');
        document.querySelector(`.sidebar-menu a[data-target="${targetId}"]`).classList.add('active');
        
        // Show corresponding section with animation
        document.querySelectorAll('.section').forEach(section => {
            section.classList.remove('active');
        });
        
        const targetSection = document.getElementById(targetId);
        targetSection.classList.add('active');
        targetSection.classList.add('fade-in-up');
        
        // Close sidebar on mobile after selection
        if (window.innerWidth < 992) {
            document.querySelector('.sidebar').classList.remove('active');
        }
        
        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });
});

// Copy endpoint functionality
document.querySelectorAll('.copy-btn').forEach(button => {
    button.addEventListener('click', function() {
        const endpoint = this.getAttribute('data-endpoint');
        navigator.clipboard.writeText(endpoint).then(() => {
            const originalText = this.innerHTML;
            this.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => {
                this.innerHTML = originalText;
            }, 2000);
        });
    });
});

// Copy result functionality
document.querySelectorAll('.copy-result-btn').forEach(button => {
    button.addEventListener('click', function() {
        const responseContent = this.closest('.response').textContent.trim();
        // Remove the "Response" text and button text
        const jsonContent = responseContent.replace('Response', '').replace('Copy Result', '').trim();
        
        navigator.clipboard.writeText(jsonContent).then(() => {
            const originalText = this.innerHTML;
            this.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => {
                this.innerHTML = originalText;
            }, 2000);
        });
    });
});

// Fungsi untuk test endpoint
window.testEndpoint = function(inputId, resultId, endpoint = '/api/mediafire') {
    const urlInput = document.getElementById(inputId);
    const resultDiv = document.getElementById(resultId);
    const testBtn = urlInput.nextElementSibling;
    
    const url = urlInput.value.trim();
    
    // Validasi input
    if (!url) {
        showError(resultDiv, 'URL tidak boleh kosong!');
        return;
    }
    
    if (endpoint === '/api/mediafire' && !url.includes('mediafire.com')) {
        showError(resultDiv, 'URL harus berasal dari MediaFire!');
        return;
    }
    
    // Tampilkan loading
    const originalText = testBtn.innerHTML;
    testBtn.innerHTML = '<span class="loading-spinner"></span> Loading...';
    testBtn.disabled = true;
    
    resultDiv.innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <span class="loading-spinner"></span>
            <p>Memproses request...</p>
        </div>
    `;
    resultDiv.className = 'test-result';
    
    // Build API URL
    let apiUrl = `${window.location.origin}${endpoint}`;
    if (url) {
        apiUrl += `?url=${encodeURIComponent(url)}`;
    }
    
    // Panggil API
    fetch(apiUrl)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            // Kembalikan tampilan tombol
            testBtn.innerHTML = originalText;
            testBtn.disabled = false;
            
            // Tampilkan hasil
            if (data.success) {
                showSuccess(resultDiv, data);
            } else {
                showError(resultDiv, data.error, data.tips);
            }
        })
        .catch(error => {
            // Kembalikan tampilan tombol
            testBtn.innerHTML = originalText;
            testBtn.disabled = false;
            showError(resultDiv, 'Error: ' + error.message);
        });
};

// Fungsi untuk menampilkan hasil sukses
function showSuccess(resultDiv, data) {
    const formattedData = JSON.stringify(data, null, 2);
    
    resultDiv.innerHTML = `
        <div class="result-header">
            <span class="result-title">✅ Success</span>
            <button class="copy-btn" onclick="copyToClipboard('${data.data.downloadUrl}')">
                <i class="fas fa-copy"></i> Copy URL
            </button>
        </div>
        <pre>${formattedData}</pre>
        ${data.data.downloadUrl ? `
        <div style="margin-top: 10px;">
            <a href="${data.data.downloadUrl}" target="_blank" style="color: var(--primary-light); word-break: break-all;">
                <i class="fas fa-download"></i> Download File
            </a>
        </div>
        ` : ''}
    `;
    resultDiv.className = 'test-result success';
}

// Fungsi untuk menampilkan error
function showError(resultDiv, error, tips = '') {
    resultDiv.innerHTML = `
        <div class="result-header">
            <span class="result-title">❌ Error</span>
        </div>
        <div style="color: var(--danger);">
            <p>${error}</p>
            ${tips ? `<p><strong>Tips:</strong> ${tips}</p>` : ''}
        </div>
    `;
    resultDiv.className = 'test-result error';
}

// Fungsi untuk copy ke clipboard
window.copyToClipboard = function(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert('Berhasil disalin ke clipboard!');
    }).catch(err => {
        alert('Gagal menyalin: ' + err);
    });
};

// Mobile menu toggle
document.querySelector('.menu-toggle').addEventListener('click', function() {
    document.querySelector('.sidebar').classList.toggle('active');
});

// Theme toggle
const themeToggle = document.getElementById('themeToggle');
themeToggle.addEventListener('click', function() {
    document.body.classList.toggle('light-mode');
    if (document.body.classList.contains('light-mode')) {
        themeToggle.innerHTML = '<i class="fas fa-sun"></i>';
        document.body.style.background = 'linear-gradient(135deg, #f1f5f9 0%, #e2e8f0 100%)';
        document.body.style.color = '#1e293b';
    } else {
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
        document.body.style.background = 'linear-gradient(135deg, var(--darker) 0%, var(--dark) 100%)';
        document.body.style.color = 'var(--light)';
    }
});

// Initialize particles
createParticles();

// Add animation to stats cards on scroll
const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
};

const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.animation = 'fadeInUp 0.6s ease forwards';
            observer.unobserve(entry.target);
        }
    });
}, observerOptions);

// Observe all sections and cards for animation
document.querySelectorAll('.section, .stat-card').forEach(el => {
    observer.observe(el);
});

// Close sidebar when clicking outside on mobile
document.addEventListener('click', function(e) {
    if (window.innerWidth < 992 && 
        !e.target.closest('.sidebar') && 
        !e.target.closest('.menu-toggle') &&
        document.querySelector('.sidebar').classList.contains('active')) {
        document.querySelector('.sidebar').classList.remove('active');
    }
});
