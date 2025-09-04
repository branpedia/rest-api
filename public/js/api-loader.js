// Fungsi untuk memuat API secara dinamis
async function loadAPIs() {
    try {
        const response = await fetch('/api/list');
        const result = await response.json();
        
        if (result.success) {
            renderAPIs(result.data);
        } else {
            console.error('Gagal memuat daftar API');
            showFallbackAPIs();
        }
    } catch (error) {
        console.error('Error:', error);
        showFallbackAPIs();
    }
}

// Fungsi untuk menampilkan API fallback jika gagal memuat
function showFallbackAPIs() {
    const apiEndpointsSection = document.getElementById('api');
    if (!apiEndpointsSection) return;
    
    apiEndpointsSection.innerHTML = `
        <h2>API Endpoints</h2>
        <p>Gagal memuat daftar API. Menampilkan daftar default...</p>
        
        <h3>Downloader</h3>
        <div class="endpoint">
            <div class="endpoint-header">
                <span class="endpoint-method">GET</span>
                <span class="endpoint-url">/api/mediafire?url={mediafire_url}</span>
                <button class="copy-btn" data-endpoint="/api/mediafire?url="><i class="fas fa-copy"></i> Copy Endpoint</button>
            </div>
            <div class="response">
                <div class="response-header">
                    <span class="response-title">Response</span>
                    <button class="copy-result-btn"><i class="fas fa-copy"></i> Copy Result</button>
                </div>
{
  "success": true,
  "data": {
    "name": "Terakomari - MD.zip",
    "size": "6.78MB",
    "extension": "zip",
    "uploaded": "2024-02-22 07:29:23",
    "downloadUrl": "https://download2264.mediafire.com/.../Terakomari+-+MD.zip"
  }
}
            </div>
            
            <div class="test-form">
                <h4>Test Endpoint</h4>
                <div class="parameter__name required">url<span>&nbsp;*</span></div>
                <div class="input-group">
                    <input type="text" id="testUrlMediafire" placeholder="https://www.mediafire.com/file/vj3al1c98u2zdr6/Terakomari_-_MD.zip/file" class="url-input">
                    <button class="test-btn" onclick="testEndpoint('testUrlMediafire', 'testResultMediafire', '/api/mediafire')">
                        <i class="fas fa-bolt"></i> Test
                    </button>
                </div>
                <div id="testResultMediafire" class="test-result"></div>
            </div>
        </div>
        
        <div class="endpoint">
            <div class="endpoint-header">
                <span class="endpoint-method">GET</span>
                <span class="endpoint-url">/api/youtube?url={youtube_url}</span>
                <button class="copy-btn" data-endpoint="/api/youtube?url="><i class="fas fa-copy"></i> Copy Endpoint</button>
            </div>
            <div class="response">
                <div class="response-header">
                    <span class="response-title">Response</span>
                    <button class="copy-result-btn"><i class="fas fa-copy"></i> Copy Result</button>
                </div>
{
  "success": true,
  "data": {
    "title": "Contoh Video YouTube",
    "duration": "5:23",
    "thumbnail": "https://i.ytimg.com/vi/.../default.jpg",
    "downloadUrl": "https://api.branpedia.com/download/youtube/..."
  }
}
            </div>
            
            <div class="test-form">
                <h4>Test Endpoint</h4>
                <div class="parameter__name required">url<span>&nbsp;*</span></div>
                <div class="input-group">
                    <input type="text" id="testUrlYoutube" placeholder="https://www.youtube.com/watch?v=abc123" class="url-input">
                    <button class="test-btn" onclick="testEndpoint('testUrlYoutube', 'testResultYoutube', '/api/youtube')">
                        <i class="fas fa-bolt"></i> Test
                    </button>
                </div>
                <div id="testResultYoutube" class="test-result"></div>
            </div>
        </div>
        
        <h3>AI Services</h3>
        <div class="endpoint">
            <div class="endpoint-header">
                <span class="endpoint-method">GET</span>
                <span class="endpoint-url">/api/ai/toanime</span>
                <button class="copy-btn" data-endpoint="/api/ai/toanime"><i class="fas fa-copy"></i> Copy Endpoint</button>
            </div>
            <div class="response">
                <div class="response-header">
                    <span class="response-title">Response</span>
                    <button class="copy-result-btn"><i class="fas fa-copy"></i> Copy Result</button>
                </div>
{
  "success": true,
  "data": {
    "original": "base64_image",
    "anime": "base64_image"
  }
}
            </div>
            
            <div class="test-form">
                <h4>Test Endpoint</h4>
                <div class="parameter__name">image_url (optional)</div>
                <div class="input-group">
                    <input type="text" id="testUrlAnime" placeholder="https://example.com/image.jpg" class="url-input">
                    <button class="test-btn" onclick="testEndpoint('testUrlAnime', 'testResultAnime', '/api/ai/toanime')">
                        <i class="fas fa-bolt"></i> Test
                    </button>
                </div>
                <div id="testResultAnime" class="test-result"></div>
            </div>
        </div>
    `;
    
    // Inisialisasi event listeners untuk tombol copy
    initCopyButtons();
}

// Fungsi untuk merender API ke halaman
function renderAPIs(apiList) {
    const apiEndpointsSection = document.getElementById('api');
    if (!apiEndpointsSection) return;
    
    // Hapus konten lama (kecuali judul)
    const oldContent = apiEndpointsSection.querySelectorAll('.endpoint, h3, p');
    oldContent.forEach(element => {
        if (!element.closest('h2')) {
            element.remove();
        }
    });
    
    // Kelompokkan API berdasarkan kategori
    const categories = {
        'Downloader': [],
        'AI Services': [],
        'Other': []
    };
    
    apiList.forEach(api => {
        // Tentukan kategori berdasarkan nama API
        if (api.name.includes('mediafire') || api.name.includes('youtube') || 
            api.name.includes('instagram') || api.name.includes('tiktok')) {
            categories['Downloader'].push(api);
        } else if (api.name.includes('ai') || api.name.includes('toanime')) {
            categories['AI Services'].push(api);
        } else {
            categories['Other'].push(api);
        }
    });
    
    // Render API berdasarkan kategori
    for (const [category, apis] of Object.entries(categories)) {
        if (apis.length > 0) {
            const categoryTitle = document.createElement('h3');
            categoryTitle.textContent = category;
            apiEndpointsSection.appendChild(categoryTitle);
            
            apis.forEach(api => {
                const endpointElement = createEndpointElement(api);
                apiEndpointsSection.appendChild(endpointElement);
            });
        }
    }
    
    // Inisialisasi event listeners untuk tombol copy
    initCopyButtons();
}

// Fungsi untuk membuat elemen endpoint
function createEndpointElement(api) {
    const endpointDiv = document.createElement('div');
    endpointDiv.className = 'endpoint';
    
    // Dapatkan dokumentasi API jika ada
    let method = 'GET';
    let params = [{ name: 'url', required: true }];
    
    // Ambil dokumentasi API
    fetch(`/api/docs/${api.name}`)
        .then(response => {
            if (!response.ok) throw new Error('Dokumentasi tidak ditemukan');
            return response.json();
        })
        .then(result => {
            if (result.success) {
                method = result.data.method || method;
                params = result.data.parameters || params;
                
                // Update elemen dengan informasi yang lebih spesifik
                const methodElement = endpointDiv.querySelector('.endpoint-method');
                if (methodElement) {
                    methodElement.textContent = method;
                }
                
                const urlElement = endpointDiv.querySelector('.endpoint-url');
                if (urlElement) {
                    let urlText = `${api.path}?`;
                    params.forEach((param, index) => {
                        urlText += `${param.name}={${param.name}}`;
                        if (index < params.length - 1) {
                            urlText += '&';
                        }
                    });
                    urlElement.textContent = urlText;
                }
                
                // Update tombol copy
                const copyBtn = endpointDiv.querySelector('.copy-btn');
                if (copyBtn) {
                    let copyEndpoint = `${api.path}?`;
                    params.forEach((param, index) => {
                        copyEndpoint += `${param.name}=`;
                        if (index < params.length - 1) {
                            copyEndpoint += '&';
                        }
                    });
                    copyBtn.setAttribute('data-endpoint', copyEndpoint);
                }
            }
        })
        .catch(error => {
            console.error(`Gagal memuat dokumentasi untuk ${api.name}:`, error);
        });
    
    endpointDiv.innerHTML = `
        <div class="endpoint-header">
            <span class="endpoint-method">${method}</span>
            <span class="endpoint-url">${api.path}?url={url}</span>
            <button class="copy-btn" data-endpoint="${api.path}?url=">
                <i class="fas fa-copy"></i> Copy Endpoint
            </button>
        </div>
        <div class="response">
            <div class="response-header">
                <span class="response-title">Response</span>
                <button class="copy-result-btn"><i class="fas fa-copy"></i> Copy Result</button>
            </div>
{
  "success": true,
  "data": {
    "message": "Response from ${api.name} API"
  }
}
        </div>
        <div class="test-form">
            <h4>Test Endpoint</h4>
            <div class="parameter__name required">url<span>&nbsp;*</span></div>
            <div class="input-group">
                <input type="text" id="testUrl${api.name}" placeholder="Masukkan URL" class="url-input">
                <button class="test-btn" onclick="testEndpoint('testUrl${api.name}', 'testResult${api.name}', '${api.path}')">
                    <i class="fas fa-bolt"></i> Test
                </button>
            </div>
            <div id="testResult${api.name}" class="test-result"></div>
        </div>
    `;
    
    return endpointDiv;
}

// Fungsi untuk test endpoint
window.testEndpoint = function(inputId, resultId, endpoint = '/api/mediafire') {
    const urlInput = document.getElementById(inputId);
    const resultDiv = document.getElementById(resultId);
    const testBtn = urlInput.nextElementSibling;
    
    const url = urlInput.value.trim();
    
    // Validasi input
    if (!url && endpoint !== '/api/ai/toanime') {
        showError(resultDiv, 'URL tidak boleh kosong!');
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
    const escapedData = formattedData.replace(/'/g, "\\'");
    
    resultDiv.innerHTML = `
        <div class="result-header">
            <span class="result-title">✅ Success</span>
            <button class="copy-btn" onclick="copyToClipboard('${escapedData}')">
                <i class="fas fa-copy"></i> Copy Result
            </button>
        </div>
        <pre>${formattedData}</pre>
        ${data.data && data.data.downloadUrl ? `
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
function showError(resultDiv, error, tips = null) {
    resultDiv.innerHTML = `
        <div class="result-header">
            <span class="result-title error">❌ Error</span>
            <button class="copy-btn" onclick="copyToClipboard('${error}')">
                <i class="fas fa-copy"></i> Copy Error
            </button>
        </div>
        <p class="error-message">${error}</p>
        ${tips ? `<p class="error-tips">💡 Tips: ${tips}</p>` : ''}
    `;
    resultDiv.className = 'test-result error';
}

// Fungsi untuk copy ke clipboard
function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        // Tampilkan notifikasi
        const notification = document.createElement('div');
        notification.className = 'copy-notification';
        notification.textContent = 'Copied to clipboard!';
        document.body.appendChild(notification);
        
        // Hilangkan notifikasi setelah 2 detik
        setTimeout(() => {
            notification.remove();
        }, 2000);
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
}

// Inisialisasi tombol copy
function initCopyButtons() {
    document.querySelectorAll('.copy-btn').forEach(button => {
        button.addEventListener('click', function() {
            const endpoint = this.getAttribute('data-endpoint');
            const fullUrl = window.location.origin + endpoint;
            copyToClipboard(fullUrl);
        });
    });
    
    document.querySelectorAll('.copy-result-btn').forEach(button => {
        button.addEventListener('click', function() {
            const responseElement = this.closest('.response');
            const preElement = responseElement.querySelector('pre');
            if (preElement) {
                copyToClipboard(preElement.textContent);
            }
        });
    });
}

// Muat API saat halaman dimuat
document.addEventListener('DOMContentLoaded', function() {
    // Hanya jalankan di halaman API Endpoints
    if (document.getElementById('api')) {
        loadAPIs();
    }
    
    // Inisialisasi semua tombol copy
    initCopyButtons();
});
