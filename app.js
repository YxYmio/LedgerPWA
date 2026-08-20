const { createApp, ref, reactive, computed, onMounted, watch, nextTick, onErrorCaptured } = Vue;

// ------------------------------------------------------------------------
// 工具函式
// ------------------------------------------------------------------------
const b64EncodeUnicode = (str) => { try { return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, (match, p1) => String.fromCharCode('0x' + p1))); } catch(e){ return ""; } };
const b64DecodeUnicode = (str) => { try { return decodeURIComponent(Array.prototype.map.call(atob(str.replace(/\n/g, '')), c => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2)).join('')); } catch(e){ return "{}"; } };

const fetchWithTimeout = async (url, options = {}, timeout = 5000) => {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(id);
    return response;
};

const app = createApp({
  setup() {
    // ------------------------------------------------------------------------
    // 1. 全域 UI 狀態
    // ------------------------------------------------------------------------
    const isAppReady = ref(false);
    const activeTab = ref('dashboard');
    const isDrawerOpen = ref(false); 
    const entryMode = ref('expense'); 
    const dashboardScope = ref('all');
    const isUnlocked = ref(false);
    const pinInput = ref(''); 
    const pinError = ref('');
    const syncStatus = ref('offline'); 
    const isSyncing = ref(false);
    const showAmounts = ref(true);
    const expenseMonth = ref(new Date().toISOString().substring(0,7));
    const dashboardMonth = ref(new Date().toISOString().substring(0,7));
    const fxRate = ref(1);

    // ------------------------------------------------------------------------
    // 2. 報表與圖表狀態
    // ------------------------------------------------------------------------
    const reportView = ref('balance');
    const reportPeriod = ref('this_month'); 
    const reportStartDate = ref('');
    const reportEndDate = ref('');
    
    const expenseChartInstance = ref(null);
    const assetChartInstance = ref(null);
    const netWorthChartInstance = ref(null);
    const hasExpensesThisMonth = ref(false);

    // ------------------------------------------------------------------------
    // 3. 彈窗控制狀態 (Modals)
    // ------------------------------------------------------------------------
    const showAddAccountModal = ref(false); // 新增資產帳戶彈窗
    const showInitialStockModal = ref(false);
    const showAddFixedAssetModal = ref(false);
    const showDisposalModal = ref(false);
    const showAddLoanModal = ref(false);
    const showRateModal = ref(false);
    const showResetModal = ref(false);
    const showNewBookModal = ref(false);
    const showAddGoalModal = ref(false);
    const showUpdateGoalModal = ref(false);
    const showManualStockModal = ref(false);
    const showRefundModal = ref(false);

    // ------------------------------------------------------------------------
    // 4. 設定與全域資料模型 (Data Models)
    // ------------------------------------------------------------------------
    const settings = reactive({ 
        appName: '智慧帳本', 
        googleClientId: '', 
        googleToken: '', 
        fileId: '', 
        pinEnabled: false, 
        pinCode: '0000', 
        booksIndex: [{id: 'default', name: '日常帳本'}] 
    });
    
    const currentBookId = ref('default');
    const newBookName = ref('');

    const data = reactive({
      version: "6.3.0",
      currencyRates: { TWD: 1, USD: 32.5, JPY: 0.22 },
      budgets: {},
      recurring: [],
      quick_tags: [], 
      smart_tags: {}, 
      main_categories: { Expense: [], Income: [] },
      accounts: [], 
      transactions: [], 
      fixed_assets: [], 
      investments: [], 
      installments: [], 
      loans: [], 
      savings_goals: []
    });

    // ------------------------------------------------------------------------
    // 5. 表單綁定狀態 (Forms Data)
    // ------------------------------------------------------------------------
    const newTx = reactive({ 
      date: new Date().toISOString().split('T')[0], scope: 'personal', desc: '', amount: null, 
      mainCategory: '', subAccount: '', paymentAcc: '', fromAcc: '', toAcc: '', investAction: 'buy', 
      symbol: '', stockName: '', shares: null, price: null, fee: null, tax: null, 
      isInst: false, periods: 3, isFA: false, faName: '', faMonths: 60, loanId: '',
      isReimbursement: false, investDividendSymbol: '', manualSymbol: '', manualName: ''
    });
    
    const txError = ref('');
    const historyFilter = reactive({ keyword: '', scope: 'all', dateFrom: '', dateTo: '' });
    const settingCategoryMode = ref('Expense');
    const newPreset = ref(''); 
    const newMainCat = ref(''); 
    const newSubCat = reactive({ main: '', name: '' });
    
    const newAssetAcc = reactive({ name: '', initBalance: null, currency: 'TWD' });
    const initStock = reactive({ symbol: '', name: '', shares: null, cost: null });
    const initFA = reactive({ name: '', date: new Date().toISOString().split('T')[0], cost: null, months: 60 });
    const disposalAsset = ref(null);
    const disposalForm = reactive({ type: 'scrap', price: null, account: '' });
    const initLoan = reactive({ name: '', principal: null, rate: null, payment: null });
    const activeLoan = ref(null);
    const rateData = reactive({ rate: null });
    const newRecurring = reactive({ type: 'expense', desc: '', amount: null, day: 1, account: '' });
    const initGoal = reactive({ name: '', target: null, deadline: '' });
    const activeGoal = ref(null);
    const updateGoalData = reactive({ amount: null, type: 'add' });
    const activeRefundTx = ref(null);
    const refundData = reactive({ amount: 0, maxAmount: 0, account: '' });

    let tokenClient = null;

    // ------------------------------------------------------------------------
    // 6. 核心架構函式 (UI切換、重置、遷移)
    // ------------------------------------------------------------------------
    const changeTab = (tab) => {
       activeTab.value = tab;
       isDrawerOpen.value = false;
    };

    const resetData = () => {
       data.transactions = []; data.accounts = []; data.fixed_assets = []; data.investments = []; 
       data.installments = []; data.loans = []; data.savings_goals = []; data.recurring = []; 
       data.quick_tags = []; data.smart_tags = {}; data.main_categories = { Expense: [], Income: [] }; data.budgets = {}; 
    };

    const migrateLegacyData = () => {
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
        data.main_categories.Expense = ['飲食', '居住', '交通', '育樂', '個人/其他'];
        data.main_categories.Income = ['薪資', '獎金分紅', '副業/兼職', '投資股利/利息', '其他入帳'];
        data.quick_tags = ['早餐', '午餐', '晚餐', '飲料', '加油'];

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

        const expMap = {
            '飲食': ['早餐', '午餐', '晚餐', '飲料點心', '生鮮採買'],
            '居住': ['房租/房貸利息', '水電瓦斯', '居家日用', '網路管理費', '修繕清潔'],
            '交通': ['油錢', '大眾運輸', '停車費', '計程車', '汽機車保養維修'],
            '育樂': ['串流訂閱', '休閒娛樂', '旅遊住宿', '書籍課程'],
            '個人/其他': ['服飾治裝', '醫療健保', '公款代墊', '孝親紅包', '稅費手續費']
        };
        for(let cat in expMap) {
            expMap[cat].forEach((sub, idx) => { defaultAccs.push({ id: `exp_${cat}_${idx}`, name: sub, type: 'Expense', category: cat, currency: 'TWD', is_hidden: false }); });
        }

        const incMap = {
            '薪資': ['本薪'],
            '獎金分紅': ['年終獎金', '績效獎金'],
            '副業/兼職': ['兼職收入'],
            '投資股利/利息': ['銀行利息'],
            '其他入帳': ['其他收入']
        };
        for(let cat in incMap) {
            incMap[cat].forEach((sub, idx) => { defaultAccs.push({ id: `inc_${cat}_${idx}`, name: sub, type: 'Income', category: cat, currency: 'TWD', is_hidden: false }); });
        }
        data.accounts = defaultAccs;
      }

      if(!data.accounts.find(a=>a && a.id==='4201')) data.accounts.push({ id: "4201", name: "處分資產損益", type: "Income", currency: "TWD", is_hidden: false });
      if(!data.accounts.find(a=>a && a.id==='4202')) data.accounts.push({ id: "4202", name: "股利收入", type: "Income", currency: "TWD", is_hidden: false });
      if(!data.accounts.find(a=>a && a.id==='5103')) data.accounts.push({ id: "5103", name: "利息支出", type: "Expense", category: "系統", is_hidden: false });
      if(!data.accounts.find(a=>a && a.id==='1104')) data.accounts.push({ id: "1104", name: "應收款項", type: "Asset", currency: "TWD", category: "系統", is_hidden: false });
      
      if(!data.main_categories.Expense || data.main_categories.Expense.length===0) data.main_categories.Expense = ['飲食', '居住', '交通', '育樂', '個人/其他'];
      if(!data.main_categories.Income || data.main_categories.Income.length===0) data.main_categories.Income = ['薪資', '獎金分紅', '副業/兼職', '投資股利/利息', '其他入帳'];
      if(!data.quick_tags || data.quick_tags.length===0) data.quick_tags = ['早餐', '午餐', '晚餐', '飲料', '加油'];
      
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

    // ------------------------------------------------------------------------
    // 7. 計算屬性 (Computed Properties)
    // ------------------------------------------------------------------------
    const activeBookName = computed(() => { let b = settings.booksIndex.find(x => x && x.id === currentBookId.value); return b ? b.name : '智慧帳本'; });
    const availableBooks = computed(() => settings.booksIndex || []);

    const assetAccounts = computed(() => { let list = data.accounts || []; return list.filter(a => a && a.type === 'Asset' && !a.is_contra && a.id !== '1103' && a.id !== '1201' && a.id !== '1104' && !a.is_hidden); });
    const paymentAccounts = computed(() => { let list = data.accounts || []; return list.filter(a => a && ((a.type === 'Asset' && !a.is_contra && a.id !== '1103' && a.id !== '1201' && a.id !== '1104') || a.type === 'Liability') && !(a.id || '').startsWith('loan_liab_') && !a.is_hidden); });
    const liabilityAccounts = computed(() => { let list = data.accounts || []; return list.filter(a => a && a.type === 'Liability' && !(a.id || '').startsWith('loan_liab_') && !a.is_hidden); });
    
    const activeInstallments = computed(() => { let list = data.installments || []; return list.filter(i => i && i.paid_periods < i.periods); });
    const getSubAccounts = (type, mainCat, incHidden = false) => { let list = data.accounts || []; return list.filter(a => a && a.type === type && a.category === mainCat && (incHidden || !a.is_hidden)); };
    
    const safeQuickTags = computed(() => data.quick_tags || []);
    const safeInvestments = computed(() => data.investments || []);
    const safeFixedAssets = computed(() => { let list = data.fixed_assets || []; return list.filter(fa => fa && !fa.is_disposed); });
    const safeLoans = computed(() => data.loans || []);
    const safeRecurring = computed(() => data.recurring || []);
    const safeSavingsGoals = computed(() => data.savings_goals || []);

    const currentHoldings = computed(() => { return safeInvestments.value.filter(i => i && i.shares > 0); });
    const historicalHoldings = computed(() => {
      let currentSyms = currentHoldings.value.map(i => i ? i.symbol : '');
      let hist = [];
      safeInvestments.value.forEach(inv => {
         if (inv && inv.shares === 0 && !currentSyms.includes(inv.symbol)) hist.push({ symbol: inv.symbol, name: inv.name });
      });
      return hist;
    });

    const calculateBalance = (id) => {
      let bal = 0; let list = data.transactions || [];
      for(let i=0; i<list.length; i++) {
        let tx = list[i];
        if(tx && tx.debits) { for(let j=0; j<tx.debits.length; j++){ if (tx.debits[j] && tx.debits[j].account_id === id) bal += Number(tx.debits[j].amount)||0; } }
        if(tx && tx.credits) { for(let j=0; j<tx.credits.length; j++){ if (tx.credits[j] && tx.credits[j].account_id === id) bal -= Number(tx.credits[j].amount)||0; } }
      }
      let accList = data.accounts || [];
      let acc = accList.find(a => a && a.id === id);
      return (acc && (acc.type === 'Asset' || acc.type === 'Expense')) ? bal : -bal;
    };

    const getBaseBalance = (id, baseBalance) => {
      let accList = data.accounts || []; let acc = accList.find(a => a && a.id === id);
      if(!acc || !acc.currency || acc.currency === 'TWD') return baseBalance;
      let rate = data.currencyRates[acc.currency] || 1;
      return baseBalance * rate;
    };

    const accountsWithBalance = (accList) => { return accList.map(a => ({ id: a.id, name: a.name, type: a.type, category: a.category, currency: a.currency||'TWD', is_hidden: a.is_hidden, balance: calculateBalance(a.id), baseBalance: getBaseBalance(a.id, calculateBalance(a.id)) })); };
    
    const paymentAccountsWithBalance = computed(() => accountsWithBalance(paymentAccounts.value));
    const assetAccountsWithBalance = computed(() => accountsWithBalance(assetAccounts.value));
    const liquidAccountsWithBalance = computed(() => accountsWithBalance(assetAccounts.value)); 
    const liabilityAccountsWithBalance = computed(() => accountsWithBalance(liabilityAccounts.value)); 
    const balanceAccounts = computed(() => accountsWithBalance(paymentAccounts.value));

    const totalLiquidAssets = computed(() => {
      let sum = 0; let list = liquidAccountsWithBalance.value || [];
      for(let i=0; i<list.length; i++) { sum += (list[i].baseBalance || 0); }
      return sum;
    });

    const upcomingBillsTotal = computed(() => {
      let sum = 0;
      let cM = new Date().toISOString().substring(0,7);
      let liabList = liabilityAccountsWithBalance.value || [];
      for(let i=0; i<liabList.length; i++) { if(liabList[i].baseBalance < 0) sum += Math.abs(liabList[i].baseBalance); }
      let instList = activeInstallments.value || [];
      for(let i=0; i<instList.length; i++) { if(instList[i] && instList[i].next_month <= cM) sum += (Number(instList[i].amount_per_period)||0); }
      let loanList = safeLoans.value || [];
      for(let i=0; i<loanList.length; i++) { if(loanList[i]) sum += (Number(loanList[i].monthly_payment)||0); }
      let recList = safeRecurring.value || [];
      for(let i=0; i<recList.length; i++) { if(recList[i] && recList[i].type === 'expense') sum += (Number(recList[i].amount)||0); }
      return sum;
    });

    const cashflowWarning = computed(() => totalLiquidAssets.value < upcomingBillsTotal.value * 1.2);

    const totalAssets = computed(() => {
      let sum = 0; let accList = data.accounts || []; let invList = data.investments || [];
      for(let i=0; i<accList.length; i++) { if(accList[i] && accList[i].type === 'Asset') sum += getBaseBalance(accList[i].id, calculateBalance(accList[i].id)); }
      for(let i=0; i<invList.length; i++) { let inv = invList[i]; if(inv) { let rate = data.currencyRates[inv.currency||'TWD'] || 1; sum += ((Number(inv.shares)||0) * (Number(inv.last_price)||0) * rate) - (Number(inv.total_cost)||0); } }
      return sum;
    });

    const totalLiabilities = computed(() => {
      let sum = 0; let accList = data.accounts || [];
      for(let i=0; i<accList.length; i++){ if(accList[i] && accList[i].type === 'Liability') sum += getBaseBalance(accList[i].id, calculateBalance(accList[i].id)); }
      return sum;
    });

    const netWorth = computed(() => totalAssets.value - totalLiabilities.value);
    
    const sortedTransactions = computed(() => {
      let list = data.transactions || [];
      return list.slice().sort((a,b) => {
        let d1 = a && a.date ? new Date(a.date).getTime() : 0;
        let d2 = b && b.date ? new Date(b.date).getTime() : 0;
        return (isNaN(d2) ? 0 : d2) - (isNaN(d1) ? 0 : d1);
      });
    });
    
    const filteredTransactions = computed(() => {
      return sortedTransactions.value.filter(tx => {
        if(!tx) return false;
        let kw = (historyFilter.keyword || '').toLowerCase(), desc = (tx.description || tx.desc || '').toLowerCase(), accD = (getDebitAccName(tx) || '').toLowerCase(), accC = (getCreditAccName(tx) || '').toLowerCase();
        let matchKw = !kw || desc.includes(kw) || accD.includes(kw) || accC.includes(kw);
        let matchScope = historyFilter.scope === 'all' || tx.scope === historyFilter.scope;
        let txDate = tx.date || '';
        let matchDate = (!historyFilter.dateFrom || txDate >= historyFilter.dateFrom) && (!historyFilter.dateTo || txDate <= historyFilter.dateTo);
        return matchKw && matchScope && matchDate;
      });
    });

    const ytdDividend = computed(() => {
      let sum = 0; let y = new Date().getFullYear().toString(); let list = data.transactions || [];
      for(let i=0; i<list.length; i++) {
        let tx = list[i];
        if(tx && tx.date && tx.date.startsWith(y) && tx.credits && !tx.is_refunded && !tx.is_refund) {
           for(let j=0; j<tx.credits.length; j++) { if(tx.credits[j] && tx.credits[j].account_id === '4202') sum += Number(tx.credits[j].amount)||0; }
        }
      }
      return sum;
    });

    // ================= 預算管理 (Budget Logic) =================
    const dashboardBudgets = computed(() => {
      let res = {}; let expMonth = dashboardMonth.value || ''; let txList = data.transactions || [];
      let expObj = {};
      for(let i=0; i<txList.length; i++) {
        let tx = txList[i]; let txDate = tx && tx.date ? tx.date : '';
        if (tx && !tx.is_refunded && !tx.is_refund && txDate.length >= 7 && expMonth.length >= 7 && txDate.substring(0,7) === expMonth.substring(0,7)) {
          if (dashboardScope.value !== 'all' && tx.scope !== dashboardScope.value) continue;
          let dList = tx.debits || [];
          for(let j=0; j<dList.length; j++) {
            let a = (data.accounts || []).find(ac => ac && ac.id === dList[j].account_id);
            if(a && a.type === 'Expense') { let cat = a.category || '未分類'; let amt = Number(dList[j].amount) || 0; if(!expObj[cat]) expObj[cat] = 0; expObj[cat] += amt; }
          }
        }
      }
      let bList = data.budgets || {};
      for(let cat in bList) {
         let limit = Number(bList[cat]) || 0; if(limit <= 0) continue;
         let spent = expObj[cat] || 0;
         res[cat] = { limit: limit, spent: spent, pct: Math.round((spent/limit)*100) };
      }
      return res;
    });

    const budgetStats = computed(() => {
        let limit = 0, spent = 0;
        let list = dashboardBudgets.value; 
        for(let cat in list) { limit += list[cat].limit; spent += list[cat].spent; }
        let remaining = limit - spent;
        
        let d = new Date();
        let selectedDateStr = dashboardMonth.value || d.toISOString().substring(0,7);
        let p = selectedDateStr.split('-');
        let year = p.length >= 1 ? Number(p[0]) : d.getFullYear();
        let month = p.length >= 2 ? Number(p[1]) - 1 : d.getMonth();
        let daysInMonth = new Date(year, month + 1, 0).getDate();
        
        let currentDay = 1;
        let isCurrentMonth = (year === d.getFullYear() && month === d.getMonth());
        if (isCurrentMonth) { currentDay = d.getDate(); }
        else if (new Date(year, month, 1) < d) { currentDay = daysInMonth; }

        let daysLeft = daysInMonth - currentDay + 1; 
        if (daysLeft < 1) daysLeft = 1;
        let daily = remaining > 0 ? Math.floor(remaining / daysLeft) : 0;
        
        return { totalLimit: limit, totalSpent: spent, totalRemaining: remaining, dailyRemaining: daily, daysLeft };
    });

    // ================= 格式化與輔助檢索 =================
    const getAccName = (id) => { if(!id) return '未知'; let list = data.accounts || []; let acc = list.find(a => a && a.id === id); return acc ? acc.name : String(id); };
    const formatNumber = (num) => { let n = Number(num); return isNaN(n) ? '0' : Math.round(n).toLocaleString('en-US'); };

    const getTxDesc = (tx) => { return (tx && (tx.desc || tx.description)) ? (tx.desc || tx.description) : '無摘要'; };
    const getDebitAccName = (tx) => { return (tx && tx.debits && tx.debits[0]) ? getAccName(tx.debits[0].account_id) : '未知'; };
    const getCreditAccName = (tx) => { return (tx && tx.credits && tx.credits[0]) ? getAccName(tx.credits[0].account_id) : '未知'; };
    const getDebitAmount = (tx) => { return (tx && tx.debits && tx.debits[0]) ? (Number(tx.debits[0].amount)||0) : 0; };
    const getDebitAccType = (tx) => { if (tx && tx.debits && tx.debits[0]) { let acc = data.accounts.find(a => a && a.id === tx.debits[0].account_id); return acc ? acc.type : ''; } return ''; };
    
    const getInvestTotalAmount = () => {
      if (newTx.investAction === 'dividend') return Number(newTx.amount)||0;
      let base = (Number(newTx.shares)||0) * (Number(newTx.price)||0);
      if (newTx.investAction === 'buy') return base + (Number(newTx.fee)||0);
      return base - (Number(newTx.fee)||0) - (Number(newTx.tax)||0);
    };
    const getInvCurrentValue = (inv) => { if (!inv) return 0; let rate = data.currencyRates[inv.currency||'TWD'] || 1; return (Number(inv.shares)||0) * (Number(inv.last_price)||0) * rate; };
    const getUnrealizedGain = (inv) => { if (!inv) return 0; return getInvCurrentValue(inv) - (Number(inv.total_cost) || 0); };
    const getFAAccDep = (fa) => { return fa ? Math.abs(calculateBalance(fa.accumulated_dep_account_id)) : 0; };
    const getFABookValue = (fa) => { return fa ? (Number(fa.original_cost)||0) - getFAAccDep(fa) : 0; };

    const getAccumulatedInterest = (loanId) => {
      let sum = 0; let list = data.transactions || [];
      for(let i=0; i<list.length; i++) {
        let tx = list[i];
        if(tx && tx.loan_id === loanId && tx.debits && !tx.is_refunded && !tx.is_refund) {
          for(let j=0; j<tx.debits.length; j++) { if(tx.debits[j] && tx.debits[j].account_id === '5103') sum += (Number(tx.debits[j].amount) || 0); }
        }
      }
      return sum;
    };

    const loanRepayPreview = computed(() => {
      let list = data.loans || [];
      let loan = list.find(l => l && l.id === newTx.loanId);
      if(!loan || !newTx.amount) return { interest: 0, principal: 0, current_principal: 0 };
      let current_principal = Math.abs(calculateBalance(loan.liability_acc_id));
      let interest = Math.round(current_principal * ((loan.interest_rate || 0) / 100 / 12));
      let principal = (newTx.amount || 0) - interest;
      if(principal > current_principal) principal = current_principal;
      return { interest, principal, current_principal };
    });

    const getTxColorBand = (tx) => {
      let tD = null, tC = null; let list = data.accounts || [];
      if(tx && tx.debits && tx.debits[0]) { let acc = list.find(a => a && a.id === tx.debits[0].account_id); if(acc) tD = acc.type; }
      if(tx && tx.credits && tx.credits[0]) { let acc = list.find(a => a && a.id === tx.credits[0].account_id); if(acc) tC = acc.type; }
      let desc = (tx && (tx.desc || tx.description)) ? (tx.desc || tx.description) : '';
      if(tx && tx.is_refund) return 'bg-slate-400';
      if(tD === 'Expense') return 'bg-red-500';
      if(tC === 'Income') return 'bg-green-500';
      if(desc.includes('買進')||desc.includes('賣出')||desc.includes('配息')) return 'bg-orange-500';
      if(tx && tx.loan_id) return 'bg-rose-500';
      return 'bg-purple-500'; 
    };
    const getTxAmountColor = (tx) => {
      if (tx && tx.is_refunded) return 'text-slate-400 line-through';
      let tD = null; let list = data.accounts || [];
      if(tx && tx.debits && tx.debits[0]) { let acc = list.find(a => a && a.id === tx.debits[0].account_id); if(acc) tD = acc.type; }
      let desc = (tx && (tx.desc || tx.description)) ? (tx.desc || tx.description) : '';
      if(tD === 'Expense') return 'text-red-500';
      if(tD === 'Asset' && !desc.includes('轉帳')) return 'text-green-600 dark:text-green-400';
      return 'text-slate-700 dark:text-slate-300';
    };

    const applyQuickTag = (tag) => {
      let list = data.accounts || [];
      let acc = list.find(a => a && a.name === tag && (a.type === 'Expense' || a.type === 'Income'));
      if (acc) { 
        entryMode.value = acc.type.toLowerCase(); newTx.mainCategory = acc.category; newTx.subAccount = acc.id; newTx.desc = tag; newTx.isReimbursement = false;
        if(data.smart_tags && data.smart_tags[tag]) newTx.paymentAcc = data.smart_tags[tag];
      }
    };

    const onDividendSymbolChange = () => {
      if (newTx.investDividendSymbol === 'manual') {
         newTx.stockName = '';
      } else {
         let invList = data.investments || [];
         let inv = invList.find(i => i && i.symbol === newTx.investDividendSymbol);
         if (inv) newTx.stockName = inv.name;
      }
    };

    // ================= Financial Reports Logic =================
    watch(reportPeriod, (newVal) => {
       let d = new Date();
       if (newVal === 'this_month') {
           reportStartDate.value = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0];
           reportEndDate.value = new Date(d.getFullYear(), d.getMonth()+1, 0).toISOString().split('T')[0];
       } else if (newVal === 'this_quarter') {
           let q = Math.floor(d.getMonth() / 3);
           reportStartDate.value = new Date(d.getFullYear(), q * 3, 1).toISOString().split('T')[0];
           reportEndDate.value = new Date(d.getFullYear(), q * 3 + 3, 0).toISOString().split('T')[0];
       } else if (newVal === 'this_year') {
           reportStartDate.value = new Date(d.getFullYear(), 0, 1).toISOString().split('T')[0];
           reportEndDate.value = new Date(d.getFullYear(), 11, 31).toISOString().split('T')[0];
       }
    }, { immediate: true });

    const calcBalAsOf = (accId, dateStr) => {
       let b = 0; let txs = data.transactions || [];
       for(let i=0; i<txs.length; i++){
           let tx = txs[i];
           if (!tx || tx.date > dateStr || tx.is_refunded) continue;
           if (tx.debits) tx.debits.forEach(d => { if (d && d.account_id===accId) b += (Number(d.amount)||0); });
           if (tx.credits) tx.credits.forEach(c => { if (c && c.account_id===accId) b -= (Number(c.amount)||0); });
       }
       let a = (data.accounts || []).find(ac => ac && ac.id === accId);
       if (a && (a.type==='Asset' || a.type==='Expense')) return b;
       return -b;
    };

    const bsData = computed(() => {
       let ed = reportEndDate.value || '9999-12-31';
       let curAssts = [], nonCurAssts = [], liabs = [];
       let tAssets = 0, tLiab = 0, initEq = 0, retainedEarn = 0;
       
       (data.accounts || []).forEach(a => {
          if(!a) return;
          let bal = calcBalAsOf(a.id, ed);
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
       (data.investments||[]).forEach(i => { if(i) invBal += getInvCurrentValue(i); });
       if(invBal !== 0) { nonCurAssts.push({ name: '投資組合現值', amount: invBal }); tAssets += invBal; retainedEarn += invBal - calcBalAsOf('1103', ed); }
       
       let faNet = calcBalAsOf('1201', ed) - Math.abs(calcBalAsOf('1201-DEP', ed));
       if(faNet !== 0) { nonCurAssts.push({ name: '固定資產淨值', amount: faNet }); tAssets += faNet; }

       return { 
           currentAssetsList: curAssts, nonCurrentAssetsList: nonCurAssts, liabList: liabs, 
           currentAssets: curAssts.reduce((s,x)=>s+(x&&x.amount?x.amount:0),0), 
           nonCurrentAssets: nonCurAssts.reduce((s,x)=>s+(x&&x.amount?x.amount:0),0), 
           totalAssets: tAssets, totalLiab: tLiab, initialEquity: initEq, 
           retainedEarnings: retainedEarn, totalEquity: initEq + retainedEarn 
       };
    });

    const isData = computed(() => {
        let sd = reportStartDate.value || '0000-00-00';
        let ed = reportEndDate.value || '9999-12-31';
        let rev = {}, exp = {};
        let txs = data.transactions || [];
        txs.forEach(tx => {
            if (!tx || tx.date < sd || tx.date > ed || tx.is_refunded) return;
            (tx.credits||[]).forEach(c => {
               let a = data.accounts.find(ac=>ac && ac.id===c.account_id);
               if (a && a.type === 'Income') rev[a.name] = (rev[a.name]||0) + Number(c.amount);
               if (a && a.type === 'Expense') exp[a.name] = (exp[a.name]||0) - Number(c.amount);
            });
            (tx.debits||[]).forEach(d => {
               let a = data.accounts.find(ac=>ac && ac.id===d.account_id);
               if (a && a.type === 'Income') rev[a.name] = (rev[a.name]||0) - Number(d.amount);
               if (a && a.type === 'Expense') exp[a.name] = (exp[a.name]||0) + Number(d.amount);
            });
        });
        let totalRev = Object.values(rev).reduce((a,b)=>a+b,0);
        let totalExp = Object.values(exp).reduce((a,b)=>a+b,0);
        return { rev, exp, totalRev, totalExp, net: totalRev - totalExp };
    });

    const cfData = computed(() => {
        let sd = reportStartDate.value || '0000-00-00';
        let ed = reportEndDate.value || '9999-12-31';
        let op = 0, inv = 0, fin = 0;

        const isCashAcc = (id) => {
            let a = data.accounts.find(ac=>ac && ac.id===id);
            return a && a.type === 'Asset' && !a.is_contra && !['1103','1201','1104'].includes(a.id);
        };

        let startCash = 0, endCash = 0;
        let sdObj = new Date(sd); sdObj.setDate(sdObj.getDate() - 1);
        let prevD = sdObj.toISOString().split('T')[0];
        
        (data.accounts||[]).forEach(a => {
           if(a && isCashAcc(a.id)) {
              startCash += calcBalAsOf(a.id, prevD);
              endCash += calcBalAsOf(a.id, ed);
           }
        });

        let txs = data.transactions || [];
        txs.forEach(tx => {
            if (!tx || tx.date < sd || tx.date > ed || tx.is_refunded) return;
            
            let cashChange = 0;
            let nonCashTypes = new Set();
            
            (tx.debits||[]).forEach(d => {
                if (isCashAcc(d.account_id)) cashChange += Number(d.amount);
                else { let a = data.accounts.find(ac=>ac && ac.id===d.account_id); if (a) nonCashTypes.add(a.type + '|' + a.id); }
            });
            (tx.credits||[]).forEach(c => {
                if (isCashAcc(c.account_id)) cashChange -= Number(c.amount);
                else { let a = data.accounts.find(ac=>ac && ac.id===c.account_id); if (a) nonCashTypes.add(a.type + '|' + a.id); }
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
    });

    // ------------------------------------------------------------------------
    // 8. 核心操作 (Core Actions)
    // ------------------------------------------------------------------------
    const switchBook = () => {
      autoBackup(); 
      let targetId = currentBookId.value;
      const newBackup = localStorage.getItem('ledger_backup_' + targetId);
      
      resetData();

      if (newBackup) { 
         let parsed = JSON.parse(newBackup);
         Object.assign(data, parsed);
      } else { 
         data.version = "6.3.0"; 
      }
      
      migrateLegacyData();
      runAutoTasks();
      isDrawerOpen.value = false;
      if (['dashboard', 'reports', 'budget'].includes(activeTab.value)) updateCharts();
      alert(`已切換至: ${activeBookName.value}`);
    };

    const createNewBook = () => { showNewBookModal.value = true; };
    const submitNewBook = () => {
      if(!newBookName.value) return;
      let newId = 'book_' + Date.now();
      settings.booksIndex.push({ id: newId, name: newBookName.value });
      currentBookId.value = newId; newBookName.value = ''; showNewBookModal.value = false;
      saveSettings(); switchBook();
    };

    const submitNewAssetAccount = () => {
      if(!newAssetAcc.name) return;
      if(!data.accounts) data.accounts = [];
      if(!data.transactions) data.transactions = [];
      const newId = 'asset_' + Date.now();
      data.accounts.push({ id: newId, name: newAssetAcc.name, type: 'Asset', currency: newAssetAcc.currency, is_hidden: false });
      if(newAssetAcc.initBalance && newAssetAcc.initBalance > 0) {
        data.transactions.push({ id: 'tx_init_' + Date.now(), date: new Date().toISOString().split('T')[0], scope: 'personal', desc: `期初餘額: ${newAssetAcc.name}`, debits: [{ account_id: newId, amount: newAssetAcc.initBalance }], credits: [{ account_id: '3101', amount: newAssetAcc.initBalance }] });
      }
      newAssetAcc.name = ''; newAssetAcc.initBalance = null; newAssetAcc.currency = 'TWD';
      showAddAccountModal.value = false;
      autoBackup(); updateCharts(); refreshIcons(); alert('✅ 帳戶建立成功！');
    };

    const submitTransaction = () => {
      txError.value = '';
      let txObj = { id: 'tx_' + Date.now(), date: newTx.date, scope: newTx.scope, desc: newTx.desc || '無摘要', debits: [], credits: [] };
      
      if (entryMode.value === 'expense') {
        if (!newTx.paymentAcc || !newTx.amount) return txError.value = '請填寫完整金額與扣款帳戶';
        let debitAcc = newTx.isReimbursement ? '1104' : newTx.subAccount;
        if (!debitAcc) return txError.value = '請選擇分類或勾選代墊';
        
        if (!newTx.isReimbursement && newTx.desc) { if(!data.smart_tags) data.smart_tags = {}; data.smart_tags[newTx.desc] = newTx.paymentAcc; }
        
        if (newTx.isInst && newTx.periods > 1) {
          let perAmt = Math.round(newTx.amount / newTx.periods);
          let firstAmt = newTx.amount - (perAmt * (newTx.periods - 1));
          if(!data.installments) data.installments = [];
          let nextM = newTx.date && newTx.date.length >= 7 ? newTx.date.substring(0,7) : new Date().toISOString().substring(0,7);
          let nextD = newTx.date && newTx.date.length >= 10 ? newTx.date.substring(8,10) : '01';
          data.installments.push({ id: 'inst_'+Date.now(), desc: newTx.desc||'無摘要', total_amount: newTx.amount, periods: newTx.periods, amount_per_period: perAmt, first_amount: firstAmt, paid_periods: 0, next_month: nextM, date_day: nextD, debit_acc: debitAcc, credit_acc: newTx.paymentAcc, scope: newTx.scope });
          runAutoTasks(); newTx.amount = null; newTx.desc = ''; newTx.isInst = false; autoBackup(); updateCharts(); refreshIcons(); alert('✅ 分期建立成功！'); return;
        } else {
          txObj.debits.push({ account_id: debitAcc, amount: newTx.amount });
          txObj.credits.push({ account_id: newTx.paymentAcc, amount: newTx.amount });
        }
        if (!newTx.isReimbursement && newTx.isFA && newTx.faMonths > 0) {
           let monthlyDep = Math.round(newTx.amount / newTx.faMonths);
           if(!data.fixed_assets) data.fixed_assets = [];
           data.fixed_assets.push({ id: 'fa_'+Date.now(), name: newTx.faName||newTx.desc, purchase_date: newTx.date, original_cost: newTx.amount, monthly_depreciation: monthlyDep, asset_account_id: '1201', accumulated_dep_account_id: '1201-DEP', expense_account_id: '5102', last_depreciation_date: newTx.date, is_disposed: false });
           txObj.debits[0].account_id = '1201';
           txObj.desc = `購入固定資產: ${newTx.faName||newTx.desc}`;
           newTx.isFA = false; newTx.faMonths = 60; newTx.faName = '';
        }
      } else if (entryMode.value === 'income') {
        if (!newTx.subAccount || !newTx.paymentAcc || !newTx.amount) return txError.value = '欄位不完整';
        if(newTx.desc) { if(!data.smart_tags) data.smart_tags = {}; data.smart_tags[newTx.desc] = newTx.paymentAcc; }
        txObj.debits.push({ account_id: newTx.paymentAcc, amount: newTx.amount }); txObj.credits.push({ account_id: newTx.subAccount, amount: newTx.amount }); 
      } else if (entryMode.value === 'transfer') {
        if (!newTx.fromAcc || !newTx.toAcc || !newTx.amount) return txError.value = '欄位不完整';
        if (newTx.fromAcc === newTx.toAcc) return txError.value = '轉出入不可相同';
        txObj.debits.push({ account_id: newTx.toAcc, amount: newTx.amount });
        txObj.credits.push({ account_id: newTx.fromAcc, amount: newTx.amount });
        if(txObj.desc === '無摘要') txObj.desc = '轉帳';
      } else if (entryMode.value === 'invest') {
        if (newTx.investAction === 'dividend') {
           let finalName = newTx.investDividendSymbol === 'manual' ? newTx.manualName : newTx.stockName;
           if(!newTx.amount || !newTx.paymentAcc) return txError.value = '請確認配息標的、入帳帳戶與金額';
           txObj.debits.push({ account_id: newTx.paymentAcc, amount: newTx.amount });
           txObj.credits.push({ account_id: '4202', amount: newTx.amount });
           txObj.desc = finalName ? `領取配息: ${finalName}` : '領取股利/配息';
           if(newTx.desc) txObj.desc += ` (${newTx.desc})`;
        } else {
           if (!newTx.symbol || !newTx.shares || !newTx.price || !newTx.paymentAcc) return txError.value = '欄位不完整';
           let totalAmt = getInvestTotalAmount();
           let invList = data.investments || [];
           let inv = invList.find(i => i && i.symbol === newTx.symbol);
           if (newTx.investAction === 'buy') {
             txObj.debits.push({ account_id: '1103', amount: totalAmt });
             txObj.credits.push({ account_id: newTx.paymentAcc, amount: totalAmt });
             txObj.desc = `買進 ${newTx.stockName || newTx.symbol} ${newTx.shares}股`;
             if (inv) { inv.shares += newTx.shares; inv.total_cost += totalAmt; } 
             else { data.investments.push({ id: 'inv_'+Date.now(), symbol: newTx.symbol, name: newTx.stockName || newTx.symbol, shares: newTx.shares, total_cost: totalAmt, currency: 'TWD' }); }
           } else {
             if (!inv || inv.shares < newTx.shares) return txError.value = '賣出股數不可超過庫存';
             let costProp = inv.total_cost * (newTx.shares / inv.shares);
             let gain = totalAmt - costProp;
             txObj.desc = `賣出 ${newTx.stockName || newTx.symbol} ${newTx.shares}股`;
             txObj.debits.push({ account_id: newTx.paymentAcc, amount: totalAmt });
             txObj.credits.push({ account_id: '1103', amount: costProp });
             if (gain > 0) { txObj.credits.push({ account_id: '4201', amount: gain }); } 
             else if (gain < 0) { txObj.debits.push({ account_id: '4201', amount: Math.abs(gain) }); }
             inv.shares -= newTx.shares; inv.total_cost -= costProp;
           }
        }
      } else if (entryMode.value === 'loan_repay') {
        if (!newTx.loanId || !newTx.paymentAcc || !newTx.amount) return txError.value = '欄位不完整';
        let list = data.loans || []; let loan = list.find(l => l && l.id === newTx.loanId); if(!loan) return txError.value = '貸款資料錯誤';
        let preview = loanRepayPreview.value;
        txObj.loan_id = loan.id;
        txObj.desc = newTx.desc || `貸款還款: ${loan.name}`;
        txObj.debits.push({ account_id: loan.liability_acc_id, amount: preview.principal });
        txObj.debits.push({ account_id: '5103', amount: preview.interest });
        txObj.credits.push({ account_id: newTx.paymentAcc, amount: newTx.amount });
      }

      if(!data.transactions) data.transactions = [];
      data.transactions.push(txObj);
      
      newTx.amount = null; newTx.desc = ''; newTx.shares = null; newTx.price = null; newTx.fee = null; newTx.tax = null; newTx.loanId = ''; newTx.manualSymbol = ''; newTx.manualName = '';
      autoBackup(); updateCharts(); refreshIcons();
      alert('✅ 記帳成功！'); 
    };

    // ================= 退款機制 (部分退款) =================
    const openRefundModal = (tx) => {
      if (!tx) return;
      activeRefundTx.value = tx;
      const originalAmt = getDebitAmount(tx);
      const refundedAmt = Number(tx.refunded_amount) || 0;
      const maxRefund = originalAmt - refundedAmt;
      
      refundData.maxAmount = maxRefund;
      refundData.amount = maxRefund; 
      refundData.account = (tx.credits && tx.credits[0]) ? tx.credits[0].account_id : '';
      showRefundModal.value = true;
    };
    
    const closeRefundModal = () => {
      showRefundModal.value = false;
      activeRefundTx.value = null;
    };

    const submitRefund = () => {
      if (!activeRefundTx.value) return;
      if (refundData.amount <= 0 || refundData.amount > refundData.maxAmount) return alert("輸入金額無效或大於可退餘額");
      if (!refundData.account) return alert("請選擇退款入帳帳戶");
      
      let expAcc = (activeRefundTx.value.debits && activeRefundTx.value.debits[0]) ? activeRefundTx.value.debits[0].account_id : null;
      if(!expAcc) return alert("無法解析原始支出科目");

      let refundTx = {
        id: 'tx_refund_' + Date.now(),
        date: new Date().toISOString().split('T')[0],
        scope: activeRefundTx.value.scope,
        desc: `[退款沖銷] ${activeRefundTx.value.desc || activeRefundTx.value.description || ''}`,
        debits: [{ account_id: refundData.account, amount: refundData.amount }],
        credits: [{ account_id: expAcc, amount: refundData.amount }],
        is_refund: true,
        ref_tx_id: activeRefundTx.value.id
      };
      
      if(!data.transactions) data.transactions = [];
      data.transactions.push(refundTx);
      
      activeRefundTx.value.refunded_amount = (Number(activeRefundTx.value.refunded_amount) || 0) + refundData.amount;
      if (activeRefundTx.value.refunded_amount >= getDebitAmount(activeRefundTx.value)) {
         activeRefundTx.value.is_refunded = true;
      }
      
      closeRefundModal();
      autoBackup(); updateCharts(); alert('✅ 退款沖銷成功！');
    };

    const deleteTransaction = (id) => {
      if(!confirm('確定刪除？')) return;
      let list = data.transactions || []; let idx = list.findIndex(t => t && t.id === id); if (idx === -1) return;
      let tx = list[idx];
      if (tx && tx.auto_generated && tx.asset_id) { let falist = data.fixed_assets || []; let a = falist.find(fa => fa && fa.id === tx.asset_id); if(a) a.last_depreciation_date = null; }
      data.transactions.splice(idx, 1); autoBackup(); updateCharts();
    };

    const submitInitialStock = () => {
      if(!initStock.symbol || !initStock.shares || !initStock.cost) return alert("請填寫完整");
      if(!data.investments) data.investments = []; if(!data.transactions) data.transactions = [];
      data.investments.push({ id: 'inv_'+Date.now(), symbol: initStock.symbol, name: initStock.name || initStock.symbol, shares: initStock.shares, total_cost: initStock.cost, currency: 'TWD' });
      data.transactions.push({ id: 'tx_init_'+Date.now(), date: new Date().toISOString().split('T')[0], scope: 'personal', desc: `期初建倉 ${initStock.name || initStock.symbol}`, debits: [{ account_id: '1103', amount: initStock.cost }], credits: [{ account_id: '3101', amount: initStock.cost }] });
      showInitialStockModal.value = false; initStock.symbol = ''; initStock.name = ''; initStock.shares = null; initStock.cost = null; autoBackup(); updateCharts();
    };

    const submitFixedAsset = () => {
      if(!initFA.name || !initFA.cost || !initFA.months) return alert("請填寫完整");
      if(!data.fixed_assets) data.fixed_assets = []; if(!data.transactions) data.transactions = [];
      let monthlyDep = Math.round(initFA.cost / initFA.months);
      data.fixed_assets.push({ id: 'fa_'+Date.now(), name: initFA.name, purchase_date: initFA.date, original_cost: initFA.cost, monthly_depreciation: monthlyDep, asset_account_id: '1201', accumulated_dep_account_id: '1201-DEP', expense_account_id: '5102', last_depreciation_date: null, is_disposed: false });
      data.transactions.push({ id: 'tx_fa_'+Date.now(), date: initFA.date, scope: 'family', desc: `購入固定資產 ${initFA.name}`, debits: [{ account_id: '1201', amount: initFA.cost }], credits: [{ account_id: '3101', amount: initFA.cost }] });
      showAddFixedAssetModal.value = false; initFA.name = ''; initFA.cost = null; initFA.months = 60; autoBackup(); updateCharts(); alert('✅ 固定資產登錄成功！');
    };

    const openDisposalModal = (fa) => { disposalAsset.value = fa; disposalForm.type = 'scrap'; disposalForm.price = null; disposalForm.account = ''; showDisposalModal.value = true; };
    
    const submitDisposal = () => {
      if (disposalForm.type === 'sell' && (disposalForm.price === null || !disposalForm.account)) return alert("請填寫出售金額與入帳帳戶");
      let fa = disposalAsset.value; if(!fa) return;
      let bookValue = getFABookValue(fa); let accDep = getFAAccDep(fa);
      let txObj = { id: 'tx_disp_' + Date.now(), date: new Date().toISOString().split('T')[0], scope: 'family', desc: `處分資產: ${fa.name}`, debits: [{ account_id: '1201-DEP', amount: accDep }], credits: [{ account_id: '1201', amount: fa.original_cost }] };
      
      if (disposalForm.type === 'scrap') {
         if(bookValue > 0) txObj.debits.push({ account_id: '4201', amount: bookValue });
         txObj.desc = `報廢資產: ${fa.name}`;
      } else {
         txObj.debits.push({ account_id: disposalForm.account, amount: disposalForm.price });
         let gain = disposalForm.price - bookValue;
         if(gain > 0) txObj.credits.push({ account_id: '4201', amount: gain });
         else if (gain < 0) txObj.debits.push({ account_id: '4201', amount: Math.abs(gain) });
      }
      if(!data.transactions) data.transactions = [];
      data.transactions.push(txObj); fa.is_disposed = true; showDisposalModal.value = false; autoBackup(); updateCharts(); alert('✅ 處分完成！');
    };

    const submitAddLoan = () => {
      if(!initLoan.name || !initLoan.principal || !initLoan.rate || !initLoan.payment) return alert("請填妥所有貸款欄位");
      if(!data.loans) data.loans = []; if(!data.transactions) data.transactions = []; if(!data.accounts) data.accounts = [];
      let accId = 'loan_liab_' + Date.now();
      let loanId = 'loan_' + Date.now();
      data.accounts.push({ id: accId, name: initLoan.name, type: 'Liability', currency: 'TWD', is_hidden: false });
      data.loans.push({ id: loanId, name: initLoan.name, liability_acc_id: accId, interest_rate: initLoan.rate, monthly_payment: initLoan.payment });
      data.transactions.push({ id: 'tx_loan_init_'+Date.now(), date: new Date().toISOString().split('T')[0], scope: 'personal', desc: `期初貸款本金: ${initLoan.name}`, debits: [{ account_id: '3101', amount: initLoan.principal }], credits: [{ account_id: accId, amount: initLoan.principal }] });
      
      newTx.loanId = loanId;
      initLoan.name = ''; initLoan.principal = null; initLoan.rate = null; initLoan.payment = null;
      showAddLoanModal.value = false;
      autoBackup(); updateCharts(); alert('✅ 貸款建立成功！');
    };

    const openRateModal = (loan) => { activeLoan.value = loan; rateData.rate = loan.interest_rate; showRateModal.value = true; };
    const submitRateAdjust = () => { if(!rateData.rate) return alert("請輸入利率"); activeLoan.value.interest_rate = rateData.rate; showRateModal.value = false; autoBackup(); alert('✅ 利率修改成功！'); };

    const submitAddGoal = () => {
      if(!initGoal.name || !initGoal.target) return alert("請填寫目標名稱與金額");
      if(!data.savings_goals) data.savings_goals = [];
      data.savings_goals.push({ id: 'goal_' + Date.now(), name: initGoal.name, target: initGoal.target, deadline: initGoal.deadline, saved: 0 });
      showAddGoalModal.value = false; initGoal.name = ''; initGoal.target = null; initGoal.deadline = ''; autoBackup(); alert('✅ 目標建立成功！');
    };
    
    const openUpdateGoalModal = (goal) => { activeGoal.value = goal; updateGoalData.amount = null; updateGoalData.type = 'add'; showUpdateGoalModal.value = true; };
    const submitUpdateGoal = () => {
      if(!activeGoal.value || !updateGoalData.amount) return;
      if(updateGoalData.type === 'add') { activeGoal.value.saved += updateGoalData.amount; } else { activeGoal.value.saved = updateGoalData.amount; }
      if(activeGoal.value.saved < 0) activeGoal.value.saved = 0;
      showUpdateGoalModal.value = false; autoBackup(); alert('✅ 進度已更新！');
    };
    
    const deleteGoal = (id) => { if(!confirm("確定刪除此儲蓄目標？")) return; data.savings_goals = (data.savings_goals || []).filter(g => g && g.id !== id); autoBackup(); };

    const addRecurring = () => {
      if(!newRecurring.desc || !newRecurring.amount || !newRecurring.account) return alert("請填妥排程資訊");
      if(!data.recurring) data.recurring = [];
      data.recurring.push({ id: 'rec_'+Date.now(), type: newRecurring.type, desc: newRecurring.desc, amount: newRecurring.amount, day: newRecurring.day, account: newRecurring.account });
      newRecurring.desc = ''; newRecurring.amount = null; newRecurring.day = 1; autoBackup(); alert('✅ 排程建立成功！');
    };
    const deleteRecurring = (id) => { data.recurring = (data.recurring||[]).filter(r => r && r.id !== id); autoBackup(); };

    const addMainCategory = () => { let list = data.main_categories[settingCategoryMode.value] || []; if (newMainCat.value && !list.includes(newMainCat.value)) { data.main_categories[settingCategoryMode.value].push(newMainCat.value); newMainCat.value = ''; autoBackup(); } };
    const deleteMainCategory = (type, name) => { if(getSubAccounts(type, name, true).length > 0) return alert("請先清空子類別"); data.main_categories[type] = (data.main_categories[type] || []).filter(c => c !== name); autoBackup(); };
    const addSubCategory = () => { if (newSubCat.name && newSubCat.main) { if(!data.accounts) data.accounts = []; data.accounts.push({ id: 'acc_'+Date.now(), name: newSubCat.name, type: settingCategoryMode.value, category: newSubCat.main, currency: 'TWD', is_hidden: false }); newSubCat.name = ''; autoBackup(); refreshIcons(); } };
    const addPreset = () => { let list = data.quick_tags || []; if (newPreset.value && !list.includes(newPreset.value)) { data.quick_tags.push(newPreset.value); newPreset.value = ''; autoBackup(); } };
    const removePreset = (idx) => { if(data.quick_tags) data.quick_tags.splice(idx, 1); autoBackup(); };
    const toggleAccountVisibility = (id) => { let list = data.accounts || []; let a = list.find(a => a && a.id === id); if (a) { a.is_hidden = !a.is_hidden; autoBackup(); refreshIcons(); } };
    
    const deleteAccount = (id) => {
      let list = data.transactions || []; let isUsed = false;
      for(let i=0; i<list.length; i++){
        let tx = list[i];
        if(tx && tx.debits) { for(let j=0; j<tx.debits.length; j++){ if(tx.debits[j] && tx.debits[j].account_id === id) isUsed = true; } }
        if(tx && tx.credits) { for(let j=0; j<tx.credits.length; j++){ if(tx.credits[j] && tx.credits[j].account_id === id) isUsed = true; } }
      }
      if (isUsed) return alert("已有紀錄，請改用隱藏");
      if (confirm("確定刪除?")) { data.accounts = (data.accounts || []).filter(a => a && a.id !== id); autoBackup(); }
    };

    const runAutoTasks = () => {
      let curM = new Date().toISOString().substring(0,7);
      let today = new Date().getDate();
      
      let faList = data.fixed_assets || [];
      for(let i=0; i<faList.length; i++) {
        let fa = faList[i]; if(!fa || fa.is_disposed) continue;
        let ld = fa.last_depreciation_date || fa.purchase_date || '';
        if (ld && ld.length >= 7 && ld.substring(0,7) !== curM && ld.substring(0,7) < curM) {
          if(!data.transactions) data.transactions = [];
          let accDep = getFAAccDep(fa);
          if (accDep + fa.monthly_depreciation > fa.original_cost) continue; 
          data.transactions.push({ id: 'tx_dep_'+Date.now()+Math.random(), date: new Date().toISOString().split('T')[0], desc: `${fa.name} 自動折舊`, scope: 'family', auto_generated: true, asset_id: fa.id, debits: [{ account_id: fa.expense_account_id, amount: fa.monthly_depreciation }], credits: [{ account_id: fa.accumulated_dep_account_id, amount: fa.monthly_depreciation }] });
          fa.last_depreciation_date = new Date().toISOString().split('T')[0];
        }
      }
      
      let instList = data.installments || [];
      for(let i=0; i<instList.length; i++) {
        let inst = instList[i]; if(!inst || !inst.next_month || inst.next_month.length < 7) continue;
        while (inst.paid_periods < inst.periods && inst.next_month <= curM) {
          if(!data.transactions) data.transactions = [];
          let day = inst.date_day || '01';
          let amt = (inst.paid_periods === 0 && inst.first_amount) ? inst.first_amount : inst.amount_per_period;
          data.transactions.push({ id: 'tx_inst_'+Date.now()+Math.random(), date: `${inst.next_month}-${day}`, desc: `${inst.desc} (${inst.paid_periods+1}/${inst.periods}期)`, scope: inst.scope, auto_generated: true, inst_id: inst.id, debits: [{ account_id: inst.debit_acc, amount: amt }], credits: [{ account_id: inst.credit_acc, amount: amt }] });
          inst.paid_periods++;
          let parts = inst.next_month.split('-');
          if(parts.length >= 2) { let y = Number(parts[0]); let m = Number(parts[1]); m++; if(m > 12) { m = 1; y++; } let mm = m < 10 ? '0' + m : '' + m; inst.next_month = `${y}-${mm}`; }
        }
      }
      
      let recList = data.recurring || [];
      for(let i=0; i<recList.length; i++) {
        let rec = recList[i]; if(!rec || !rec.amount) continue;
        let lastExec = rec.last_exec_month || '';
        if (lastExec !== curM && today >= rec.day) {
           let txObj = { id: 'tx_rec_' + Date.now() + Math.random(), date: `${curM}-${String(rec.day).padStart(2,'0')}`, scope: 'personal', desc: `[定期] ${rec.desc}`, debits: [], credits: [], auto_generated: true };
           if (rec.type === 'expense') {
              let sub = (data.accounts || []).find(a => a && a.type === 'Expense' && a.name === rec.desc);
              txObj.debits.push({ account_id: sub ? sub.id : '5102', amount: rec.amount });
              txObj.credits.push({ account_id: rec.account, amount: rec.amount });
           } else {
              let sub = (data.accounts || []).find(a => a && a.type === 'Income' && a.name === rec.desc);
              txObj.debits.push({ account_id: rec.account, amount: rec.amount });
              txObj.credits.push({ account_id: sub ? sub.id : '4201', amount: rec.amount });
           }
           data.transactions.push(txObj);
           rec.last_exec_month = curM;
        }
      }
    };

    // ------------------------------------------------------------------------
    // 9. Google Drive 同步機制
    // ------------------------------------------------------------------------
    const autoBackup = () => { localStorage.setItem('ledger_backup_' + currentBookId.value, JSON.stringify(data)); if(settings.googleToken) syncWithGoogleDrive(false); };
    
    const initGoogleAuth = () => {
      if (!settings.googleClientId || typeof google === 'undefined') return;
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: settings.googleClientId, scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (res) => {
          if(res.error) return alert('授權失敗');
          settings.googleToken = res.access_token;
          saveSettings(); syncWithGoogleDrive(true);
        },
      });
      if(typeof gapi !== 'undefined') { gapi.load('client', () => { gapi.client.init({}).then(()=>{ gapi.client.setToken({access_token: settings.googleToken}); }); }); }
    };

    const handleGoogleAuth = () => { if(!settings.googleClientId) return alert("請先填寫 Client ID"); if(tokenClient) tokenClient.requestAccessToken({prompt: 'consent'}); };
    const handleGoogleSignout = () => { settings.googleToken = ''; settings.fileId = ''; saveSettings(); };

    const syncWithGoogleDrive = async (isManual = false) => {
      if(!settings.googleToken || typeof gapi === 'undefined' || !gapi.client) return;
      isSyncing.value = true;
      try {
        gapi.client.setToken({access_token: settings.googleToken});
        let fileId = settings.fileId;
        let currentFileName = `ledger_data_${currentBookId.value}.json`;
        if (!fileId) {
           let query = await gapi.client.request({ path: 'https://www.googleapis.com/drive/v3/files', method: 'GET', params: { q: `name='${currentFileName}' and trashed=false` }});
           if(query.result.files && query.result.files.length > 0) fileId = query.result.files[0].id;
        }
        if (fileId) {
           settings.fileId = fileId; saveSettings();
           if(isManual) { 
              let fileRes = await gapi.client.request({ path: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, method: 'GET' });
              if(fileRes.result) { 
                resetData();
                Object.assign(data, fileRes.result); 
                migrateLegacyData(); runAutoTasks(); updateCharts(); 
                if(isManual) alert('雲端資料已同步還原'); 
              }
           } else { 
              let content = JSON.stringify(data);
              await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${settings.googleToken}`, 'Content-Type': 'application/json' }, body: content });
           }
           syncStatus.value = 'ok';
        } else {
           let metadata = { name: currentFileName, mimeType: 'application/json' };
           let form = new FormData();
           form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
           form.append('file', new Blob([JSON.stringify(data)], { type: 'application/json' }));
           let res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: { 'Authorization': `Bearer ${settings.googleToken}` }, body: form });
           let result = await res.json();
           settings.fileId = result.id; saveSettings(); syncStatus.value = 'ok'; if(isManual) alert('雲端備份已建立');
        }
      } catch (e) {
        syncStatus.value = 'error'; console.error("GDrive Sync Error", e);
        if(e.status === 401) { settings.googleToken = ''; saveSettings(); if(isManual) alert("權限過期，請重新登入"); }
      } finally { isSyncing.value = false; }
    };

    const executeFactoryReset = async () => {
      resetData();
      migrateLegacyData();
      if (settings.googleToken && settings.fileId && typeof gapi !== 'undefined') {
         try {
            let content = JSON.stringify(data);
            await fetch(`https://www.googleapis.com/upload/drive/v3/files/${settings.fileId}?uploadType=media`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${settings.googleToken}`, 'Content-Type': 'application/json' }, body: content });
         } catch(e) { console.error("GDrive Reset Failed", e); }
      }
      localStorage.removeItem('ledger_backup_' + currentBookId.value);
      window.location.reload(true);
    };

    // ------------------------------------------------------------------------
    // 10. 報價與匯率 API
    // ------------------------------------------------------------------------
    const updateStockPrices = async () => {
      try {
        const res = await fetchWithTimeout('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', {}, 5000);
        if (!res.ok) throw new Error('API Error');
        const twseData = await res.json();
        let invList = data.investments || [];
        for(let i=0; i<invList.length; i++) {
          let inv = invList[i];
          if(inv && inv.currency !== 'USD') {
            let s = twseData.find(st => st && st.Code === (inv.symbol || '').replace('.TW',''));
            if (s) inv.last_price = parseFloat(s.ClosingPrice);
          }
        }
        alert('股價自動更新完成！'); autoBackup(); updateCharts();
      } catch (e) { 
        console.error("Stock API Error:", e);
        alert('無法連線證交所或連線逾時。請手動輸入最新報價！');
        showManualStockModal.value = true;
      }
    };

    const submitManualStockUpdate = () => {
        showManualStockModal.value = false;
        autoBackup(); updateCharts(); alert('✅ 手動股價更新完成');
    };

    const setHistoryToCurrentMonth = () => {
      const now = new Date(); const y = now.getFullYear(); const m = now.getMonth() + 1; const mStr = m < 10 ? '0' + m : '' + m; const d = new Date(y, m, 0).getDate();
      historyFilter.dateFrom = `${y}-${mStr}-01`; historyFilter.dateTo = `${y}-${mStr}-${d}`;
    };

    const fetchExchangeRate = async () => { 
        try { 
            const res = await fetchWithTimeout('https://api.exchangerate-api.com/v4/latest/USD', {}, 3000); 
            const fx = await res.json(); 
            if(fx && fx.rates && fx.rates.TWD) fxRate.value = fx.rates.TWD; 
        } catch(e) {} 
    };
    
    // ------------------------------------------------------------------------
    // 11. 初始化與生命週期 (Lifecycle)
    // ------------------------------------------------------------------------
    const loadSettings = () => { 
      try { const s = JSON.parse(localStorage.getItem('ledger_settings') || '{}'); if(s && typeof s === 'object') Object.assign(settings, s); } catch(e) {} 
      if(!settings.appName) settings.appName = '智慧帳本'; 
      if(!settings.booksIndex || settings.booksIndex.length === 0) settings.booksIndex = [{id: 'default', name: '日常帳本'}];
      if(!settings.pinEnabled) isUnlocked.value = true; 
    };
    
    const unlockApp = () => { if (pinInput.value === settings.pinCode) { isUnlocked.value = true; initData(); } else { pinError.value = "PIN錯誤"; } };
    const saveSettings = () => { localStorage.setItem('ledger_settings', JSON.stringify(settings)); alert('設定已儲存'); if (settings.googleToken && settings.googleClientId) initGoogleAuth(); };
    const exportData = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'})); a.download = `Ledger_${currentBookId.value}_${new Date().toISOString().split('T')[0]}.json`; a.click(); };
    const importData = (e) => { const f = e.target.files[0]; if(!f) return; const r = new FileReader(); r.onload = (ev) => { try { const p = JSON.parse(ev.target.result); if (p && typeof p === 'object') { resetData(); Object.assign(data, p); migrateLegacyData(); autoBackup(); updateCharts(); alert("成功覆蓋匯入"); } } catch(err) { alert("檔案錯誤"); } }; r.readAsText(f); };

    const updateCharts = () => {
      if (activeTab.value !== 'dashboard' && activeTab.value !== 'budget') return;
      nextTick(() => {
        try {
          const canvas1 = document.getElementById('expenseChart');
          if (canvas1) {
            const ctx1 = canvas1.getContext('2d');
            const expMonth = dashboardMonth.value || ''; const exp = {}; let tot = 0;
            let txList = data.transactions || [];
            for(let i=0; i<txList.length; i++) {
              let tx = txList[i]; let txDate = tx && tx.date ? tx.date : '';
              if (tx && !tx.is_refunded && !tx.is_refund && txDate.length >= 7 && expMonth.length >= 7 && txDate.substring(0,7) === expMonth.substring(0,7)) {
                if (dashboardScope.value !== 'all' && tx.scope !== dashboardScope.value) continue;
                let dList = tx.debits || [];
                for(let j=0; j<dList.length; j++) {
                  let d = dList[j]; let accList = data.accounts || []; let a = accList.find(ac => ac && ac.id === d.account_id);
                  if(a && a.type === 'Expense') { let cat = a.category || '未分類'; let amt = Number(d.amount) || 0; if(!exp[cat]) exp[cat] = 0; exp[cat] += amt; tot += amt; }
                }
              }
            }
            hasExpensesThisMonth.value = tot > 0;
            if (hasExpensesThisMonth.value) {
              if (expenseChartInstance.value) expenseChartInstance.value.destroy();
              let labels = []; let values = []; for(let key in exp) { labels.push(key); values.push(exp[key]); }
              expenseChartInstance.value = new Chart(ctx1, { type: 'doughnut', data: { labels: labels, datasets: [{ data: values, backgroundColor: ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: {color: '#94a3b8'} } } } });
            } else if (expenseChartInstance.value) {
              expenseChartInstance.value.destroy(); expenseChartInstance.value = null;
            }
          }

          const canvas2 = document.getElementById('assetChart');
          if (canvas2) {
            const ctx2 = canvas2.getContext('2d');
            if (totalAssets.value <= 0) {
              if (assetChartInstance.value) { assetChartInstance.value.destroy(); assetChartInstance.value = null; }
            } else {
              let cTot=0, sTot=0;
              let accList = data.accounts || [];
              for(let i=0; i<accList.length; i++){ let a = accList[i]; if(a && a.type==='Asset' && !a.is_contra && a.id!=='1103' && a.id!=='1201' && a.id!=='1104') cTot += getBaseBalance(a.id, calculateBalance(a.id)); }
              let invList = data.investments || [];
              for(let i=0; i<invList.length; i++){ let inv = invList[i]; sTot += getInvCurrentValue(inv); }
              let fTot = calculateBalance('1201') + calculateBalance('1201-DEP');
              
              if (assetChartInstance.value) assetChartInstance.value.destroy();
              assetChartInstance.value = new Chart(ctx2, { type: 'pie', data: { labels: ['流動資金總額', '股票現值', '固定資產'], datasets: [{ data: [Math.max(0,cTot), sTot, Math.max(0,fTot)], backgroundColor: ['#3b82f6', '#8b5cf6', '#14b8a6'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'right', labels: {color: '#94a3b8'} } } } });
            }
          }

          const canvas3 = document.getElementById('netWorthChart');
          if(canvas3) {
             const ctx3 = canvas3.getContext('2d');
             let histLabels = []; let histData = [];
             let d = new Date();
             for(let i=5; i>=0; i--) {
                let tempDate = new Date(d.getFullYear(), d.getMonth() - i, 1);
                let mStr = tempDate.getFullYear() + '-' + String(tempDate.getMonth()+1).padStart(2,'0');
                histLabels.push(mStr);
                let endOfMonth = mStr + '-31'; 
                let aSum=0, lSum=0;
                for(let k=0; k<data.accounts.length; k++){
                   let a = data.accounts[k]; if(!a) continue;
                   let bal=0;
                   for(let t=0; t<data.transactions.length; t++){
                      let tx = data.transactions[t]; if(!tx || tx.date > endOfMonth) continue;
                      if(tx.debits) tx.debits.forEach(db=>{if(db && db.account_id===a.id) bal+=Number(db.amount)||0;});
                      if(tx.credits) tx.credits.forEach(cr=>{if(cr && cr.account_id===a.id) bal-=Number(cr.amount)||0;});
                   }
                   if(a.type==='Asset') aSum += (a.type==='Expense'||a.type==='Asset'? bal : -bal);
                   else if(a.type==='Liability') lSum += (a.type==='Expense'||a.type==='Asset'? bal : -bal);
                }
                histData.push(aSum - lSum);
             }
             if(netWorthChartInstance.value) netWorthChartInstance.value.destroy();
             netWorthChartInstance.value = new Chart(ctx3, { type: 'line', data: { labels: histLabels, datasets: [{ label: '淨資產', data: histData, borderColor: '#6366f1', backgroundColor: 'rgba(99,102,241,0.2)', fill: true, tension: 0.4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { ticks: { color: '#94a3b8' } }, x: { ticks: { color: '#94a3b8' } } } } });
          }

        } catch (err) { console.error("Chart Render Error:", err); }
      });
    };

    const refreshIcons = () => { nextTick(() => { try { if (window.lucide) lucide.createIcons(); } catch(e){} }); };

    watch(activeTab, () => {
      if(['dashboard', 'reports', 'budget'].includes(activeTab.value)) updateCharts();
      refreshIcons();
    });
    watch(dashboardScope, () => updateCharts());

    const initData = async () => {
      try {
        const backup = localStorage.getItem('ledger_backup_' + currentBookId.value);
        if (backup) { const p = JSON.parse(backup); if(p && typeof p === 'object') Object.assign(data, p); }
      } catch(e) {}
      
      migrateLegacyData();
      setHistoryToCurrentMonth();
      await fetchExchangeRate();
      
      isAppReady.value = true;
      let loadingScreen = document.getElementById('native-loading');
      if(loadingScreen) loadingScreen.style.display = 'none';

      if(window.google) initGoogleAuth(); else setTimeout(initGoogleAuth, 2000);
      
      runAutoTasks();
      if (['dashboard', 'reports', 'budget'].includes(activeTab.value)) updateCharts();
      refreshIcons();
    };

    onMounted(() => {
      loadSettings();
      if(isUnlocked.value) { initData(); } 
      else {
        isAppReady.value = true;
        let loadingScreen = document.getElementById('native-loading');
        if(loadingScreen) loadingScreen.style.display = 'none';
        refreshIcons();
      }
    });

    const expenseCategories = computed(() => (data.main_categories && data.main_categories.Expense) ? data.main_categories.Expense : []);
    const incomeCategories = computed(() => (data.main_categories && data.main_categories.Income) ? data.main_categories.Income : []);
    const currentSettingCategories = computed(() => (data.main_categories && data.main_categories[settingCategoryMode.value]) ? data.main_categories[settingCategoryMode.value] : []);

    return { 
      isAppReady, activeTab, isDrawerOpen, entryMode, dashboardScope, isUnlocked, pinInput, pinError, 
      syncStatus, isSyncing, showAmounts, expenseMonth, dashboardMonth, fxRate,
      reportView, reportPeriod, reportStartDate, reportEndDate,
      showAddAccountModal, showInitialStockModal, showAddFixedAssetModal, showDisposalModal, showAddLoanModal, showRateModal, 
      showResetModal, showNewBookModal, showAddGoalModal, showUpdateGoalModal, showManualStockModal, showRefundModal,
      activeRefundTx, refundData, hasExpensesThisMonth, settings, currentBookId, newBookName, data, newTx, txError, 
      historyFilter, settingCategoryMode, newPreset, newMainCat, newSubCat, newAssetAcc, initStock, initFA, 
      disposalAsset, disposalForm, initLoan, activeLoan, rateData, newRecurring, initGoal, activeGoal, updateGoalData,
      changeTab, unlockApp, saveSettings, exportData, importData,
      activeBookName, availableBooks, assetAccounts, paymentAccounts, liabilityAccounts, activeInstallments, 
      getSubAccounts, safeQuickTags, safeInvestments, safeFixedAssets, safeLoans, safeRecurring, safeSavingsGoals,
      currentHoldings, historicalHoldings, calculateBalance, getBaseBalance, accountsWithBalance, 
      paymentAccountsWithBalance, assetAccountsWithBalance, liquidAccountsWithBalance, liabilityAccountsWithBalance, 
      balanceAccounts, totalLiquidAssets, upcomingBillsTotal, cashflowWarning, totalAssets, totalLiabilities, netWorth,
      sortedTransactions, filteredTransactions, ytdDividend, dashboardBudgets, budgetStats, getAccName, formatNumber,
      getTxDesc, getDebitAccName, getCreditAccName, getDebitAmount, getDebitAccType, getInvestTotalAmount, 
      getInvCurrentValue, getUnrealizedGain, getFAAccDep, getFABookValue, getAccumulatedInterest, loanRepayPreview, 
      getTxColorBand, getTxAmountColor, applyQuickTag, onDividendSymbolChange, calcBalAsOf, bsData, isData, cfData,
      switchBook, createNewBook, submitNewBook, submitNewAssetAccount, submitTransaction, openRefundModal, closeRefundModal, submitRefund,
      deleteTransaction, submitInitialStock, submitFixedAsset, openDisposalModal, submitDisposal, submitAddLoan, 
      openRateModal, submitRateAdjust, submitAddGoal, openUpdateGoalModal, submitUpdateGoal, deleteGoal, addRecurring, 
      deleteRecurring, addMainCategory, deleteMainCategory, addSubCategory, addPreset, removePreset, toggleAccountVisibility, 
      deleteAccount, runAutoTasks, autoBackup, initGoogleAuth, handleGoogleAuth, handleGoogleSignout, syncWithGoogleDrive, 
      executeFactoryReset, updateStockPrices, submitManualStockUpdate, setHistoryToCurrentMonth, fetchExchangeRate, 
      loadSettings, updateCharts, refreshIcons, initData, expenseCategories, incomeCategories, currentSettingCategories
    };
  }
});

// 全域錯誤捕捉機制
app.config.errorHandler = function(err, vm, info) {
  console.error("Vue Global Error:", err, info);
  var loading = document.getElementById('native-loading');
  var errorScreen = document.getElementById('fallback-error');
  var errorMsg = document.getElementById('fallback-error-msg');
  if(loading) loading.style.display = 'none';
  if(errorScreen) errorScreen.style.display = 'flex';
  if(errorMsg) errorMsg.innerText = err.message + '\n(' + info + ')';
};

app.mount('#app');