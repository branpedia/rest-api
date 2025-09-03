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
function setupCopyResultButtons() {
    document.querySelectorAll('.copy-result-btn').forEach(button => {
        // Hapus event listener lama jika ada
        button.replaceWith(button.cloneNode(true));
    });

    document.querySelectorAll('.copy-result-btn').forEach(button => {
        button.addEventListener('click', function() {
            const responseElement = this.closest('.response');
            const preElement = responseElement.querySelector('pre');
            const jsonContent = preElement.textContent;
            
            navigator.clipboard.writeText(jsonContent).then(() => {
                const originalText = this.innerHTML;
                this.innerHTML = '<i class="fas fa-check"></i> Copied!';
                setTimeout(() => {
                    this.innerHTML = '<i class="fas fa-copy"></i> Copy Result';
                }, 2000);
            });
        });
    });
}

// Fungsi untuk test endpoint
function testEndpoint(endpoint, url) {
    return new Promise((resolve, reject) => {
        // Build API URL
        let apiUrl = `${window.location.origin}${endpoint}?url=${encodeURIComponent(url)}`;
        
        // Panggil API
        fetch(apiUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                resolve(data);
            })
            .catch(error => {
                reject(error);
            });
    });
}

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

// Event listener untuk semua tombol Test Endpoint
document.addEventListener('DOMContentLoaded', function() {
    setupCopyResultButtons();
    
    document.querySelectorAll('.try-btn').forEach(button => {
        button.addEventListener('click', async function() {
            const endpoint = this.getAttribute('data-endpoint');
            const endpointElement = this.closest('.endpoint');
            const responseElement = endpointElement.querySelector('.response');
            const copyResultBtn = responseElement.querySelector('.copy-result-btn');
            
            // Buat modal untuk input URL
            let defaultUrl = '';
            if (endpoint === '/api/mediafire') {
                defaultUrl = 'https://www.mediafire.com/file/vj3al1c98u2zdr6/Terakomari_-_MD.zip/file';
            } else if (endpoint === '/api/youtube') {
                defaultUrl = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
            }
            
            const url = prompt('Masukkan URL yang ingin di-test:', defaultUrl);
            
            // Validasi input
            if (!url) {
                return;
            }
            
            if (endpoint === '/api/mediafire' && !url.includes('mediafire.com')) {
                alert('URL harus berasal dari MediaFire!');
                return;
            }
            
            // Tampilkan loading pada tombol
            const originalText = this.innerHTML;
            this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
            this.disabled = true;
            
            // Tampilkan loading pada response
            const originalResponse = responseElement.innerHTML;
            responseElement.innerHTML = `
                <div class="response-header">
                    <span class="response-title">Response</span>
                    <button class="copy-result-btn" disabled><i class="fas fa-spinner fa-spin"></i> Loading</button>
                </div>
                <div style="text-align: center; padding: 20px;">
                    <span class="loading-spinner"></span>
                    <p>Memproses request...</p>
                </div>
            `;
            
            try {
                // Panggil API
                const data = await testEndpoint(endpoint, url);
                
                // Kembalikan tampilan tombol
                this.innerHTML = originalText;
                this.disabled = false;
                
                // Format JSON dengan indentasi
                const formattedData = JSON.stringify(data, null, 2);
                
                // Update response dengan hasil real
                responseElement.innerHTML = `
                    <div class="response-header">
                        <span class="response-title">Response</span>
                        <button class="copy-result-btn"><i class="fas fa-copy"></i> Copy Result</button>
                    </div>
                    <pre>${formattedData}</pre>
                `;
                
                // Setup ulang tombol copy
                setupCopyResultButtons();
                
            } catch (error) {
                // Kembalikan tampilan tombol
                this.innerHTML = originalText;
                this.disabled = false;
                
                // Kembalikan response contoh
                responseElement.innerHTML = originalResponse;
                
                // Setup ulang tombol copy
                setupCopyResultButtons();
                
                alert('Error: ' + error.message);
            }
        });
    });
});
