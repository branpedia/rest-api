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

// Test endpoint functionality
document.querySelectorAll('.try-btn').forEach(button => {
    button.addEventListener('click', function() {
        const endpoint = this.getAttribute('data-endpoint');
        let apiUrl;
        
        // Determine which API to test based on the endpoint
        if (endpoint === '/api/mediafire') {
            apiUrl = `${window.location.origin}${endpoint}?url=https://www.mediafire.com/file/vj3al1c98u2zdr6/Terakomari_-_MD.zip/file`;
        } else {
            // For other endpoints, use a placeholder URL
            apiUrl = `${window.location.origin}${endpoint}?url=https://example.com/sample`;
        }
        
        // Tampilkan loading
        const originalText = this.innerHTML;
        this.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Loading...';
        this.disabled = true;
        
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
                this.innerHTML = originalText;
                this.disabled = false;
                
                // Tampilkan hasil
                alert(JSON.stringify(data, null, 2));
            })
            .catch(error => {
                this.innerHTML = originalText;
                this.disabled = false;
                alert('Error: ' + error.message);
            });
    });
});

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
        // Update CSS variables for light mode
        document.documentElement.style.setProperty('--light', '#1e293b');
        document.documentElement.style.setProperty('--dark', '#f1f5f9');
        document.documentElement.style.setProperty('--darker', '#e2e8f0');
    } else {
        themeToggle.innerHTML = '<i class="fas fa-moon"></i>';
        // Revert to dark mode CSS variables
        document.documentElement.style.setProperty('--light', '#f1f5f9');
        document.documentElement.style.setProperty('--dark', '#1e293b');
        document.documentElement.style.setProperty('--darker', '#0f172a');
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

// Add data-endpoint attributes to try buttons
document.querySelectorAll('.try-btn').forEach(button => {
    const endpoint = button.closest('.endpoint').querySelector('.endpoint-url').textContent.split('?')[0];
    button.setAttribute('data-endpoint', endpoint);
});
