const formatNumber = (num) => {
    let n = Number(num);
    return isNaN(n) ? '0' : Math.round(n).toLocaleString('en-US');
};

const b64EncodeUnicode = (str) => {
    try { 
        return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1))); 
    } catch(e) { return ""; }
};

const b64DecodeUnicode = (str) => {
    try { 
        return decodeURIComponent(Array.prototype.map.call(atob(str.replace(/\n/g, '')), c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')); 
    } catch(e) { return "{}"; }
};

const fetchWithTimeout = async (url, options = {}, timeout = 5000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
};

const getCurrentBillingPeriod = (payday = 1) => {
    const d = new Date();
    let year = d.getFullYear();
    let month = d.getMonth() + 1;
    let day = d.getDate();
    if (day < payday) {
        month -= 1;
        if (month === 0) {
            month = 12;
            year -= 1;
        }
    }
    let nextMonth = month + 1;
    let nextYear = year;
    if (nextMonth > 12) {
        nextMonth = 1;
        nextYear += 1;
    }
    const startDate = `${year}-${String(month).padStart(2, '0')}-${String(payday).padStart(2, '0')}`;
    const endDateObj = new Date(nextYear, nextMonth - 1, payday - 1);
    const endDate = `${endDateObj.getFullYear()}-${String(endDateObj.getMonth() + 1).padStart(2, '0')}-${String(endDateObj.getDate()).padStart(2, '0')}`;
    return { startDate, endDate };
};

const splitBillCalculator = (totalAmount, peopleCount, isPayer = true) => {
    if (peopleCount <= 1) return { personalAmount: totalAmount, receivableAmount: 0 };
    const perPerson = Math.round(totalAmount / peopleCount);
    const receivable = isPayer ? totalAmount - perPerson : 0;
    return { personalAmount: perPerson, receivableAmount: receivable };
};

const setupDefaultData = (data, defaultCategories) => {
    if(!data.transactions) data.transactions = [];
    if(!data.investments) data.investments = [];
    if(!data.fixed_assets) data.fixed_assets = [];
    if(!data.installments) data.installments = [];
    if(!data.loans) data.loans = [];
    if(!data.smart_tags) data.smart_tags = {};
    if(!data.budgets) data.budgets = {};
    if(!data.recurring) data.recurring = [];
    if(!data.savings_goals) data.savings_goals = [];
    if(!data.currencyRates) data.currencyRates = { TWD: 1, USD: 32.5, JPY: 0.22 };
    if(!data.main_categories) data.main_categories = { Expense: [], Income: [] };
    
    if(!data.accounts || data.accounts.length === 0) {
        data.main_categories.Expense = defaultCategories.Expense.map(c => c.category);
        data.main_categories.Income = defaultCategories.Income.map(c => c.category);
        data.quick_tags = [...defaultCategories.QuickTags];

        let defaultAccs = [
            { id: "1101", name: "現金錢包", type: "Asset", currency: "TWD", is_hidden: false },
            { id: "1102", name: "常用銀行存款", type: "Asset", currency: "TWD", is_hidden: false },
            { id: "2101", name: "信用卡", type: "Liability", currency: "TWD", is_hidden: false },
            { id: "1103", name: "股票投資", type: "Asset", currency: "TWD", is_hidden: false }, 
            { id: "1201", name: "固定資產", type: "Asset", currency: "TWD", is_hidden: false },
            { id: "1201-DEP", name: "累計折舊", type: "Asset", currency: "TWD", is_contra: true, is_hidden: false },
            { id: "1104", name: "應收款項", type: "Asset", currency: "TWD", category: "系統", is_hidden: false },
            { id: "3101", name: "期初權益", type: "Equity", currency: "TWD", is_hidden: false }, 
            { id: "4201", name: "處分資產損益", type: "Income", currency: "TWD", is_hidden: false },
            { id: "4202", name: "股利收入", type: "Income", currency: "TWD", is_hidden: false },
            { id: "5102", name: "折舊費用", type: "Expense", category: "系統", is_hidden: false }, 
            { id: "5103", name: "利息支出", type: "Expense", category: "系統", is_hidden: false }
        ];

        defaultCategories.Expense.forEach(cat => {
            cat.sub.forEach((sub, idx) => { defaultAccs.push({ id: `exp_${cat.category}_${idx}`, name: sub, type: 'Expense', category: cat.category, currency: 'TWD', is_hidden: false }); });
        });

        defaultCategories.Income.forEach(cat => {
            cat.sub.forEach((sub, idx) => { defaultAccs.push({ id: `inc_${cat.category}_${idx}`, name: sub, type: 'Income', category: cat.category, currency: 'TWD', is_hidden: false }); });
        });
        
        data.accounts = defaultAccs;
    }

    if(!data.accounts.find(a=>a && a.id==='4201')) data.accounts.push({ id: "4201", name: "處分資產損益", type: "Income", currency: "TWD", is_hidden: false });
    if(!data.accounts.find(a=>a && a.id==='4202')) data.accounts.push({ id: "4202", name: "股利收入", type: "Income", currency: "TWD", is_hidden: false });
    if(!data.accounts.find(a=>a && a.id==='5103')) data.accounts.push({ id: "5103", name: "利息支出", type: "Expense", category: "系統", is_hidden: false });
    if(!data.accounts.find(a=>a && a.id==='1104')) data.accounts.push({ id: "1104", name: "應收款項", type: "Asset", currency: "TWD", category: "系統", is_hidden: false });
    
    if(!data.main_categories.Expense || data.main_categories.Expense.length===0) data.main_categories.Expense = defaultCategories.Expense.map(c => c.category);
    if(!data.main_categories.Income || data.main_categories.Income.length===0) data.main_categories.Income = defaultCategories.Income.map(c => c.category);
    if(!data.quick_tags || data.quick_tags.length===0) data.quick_tags = [...defaultCategories.QuickTags];
    
    let accountsList = data.accounts || [];
    for (let i = 0; i < accountsList.length; i++) {
        let acc = accountsList[i];
        if (!acc) continue;
        if (acc.is_hidden === undefined) acc.is_hidden = false;
        if (!acc.currency) acc.currency = 'TWD';
        if ((acc.type === 'Expense' || acc.type === 'Income') && !acc.category) {
            if (acc.type === 'Expense') { acc.category = ['三餐', '餐飲'].includes(acc.name) ? '飲食' : (['交通', '高鐵'].includes(acc.name) ? '交通' : '個人/其他'); } 
            else { acc.category = ['薪水', '獎金'].includes(acc.name) ? '薪資' : '其他入帳'; }
        }
    }
};