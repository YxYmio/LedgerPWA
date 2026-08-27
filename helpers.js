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

// 支援非自然月的計費週期推算邏輯
const getCurrentBillingPeriod = (dateStr, startDay = 1) => {
    const d = dateStr ? new Date(dateStr) : new Date();
    let year = d.getFullYear();
    let month = d.getMonth() + 1;
    let day = d.getDate();
    
    // 如果當前日期小於起算日，則屬於上一個計費週期
    if (day < startDay) {
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
    
    const startDate = `${year}-${String(month).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`;
    
    // 結束日為下個週期的起算日減 1 天
    const endDateObj = new Date(nextYear, nextMonth - 1, startDay - 1);
    const endDate = `${endDateObj.getFullYear()}-${String(endDateObj.getMonth() + 1).padStart(2, '0')}-${String(endDateObj.getDate()).padStart(2, '0')}`;
    
    return { startDate, endDate };
};

const splitBillCalculator = (totalAmount, peopleCount, isPayer = true) => {
    if (peopleCount <= 1) return { personalAmount: totalAmount, receivableAmount: 0 };
    const perPerson = Math.round(totalAmount / peopleCount);
    const receivable = isPayer ? totalAmount - perPerson : 0;
    return { personalAmount: perPerson, receivableAmount: receivable };
};

// ==========================================
// 全新 Lightsplit 群組結算引擎 (AA 演算法)
// ==========================================

// 1. 計算群組內每位成員的淨結餘 (代墊總額 - 應分擔總額)
// records 格式範例: [{ payer: 'A', amount: 1000, splits: [{member: 'A', amount: 500}, {member: 'B', amount: 500}] }]
const calculateNetBalances = (records, members) => {
    let balances = {};
    (members || []).forEach(m => { balances[m.name] = 0; });

    (records || []).forEach(record => {
        if (!record) return;
        // 加上代墊金額 (視為債權增加)
        if (balances[record.payer] !== undefined) {
            balances[record.payer] += (Number(record.amount) || 0);
        }
        // 扣除應分攤金額 (視為債務增加)
        (record.splits || []).forEach(split => {
            if (balances[split.member] !== undefined) {
                balances[split.member] -= (Number(split.amount) || 0);
            }
        });
    });
    return balances;
};

// 2. 貪婪演算法：計算最佳化結算矩陣 (最少轉帳次數)
// 傳入 balances 格式: { 'A': 500, 'B': -200, 'C': -300 }
const optimizeSettlements = (balances) => {
    let debtors = [];
    let creditors = [];

    // 拆分債務人(-)與債權人(+)
    for (let member in balances) {
        let amount = balances[member];
        // 處理浮點數誤差，只處理大於 1 元的帳
        if (amount < -0.5) debtors.push({ member, amount: Math.abs(amount) });
        else if (amount > 0.5) creditors.push({ member, amount });
    }

    // 金額由大到小排序，優先抵銷大額債務，確保最佳化
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    let settlements = [];
    let i = 0; // debtors index
    let j = 0; // creditors index

    while (i < debtors.length && j < creditors.length) {
        let debtor = debtors[i];
        let creditor = creditors[j];

        let settleAmount = Math.min(debtor.amount, creditor.amount);
        settleAmount = Math.round(settleAmount);

        if (settleAmount > 0) {
            settlements.push({
                from: debtor.member,
                to: creditor.member,
                amount: settleAmount
            });
        }

        debtor.amount -= settleAmount;
        creditor.amount -= settleAmount;

        if (debtor.amount < 0.5) i++;
        if (creditor.amount < 0.5) j++;
    }

    return settlements;
};

// ==========================================

// 安全的計算機數學表達式解析器
const evaluateCalc = (expression) => {
    try {
        // 僅允許數字、小數點與基本運算符號，防止 XSS/Injection
        let sanitized = expression.replace(/[^-()\d/*+.]/g, '');
        if (!sanitized) return null;
        let result = new Function('return ' + sanitized)();
        return (typeof result === 'number' && isFinite(result)) ? Math.round(result) : null;
    } catch (e) {
        return null;
    }
};

// 語音正則解析器 (NLP Parser)
const parseVoiceCommand = (text, accounts = []) => {
    let result = { amount: null, desc: '', tags: [], paymentAcc: '' };
    if (!text) return result;

    // 1. 提取 #標籤
    let tagMatches = text.match(/#\S+/g);
    if (tagMatches) {
        result.tags = tagMatches.map(t => t.substring(1));
        text = text.replace(/#\S+/g, '').trim();
    }

    // 2. 提取金額 (取第一個連續數字)
    let amountMatch = text.match(/\b\d+(\.\d+)?\b/);
    if (amountMatch) {
        result.amount = Number(amountMatch[0]);
        text = text.replace(amountMatch[0], '').trim();
    }

    // 3. 嘗試匹配扣款帳戶名稱
    let matchedAcc = accounts.find(a => a && a.name && text.includes(a.name) && a.type !== 'Expense' && a.type !== 'Income');
    if (matchedAcc) {
        result.paymentAcc = matchedAcc.id;
        text = text.replace(matchedAcc.name, '').trim();
    }

    // 4. 剩餘字串作為摘要
    result.desc = text.trim();
    return result;
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
    
    // --- 群組分帳 (類 Lightsplit) 資料結構相容 ---
    if(!data.split_projects) data.split_projects = [];
    if(!data.split_records) data.split_records = [];

    if(!data.accounts || data.accounts.length === 0) {
        data.main_categories.Expense = defaultCategories.Expense.map(c => c.category);
        data.main_categories.Income = defaultCategories.Income.map(c => c.category);
        data.quick_tags = [...defaultCategories.QuickTags];

        let defaultAccs = [
            { id: "1101", name: "現金錢包", type: "Asset", currency: "TWD", is_hidden: false, icon: '👛' },
            { id: "1102", name: "常用銀行存款", type: "Asset", currency: "TWD", is_hidden: false, icon: '🏦' },
            { id: "2101", name: "信用卡", type: "Liability", currency: "TWD", is_hidden: false, icon: '💳' },
            { id: "1103", name: "股票投資", type: "Asset", currency: "TWD", is_hidden: false, icon: '📈' }, 
            { id: "1201", name: "固定資產", type: "Asset", currency: "TWD", is_hidden: false, icon: '🖥️' },
            { id: "1201-DEP", name: "累計折舊", type: "Asset", currency: "TWD", is_contra: true, is_hidden: false, icon: '📉' },
            { id: "1104", name: "應收款項", type: "Asset", currency: "TWD", category: "系統", is_hidden: false, icon: '🧾' },
            { id: "3101", name: "期初權益", type: "Equity", currency: "TWD", is_hidden: false, icon: '⚖️' }, 
            { id: "4201", name: "處分資產損益", type: "Income", currency: "TWD", is_hidden: false, icon: '⚖️' },
            { id: "4202", name: "股利收入", type: "Income", currency: "TWD", is_hidden: false, icon: '💹' },
            { id: "5102", name: "折舊費用", type: "Expense", category: "系統", is_hidden: false, icon: '📉' }, 
            { id: "5103", name: "利息支出", type: "Expense", category: "系統", is_hidden: false, icon: '💸' }
        ];

        defaultCategories.Expense.forEach(cat => {
            cat.sub.forEach((sub, idx) => { defaultAccs.push({ id: `exp_${cat.category}_${idx}`, name: sub, type: 'Expense', category: cat.category, currency: 'TWD', is_hidden: false }); });
        });

        defaultCategories.Income.forEach(cat => {
            cat.sub.forEach((sub, idx) => { defaultAccs.push({ id: `inc_${cat.category}_${idx}`, name: sub, type: 'Income', category: cat.category, currency: 'TWD', is_hidden: false }); });
        });
        
        data.accounts = defaultAccs;
    }

    if(!data.accounts.find(a=>a && a.id==='4201')) data.accounts.push({ id: "4201", name: "處分資產損益", type: "Income", currency: "TWD", is_hidden: false, icon: '⚖️' });
    if(!data.accounts.find(a=>a && a.id==='4202')) data.accounts.push({ id: "4202", name: "股利收入", type: "Income", currency: "TWD", is_hidden: false, icon: '💹' });
    if(!data.accounts.find(a=>a && a.id==='5103')) data.accounts.push({ id: "5103", name: "利息支出", type: "Expense", category: "系統", is_hidden: false, icon: '💸' });
    if(!data.accounts.find(a=>a && a.id==='1104')) data.accounts.push({ id: "1104", name: "應收款項", type: "Asset", currency: "TWD", category: "系統", is_hidden: false, icon: '🧾' });
    
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

        // 自動補齊舊資料的 Emoji 屬性
        if (!acc.icon) {
            let matchedBrand = Object.keys(typeof BANK_BRAND_COLORS !== 'undefined' ? BANK_BRAND_COLORS : {}).find(brand => acc.name.includes(brand));
            if (matchedBrand) {
                acc.icon = BANK_BRAND_COLORS[matchedBrand].icon || '🏦';
            } else {
                acc.icon = typeof EMOJI_DICTIONARY !== 'undefined' ? (EMOJI_DICTIONARY[acc.name] || EMOJI_DICTIONARY[acc.category] || '🏷️') : '🏷️';
            }
        }
    }
};