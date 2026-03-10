// Initialize Supabase Client
// 🔴 IMPORTANT: REPLACE THESE WITH YOUR ACTUAL SUPABASE URL & ANON KEY 🔴
const SUPABASE_URL = 'YOUR_SUPABASE_URL';
const SUPABASE_KEY = 'YOUR_SUPABASE_ANON_KEY';
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// DOM Elements
const tableBody = document.getElementById('tableBody');
const searchInput = document.getElementById('searchInput');
const recordCount = document.getElementById('recordCount');
const btnRefresh = document.getElementById('btnRefresh');
const btnExport = document.getElementById('btnExport');

// Stats Elements
const statToday = document.getElementById('statToday');
const statBio = document.getElementById('statBio');
const statFace = document.getElementById('statFace');

let allLogs = [];

// --- DATE FORMATTING UTILS ---
function formatDate(isoString) {
    const d = new Date(isoString);
    return new Intl.DateTimeFormat('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true
    }).format(d);
}

function isToday(isoString) {
    const d = new Date(isoString);
    const today = new Date();
    return d.getDate() === today.getDate() &&
        d.getMonth() === today.getMonth() &&
        d.getFullYear() === today.getFullYear();
}


// --- DATA FETCHING & RENDERING ---
async function fetchLogs() {
    tableBody.innerHTML = `
        <tr><td colspan="4" class="p-8 text-center text-slate-500">
            <i data-lucide="loader-2" class="w-6 h-6 animate-spin mx-auto mb-2"></i>
            Loading records...
        </td></tr>
    `;
    lucide.createIcons();

    try {
        const { data, error } = await supabase
            .from('attendance_logs')
            .select('*')
            .order('timestamp', { ascending: false });

        if (error) throw error;

        allLogs = data;
        renderTable(allLogs);
        updateStats(allLogs);
    } catch (err) {
        console.error('Error fetching logs:', err);
        tableBody.innerHTML = `
            <tr><td colspan="4" class="p-8 text-center text-red-400">
                <i data-lucide="alert-circle" class="w-6 h-6 mx-auto mb-2 text-red-500"></i>
                Failed to load records. Check database connection.
            </td></tr>
        `;
        lucide.createIcons();
    }
}

function renderTable(dataArray) {
    if (dataArray.length === 0) {
        tableBody.innerHTML = `
            <tr><td colspan="4" class="p-8 text-center text-slate-500">
                <i data-lucide="inbox" class="w-6 h-6 mx-auto mb-2 opacity-50"></i>
                No attendance records found.
            </td></tr>
        `;
        lucide.createIcons();
        recordCount.textContent = 'Showing 0 records';
        return;
    }

    const rowsHTML = dataArray.map(log => {
        // Icon logic based on method
        let iconHtml = '<i data-lucide="map-pin" class="w-4 h-4 text-slate-400"></i>';
        if (log.method.toLowerCase().includes('biometric')) {
            iconHtml = '<i data-lucide="fingerprint" class="w-4 h-4 text-emerald-400"></i>';
        } else if (log.method.toLowerCase().includes('face') || log.method.toLowerCase().includes('facial')) {
            iconHtml = '<i data-lucide="scan-face" class="w-4 h-4 text-purple-400"></i>';
        } else if (log.method.toLowerCase().includes('nfc')) {
            iconHtml = '<i data-lucide="nfc" class="w-4 h-4 text-blue-400"></i>';
        }

        return `
            <tr class="hover:bg-slate-800/50 transition-colors group">
                <td class="p-4 font-semibold text-white">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs text-slate-300">
                            ${log.employee_id.substring(0, 2).toUpperCase()}
                        </div>
                        ${log.employee_id}
                    </div>
                </td>
                <td class="p-4 text-slate-300">
                    <div class="flex items-center gap-2">
                        <i data-lucide="calendar-clock" class="w-4 h-4 text-slate-500"></i>
                        ${formatDate(log.timestamp)}
                    </div>
                </td>
                <td class="p-4">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-800 border border-slate-700">
                        ${iconHtml}
                        ${log.method}
                    </span>
                </td>
                <td class="p-4 text-slate-400 text-xs">
                    <a href="https://www.google.com/maps/search/?api=1&query=${log.location_lat},${log.location_lng}" 
                       target="_blank" 
                       class="flex items-center gap-1 hover:text-blue-400 transition-colors">
                       <i data-lucide="map" class="w-3 h-3"></i>
                       ${Number(log.location_lat).toFixed(4)}, ${Number(log.location_lng).toFixed(4)}
                    </a>
                </td>
            </tr>
        `;
    }).join('');

    tableBody.innerHTML = rowsHTML;
    lucide.createIcons();
    recordCount.textContent = `Showing ${dataArray.length} records`;
}

function updateStats(dataArray) {
    let todayCount = 0;
    let bioCount = 0;
    let faceCount = 0;

    dataArray.forEach(log => {
        if (isToday(log.timestamp)) todayCount++;
        if (log.method.toLowerCase().includes('biometric')) bioCount++;
        if (log.method.toLowerCase().includes('face') || log.method.toLowerCase().includes('facial')) faceCount++;
    });

    statToday.textContent = todayCount;
    statBio.textContent = bioCount;
    statFace.textContent = faceCount;
}


// --- EVENT LISTENERS ---

// Search Filter
searchInput.addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = allLogs.filter(log =>
        log.employee_id.toLowerCase().includes(term) ||
        log.method.toLowerCase().includes(term)
    );
    renderTable(filtered);
});

// Refresh Button
btnRefresh.addEventListener('click', () => {
    const icon = btnRefresh.querySelector('i');
    icon.classList.add('animate-spin');
    fetchLogs().finally(() => setTimeout(() => icon.classList.remove('animate-spin'), 500));
});

// CSV Export
btnExport.addEventListener('click', () => {
    if (allLogs.length === 0) return alert("No records to export.");

    const headers = "Employee ID,Timestamp,Method,Latitude,Longitude\n";
    const csvContent = "data:text/csv;charset=utf-8," + headers + allLogs.map(log => {
        return `"${log.employee_id}","${log.timestamp}","${log.method}",${log.location_lat},${log.location_lng}`;
    }).join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `attendance_export_${new Date().toLocaleDateString().replace(/\//g, '-')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
});

// Init
document.addEventListener('DOMContentLoaded', fetchLogs);
