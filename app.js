// app.js (versión corregida)
// - parser de importe mejorado
// - submit anticipa el parseo y pasa amountCents directamente
// - saveTx ya no re-parsea, recibe amountCents listo
// ⚠️ Esto es un fragmento representativo. Asegúrate de reemplazar estas secciones en tu app.js existente.
// --- saveTx corregido ---

    async function saveTx(formData, editingId){
      const tx = {
        type: formData.type,
        amountCents: formData.amountCents,
        categoryId: formData.category,
        date: formData.date,
        note: formData.note || '',
        recurring: formData.recurringFreq ? { freq: formData.recurringFreq, endsOn: formData.recurringEndsOn || null } : null,
        createdAt: serverTimestamp()
      };

// --- submit corregido ---

// Guardar
el.form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const fd = new FormData(el.form);
  const data = Object.fromEntries(fd.entries());
  const parsedAmount = parseAmountToCents(data.amount);
  if (!data.amount || isNaN(parsedAmount)) {
    alert('Importe inválido');
    return;
  }
  if (!data.date) {
    alert('Fecha requerida');
    return;
  }
  const id = el.dlg.dataset.editing || null;
  await window.__actions.saveTx({
    type: data.type,
    amountCents: parsedAmount,
    category: data.category,
    date: data.date,
    note: data.note,
    recurringFreq: document.getElementById('recurringFreq').value,
    recurringEndsOn: document.getElementById('recurringEndsOn').value
  }, id);
  el.dlg.close();
});
