// ============================================================
// COMBINED NETBOOT OPERATOR MAPPING PORTAL — app.js
// Holds both Operator Form and Admin Dashboard Logic
// ============================================================
const API_URL = "https://script.google.com/macros/s/AKfycbyOK61LYY3z0kqZJ6g6VbyWhmw_AYvYG5FKwG6rhHUSyCINMjb6XmzZ9aL_Q6PapaNc/exec";

// --- Global Admin State Variables ---
let activePassToken = "";
let masterHeaders = [];
let matrixDataset = [];     // Full dataset pulled from server: [{ sheetIndex, fields }]
let filteredDataset = [];   // Matches active search controls
let headerMap = {};         // Translates string headings directly to index positions
let keyStatusIdx;           // Column index of "Key Status" (sheet column J)
let keyStatusCountIdx;      // Column index of "Key Status Count" (sheet column K)
let searchDebounceHandle = null;
let currentPage = 1;
let pageSize = 50;
let totalPages = 1;

// Generic API caller — uses text/plain content-type so the browser does
// NOT send a CORS preflight (Apps Script web apps don't respond to OPTIONS).
async function callAPI(action, payload) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action: action, payload: payload || {} })
  });
  if (!res.ok) throw new Error("Network error: " + res.status);
  return res.json();
}

// Automatically detect which page is loading and initialize components
document.addEventListener('DOMContentLoaded', function() {
  if (document.getElementById('examName')) {
    // We are on index.html (Operator Form View)
    loadExams();
    buildServers();
  } else if (document.getElementById('admHeaders')) {
    // We are on admin.html (Admin Dashboard View)
    triggerSystemLogin();
  }
});

// ------------------------------------------------------------
// OPERATOR FORM UTILITIES (index.html Logic)
// ------------------------------------------------------------
function loadExams(){
  callAPI('getExamNames')
    .then(function(exams){
      var sel = document.getElementById('examName');
      sel.innerHTML = '<option value="">— Select Exam —</option>';
      exams.forEach(function(e){
        var opt = document.createElement('option');
        opt.value = e; opt.textContent = e;
        sel.appendChild(opt);
      });
    })
    .catch(function(){ showToast('Failed to load exams'); });
}

function buildServers(){
  var sel = document.getElementById('server');
  sel.innerHTML = '<option value="">— Select Server —</option>';
  for(var i=1;i<=40;i++){
    var opt = document.createElement('option');
    var label = 'Server-'+(i<10?'0'+i:i);
    opt.value = label; opt.textContent = label;
    sel.appendChild(opt);
  }
}

function onExamChange(){
  var examCode = document.getElementById('examName').value;
  var cityEl = document.getElementById('city');
  if(!examCode){
    cityEl.innerHTML = '<option value="">— Select exam first —</option>';
    cityEl.disabled = true;
    resetCenterFields();
    return;
  }
  cityEl.innerHTML = '<option value="">— Loading cities... —</option>';
  cityEl.disabled = true;
  resetCenterFields();
  callAPI('getCitiesForExam', { examCode: examCode })
    .then(function(cities){
      cityEl.innerHTML = '<option value="">— Select City —</option>';
      cities.forEach(function(c){
        var opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        cityEl.appendChild(opt);
      });
      cityEl.disabled = false;
    })
    .catch(function(){ showToast('Failed to load cities'); });
}

function onCityChange(){
  var examCode = document.getElementById('examName').value;
  var city = document.getElementById('city').value;
  var cnEl = document.getElementById('centerName');
  if(!city){ resetCenterFields(); return; }
  cnEl.innerHTML = '<option value="">— Loading centers... —</option>';
  cnEl.disabled = true;
  document.getElementById('centerCode').value = '';
  callAPI('getCentersForCity', { examCode: examCode, city: city })
    .then(function(centers){
      cnEl.innerHTML = '<option value="">— Select Center —</option>';
      centers.forEach(function(c){
        var opt = document.createElement('option');
        opt.value = c.name; opt.textContent = c.name;
        opt.dataset.code = c.code;
        cnEl.appendChild(opt);
      });
      cnEl.disabled = false;
    })
    .catch(function(){ showToast('Failed to load centers'); });
}

function onCenterChange(){
  var sel = document.getElementById('centerName');
  var opt = sel.options[sel.selectedIndex];
  document.getElementById('centerCode').value = (opt && opt.dataset.code) ? opt.dataset.code : '';
  updateCenterCode();
}

function updateCenterCode(){
  var centerSel = document.getElementById('centerName');
  var centerOpt = centerSel.options[centerSel.selectedIndex];
  var baseCode = (centerOpt && centerOpt.dataset.code) ? centerOpt.dataset.code : '';
  var server = document.getElementById('server').value;

  if(!baseCode){
    document.getElementById('centerCode').value = '';
    return;
  }

  document.getElementById('centerCode').value = baseCode;

  if(server){
    var serverNo = server.split('-')[1];
    if(serverNo !== '01'){
      document.getElementById('centerCode').value = baseCode + '-' + serverNo;
    }
  }
}

function resetCenterFields(){
  var cnEl = document.getElementById('centerName');
  cnEl.innerHTML = '<option value="">— Select city first —</option>';
  cnEl.disabled = true;
  document.getElementById('centerCode').value = '';
}

function clearErrors(){
  ['exam','city','center','server','netboot','tc','mobile']
    .forEach(function(k){ document.getElementById('err_'+k).textContent=''; });
}

function validateForm(){
  clearErrors();
  var ok = true;
  var val = function(id){ return document.getElementById(id).value.trim(); };
  var err = function(id,msg){ document.getElementById('err_'+id).textContent=msg; ok=false; };
  if(!val('examName'))        err('exam','Please select exam.');
  if(!val('city'))            err('city','Please select city.');
  if(!val('centerName'))      err('center','Please select center.');
  if(!val('server'))          err('server','Please select server.');
  if(!val('netbootHostname')) err('netboot','Please enter asset number.');
  if(!val('tcName'))          err('tc','Please enter tech person name.');
  var mob = val('mobile');
  if(!mob)                    err('mobile','Mobile number required.');
  else if(mob.length!==10)    err('mobile','Enter valid 10-digit number.');
  return ok;
}

function handleSubmit(){
  if(!validateForm()) return;
  var btn = document.getElementById('submitBtn');
  var spin = document.getElementById('spin');
  btn.disabled = true; spin.style.display = 'block';
  var payload = {
    examName       : document.getElementById('examName').value,
    centerCode     : document.getElementById('centerCode').value,
    city           : document.getElementById('city').value,
    centerName     : document.getElementById('centerName').value,
    server         : document.getElementById('server').value,
    netbootHostname: document.getElementById('netbootHostname').value.trim(),
    tcName         : document.getElementById('tcName').value.trim(),
    mobile         : document.getElementById('mobile').value.trim()
  };
  callAPI('submitForm', payload)
    .then(function(result){
      btn.disabled = false; spin.style.display = 'none';
      if(result.success){
        showOverlay(payload);
      } else if(result.error === 'DUPLICATE_MOBILE'){
        document.getElementById('err_mobile').textContent = 'This mobile number already exists';
        showToast('Duplicate mobile number detected');
      } else {
        showToast('Submission failed');
      }
    })
    .catch(function(){
      btn.disabled = false; spin.style.display = 'none';
      showToast('Server error');
    });
}

function showOverlay(p){
  document.getElementById('tyMeta').innerHTML =
    'Exam: <span>'+p.examName+'</span><br>'+
    'City: <span>'+p.city+'</span><br>'+
    'Center: <span>'+p.centerName+'</span><br>'+
    'Server: <span>'+p.server+'</span><br>'+
    'Asset: <span>PXE-'+p.netbootHostname+'</span><br>'+
    'Tech Person: <span>'+p.tcName+'</span><br>'+
    'Mobile: <span>'+p.mobile+'</span>';
  document.getElementById('overlay').classList.add('show');
}

function resetForm(){
  document.getElementById('overlay').classList.remove('show');
  ['examName','city','centerName','server'].forEach(function(id){
    document.getElementById(id).selectedIndex = 0;
  });
  document.getElementById('city').disabled = true;
  document.getElementById('centerName').disabled = true;
  document.getElementById('centerCode').value = '';
  document.getElementById('netbootHostname').value = '';
  document.getElementById('tcName').value = '';
  document.getElementById('mobile').value = '';
  clearErrors();
  document.getElementById('city').innerHTML = '<option value="">— Select exam first —</option>';
  resetCenterFields();
}

// ------------------------------------------------------------
// ADMIN DASHBOARD LOGIC (admin.html)
// ------------------------------------------------------------
// ------------------------------------------------------------
// ADMIN DASHBOARD LOGIC (admin.html)
// ------------------------------------------------------------
function triggerSystemLogin() {
  // Check if a valid session token already exists from a prior login
  const isAuthenticated = sessionStorage.getItem("netboot_authenticated");

  if (isAuthenticated === "true") {
    // Session exists! Automatically bypass the login gate
    document.getElementById('adminAuthBlock').style.display = 'none';
    document.getElementById('adminDashboardView').style.display = 'flex';
    loadMasterGrid();
  } else {
    // No session found: enforce regular login presentation
    document.getElementById('adminAuthBlock').style.display = 'flex';
    document.getElementById('adminDashboardView').style.display = 'none';
  }
}

function executeLocalPortalAuth() {
  const enteredUser = document.getElementById('authAdminUser').value.trim();
  const enteredPass = document.getElementById('authAdminPass').value.trim();
  const errEl = document.getElementById('authErrorMsg');

  if (enteredUser === "user" && enteredPass === "password") {
    errEl.textContent = '';
    
    // Write the authentication state token into memory cache
    sessionStorage.setItem("netboot_authenticated", "true");
    
    document.getElementById('adminAuthBlock').style.display = 'none';
    document.getElementById('adminDashboardView').style.display = 'flex';
    showToast('Authentication complete');
    loadMasterGrid();
  } else {
    errEl.textContent = 'Invalid username or password.';
    showToast('Invalid username or password.');
  }
}

// Pulls the FULL sheet dataset from the backend. Code.gs has no artificial
// row cap — getSheet3Data() reads the entire used range every time — so the
// count here should always match your sheet's real row count.
function loadMasterGrid() {
  const refreshBtn = document.getElementById('btnRefresh');
  const bodyEl = document.getElementById('admBody');
  const diagBanner = document.getElementById('diagBanner');

  if (refreshBtn) refreshBtn.classList.add('spinning');
  diagBanner.classList.remove('show');

  bodyEl.innerHTML = `<tr class="loading-state"><td colspan="10"><div class="spinner"></div>Streaming sheet records…</td></tr>`;

  callAPI('getSheet3Data')
    .then(function(rows) {
      console.log('[admin] getSheet3Data returned', rows ? rows.length : 0, 'rows (including header)');

      if (!rows || rows.length === 0) {
        matrixDataset = [];
        masterHeaders = [];
        renderNoHeaders();
        return;
      }

      masterHeaders = rows[0];
      headerMap = {};
      masterHeaders.forEach((name, idx) => {
        headerMap[String(name).trim()] = idx;
      });
      keyStatusIdx = headerMap["Key Status"];
      keyStatusCountIdx = headerMap["Key Status Count"];

      matrixDataset = rows.slice(1).map((row, idx) => ({
        sheetIndex: idx + 2, // 1-based sheet row (header is row 1)
        fields: row
      }));

      document.getElementById('statLoaded').textContent = matrixDataset.length;
      buildFilterDropdownOptions();
      currentPage = 1;
      runFilters();
    })
    .catch(function(err) {
      console.error('[admin] loadMasterGrid failed:', err);
      bodyEl.innerHTML = `<tr><td colspan="10" style="text-align:center;padding:24px;color:#dc2626;">Failed to load records — ${escapeHtml(String(err.message || err))}</td></tr>`;
      showToast('Failed to pull master configuration table');
    })
    .finally(function(){
      if (refreshBtn) refreshBtn.classList.remove('spinning');
    });
}

function renderNoHeaders(){
  document.getElementById('admHeaders').innerHTML = '';
  document.getElementById('admBody').innerHTML =
    '<tr><td colspan="10" style="text-align:center;padding:28px;color:#94a3b8;">No records found in the source sheet.</td></tr>';
  document.getElementById('counterValue').textContent = '0';
  document.getElementById('statFiltered').textContent = '0';
  document.getElementById('paginationBar').style.display = 'none';
}

function buildFilterDropdownOptions() {
  const examSel = document.getElementById('admFilterExam');
  const citySel = document.getElementById('admFilterCity');

  const examIdx = headerMap["Exam Name"];
  const cityIdx = headerMap["City"];

  let distinctExams = new Set();
  let distinctCities = new Set();

  matrixDataset.forEach(row => {
    if (examIdx !== undefined && row.fields[examIdx]) distinctExams.add(String(row.fields[examIdx]).trim());
    if (cityIdx !== undefined && row.fields[cityIdx]) distinctCities.add(String(row.fields[cityIdx]).trim());
  });

  examSel.innerHTML = '<option value="">— All exams —</option>';
  citySel.innerHTML = '<option value="">— All cities —</option>';

  [...distinctExams].sort().forEach(e => examSel.innerHTML += `<option value="${escapeHtml(e)}">${escapeHtml(e)}</option>`);
  [...distinctCities].sort().forEach(c => citySel.innerHTML += `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`);
}

// Debounced so typing quickly through a large dataset doesn't re-filter
// and re-render on every keystroke.
function onSearchInput(){
  clearTimeout(searchDebounceHandle);
  searchDebounceHandle = setTimeout(function(){
    currentPage = 1;
    runFilters();
  }, 180);
}

function onFilterChange(){
  currentPage = 1;
  runFilters();
}

function runFilters() {
  const selectedExam = document.getElementById('admFilterExam').value.toLowerCase();
  const selectedCity = document.getElementById('admFilterCity').value.toLowerCase();
  const searchQuery = document.getElementById('admFilterSearch').value.toLowerCase().trim();

  const examIdx = headerMap["Exam Name"];
  const cityIdx = headerMap["City"];

  filteredDataset = matrixDataset.filter(row => {
    if (selectedExam && examIdx !== undefined) {
      if (String(row.fields[examIdx]).toLowerCase() !== selectedExam) return false;
    }
    if (selectedCity && cityIdx !== undefined) {
      if (String(row.fields[cityIdx]).toLowerCase() !== selectedCity) return false;
    }
    if (searchQuery) {
      const compiledRowString = row.fields.join(" ").toLowerCase();
      if (!compiledRowString.includes(searchQuery)) return false;
    }
    return true;
  });

  document.getElementById('statFiltered').textContent = filteredDataset.length;

  const pillParts = [];
  if (selectedExam) pillParts.push(document.getElementById('admFilterExam').selectedOptions[0].textContent);
  if (selectedCity) pillParts.push(document.getElementById('admFilterCity').selectedOptions[0].textContent);
  if (searchQuery) pillParts.push('"' + searchQuery + '"');
  document.getElementById('activeFilterPill').textContent = pillParts.length ? 'Active: ' + pillParts.join(' · ') : '';

  totalPages = Math.max(1, Math.ceil(filteredDataset.length / pageSize));
  if (currentPage > totalPages) currentPage = totalPages;

  renderTableLayout();
}

function onPageSizeChange(){
  pageSize = parseInt(document.getElementById('pgSizeSelect').value, 10);
  currentPage = 1;
  totalPages = Math.max(1, Math.ceil(filteredDataset.length / pageSize));
  renderTableLayout();
}

function goToPage(p){
  if (p < 1 || p > totalPages) return;
  currentPage = p;
  renderTableLayout();
  document.querySelector('.table-scroll').scrollTop = 0;
}

function escapeHtml(str){
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderTableLayout() {
  const headerContainer = document.getElementById('admHeaders');
  const bodyContainer = document.getElementById('admBody');

  document.getElementById('counterValue').textContent = filteredDataset.length;

  if (!masterHeaders || masterHeaders.length === 0) {
    renderNoHeaders();
    return;
  }

  // "Key Status Count" (col K) is folded into the Key Status button, so it
  // doesn't get its own visible column.
  const visibleIndices = masterHeaders
    .map((_, i) => i)
    .filter(i => i !== keyStatusCountIdx);

  headerContainer.innerHTML = '<tr>' +
    visibleIndices.map(i => `<th>${escapeHtml(masterHeaders[i])}</th>`).join('') +
    '</tr>';

  if (filteredDataset.length === 0) {
    bodyContainer.innerHTML = `<tr><td colspan="${visibleIndices.length}" style="text-align:center;padding:28px;color:#94a3b8;">No records match your active filters.</td></tr>`;
    document.getElementById('paginationBar').style.display = 'none';
    return;
  }

  const hostnameIdx = headerMap["Netboot Hostname"];

  // Paginate: only render the current page's slice into the DOM so the
  // table stays smooth even with a large dataset. Newest-first ordering
  // preserved (reverse of sheet order) within the full filtered set.
  const reversed = filteredDataset.slice().reverse();
  const startIdx = (currentPage - 1) * pageSize;
  const endIdx = Math.min(startIdx + pageSize, reversed.length);
  const pageItems = reversed.slice(startIdx, endIdx);

  let outputHtml = "";
  pageItems.forEach(item => {
    const cellsHtml = visibleIndices.map(colIdx => {
      const val = item.fields[colIdx];

      if (colIdx === hostnameIdx) {
        const rawHostText = val ? String(val).trim() : "";
        const safeText = escapeHtml(rawHostText);
        const jsSafeText = rawHostText.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
        return `<td>
          <div class="hostname-cell">
            <span class="cell-code" title="${safeText}">${safeText || '—'}</span>
            ${rawHostText ? `<button class="btn-copy-icon" title="Copy hostname" onclick="event.stopPropagation();copyAssetHostname(this,'${jsSafeText}')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1"/></svg>
            </button>` : ''}
          </div>
        </td>`;
      }

      if (colIdx === keyStatusIdx) {
        const status = (val === undefined || val === null || val === '') ? 'No' : String(val).trim();
        const count = keyStatusCountIdx !== undefined
          ? (Number(item.fields[keyStatusCountIdx]) || 0)
          : 0;
        const isYes = status === 'Yes';
        const label = count > 0 ? `${status} (${count})` : status;
        return `<td>
          <button class="btn-keystatus ${isYes ? 'status-yes' : 'status-no'}"
                  onclick="event.stopPropagation();toggleKeyStatusClick(this,${item.sheetIndex})">${escapeHtml(label)}</button>
        </td>`;
      }

      const safeVal = escapeHtml(val);
      return `<td title="${safeVal}">${safeVal}</td>`;
    }).join('');

    outputHtml += `<tr>${cellsHtml}</tr>`;
  });
  bodyContainer.innerHTML = outputHtml;

  // Pagination controls
  const pgBar = document.getElementById('paginationBar');
  pgBar.style.display = 'flex';
  document.getElementById('pgRangeStart').textContent = filteredDataset.length ? startIdx + 1 : 0;
  document.getElementById('pgRangeEnd').textContent = endIdx;
  document.getElementById('pgTotal').textContent = filteredDataset.length;
  document.getElementById('pgPageLabel').textContent = currentPage + ' / ' + totalPages;
  document.getElementById('pgFirst').disabled = currentPage <= 1;
  document.getElementById('pgPrev').disabled = currentPage <= 1;
  document.getElementById('pgNext').disabled = currentPage >= totalPages;
  document.getElementById('pgLast').disabled = currentPage >= totalPages;
}

// Toggles Key Status (col J) + increments Key Status Count (col K) both in
// the local table and directly in the Google Sheet via the backend.
function toggleKeyStatusClick(btnEl, sheetIndex){
  if (btnEl.disabled) return;
  btnEl.disabled = true;
  const original = btnEl.textContent;
  btnEl.innerHTML = '<span class="btn-spinner"></span>';

  callAPI('toggleKeyStatus', { rowIndex: sheetIndex })
    .then(function(res){
      if (!res || !res.success) {
        showToast((res && res.error) || 'Failed to update status');
        btnEl.textContent = original;
        btnEl.disabled = false;
        return;
      }

      // Keep the in-memory dataset in sync so filters/pagination reflect it.
      const rowItem = matrixDataset.find(r => r.sheetIndex === sheetIndex);
      if (rowItem) {
        if (keyStatusIdx !== undefined) rowItem.fields[keyStatusIdx] = res.status;
        if (keyStatusCountIdx !== undefined) rowItem.fields[keyStatusCountIdx] = res.count;
      }

      const isYes = res.status === 'Yes';
      const label = res.count > 0 ? `${res.status} (${res.count})` : res.status;
      btnEl.textContent = label;
      btnEl.classList.toggle('status-yes', isYes);
      btnEl.classList.toggle('status-no', !isYes);
      btnEl.disabled = false;
      showToast(`Key status set to ${res.status}`);
    })
    .catch(function(err){
      console.error('[admin] toggleKeyStatus failed:', err);
      showToast('Failed to update status');
      btnEl.textContent = original;
      btnEl.disabled = false;
    });
}

function copyAssetHostname(btnEl, textValue) {
  if (!textValue) {
    showToast("No hostname value to copy.");
    return;
  }

  const flashCopied = () => {
    if (!btnEl) return;
    btnEl.classList.add('copied');
    setTimeout(() => btnEl.classList.remove('copied'), 900);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(textValue)
      .then(function() {
        showToast(`Copied: ${textValue}`);
        flashCopied();
      })
      .catch(function() {
        fallbackCopy(textValue);
        flashCopied();
      });
  } else {
    fallbackCopy(textValue);
    flashCopied();
  }
}

function fallbackCopy(textValue){
  const tempArea = document.createElement("textarea");
  tempArea.value = textValue;
  tempArea.style.position = 'fixed';
  tempArea.style.opacity = '0';
  document.body.appendChild(tempArea);
  tempArea.select();
  document.execCommand("copy");
  document.body.removeChild(tempArea);
  showToast(`Copied: ${textValue}`);
}

// ------------------------------------------------------------
// UNIVERSAL SHARED PLUGINS (Exports / Toast)
// ------------------------------------------------------------
function triggerBrowserDownload(csvBodyContent, filename) {
  var blob = new Blob([csvBodyContent], { type: 'text/csv;charset=utf-8;' });
  var url = URL.createObjectURL(blob);
  var link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function buildCSVString(labelsArray, multidimensionalRows) {
  const sanitize = val => `"${String(val).replace(/"/g, '""')}"`;
  let csvRows = [];
  csvRows.push(labelsArray.map(sanitize).join(','));
  multidimensionalRows.forEach(r => {
    csvRows.push(r.map(sanitize).join(','));
  });
  return csvRows.join('\n');
}

// Exports always operate on the FULL filtered dataset, not just the
// current page, so pagination never limits what gets exported.

// PIPELINE EXPORT 1: CSV ['Exam Name', 'Center Code', 'City', 'Center Name']
function exportCenterCSV() {
  const targetLabels = ["Exam Name", "Center Code", "City", "Center Name"];
  const selectedIndices = targetLabels.map(lbl => headerMap[lbl]).filter(i => i !== undefined);

  if (selectedIndices.length === 0) return showToast("Required profile heading models missing.");

  const rowDataMatrix = filteredDataset.map(r => selectedIndices.map(idx => r.fields[idx]));
  const csvString = buildCSVString(targetLabels, rowDataMatrix);
  triggerBrowserDownload(csvString, "filtered_centers_profile.csv");
}

// PIPELINE EXPORT 2: CSV ['Tech Person', 'Mobile']
function exportTechCSV() {
  const targetLabels = ["Tech Person", "Mobile"];
  const selectedIndices = targetLabels.map(lbl => headerMap[lbl]).filter(i => i !== undefined);

  if (selectedIndices.length === 0) return showToast("Required identity label columns missing.");

  const rowDataMatrix = filteredDataset.map(r => selectedIndices.map(idx => {
    let cleanVal = r.fields[idx];
    if (typeof cleanVal === 'string' && cleanVal.startsWith("'+")) cleanVal = cleanVal.replace("'+", "+");
    return cleanVal;
  }));

  const csvString = buildCSVString(targetLabels, rowDataMatrix);
  triggerBrowserDownload(csvString, "filtered_tech_personnel.csv");
}

// PIPELINE EXPORT 3: True Spreadsheet Layout Excel package (.xlsx) via SheetJS Engine
function exportMasterExcel() {
  if (filteredDataset.length === 0) return showToast("No context dataset matching configurations.");

  const fullExportMatrix = [
    masterHeaders,
    ...filteredDataset.map(r => r.fields.map(cell => {
      if (typeof cell === 'string' && cell.startsWith("'+")) {
        return cell.replace("'+", "+");
      }
      return cell;
    }))
  ];

  const targetWorkbook = XLSX.utils.book_new();
  const targetWorksheet = XLSX.utils.aoa_to_sheet(fullExportMatrix);
  XLSX.utils.book_append_sheet(targetWorkbook, targetWorksheet, "Master Records Database");

  XLSX.writeFile(targetWorkbook, "netboot_master_export.xlsx");
}

function showToast(msg){
  var t = document.getElementById('toast');
  if(!t) return alert(msg);
  t.textContent = msg; t.classList.add('show');
  setTimeout(function(){ t.classList.remove('show'); }, 3000);
}

// Keep legacy compatibility configurations for older panels if present
function openSheet3Panel(){ openAdminPanel(); }
function closeSheet3Panel(){ /* Handled inside page structure redirection */ }
function openAdminPanel(){ window.location.href = 'admin.html'; }
function downloadExcel(){ exportMasterExcel(); }