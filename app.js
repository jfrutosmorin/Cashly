// Utilidades
const fmtEUR = new Intl.NumberFormat('es-ES', { style:'currency', currency:'EUR' });
const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
const todayISO = () => new Date().toISOString().slice(0,10);
const toMonthKey = (d) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
const parseAmountToCents = (value) => {
  if (value == null) return NaN;

  // Convertir a string, quitar espacios, símbolo €, separadores de millar, etc.
  let s = String(value)
    .normalize('NFKC') // normaliza caracteres Unicode raros
    .replace(/[^\d,.\-]/g, '') // elimina cualquier caracter no numérico, salvo . , -
    .replace(/\./g, '')        // quita separadores de miles (.)
    .replace(',', '.');        // cambia coma decimal a punto

  const n = parseFloat(s);
  if (isNaN(n)) return NaN;

  return Math.round(n * 100);
};
const centsToEUR = (c) => fmtEUR.format((c||0)/100);

// Categorías iniciales
const CATEGORIES = [
  { id:'salary', name:'Salario', emoji:'💼', color:'#22c55e' },
  { id:'freelance', name:'Freelance', emoji:'🧾', color:'#10b981' },
  { id:'other_inc', name:'Otros ingresos', emoji:'🎁', color:'#84cc16' },
  { id:'food', name:'Comida', emoji:'🍽️', color:'#f97316' },
  { id:'groceries', name:'Super', emoji:'🛒', color:'#fb7185' },
  { id:'rent', name:'Alquiler', emoji:'🏠', color:'#60a5fa' },
  { id:'transport', name:'Transporte', emoji:'🚌', color:'#a78bfa' },
  { id:'leisure', name:'Ocio', emoji:'🎮', color:'#f59e0b' },
  { id:'health', name:'Salud', emoji:'💊', color:'#f43f5e' },
  { id:'utilities', name:'Luz/Agua', emoji:'💡', color:'#38bdf8' },
  { id:'other_exp', name:'Otros gastos', emoji:'🧩', color:'#94a3b8' }
];

// Estado
let state = {
  month: toMonthKey(new Date()),
  txs: [], // del snapshot de Firestore
  chart: null
};

// UI refs
const el = {
  currentMonth: document.getElementById('currentMonth'),
  incomeTotal: document.getElementById('incomeTotal'),
  expenseTotal: document.getElementById('expenseTotal'),
  balance: document.getElementById('balance'),
  txList: document.getElementById('txList'),
  empty: document.getElementById('emptyState'),
  fab: document.getElementById('fabAdd'),
  dlg: document.getElementById('dlgTx'),
  form: document.getElementById('txForm'),
  dlgTitle: document.getElementById('dlgTitle'),
  btnExport: document.getElementById('btnExport'),
  fileImport: document.getElementById('fileImport'),
  authInfo: document.getElementById('authInfo'),
  chartCanvas: document.getElementById('chartCategories'),
  prevMonth: document.getElementById('prevMonth'),
  nextMonth: document.getElementById('nextMonth'),
  confirm: document.getElementById('dlgConfirm'),
  confirmText: document.getElementById('confirmText')
};

// Poblar select de categorías
const categorySelect = document.getElementById('category');
CATEGORIES.forEach(c => {
  const opt = document.createElement('option');
  opt.value = c.id; opt.textContent = `${c.emoji} ${c.name}`;
  categorySelect.appendChild(opt);
});

// Mes UI
function setMonthLabel(key){
  const y = key.slice(0,4); const m = Number(key.slice(5,7)) - 1;
  el.currentMonth.textContent = `${monthNames[m]} ${y}`;
}
setMonthLabel(state.month);
el.prevMonth.addEventListener('click', () => {
  const [y,m] = state.month.split('-').map(Number);
  const d = new Date(y, m-2, 1);
  state.month = toMonthKey(d);
  setMonthLabel(state.month);
  refreshList();
});
el.nextMonth.addEventListener('click', () => {
  const [y,m] = state.month.split('-').map(Number);
  const d = new Date(y, m, 1);
  state.month = toMonthKey(d);
  setMonthLabel(state.month);
  refreshList();
});

// Firebase ready → attach listeners
document.addEventListener('firebase-ready', () => {
  const { db, user } = window.__firebase;
  el.authInfo.textContent = `Conectado • ${user.uid.slice(0,6)}…`;

  import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js').then(({ 
    collection, addDoc, serverTimestamp, onSnapshot, query, orderBy, doc, deleteDoc, updateDoc 
  }) => {
    const col = collection(db, 'users', user.uid, 'transactions');

    // ✅ Ordenamos por fecha y luego por creación
    const q = query(
      col,
      orderBy('date', 'desc'),
      orderBy('createdAt', 'desc')
    );

    // Snapshot en tiempo real con manejo de error visible
    onSnapshot(q,
      snap => {
        state.txs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        refreshList();
      },
      err => {
        alert('Firestore error: ' + (err?.message || err));
      }
    );

    // Crear / actualizar
    async function saveTx(formData, editingId){
      const tx = {
        type: formData.type,
        amountCents: formData.amountCents,
        categoryId: formData.category,
        date: formData.date,
        note: formData.note || '',
        recurring: formData.recurringFreq
          ? { freq: formData.recurringFreq, endsOn: formData.recurringEndsOn || null }
          : null,
        createdAt: serverTimestamp()
      };

      if (editingId){
        await updateDoc(doc(db, 'users', user.uid, 'transactions', editingId), tx);
      } else {
        await addDoc(col, tx);

        // Recurrentes
        if (tx.recurring && tx.recurring.freq){
          const ends = tx.recurring.endsOn ? new Date(tx.recurring.endsOn) : null;
          let d = new Date(tx.date);
          while(true){
            d = new Date(d);
            if (tx.recurring.freq === 'monthly') d.setMonth(d.getMonth()+1);
            if (tx.recurring.freq === 'weekly')  d.setDate(d.getDate()+7);
            if (ends && d > ends) break;
            const future = { ...tx, date: d.toISOString().slice(0,10), recurring: null };
            await addDoc(col, future);
            if (!ends) break;
          }
        }
      }
    }

    async function removeTx(id){
      await deleteDoc(doc(db, 'users', user.uid, 'transactions', id));
    }

    window.__actions = { saveTx, removeTx };
  });
});

// Render lista + totales + gráfico
function refreshList(){
  // Rango del mes visible
  const [y,m] = state.month.split('-').map(Number);
  const first = new Date(y, m-1, 1);
  const last  = new Date(y, m,   0);

  // Función robusta para obtener Date desde el doc (string o Timestamp)
  const toDateObj = (t) => {
    const v = t.date;
    // Firestore Timestamp
    if (v && typeof v.toDate === 'function') return v.toDate();
    // String tipo "YYYY-MM-DD"
    if (typeof v === 'string') {
      const s = v.trim().slice(0,10);
      const d = new Date(s + 'T00:00:00');
      if (!isNaN(d)) return d;
    }
    return null; // inválida
  };

  // Mapear docs -> con fecha válida
  let valid = 0, invalid = 0;
  const details = [];
  const txs = state.txs.map(t => {
    const d = toDateObj(t);
    if (d) { valid++; } else { invalid++; }
    details.push(`${(t.id||'').slice(0,6)} date=${t.date} -> ${d ? d.toISOString().slice(0,10) : 'INVALID'}`);
    return { ...t, __dateObj: d };
  });

  // Filtrar por mes visible
  const inMonth = txs.filter(t => t.__dateObj && t.__dateObj >= first && t.__dateObj <= last);

  // Totales
  const income  = inMonth.filter(t=>t.type==='income' ).reduce((s,t)=>s+(t.amountCents||0),0);
  const expense = inMonth.filter(t=>t.type==='expense').reduce((s,t)=>s+(t.amountCents||0),0);
  const balance = income - expense;
  el.incomeTotal.textContent  = centsToEUR(income);
  el.expenseTotal.textContent = centsToEUR(expense);
  el.balance.textContent      = centsToEUR(balance);

  // Lista
  el.txList.innerHTML = '';
  el.empty.style.display = inMonth.length ? 'none' : 'block';

  inMonth.forEach(t => {
    const li = document.createElement('li');
    li.className = `tx ${t.type}`;
    const cat = CATEGORIES.find(c=>c.id===t.categoryId) || { emoji:'🏷️', name:t.categoryId };
    const amountStr = (t.type==='expense' ? '-' : '+') + centsToEUR(t.amountCents).replace('€','').trim() + ' €';
    li.innerHTML = `
      <div class="emoji">${cat.emoji||'🏷️'}</div>
      <div class="main">
        <div class="title">${cat.name} · ${amountStr}</div>
        <div class="sub">${t.note ? (t.note + ' · ') : ''}${(t.__dateObj||new Date()).toLocaleDateString('es-ES')}</div>
      </div>
      <div class="actions">
        <button data-id="${t.id}" class="edit">Editar</button>
        <button data-id="${t.id}" class="del">Eliminar</button>
      </div>
    `;
    el.txList.appendChild(li);
  });

  // Eventos edición/eliminación
  el.txList.querySelectorAll('button.edit').forEach(b => b.addEventListener('click', () => openEdit(b.dataset.id)));
  el.txList.querySelectorAll('button.del').forEach(b => b.addEventListener('click', () => confirmDelete(b.dataset.id)));

  // Gráfico
  renderChart(inMonth);
}

function renderChart(txs){
  const ctx = el.chartCanvas.getContext('2d');
  const byCat = new Map();
  txs.filter(t=>t.type==='expense').forEach(t => {
    byCat.set(t.categoryId, (byCat.get(t.categoryId)||0) + (t.amountCents||0));
  });
  const labels = Array.from(byCat.keys()).map(id => (CATEGORIES.find(c=>c.id===id)||{name:id}).name);
  const data = Array.from(byCat.values()).map(v => v/100);
  if (state.chart) state.chart.destroy();
  state.chart = new Chart(ctx, {
    type:'doughnut',
    data:{ labels, datasets:[{ data }] },
    options:{ plugins:{ legend:{ position:'bottom', labels:{ color:'#e5e7eb' } } } }
  });
}

// Abrir modal Nuevo
document.getElementById('fabAdd').addEventListener('click', () => {
  el.form.reset();
  document.getElementById('typeIncome').checked = true;
  document.getElementById('date').value = todayISO();
  el.dlgTitle.textContent = 'Nuevo movimiento';
  el.dlg.dataset.editing = '';
  el.dlg.showModal();
});

// Guardar
el.form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const fd = new FormData(el.form);
  const data = Object.fromEntries(fd.entries());
  
  const parsedAmount = parseAmountToCents(data.amount);

  if (!data.amount || isNaN(parsedAmount)) {
    alert('❌ Importe inválido');
    return;
  }
  if (!data.date) {
    alert('❌ Fecha requerida');
    return;
  }

  if (!window.__actions || !window.__actions.saveTx) {
    alert('⚠️ Firebase aún no está listo. Intenta de nuevo en unos segundos.');
    return;
  }

  const id = el.dlg.dataset.editing || null;

  try {
    await window.__actions.saveTx({
      type: data.type,
      amountCents: parsedAmount,
      category: data.category,
      date: data.date,
      note: data.note,
      recurringFreq: document.getElementById('recurringFreq').value,
      recurringEndsOn: document.getElementById('recurringEndsOn').value
    }, id);

    alert('✅ Movimiento guardado correctamente');
    el.dlg.close();
  } catch (err) {
    alert('❌ Error al guardar el movimiento:\n' + err.message);
  }
});


function openEdit(id){
  const t = state.txs.find(x=>x.id===id); if (!t) return;
  el.form.reset();
  (t.type==='income' ? document.getElementById('typeIncome') : document.getElementById('typeExpense')).checked = true;
  document.getElementById('amount').value = (t.amountCents/100).toFixed(2);
  document.getElementById('category').value = t.categoryId;
  document.getElementById('date').value = t.date;
  document.getElementById('note').value = t.note||'';
  document.getElementById('recurringFreq').value = t.recurring?.freq || '';
  document.getElementById('recurringEndsOn').value = t.recurring?.endsOn || '';
  el.dlgTitle.textContent = 'Editar movimiento';
  el.dlg.dataset.editing = id;
  el.dlg.showModal();
}

function confirmDelete(id){
  el.confirmText.textContent = '¿Eliminar este movimiento?';
  // Quitamos posibles listeners previos
  el.confirm.addEventListener('close', () => {}, { once:true }); 
  // Abrimos y esperamos el cierre
  el.confirm.showModal();
  el.confirm.addEventListener('close', async () => {
    try {
      if (el.confirm.returnValue === 'ok') {
        await window.__actions.removeTx(id);
      }
    } catch (e) {
      alert('Error eliminando: ' + (e?.message || e));
    }
  }, { once:true });
}

async function removeTx(id){
  try {
    const { db, user } = window.__firebase;
    const { doc, deleteDoc } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    await deleteDoc(doc(db, 'users', user.uid, 'transactions', id));
  } catch (e) {
    throw e; // lo captura confirmDelete y muestra alert
  }
}

// Exportar / Importar
el.btnExport.addEventListener('click', () => {
  const payload = {
    exportedAt: new Date().toISOString(),
    version: 1,
    data: state.txs
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `finanzas-${state.month}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});

el.fileImport.addEventListener('change', async (e) => {
  const file = e.target.files[0]; if (!file) return;
  const text = await file.text();
  try{
    const json = JSON.parse(text);
    if (!Array.isArray(json.data)) { alert('Archivo no válido'); return; }
    const { db, user } = window.__firebase;
    const { collection, addDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
    const col = collection(db, 'users', user.uid, 'transactions');
    for (const t of json.data){
      const clean = {
        type: (t.type === 'income' ? 'income' : 'expense'),
        amountCents: Number(t.amountCents)||0,
        categoryId: String(t.categoryId||'other_exp'),
        date: t.date?.slice(0,10) || todayISO(),
        note: String(t.note||''),
        createdAt: serverTimestamp()
      };
      await addDoc(col, clean);
    }
    alert('Importación completada');
  }catch(err){
    console.error(err); alert('Error importando JSON');
  }
});

document.getElementById('btnLogout').addEventListener('click', async () => {
  const { signOut } = await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js');
  await signOut(window.__auth);
  location.reload();
});

document.getElementById('btnCancel').addEventListener('click', () => {
  el.dlg.close();
});

// --- Auth UI (login/registro) ---
const authDialog   = document.getElementById('authDialog');
const authForm     = document.getElementById('authForm');
const authEmail    = document.getElementById('authEmail');
const authPassword = document.getElementById('authPassword');
const toggleMode   = document.getElementById('toggleMode');
const authCancel   = document.getElementById('authCancel');
const authSubmit   = document.getElementById('authSubmit');
const btnLogout    = document.getElementById('btnLogout');

let authMode = 'login'; // 'login' | 'register'
function setAuthMode(mode){
  authMode = mode;
  const title = document.getElementById('authTitle');
  if (mode === 'login') {
    title.textContent = 'Iniciar sesión';
    authSubmit.textContent = 'Entrar';
    toggleMode.textContent = '¿No tienes cuenta? Regístrate';
  } else {
    title.textContent = 'Crear cuenta';
    authSubmit.textContent = 'Registrarme';
    toggleMode.textContent = '¿Ya tienes cuenta? Inicia sesión';
  }
}
setAuthMode('login');

toggleMode?.addEventListener('click', () => {
  setAuthMode(authMode === 'login' ? 'register' : 'login');
});

authCancel?.addEventListener('click', () => {
  authDialog?.close();
});

authForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  try {
    const email = authEmail.value.trim();
    const pwd   = authPassword.value;
    if (!email || !pwd) { alert('Rellena email y contraseña'); return; }

    if (!window.__firebase) { alert('Firebase no está listo aún.'); return; }
    const { auth, createUserWithEmailAndPassword, signInWithEmailAndPassword } = window.__firebase;

    if (authMode === 'register') {
      await createUserWithEmailAndPassword(auth, email, pwd);
    } else {
      await signInWithEmailAndPassword(auth, email, pwd);
    }

    authDialog?.close();
    // El onAuthStateChanged del firebase.js disparará 'firebase-ready' y montará listeners
  } catch (e) {
    alert('Error de autenticación: ' + (e?.message || e));
  }
});

btnLogout?.addEventListener('click', async () => {
  try {
    if (!window.__firebase) return;
    const { auth, signOut } = window.__firebase;
    await signOut(auth);
    // Limpia UI mínima
    state.txs = [];
    refreshList();
    // El onAuthStateChanged abrirá el diálogo otra vez
  } catch (e) {
    alert('Error al cerrar sesión: ' + (e?.message || e));
  }
});

// ======== OCR: importar movimientos desde imágenes ========
const btnOcr = document.getElementById('btnOcr');
const ocrFiles = document.getElementById('ocrFiles');
const dlgOcr = document.getElementById('dlgOcr');
const ocrStatus = document.getElementById('ocrStatus');
const ocrPreview = document.getElementById('ocrPreview');
const btnOcrImport = document.getElementById('ocrImport');
const btnOcrCancel = document.getElementById('ocrCancel');

btnOcr?.addEventListener('click', () => ocrFiles.click());
btnOcrCancel?.addEventListener?.('click', () => dlgOcr.close());
ocrFiles?.addEventListener('change', async (e) => {
  if (!e.target.files?.length) return;
  dlgOcr.showModal();
  ocrStatus.textContent = `Procesando ${e.target.files.length} imagen(es)…`;
  btnOcrImport.disabled = true;
  ocrPreview.innerHTML = 'Leyendo…';

  try {
    const results = [];

    // Pre-proceso: reescala y pone en blanco/negro para mejorar OCR
    const preprocess = (file) => new Promise(res => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1.8, 1200 / Math.min(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        // Gris y contraste leve
        const imgData = ctx.getImageData(0,0,w,h);
        const d = imgData.data;
        for (let i=0;i<d.length;i+=4){
          const g = 0.299*d[i]+0.587*d[i+1]+0.114*d[i+2];
          const gc = Math.min(255, Math.max(0, (g-128)*1.15+128));
          d[i]=d[i+1]=d[i+2]=gc;
        }
        ctx.putImageData(imgData,0,0);
        c.toBlob(b => res(b), 'image/jpeg', 0.92);
      };
      img.src = URL.createObjectURL(file);
    });

    for (const file of e.target.files) {
      const pre = await preprocess(file);

      const { data } = await Tesseract.recognize(
        pre,
        // español + inglés mejora marcas y abreviaturas
        'spa+eng',
        {
          logger: m => (ocrStatus.textContent = `${m.status} ${Math.round((m.progress||0)*100)}%`),
          langPath: 'https://tessdata.projectnaptha.com/4.0.0',
          // ayuda a detectar dígitos/€ y signos
          tessedit_char_whitelist: '0123456789€,-.abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ áéíóúÁÉÍÓÚñÑ:/',
        }
      );

      results.push({ file, text: data.text || '' });
    }

    // DEBUG: muestra lo que realmente leyó el OCR (primeros 600 chars)
    const sample = results.map((r,i)=>`[Imagen ${i+1}] ${r.text.slice(0,600)}`).join('\n---\n');
    ocrPreview.innerHTML = `<pre style="white-space:pre-wrap;font-size:12px;opacity:.8">${sample || '(sin texto OCR)'}</pre>`;

    // Parseo
    const candidates = [];
    for (const r of results) candidates.push(...parseBankTextToTx(r.text));

    if (!candidates.length) {
      // Fallback: si no encontró fechas, al menos saca importes con fecha HOY
      const fallback = parseAnyAmountsToday(results.map(r=>r.text).join('\n'));
      if (fallback.length) candidates.push(...fallback);
    }

    if (!candidates.length) {
      ocrStatus.textContent = 'No se reconocieron movimientos. Prueba a recortar la zona de “Movimientos” y reintenta.';
      btnOcrImport.disabled = true;
      return;
    }

    // Render selección
    renderCandidatesForImport(candidates);
    ocrStatus.textContent = `Detectados ${candidates.length} movimientos`;
  } catch (e2) {
    alert('Error OCR: ' + (e2?.message || e2));
    dlgOcr.close();
  } finally {
    ocrFiles.value = '';
  }
});

// Render de candidatos (sin cambios esenciales)
function renderCandidatesForImport(candidates){
  ocrPreview.innerHTML = '';
  const list = document.createElement('ul');
  list.style.listStyle='none'; list.style.padding='0';
  candidates.forEach((tx,i)=>{
    const li = document.createElement('li');
    li.style.margin='6px 0'; li.style.padding='8px';
    li.style.border='1px solid #334155'; li.style.borderRadius='8px';
    const sign = tx.type==='expense' ? '-' : '+';
    li.innerHTML = `
      <label style="display:flex;gap:8px;align-items:center;">
        <input type="checkbox" data-i="${i}" checked>
        <div style="flex:1">
          <div><strong>${tx.note || tx.merchant || 'Movimiento'}</strong></div>
          <div style="opacity:.8">${tx.date} · ${tx.category || '—'}</div>
        </div>
        <div><strong>${sign}${centsToEUR(tx.amountCents).replace('€','').trim()} €</strong></div>
      </label>`;
    list.appendChild(li);
  });
  ocrPreview.appendChild(list);
  btnOcrImport.disabled = false;

  btnOcrImport.onclick = async () => {
    const checks = ocrPreview.querySelectorAll('input[type="checkbox"]');
    const toImport = [];
    checks.forEach(ch => ch.checked && toImport.push(candidates[Number(ch.dataset.i)]));
    if (!toImport.length) { alert('No hay elementos seleccionados'); return; }
    ocrStatus.textContent = `Importando ${toImport.length}…`;
    btnOcrImport.disabled = true;
    for (const tx of toImport) {
      await window.__actions.saveTx({
        type: tx.type,
        amountCents: tx.amountCents,
        category: tx.categoryId || tx.category || 'other_exp',
        date: tx.date,
        note: tx.note || tx.merchant || ''
      }, null);
    }
    ocrStatus.textContent = 'Importación completada';
    setTimeout(()=> dlgOcr.close(), 600);
  };
}
// ======== Parser para texto OCR (español, estilo apps bancarias) ========
// Heurísticas básicas para: fechas, importes y tipo (ingreso/gasto).
function parseBankTextToTx(text){
  if (!text) return [];
  const lines = text.split(/\r?\n/).map(s => s.trim()).filter(Boolean);

  // Meses ES (3 letras)
  const MES = { ene:1,feb:2,mar:3,abr:4,may:5,jun:6,jul:7,ago:8,sep:9,oct:10,nov:11,dic:12 };

  // Fecha estilo "Jueves, 7 ago" / "Miércoles, 6 ago"
  const reFecha = /(?:lunes|martes|miércoles|miercoles|jueves|viernes|sábado|sabado|domingo),?\s*(\d{1,2})\s+([a-záéíóú]{3,})/i;

  // Importes: permite signo menos unicode (−), € delante o detrás, miles por punto o espacio fino
  const reMonto = /(?:€\s*)?([+\-−]?\s?\d{1,3}(?:[.\s ]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2}))(?:\s*€)?/i;

  const KEY_EXP = /(compra|pago|tarj|cargo|movil|móvil|apple|amazon|comisión|comision|tienda|bizum enviado)/i;
  const KEY_INC = /(ingreso|abono|transferencia.*(recib|entrada)|n[oó]mina|bizum recibido)/i;

  const pickCategory = (desc, isExpense) => {
    if (/super|mercadona|carre?four|aldi|lidl/i.test(desc)) return 'groceries';
    if (/corte ingles|apple|amazon|tienda|compra/i.test(desc)) return isExpense ? 'other_exp' : 'other_inc';
    if (/transfe|ingreso|abono|n[oó]mina/i.test(desc)) return isExpense ? 'other_exp' : 'salary';
    if (/pago movil|m[oó]vil|tarj/i.test(desc)) return 'other_exp';
    return isExpense ? 'other_exp' : 'other_inc';
  };

  let currentDateISO = todayISO();
  const out = [];

  for (let i=0;i<lines.length;i++){
    const ln = lines[i].normalize('NFKC');

    const mF = ln.toLowerCase().match(reFecha);
    if (mF){
      const d = parseInt(mF[1],10);
      const mm = (MES[mF[2].slice(0,3).toLowerCase()] || (new Date().getMonth()+1));
      const yy = new Date().getFullYear();
      currentDateISO = `${yy}-${String(mm).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
      continue;
    }

    const mA = ln.match(reMonto);
    if (!mA) continue;

    const raw = mA[1].replace(/\s/g,'').replace('−','-').replace(/\.(?=\d{3}\b)/g,'').replace(',', '.');
    const cents = Math.round(parseFloat(raw)*100);
    if (!Number.isFinite(cents) || cents<=0) continue;

    const isExpense = /^-/.test(raw) || KEY_EXP.test(ln);
    const type = isExpense ? 'expense' : (KEY_INC.test(ln) ? 'income' : 'expense');

    const note = ln.replace(mA[0], '').trim().replace(/\s{2,}/g,' ');

    out.push({
      type,
      amountCents: cents,
      date: currentDateISO,
      merchant: note || 'Movimiento',
      categoryId: pickCategory(note, isExpense)
    });
  }

  return out;
}

// Fallback: si no detecta fechas, al menos captura importes y usa fecha de hoy
function parseAnyAmountsToday(text){
  const re = /(?:€\s*)?([+\-−]?\s?\d{1,3}(?:[.\s ]\d{3})*(?:[.,]\d{2})|\d+(?:[.,]\d{2}))(?:\s*€)?/g;
  const out=[]; let m;
  while ((m=re.exec(text))){
    const raw = m[1].replace(/\s/g,'').replace('−','-').replace(/\.(?=\d{3}\b)/g,'').replace(',', '.');
    const cents = Math.round(parseFloat(raw)*100);
    if (!Number.isFinite(cents) || cents<=0) continue;
    const isExpense = /^-/.test(raw);
    out.push({
      type: isExpense ? 'expense':'expense', // por defecto gasto si no sabemos
      amountCents: cents,
      date: todayISO(),
      merchant: 'Detectado por OCR',
      categoryId: 'other_exp'
    });
  }
  return out;
}
