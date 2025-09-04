// Fungsi untuk memuat daftar API
async function loadAPIs() {
    try {
        const response = await fetch('/api/list');
        const result = await response.json();
        
        if (result.success) {
            const apiList = document.getElementById('apiList');
            apiList.innerHTML = '';
            
            if (result.data.length === 0) {
                apiList.innerHTML = '<p>Tidak ada API yang terdaftar</p>';
                return;
            }
            
            result.data.forEach(api => {
                const apiCard = document.createElement('div');
                apiCard.className = 'api-card';
                apiCard.innerHTML = `
                    <h4>${api.name}</h4>
                    <p><strong>Endpoint:</strong> ${api.path}</p>
                    <p><strong>File:</strong> ${api.file}</p>
                    <div class="api-actions">
                        <button class="test-btn" onclick="testAPI('${api.name}')">
                            <i class="fas fa-bolt"></i> Test
                        </button>
                        <button class="test-btn btn-delete" onclick="deleteAPI('${api.name}')">
                            <i class="fas fa-trash"></i> Hapus
                        </button>
                    </div>
                `;
                apiList.appendChild(apiCard);
            });
        } else {
            alert('Gagal memuat daftar API');
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Terjadi kesalahan saat memuat API');
    }
}

// Fungsi untuk menghapus API
async function deleteAPI(apiName) {
    if (!confirm(`Apakah Anda yakin ingin menghapus API ${apiName}?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/admin/api/${apiName}`, {
            method: 'DELETE'
        });
        const result = await response.json();
        
        if (result.success) {
            alert('API berhasil dihapus');
            loadAPIs(); // Muat ulang daftar API
        } else {
            alert('Gagal menghapus API: ' + result.error);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Terjadi kesalahan saat menghapus API');
    }
}

// Fungsi untuk mengupload API baru
document.getElementById('apiUploadForm').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const apiName = document.getElementById('apiName').value;
    const apiCode = document.getElementById('apiCode').value;
    const apiDocumentation = document.getElementById('apiDocumentation').value;
    
    try {
        const response = await fetch('/admin/api/upload', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: apiName,
                code: apiCode,
                documentation: apiDocumentation ? JSON.parse(apiDocumentation) : null
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            alert('API berhasil diupload');
            document.getElementById('apiUploadForm').reset();
            loadAPIs(); // Muat ulang daftar API
        } else {
            alert('Gagal upload API: ' + result.error);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Terjadi kesalahan saat upload API');
    }
});

// Fungsi untuk test API
async function testAPI(apiName) {
    const url = prompt(`Masukkan URL untuk testing API ${apiName}:`);
    if (!url) return;
    
    try {
        const response = await fetch(`/api/${apiName}?url=${encodeURIComponent(url)}`);
        const result = await response.json();
        alert(JSON.stringify(result, null, 2));
    } catch (error) {
        console.error('Error:', error);
        alert('Terjadi kesalahan saat testing API');
    }
}

// Muat daftar API saat halaman dimuat
document.addEventListener('DOMContentLoaded', loadAPIs);
