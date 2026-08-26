const renderExpenseChart = (instanceRef, canvasId, transactions, accounts, dashboardScope, dashboardMonth) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return instanceRef;
    const ctx = canvas.getContext('2d');
    if (instanceRef) { instanceRef.destroy(); instanceRef = null; }
    if (canvas.width > 0 && canvas.height > 0 && ctx) {
        const expMonth = dashboardMonth || ''; 
        const exp = {}; 
        let tot = 0;
        (transactions || []).forEach(tx => {
            let txDate = tx && tx.date ? tx.date : '';
            if (tx && !tx.is_refunded && !tx.is_refund && txDate.length >= 7 && expMonth.length >= 7 && txDate.substring(0,7) === expMonth.substring(0,7)) {
                if (dashboardScope !== 'all' && tx.scope !== dashboardScope) return;
                (tx.debits || []).forEach(d => {
                    let a = accounts.find(ac => ac && ac.id === d.account_id);
                    if(a && a.type === 'Expense') { 
                        let cat = a.category || '未分類'; 
                        let amt = Number(d.amount) || 0; 
                        if(!exp[cat]) exp[cat] = 0; 
                        exp[cat] += amt; 
                        tot += amt; 
                    }
                });
            }
        });
        if (tot > 0) {
            let labels = Object.keys(exp);
            let values = Object.values(exp);
            instanceRef = new Chart(ctx, { 
                type: 'doughnut', 
                data: { 
                    labels: labels, 
                    datasets: [{ data: values, backgroundColor: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'], borderWidth: 0 }] 
                }, 
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: {color: '#94a3b8'} } } } 
            });
        }
    }
    return instanceRef;
};

const renderAssetChart = (instanceRef, canvasId, cTot, sTot, fTot) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return instanceRef;
    const ctx = canvas.getContext('2d');
    if (instanceRef) { instanceRef.destroy(); instanceRef = null; }
    if (canvas.width > 0 && canvas.height > 0 && ctx && (cTot > 0 || sTot > 0 || fTot > 0)) {
        instanceRef = new Chart(ctx, { 
            type: 'pie', 
            data: { 
                labels: ['流動資金總額', '股票現值', '固定資產'], 
                datasets: [{ data: [Math.max(0,cTot), sTot, Math.max(0,fTot)], backgroundColor: ['#3b82f6', '#8b5cf6', '#14b8a6'], borderWidth: 0 }] 
            }, 
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: {color: '#94a3b8'} } } } 
        });
    }
    return instanceRef;
};

const renderNetWorthChart = (instanceRef, canvasId, histLabels, histData) => {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return instanceRef;
    const ctx = canvas.getContext('2d');
    if (instanceRef) { instanceRef.destroy(); instanceRef = null; }
    if (canvas.width > 0 && canvas.height > 0 && ctx) {
        instanceRef = new Chart(ctx, { 
            type: 'line', 
            data: { 
                labels: histLabels, 
                datasets: [{ label: '淨資產', data: histData, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.2)', fill: true, tension: 0.4 }] 
            }, 
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: '#94a3b8' } }, x: { ticks: { color: '#94a3b8' } } } } 
        });
    }
    return instanceRef;
};