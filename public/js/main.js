// Format bytes nicely
function formatBytes(bytes){
    if(bytes < 1024) return bytes + ' B';
    else if(bytes < 1024*1024) return (bytes/1024).toFixed(1) + ' KB';
    else return (bytes/(1024*1024)).toFixed(1) + ' MB';
}

// Upload modal
const uploadModal = document.getElementById('uploadModal');
const uploadBtn = document.getElementById('uploadBtn');
const closeModalBtn = document.getElementById('closeUpload');

if(uploadBtn){
    uploadBtn.onclick = () => uploadModal.style.display = 'block';
}
if(closeModalBtn){
    closeModalBtn.onclick = () => uploadModal.style.display = 'none';
}
window.onclick = e => { if(e.target == uploadModal) uploadModal.style.display = 'none'; }

// Upload file
const uploadForm = document.getElementById('uploadForm');
if(uploadForm){
    uploadForm.addEventListener('submit', async e=>{
        e.preventDefault();
        const formData = new FormData(uploadForm);
        const res = await fetch('/api/upload', { method:'POST', body: formData });
        const data = await res.json();
        alert(data.message);
        uploadForm.reset();
        uploadModal.style.display='none';
    });
}

// Search redirect
const searchForm = document.getElementById('searchForm');
if(searchForm){
    searchForm.addEventListener('submit', e=>{
        e.preventDefault();
        const q = document.getElementById('searchInput').value.trim();
        if(q) window.location.href = `/search.html?q=${encodeURIComponent(q)}`;
    });
}

// Delete file
async function deleteFile(filename){
    if(!confirm(`Delete ${filename}?`)) return;
    const res = await fetch(`/api/delete/${encodeURIComponent(filename)}`, { method:'DELETE' });
    const data = await res.json();
    alert(data.message);
    location.reload();
}

// Sort table by column
function sortTable(n){
    const table = document.getElementById("resultsTable");
    if(!table) return;
    let rows, switching = true, i, x, y, shouldSwitch, dir = "asc";
    while(switching){
        switching=false;
        rows = table.rows;
        for(i=1;i<rows.length-1;i++){
            shouldSwitch=false;
            x = rows[i].getElementsByTagName("TD")[n];
            y = rows[i+1].getElementsByTagName("TD")[n];
            if(dir=="asc" && x.innerText.toLowerCase()>y.innerText.toLowerCase()){shouldSwitch=true;break;}
            if(dir=="desc" && x.innerText.toLowerCase()<y.innerText.toLowerCase()){shouldSwitch=true;break;}
        }
        if(shouldSwitch){
            rows[i].parentNode.insertBefore(rows[i+1],rows[i]);
            switching=true;
        } else if(dir=="asc"){dir="desc"; switching=true;}
    }
}
