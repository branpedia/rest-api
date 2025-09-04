// Fungsi untuk memuat API secara dinamis
async function loadAPIs() {
    try {
        const response = await fetch('/api/list');
        const result = await response.json();
        
        if (result.success) {
            renderAPIs(result.data);
        } else {
            console.error('Gagal memuat daftar API');
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

// Fungsi untuk merender API ke halaman
function renderAPIs(apiList) {
    const apiEndpointsSection = document.getElementById('api');
    if (!apiEndpointsSection) return;
    
    // Hapus konten lama (kecuali judul)
    const oldContent = apiEndpointsSection.querySelectorAll('.endpoint');
    oldContent.forEach(element => {
        if (!element.closest('h3')) {
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
}

// Fungsi untuk membuat elemen endpoint
function createEndpointElement(api) {
    const endpointDiv = document.createElement('div');
    endpointDiv.className = 'endpoint';
    
    // Dapatkan dokumentasi API jika ada
    let method = 'GET';
    let params = [{ name: 'url', required: true }];
    
    fetch(`/api/docs/${api.name}`)
        .then(response => response.json())
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
            }
        })
        .catch(error => {
            console.error(`Gagal memuat dokumentasi untuk ${api.name}:`, error);
        });
    
    endpointDiv.innerHTML = `
        <div class="endpoint-header">
            <span class="endpoint-method">GET</span>
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

// Fungsi untuk test endpoint (diperbarui)
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

// Fungsi untuk menampilkan hasil sukses (diperbarui)
function showSuccess(resultDiv, data) {
    const formattedData = JSON.stringify(data, null, 2);
    
    resultDiv.innerHTML = `
        <div class="result-header">
            <span class="result-title">✅ Success</span>
            <button class="copy-btn" onclick="copyToClipboard('${formattedData}')">
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

// Muat API saat halaman dimuat
document.addEventListener('DOMContentLoaded', function() {
    // Hanya jalankan di halaman API Endpoints
    if (document.getElementById('api')) {
        loadAPIs();
    }
});
