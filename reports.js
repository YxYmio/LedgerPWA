const calculateBalanceAsOf = (accounts, transactions, accId, dateStr) => {
    let b = 0;
    (transactions || []).forEach(tx => {
        if (!tx || tx.date > dateStr || tx.is_refunded) return;
        if (tx.debits) tx.debits.forEach(d => { if (d && d.account_id===accId) b += (Number(d.amount)||0); });
        if (tx.credits) tx.credits.forEach(c => { if (c && c.account_id===accId) b -= (Number(c.amount)||0); });
    });
    let a = (accounts || []).find(ac => ac && ac.id === accId);
    if (a && (a.type==='Asset' || a.type==='Expense')) return b;
    return -b;
};

const calculateBalanceSheet = (accounts, transactions, investments, dateRates, endDate) => {
    let ed = endDate || '9999-12-31';
    let curAssts = [], nonCurAssts = [], liabs = [];
    let tAssets = 0, tLiab = 0, initEq = 0, retainedEarn = 0;
    
    (accounts || []).forEach(a => {
        if(!a) return;
        let bal = calculateBalanceAsOf(accounts, transactions, a.id, ed);
        if (a.type === 'Asset') {
            if (['1103','1201','1201-DEP'].includes(a.id)) {
            } else {
                if(bal !== 0) curAssts.push({ name: a.name, amount: bal });
                tAssets += bal;
            }
        } else if (a.type === 'Liability') {
            if(bal !== 0) liabs.push({ name: a.name, amount: bal });
            tLiab += bal;
        } else if (a.id === '3101') {
            initEq = bal;
        } else if (a.type === 'Income') {
            retainedEarn += bal;
        } else if (a.type === 'Expense') {
            retainedEarn -= bal;
        }
    });
    
    let invBal = 0;
    (investments||[]).forEach(i => {
        if(i) {
            let rate = dateRates[i.currency||'TWD'] || 1;
            invBal += (Number(i.shares)||0) * (Number(i.last_price)||0) * rate;
        }
    });
    if(invBal !== 0) { 
        nonCurAssts.push({ name: '投資組合現值', amount: invBal }); 
        tAssets += invBal; 
        retainedEarn += invBal - calculateBalanceAsOf(accounts, transactions, '1103', ed); 
    }
    
    let faNet = calculateBalanceAsOf(accounts, transactions, '1201', ed) - Math.abs(calculateBalanceAsOf(accounts, transactions, '1201-DEP', ed));
    if(faNet !== 0) { nonCurAssts.push({ name: '固定資產淨值', amount: faNet }); tAssets += faNet; }

    return { 
        currentAssetsList: curAssts, nonCurrentAssetsList: nonCurAssts, liabList: liabs, 
        currentAssets: curAssts.reduce((s,x)=>s+(x&&x.amount?x.amount:0),0), 
        nonCurrentAssets: nonCurAssts.reduce((s,x)=>s+(x&&x.amount?x.amount:0),0), 
        totalAssets: tAssets, totalLiab: tLiab, initialEquity: initEq, 
        retainedEarnings: retainedEarn, totalEquity: initEq + retainedEarn 
    };
};

const calculateIncomeStatement = (accounts, transactions, startDate, endDate) => {
    let sd = startDate || '0000-00-00';
    let ed = endDate || '9999-12-31';
    let rev = {}, exp = {};
    
    (transactions || []).forEach(tx => {
        if (!tx || tx.date < sd || tx.date > ed || tx.is_refunded) return;
        (tx.credits||[]).forEach(c => {
            let a = accounts.find(ac=>ac && ac.id===c.account_id);
            if (a && a.type === 'Income') rev[a.name] = (rev[a.name]||0) + Number(c.amount);
            if (a && a.type === 'Expense') exp[a.name] = (exp[a.name]||0) - Number(c.amount);
        });
        (tx.debits||[]).forEach(d => {
            let a = accounts.find(ac=>ac && ac.id===d.account_id);
            if (a && a.type === 'Income') rev[a.name] = (rev[a.name]||0) - Number(d.amount);
            if (a && a.type === 'Expense') exp[a.name] = (exp[a.name]||0) + Number(d.amount);
        });
    });
    let totalRev = Object.values(rev).reduce((a,b)=>a+b,0);
    let totalExp = Object.values(exp).reduce((a,b)=>a+b,0);
    return { rev, exp, totalRev, totalExp, net: totalRev - totalExp };
};

const calculateCashFlow = (accounts, transactions, startDate, endDate) => {
    let sd = startDate || '0000-00-00';
    let ed = endDate || '9999-12-31';
    let op = 0, inv = 0, fin = 0;

    const isCashAcc = (id) => {
        let a = accounts.find(ac=>ac && ac.id===id);
        return a && a.type === 'Asset' && !a.is_contra && !['1103','1201','1104'].includes(a.id);
    };

    let startCash = 0, endCash = 0;
    let sdObj = new Date(sd); sdObj.setDate(sdObj.getDate() - 1);
    let prevD = sdObj.toISOString().split('T')[0];
    
    (accounts||[]).forEach(a => {
        if(a && isCashAcc(a.id)) {
            startCash += calculateBalanceAsOf(accounts, transactions, a.id, prevD);
            endCash += calculateBalanceAsOf(accounts, transactions, a.id, ed);
        }
    });

    (transactions || []).forEach(tx => {
        if (!tx || tx.date < sd || tx.date > ed || tx.is_refunded) return;
        
        let cashChange = 0;
        let nonCashTypes = new Set();
        
        (tx.debits||[]).forEach(d => {
            if (isCashAcc(d.account_id)) cashChange += Number(d.amount);
            else { let a = accounts.find(ac=>ac && ac.id===d.account_id); if (a) nonCashTypes.add(a.type + '|' + a.id); }
        });
        (tx.credits||[]).forEach(c => {
            if (isCashAcc(c.account_id)) cashChange -= Number(c.amount);
            else { let a = accounts.find(ac=>ac && ac.id===c.account_id); if (a) nonCashTypes.add(a.type + '|' + a.id); }
        });

        if (cashChange !== 0) {
            let isInv = false, isFin = false;
            nonCashTypes.forEach(t => {
                if (t.includes('1103') || t.includes('1201') || t.includes('4201') || t.includes('4202')) isInv = true;
                if (t.includes('Liability') || t.includes('Equity')) isFin = true;
            });

            if (isInv) inv += cashChange;
            else if (isFin) fin += cashChange;
            else op += cashChange;
        }
    });
    return { op, inv, fin, net: op + inv + fin, startCash, endCash };
};