const { createApp, ref, reactive, computed, onMounted, watch, nextTick } = Vue;

const app = createApp({
  setup() {
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
    const dashboardMonth = ref(new Date().toISOString().substring(0,7));
    const fxRate = ref(1);

    const reportView = ref('balance');
    const reportPeriod = ref('this_month'); 
    const reportStartDate = ref('');
    const reportEndDate = ref('');
    
    const expenseChartInstance = ref(null);
    const assetChartInstance = ref(null);
    const netWorthChartInstance = ref(null);
    const hasExpensesThisMonth = ref(false);

    const showAddAccountModal = ref(false);
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
    const showReimburseModal = ref(false);

    const settings = reactive({ 
        appName: '智慧帳本', 
        googleClientId: '', 
        googleToken: '', 
        fileId: '', 
        pinEnabled: false, 
        pinCode: '0000', 
        currentBookId: 'default',
        booksIndex: [{id: 'default', name: '日常帳本'}] 
    });
    
    const currentBookId = ref('default');
    const newBookName = ref('');

    const data = reactive({
      version: "6.3.0",
      currencyRates: { TWD: 1, USD: 32.5, JPY: 0.22 },
      budgets: {}, recurring: [], quick_tags: [], smart_tags: {}, 
      main_categories: { Expense: [], Income: [] }, accounts: [], 
      transactions: [], fixed_assets: [], investments: [], installments: [], 
      loans: [], savings_goals: []
    });

    const newTx = reactive({ 
      date: new Date().toISOString().split('T')[0], scope: 'personal', desc: '', amount: null, 
      mainCategory: '', subAccount: '', paymentAcc: '', fromAcc: '', toAcc: '', investAction: 'buy', 
      symbol: '', stockName: '', shares: null, price: null, fee: null, tax: null, 
      isInst: false, periods: 3, isFA: false, faName: '', faMonths: 60, loanId: '',
      isReimbursement: false, investDividendSymbol: '', manualSymbol: '', manualName: ''
    });
    
    const initStock = reactive({ symbol: '', name: '', shares: null, cost: null });
    const newAssetAcc = reactive({ name: '', type: 'Asset', initBalance: null, currency: 'TWD' });
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
    const activeReimburseTx = ref(null);
    const reimburseData = reactive({ account: '' });

    const txError = ref('');
    const historyFilter = reactive({ keyword: '', scope: 'all', dateFrom: '', dateTo: '' });
    const settingCategoryMode = ref('Expense');
    const newPreset = ref(''); 
    const newMainCat = ref(''); 
    const newSubCat = reactive({ main: '', name: '' });

    let tokenClient = null;

    const onSymbolInput = (target) => {
        let val = target === 'tx' ? newTx.symbol : initStock.symbol;
        if (!val) return;
        let symbol = val.replace('.TW', '').toUpperCase();
        let matchName = '';
        if (STOCK_DICTIONARY[symbol]) {
            matchName = STOCK_DICTIONARY[symbol];
        } else {
            let existing = (data.investments || []).find(i => i && i.symbol && i.symbol.replace('.TW', '').toUpperCase() === symbol);
            if (existing) matchName = (existing.name || '').replace(/^\[.*?\]\s*/, '');
        }
        if (matchName) {
            if (target === 'tx') newTx.stockName = matchName;
            if (target === 'init') initStock.name = matchName;
        }
    };

    const changeTab = (tab) => { activeTab.value = tab; isDrawerOpen.value = false; };
    const filterByAccount = (acc) => {
       if (!acc) return;
       historyFilter.keyword = acc.name || ''; historyFilter.dateFrom = ''; historyFilter.dateTo = ''; historyFilter.scope = 'all'; activeTab.value = 'history';
    };

    const resetData = () => {
       data.transactions = []; data.accounts = []; data.fixed_assets = []; data.investments = []; 
       data.installments = []; data.loans = []; data.savings_goals = []; data.recurring = []; 
       data.quick_tags = []; data.smart_tags = {}; data.main_categories = { Expense: [], Income: [] }; data.budgets = {}; 
    };

    const activeBookName = computed(() => { let b = settings.booksIndex.find(x => x && x.id === currentBookId.value); return b ? b.name : '智慧帳本'; });
    const availableBooks = computed(() => settings.booksIndex || []);

    const assetAccounts = computed(() => { return (data.accounts || []).filter(a => a && a.type === 'Asset' && !a.is_contra && a.id !== '1103' && a.id !== '1201' && a.id !== '1104' && !a.is_hidden); });
    const paymentAccounts = computed(() => { return (data.accounts || []).filter(a => a && ((a.type === 'Asset' && !a.is_contra && a.id !== '1103' && a.id !== '1201' && a.id !== '1104') || a.type === 'Liability') && !(a.id || '').startsWith('loan_liab_') && !a.is_hidden); });
    const liabilityAccounts = computed(() => { return (data.accounts || []).filter(a => a && a.type === 'Liability' && !(a.id || '').startsWith('loan_liab_') && !a.is_hidden); });
    
    const activeInstallments = computed(() => (data.installments || []).filter(i => i && i.paid_periods < i.periods));
    const getSubAccounts = (type, mainCat, incHidden = false) => (data.accounts || []).filter(a => a && a.type === type && a.category === mainCat && (incHidden || !a.is_hidden));
    
    const safeQuickTags = computed(() => data.quick_tags || []);
    const safeInvestments = computed(() => data.investments || []);
    const safeFixedAssets = computed(() => (data.fixed_assets || []).filter(fa => fa && !fa.is_disposed));
    const safeLoans = computed(() => data.loans || []);
    const safeRecurring = computed(() => data.recurring || []);
    const safeSavingsGoals = computed(() => data.savings_goals || []);

    const currentHoldings = computed(() => safeInvestments.value.filter(i => i && i.shares > 0).map(i => ({ symbol: i.symbol, name: `[${i.symbol}] ${(i.name || '').replace(/^\[.*?\]\s*/, '')}` }))); 
    const historicalHoldings = computed(() => {
      let currentSyms = currentHoldings.value.map(i => i ? i.symbol : '');
      let hist = [];
      safeInvestments.value.forEach(inv => {
         if (inv && inv.shares === 0 && !currentSyms.includes(inv.symbol)) hist.push({ symbol: inv.symbol, name: `[${inv.symbol}] ${(inv.name || '').replace(/^\[.*?\]\s*/, '')}` });
      });
      return hist;
    });

    const calculateBalance = (id, scope = 'all') => {
      let bal = 0;
      (data.transactions || []).forEach(tx => {
        if(!tx) return;
        if (scope !== 'all' && tx.scope !== scope) return;
        if(tx.debits) tx.debits.forEach(d => { if (d && d.account_id === id) bal += Number(d.amount)||0; });
        if(tx.credits) tx.credits.forEach(c => { if (c && c.account_id === id) bal -= Number(c.amount)||0; });
      });
      let acc = (data.accounts || []).find(a => a && a.id === id);
      return (acc && (acc.type === 'Asset' || acc.type === 'Expense')) ? bal : -bal;
    };

    const getBaseBalance = (id, baseBalance) => {
      let acc = (data.accounts || []).find(a => a && a.id === id);
      if(!acc || !acc.currency || acc.currency === 'TWD') return baseBalance;
      return baseBalance * (data.currencyRates[acc.currency] || 1);
    };

    const accountsWithBalance = (accList) => { 
        return accList.map(a => ({ 
            id: a.id, name: a.name, type: a.type, category: a.category, currency: a.currency||'TWD', is_hidden: a.is_hidden, 
            balance: calculateBalance(a.id, 'all'), 
            baseBalance: getBaseBalance(a.id, calculateBalance(a.id, 'all')) 
        })); 
    };
    
    const paymentAccountsWithBalance = computed(() => accountsWithBalance(paymentAccounts.value));
    const assetAccountsWithBalance = computed(() => accountsWithBalance(assetAccounts.value));
    const liquidAccountsWithBalance = computed(() => accountsWithBalance(assetAccounts.value)); 
    const liabilityAccountsWithBalance = computed(() => accountsWithBalance(liabilityAccounts.value)); 
    const balanceAccounts = computed(() => accountsWithBalance(paymentAccounts.value));

    const totalLiquidAssets = computed(() => liquidAccountsWithBalance.value.reduce((s, acc) => s + (acc.baseBalance || 0), 0));

    const upcomingBillsTotal = computed(() => {
      let sum = 0; let cM = new Date().toISOString().substring(0,7);
      liabilityAccountsWithBalance.value.forEach(acc => { if(acc.baseBalance < 0) sum += Math.abs(acc.baseBalance); });
      activeInstallments.value.forEach(inst => { if(inst && inst.next_month <= cM) sum += (Number(inst.amount_per_period)||0); });
      safeLoans.value.forEach(loan => { if(loan) sum += (Number(loan.monthly_payment)||0); });
      safeRecurring.value.forEach(rec => { if(rec && rec.type === 'expense') sum += (Number(rec.amount)||0); });
      return sum;
    });

    const cashflowWarning = computed(() => totalLiquidAssets.value < upcomingBillsTotal.value * 1.2);

    const totalAssets = computed(() => {
      let scope = dashboardScope.value;
      let sum = 0; 
      (data.accounts || []).forEach(a => { if(a && a.type === 'Asset') sum += getBaseBalance(a.id, calculateBalance(a.id, scope)); });
      
      let allStockCost = calculateBalance('1103', 'all');
      let scopeStockCost = calculateBalance('1103', scope);
      let scopeRatio = allStockCost ? (scopeStockCost / allStockCost) : 0;
      
      let totalInvMV = 0; let totalInvCost = 0;
      (data.investments || []).forEach(inv => { 
          if(inv) { 
              let rate = data.currencyRates[inv.currency||'TWD'] || 1; 
              totalInvMV += (Number(inv.shares)||0) * (Number(inv.last_price)||0) * rate;
              totalInvCost += Number(inv.total_cost)||0;
          } 
      });
      sum += ((totalInvMV - totalInvCost) * scopeRatio);
      return sum;
    });

    const totalLiabilities = computed(() => {
      let scope = dashboardScope.value;
      let sum = 0; 
      (data.accounts || []).forEach(a => { if(a && a.type === 'Liability') sum += getBaseBalance(a.id, calculateBalance(a.id, scope)); });
      return sum;
    });

    const netWorth = computed(() => totalAssets.value - totalLiabilities.value);
    
    const sortedTransactions = computed(() => {
      return (data.transactions || []).slice().sort((a,b) => {
        let d1 = (a && a.date) ? a.date : ''; let d2 = (b && b.date) ? b.date : '';
        if (d1 !== d2) return d1 < d2 ? 1 : -1;
        let id1 = (a && a.id) ? a.id : ''; let id2 = (b && b.id) ? b.id : '';
        return id2.localeCompare(id1);
      });
    });
    
    const filteredTransactions = computed(() => {
      return sortedTransactions.value.filter(tx => {
        if(!tx) return false;
        let kw = historyFilter.keyword.toLowerCase(), desc = getTxDesc(tx).toLowerCase(), accD = getDebitAccName(tx).toLowerCase(), accC = getCreditAccName(tx).toLowerCase();
        let matchKw = !kw || desc.includes(kw) || accD.includes(kw) || accC.includes(kw);
        let matchScope = historyFilter.scope === 'all' || tx.scope === historyFilter.scope;
        let matchDate = (!historyFilter.dateFrom || tx.date >= historyFilter.dateFrom) && (!historyFilter.dateTo || tx.date <= historyFilter.dateTo);
        return matchKw && matchScope && matchDate;
      });
    });

    const ytdDividend = computed(() => {
      let sum = 0; let y = new Date().getFullYear().toString();
      (data.transactions || []).forEach(tx => {
        if(tx && tx.date && tx.date.startsWith(y) && tx.credits && !tx.is_refunded && !tx.is_refund) {
           tx.credits.forEach(c => { if(c && c.account_id === '4202') sum += Number(c.amount)||0; });
        }
      });
      return sum;
    });

    const expenseCategories = computed(() => (data.main_categories && data.main_categories.Expense) ? data.main_categories.Expense : []);
    const incomeCategories = computed(() => (data.main_categories && data.main_categories.Income) ? data.main_categories.Income : []);
    const currentSettingCategories = computed(() => (data.main_categories && data.main_categories[settingCategoryMode.value]) ? data.main_categories[settingCategoryMode.value] : []);

    const dashboardBudgets = computed(() => {
      let res = {}; let expMonth = dashboardMonth.value || ''; let expObj = {};
      (data.transactions || []).forEach(tx => {
        let txDate = tx && tx.date ? tx.date : '';
        if (tx && !tx.is_refunded && !tx.is_refund && txDate.length >= 7 && expMonth.length >= 7 && txDate.substring(0,7) === expMonth.substring(0,7)) {
          if (dashboardScope.value !== 'all' && tx.scope !== dashboardScope.value) return;
          (tx.debits || []).forEach(d => {
            let a = (data.accounts || []).find(ac => ac && ac.id === d.account_id);
            if(a && a.type === 'Expense') { let cat = a.category || '未分類'; if(!expObj[cat]) expObj[cat] = 0; expObj[cat] += (Number(d.amount) || 0); }
          });
        }
      });
      for(let cat in (data.budgets || {})) {
         let limit = Number(data.budgets[cat]) || 0; if(limit <= 0) continue;
         let spent = expObj[cat] || 0;
         res[cat] = { limit: limit, spent: spent, pct: Math.round((spent/limit)*100) };
      }
      return res;
    });

    const budgetStats = computed(() => {
        let limit = 0, spent = 0;
        for(let cat in dashboardBudgets.value) { limit += dashboardBudgets.value[cat].limit; spent += dashboardBudgets.value[cat].spent; }
        let remaining = limit - spent;
        let d = new Date(); let p = (dashboardMonth.value || d.toISOString().substring(0,7)).split('-');
        let year = p.length >= 1 ? Number(p[0]) : d.getFullYear(); let month = p.length >= 2 ? Number(p[1]) - 1 : d.getMonth();
        let daysInMonth = new Date(year, month + 1, 0).getDate();
        let currentDay = (year === d.getFullYear() && month === d.getMonth()) ? d.getDate() : (new Date(year, month, 1) < d ? daysInMonth : 1);
        let daysLeft = Math.max(daysInMonth - currentDay + 1, 1); 
        return { totalLimit: limit, totalSpent: spent, totalRemaining: remaining, dailyRemaining: remaining > 0 ? Math.floor(remaining / daysLeft) : 0, daysLeft };
    });

    const getAccName = (id) => { let a = (data.accounts || []).find(ac => ac && ac.id === id); return a ? a.name : (id || '未知'); };
    const getTxDesc = (tx) => (tx && (tx.desc || tx.description)) ? (tx.desc || tx.description) : '無摘要';
    const getDebitAccName = (tx) => (tx && tx.debits && tx.debits[0]) ? getAccName(tx.debits[0].account_id) : '未知';
    const getCreditAccName = (tx) => (tx && tx.credits && tx.credits[0]) ? getAccName(tx.credits[0].account_id) : '未知';
    const getDebitAmount = (tx) => (tx && tx.debits && tx.debits[0]) ? (Number(tx.debits[0].amount)||0) : 0;
    const getDebitAccType = (tx) => { if (tx && tx.debits && tx.debits[0]) { let a = data.accounts.find(ac => ac && ac.id === tx.debits[0].account_id); return a ? a.type : ''; } return ''; };
    
    const getInvestTotalAmount = () => {
      if (newTx.investAction === 'dividend') return Number(newTx.amount)||0;
      let base = (Number(newTx.shares)||0) * (Number(newTx.price)||0);
      return newTx.investAction === 'buy' ? base + (Number(newTx.fee)||0) : base - (Number(newTx.fee)||0) - (Number(newTx.tax)||0);
    };
    const getInvCurrentValue = (inv) => inv ? (Number(inv.shares)||0) * (Number(inv.last_price)||0) * (data.currencyRates[inv.currency||'TWD'] || 1) : 0;
    const getUnrealizedGain = (inv) => inv ? getInvCurrentValue(inv) - (Number(inv.total_cost) || 0) : 0;
    const getFAAccDep = (fa) => fa ? Math.abs(calculateBalance(fa.accumulated_dep_account_id, 'all')) : 0;
    const getFABookValue = (fa) => fa ? (Number(fa.original_cost)||0) - getFAAccDep(fa) : 0;
    const getAccumulatedInterest = (loanId) => {
      let sum = 0;
      (data.transactions || []).forEach(tx => {
        if(tx && tx.loan_id === loanId && tx.debits && !tx.is_refunded && !tx.is_refund) {
          tx.debits.forEach(d => { if(d && d.account_id === '5103') sum += (Number(d.amount) || 0); });
        }
      });
      return sum;
    };

    const loanRepayPreview = computed(() => {
      let loan = (data.loans || []).find(l => l && l.id === newTx.loanId);
      if(!loan || !newTx.amount) return { interest: 0, principal: 0, current_principal: 0 };
      let cp = Math.abs(calculateBalance(loan.liability_acc_id, 'all'));
      let interest = Math.round(cp * ((loan.interest_rate || 0) / 100 / 12));
      let principal = Math.min((newTx.amount || 0) - interest, cp);
      return { interest, principal, current_principal: cp };
    });

    const getTxColorBand = (tx) => {
      let tD = null, tC = null; let list = data.accounts || [];
      if(tx && tx.debits && tx.debits[0]) { let acc = list.find(a => a && a.id === tx.debits[0].account_id); if(acc) tD = acc.type; }
      if(tx && tx.credits && tx.credits[0]) { let acc = list.find(a => a && a.id === tx.credits[0].account_id); if(acc) tC = acc.type; }
      let desc = getTxDesc(tx);
      if(tx && tx.is_refund) return 'bg-slate-400';
      if(tD === 'Expense') return 'bg-red-500';
      if(tC === 'Income') return 'bg-green-500';
      if(desc.includes('買進')||desc.includes('賣出')||desc.includes('配息')) return 'bg-orange-500';
      if(tx && tx.loan_id) return 'bg-rose-500';
      return 'bg-purple-500'; 
    };
    
    const getTxAmountColor = (tx) => {
      if (tx && tx.is_refunded) return 'text-slate-400 line-through';
      let tD = getDebitAccType(tx);
      if(tD === 'Expense') return 'text-red-500';
      if(tD === 'Asset' && !getTxDesc(tx).includes('轉帳')) return 'text-green-600 dark:text-green-400';
      return 'text-slate-700 dark:text-slate-300';
    };

    const applyQuickTag = (tag) => {
      let acc = (data.accounts || []).find(a => a && a.name === tag && (a.type === 'Expense' || a.type === 'Income'));
      if (acc) { 
        entryMode.value = acc.type.toLowerCase(); newTx.mainCategory = acc.category; newTx.subAccount = acc.id; newTx.desc = tag; newTx.isReimbursement = false;
        if(data.smart_tags && data.smart_tags[tag]) newTx.paymentAcc = data.smart_tags[tag];
      }
    };

    const onDividendSymbolChange = () => {
      if (newTx.investDividendSymbol === 'manual') newTx.stockName = '';
      else {
         let inv = (data.investments || []).find(i => i && i.symbol === newTx.investDividendSymbol);
         if (inv) newTx.stockName = (inv.name || '').replace(/^\[.*?\]\s*/, '');
      }
    };

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

    const bsData = computed(() => calculateBalanceSheet(data.accounts, data.transactions, data.investments, data.currencyRates, reportEndDate.value));
    const isData = computed(() => calculateIncomeStatement(data.accounts, data.transactions, reportStartDate.value, reportEndDate.value));
    const cfData = computed(() => calculateCashFlow(data.accounts, data.transactions, reportStartDate.value, reportEndDate.value));

    // ------------------------------------------------------------------------
    // 8. 核心操作 (Core Actions)
    // ------------------------------------------------------------------------
    const switchBook = () => {
      let oldId = settings.currentBookId || 'default';
      let targetId = currentBookId.value;
      localStorage.setItem('ledger_backup_' + oldId, JSON.stringify(data)); 
      
      settings.currentBookId = targetId;
      saveSettings(false);
      
      const newBackup = localStorage.getItem('ledger_backup_' + targetId);
      resetData();

      if (newBackup) { 
         Object.assign(data, JSON.parse(newBackup));
      } else { 
         data.version = "6.3.0"; 
      }
      
      setupDefaultData(data, DEFAULT_CATEGORIES);
      runAutoTasks();
      setHistoryToCurrentMonth();

      isDrawerOpen.value = false;
      if (['dashboard', 'reports', 'budget'].includes(activeTab.value)) updateCharts();
      alert(`已切換至: ${activeBookName.value}`);
    };

    const createNewBook = () => { showNewBookModal.value = true; };
    const submitNewBook = () => {
      if(!newBookName.value) return;
      let newId = 'book_' + Date.now();
      settings.booksIndex.push({ id: newId, name: newBookName.value });
      currentBookId.value = newId; 
      switchBook();
      newBookName.value = ''; 
      showNewBookModal.value = false;
    };

    const submitNewAssetAccount = () => {
      if(!newAssetAcc.name) return;
      let finalType = newAssetAcc.name.includes('信用卡') || newAssetAcc.name.includes('欠款') || newAssetAcc.name.includes('貸款') ? 'Liability' : (newAssetAcc.type || 'Asset');
      const newId = (finalType === 'Liability' ? 'liab_' : 'asset_') + Date.now();
      data.accounts.push({ id: newId, name: newAssetAcc.name, type: finalType, currency: newAssetAcc.currency, is_hidden: false });
      
      if(newAssetAcc.initBalance && newAssetAcc.initBalance > 0) {
        if (finalType === 'Asset') {
            data.transactions.push({ id: 'tx_init_' + Date.now(), date: new Date().toISOString().split('T')[0], scope: 'personal', desc: `期初餘額: ${newAssetAcc.name}`, debits: [{ account_id: newId, amount: newAssetAcc.initBalance }], credits: [{ account_id: '3101', amount: newAssetAcc.initBalance }] });
        } else {
            data.transactions.push({ id: 'tx_init_' + Date.now(), date: new Date().toISOString().split('T')[0], scope: 'personal', desc: `期初欠款: ${newAssetAcc.name}`, debits: [{ account_id: '3101', amount: newAssetAcc.initBalance }], credits: [{ account_id: newId, amount: newAssetAcc.initBalance }] });
        }
      }
      newAssetAcc.name = ''; newAssetAcc.type = 'Asset'; newAssetAcc.initBalance = null; newAssetAcc.currency = 'TWD';
      showAddAccountModal.value = false; autoBackup(); updateCharts(); refreshIcons(); alert('✅ 帳戶建立成功！');
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
           let inv = (data.investments || []).find(i => i && i.symbol === newTx.symbol);
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
        let loan = (data.loans || []).find(l => l && l.id === newTx.loanId); if(!loan) return txError.value = '貸款資料錯誤';
        let preview = loanRepayPreview.value;
        txObj.loan_id = loan.id;
        txObj.desc = newTx.desc || `貸款還款: ${loan.name}`;
        txObj.debits.push({ account_id: loan.liability_acc_id, amount: preview.principal });
        txObj.debits.push({ account_id: '5103', amount: preview.interest });
        txObj.credits.push({ account_id: newTx.paymentAcc, amount: newTx.amount });
      }

      data.transactions.push(txObj);
      newTx.amount = null; newTx.desc = ''; newTx.shares = null; newTx.price = null; newTx.fee = null; newTx.tax = null; newTx.loanId = ''; newTx.manualSymbol = ''; newTx.manualName = '';
      autoBackup(); updateCharts(); refreshIcons();
      alert('✅ 記帳成功！'); 
    };

    const openRefundModal = (tx) => {
      if (!tx) return;
      activeRefundTx.value = tx;
      const originalAmt = getDebitAmount(tx);
      const refundedAmt = Number(tx.refunded_amount) || 0;
      refundData.maxAmount = originalAmt - refundedAmt;
      refundData.amount = refundData.maxAmount; 
      refundData.account = (tx.credits && tx.credits[0]) ? tx.credits[0].account_id : '';
      showRefundModal.value = true;
    };
    const closeRefundModal = () => { showRefundModal.value = false; activeRefundTx.value = null; };

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
      data.transactions.push(refundTx);
      activeRefundTx.value.refunded_amount = (Number(activeRefundTx.value.refunded_amount) || 0) + refundData.amount;
      if (activeRefundTx.value.refunded_amount >= getDebitAmount(activeRefundTx.value)) activeRefundTx.value.is_refunded = true;
      closeRefundModal(); autoBackup(); updateCharts(); alert('✅ 退款沖銷成功！');
    };

    const openReimburseModal = (tx) => { activeReimburseTx.value = tx; reimburseData.account = ''; showReimburseModal.value = true; };
    const closeReimburseModal = () => { showReimburseModal.value = false; activeReimburseTx.value = null; };
    const submitReimburse = () => {
        if (!activeReimburseTx.value) return;
        if (!reimburseData.account) return alert('請選擇入帳帳戶');
        reimburseTx(activeReimburseTx.value, reimburseData.account);
        closeReimburseModal();
    };
    const reimburseTx = (tx, toAccountId) => {
         if (!tx || !toAccountId) return;
         let origAmount = getDebitAmount(tx);
         data.transactions.push({
            id: 'tx_reimb_' + Date.now(),
            date: new Date().toISOString().split('T')[0],
            scope: tx.scope,
            desc: `[代墊報銷] ${(tx.desc || tx.description || '')}`,
            debits: [{ account_id: toAccountId, amount: origAmount }],
            credits: [{ account_id: '1104', amount: origAmount }],
            ref_tx_id: tx.id
        });
        tx.is_reimbursed = true;
        autoBackup(); updateCharts(); alert('✅ 報銷沖銷成功！');
    };

    const deleteTransaction = (id) => {
      if(!confirm('確定刪除？')) return;
      let idx = data.transactions.findIndex(t => t && t.id === id); if (idx === -1) return;
      let tx = data.transactions[idx];
      if (tx && tx.auto_generated && tx.asset_id) { let a = data.fixed_assets.find(fa => fa && fa.id === tx.asset_id); if(a) a.last_depreciation_date = null; }
      data.transactions.splice(idx, 1); autoBackup(); updateCharts();
    };

    const submitInitialStock = () => {
      if(!initStock.symbol || !initStock.shares || !initStock.cost) return alert("請填寫完整");
      data.investments.push({ id: 'inv_'+Date.now(), symbol: initStock.symbol, name: initStock.name || initStock.symbol, shares: initStock.shares, total_cost: initStock.cost, currency: 'TWD' });
      data.transactions.push({ id: 'tx_init_'+Date.now(), date: new Date().toISOString().split('T')[0], scope: 'personal', desc: `期初建倉 ${initStock.name || initStock.symbol}`, debits: [{ account_id: '1103', amount: initStock.cost }], credits: [{ account_id: '3101', amount: initStock.cost }] });
      showInitialStockModal.value = false; initStock.symbol = ''; initStock.name = ''; initStock.shares = null; initStock.cost = null; autoBackup(); updateCharts();
    };

    const submitFixedAsset = () => {
      if(!initFA.name || !initFA.cost || !initFA.months) return alert("請填寫完整");
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
      data.transactions.push(txObj); fa.is_disposed = true; showDisposalModal.value = false; autoBackup(); updateCharts(); alert('✅ 處分完成！');
    };

    const submitAddLoan = () => {
      if(!initLoan.name || !initLoan.principal || !initLoan.rate || !initLoan.payment) return alert("請填妥所有貸款欄位");
      let accId = 'loan_liab_' + Date.now(); let loanId = 'loan_' + Date.now();
      data.accounts.push({ id: accId, name: initLoan.name, type: 'Liability', currency: 'TWD', is_hidden: false });
      data.loans.push({ id: loanId, name: initLoan.name, liability_acc_id: accId, interest_rate: initLoan.rate, monthly_payment: initLoan.payment });
      data.transactions.push({ id: 'tx_loan_init_'+Date.now(), date: new Date().toISOString().split('T')[0], scope: 'personal', desc: `期初貸款本金: ${initLoan.name}`, debits: [{ account_id: '3101', amount: initLoan.principal }], credits: [{ account_id: accId, amount: initLoan.principal }] });
      newTx.loanId = loanId; initLoan.name = ''; initLoan.principal = null; initLoan.rate = null; initLoan.payment = null; showAddLoanModal.value = false; autoBackup(); updateCharts(); alert('✅ 貸款建立成功！');
    };

    const openRateModal = (loan) => { activeLoan.value = loan; rateData.rate = loan.interest_rate; showRateModal.value = true; };
    const submitRateAdjust = () => { if(!rateData.rate) return alert("請輸入利率"); activeLoan.value.interest_rate = rateData.rate; showRateModal.value = false; autoBackup(); alert('✅ 利率修改成功！'); };

    const submitAddGoal = () => {
      if(!initGoal.name || !initGoal.target) return alert("請填寫目標名稱與金額");
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
    const deleteGoal = (id) => { if(!confirm("確定刪除此儲蓄目標？")) return; data.savings_goals = data.savings_goals.filter(g => g && g.id !== id); autoBackup(); };

    const addRecurring = () => {
      if(!newRecurring.desc || !newRecurring.amount || !newRecurring.account) return alert("請填妥排程資訊");
      data.recurring.push({ id: 'rec_'+Date.now(), type: newRecurring.type, desc: newRecurring.desc, amount: newRecurring.amount, day: newRecurring.day, account: newRecurring.account });
      newRecurring.desc = ''; newRecurring.amount = null; newRecurring.day = 1; autoBackup(); alert('✅ 排程建立成功！');
    };
    const deleteRecurring = (id) => { data.recurring = data.recurring.filter(r => r && r.id !== id); autoBackup(); };

    const addMainCategory = () => { let list = data.main_categories[settingCategoryMode.value] || []; if (newMainCat.value && !list.includes(newMainCat.value)) { data.main_categories[settingCategoryMode.value].push(newMainCat.value); newMainCat.value = ''; autoBackup(); } };
    const deleteMainCategory = (type, name) => { if(getSubAccounts(type, name, true).length > 0) return alert("請先清空子類別"); data.main_categories[type] = (data.main_categories[type] || []).filter(c => c !== name); autoBackup(); };
    const addSubCategory = () => { if (newSubCat.name && newSubCat.main) { data.accounts.push({ id: 'acc_'+Date.now(), name: newSubCat.name, type: settingCategoryMode.value, category: newSubCat.main, currency: 'TWD', is_hidden: false }); newSubCat.name = ''; autoBackup(); refreshIcons(); } };
    const addPreset = () => { let list = data.quick_tags || []; if (newPreset.value && !list.includes(newPreset.value)) { data.quick_tags.push(newPreset.value); newPreset.value = ''; autoBackup(); } };
    const removePreset = (idx) => { data.quick_tags.splice(idx, 1); autoBackup(); };
    const toggleAccountVisibility = (id) => { let a = data.accounts.find(a => a && a.id === id); if (a) { a.is_hidden = !a.is_hidden; autoBackup(); refreshIcons(); } };
    const deleteAccount = (id) => {
      let isUsed = false;
      data.transactions.forEach(tx => {
        if(tx.debits) tx.debits.forEach(d => { if(d.account_id === id) isUsed = true; });
        if(tx.credits) tx.credits.forEach(c => { if(c.account_id === id) isUsed = true; });
      });
      if (isUsed) return alert("已有紀錄，請改用隱藏");
      if (confirm("確定刪除?")) { data.accounts = data.accounts.filter(a => a && a.id !== id); autoBackup(); }
    };

    const runAutoTasks = () => {
      let curM = new Date().toISOString().substring(0,7); let today = new Date().getDate();
      (data.fixed_assets || []).forEach(fa => {
        if(!fa || fa.is_disposed) return;
        let ld = fa.last_depreciation_date || fa.purchase_date || '';
        if (ld && ld.length >= 7 && ld.substring(0,7) < curM) {
          let accDep = getFAAccDep(fa);
          if (accDep + fa.monthly_depreciation > fa.original_cost) return; 
          data.transactions.push({ id: 'tx_dep_'+Date.now()+Math.random(), date: new Date().toISOString().split('T')[0], desc: `${fa.name} 自動折舊`, scope: 'family', auto_generated: true, asset_id: fa.id, debits: [{ account_id: fa.expense_account_id, amount: fa.monthly_depreciation }], credits: [{ account_id: fa.accumulated_dep_account_id, amount: fa.monthly_depreciation }] });
          fa.last_depreciation_date = new Date().toISOString().split('T')[0];
        }
      });
      (data.installments || []).forEach(inst => {
        if(!inst || !inst.next_month) return;
        while (inst.paid_periods < inst.periods && inst.next_month <= curM) {
          let day = inst.date_day || '01'; let amt = (inst.paid_periods === 0 && inst.first_amount) ? inst.first_amount : inst.amount_per_period;
          data.transactions.push({ id: 'tx_inst_'+Date.now()+Math.random(), date: `${inst.next_month}-${day}`, desc: `${inst.desc} (${inst.paid_periods+1}/${inst.periods}期)`, scope: inst.scope, auto_generated: true, inst_id: inst.id, debits: [{ account_id: inst.debit_acc, amount: amt }], credits: [{ account_id: inst.credit_acc, amount: amt }] });
          inst.paid_periods++;
          let p = inst.next_month.split('-'); let y = Number(p[0]); let m = Number(p[1]) + 1; if(m > 12) { m = 1; y++; }
          inst.next_month = `${y}-${String(m).padStart(2,'0')}`;
        }
      });
      (data.recurring || []).forEach(rec => {
        if(!rec || !rec.amount) return;
        let lastExec = rec.last_exec_month || '';
        if (lastExec !== curM && today >= rec.day) {
           let txObj = { id: 'tx_rec_' + Date.now() + Math.random(), date: `${curM}-${String(rec.day).padStart(2,'0')}`, scope: 'personal', desc: `[定期] ${rec.desc}`, debits: [], credits: [], auto_generated: true };
           if (rec.type === 'expense') {
              let sub = data.accounts.find(a => a && a.type === 'Expense' && a.name === rec.desc);
              txObj.debits.push({ account_id: sub ? sub.id : '5102', amount: rec.amount }); txObj.credits.push({ account_id: rec.account, amount: rec.amount });
           } else {
              let sub = data.accounts.find(a => a && a.type === 'Income' && a.name === rec.desc);
              txObj.debits.push({ account_id: rec.account, amount: rec.amount }); txObj.credits.push({ account_id: sub ? sub.id : '4201', amount: rec.amount });
           }
           data.transactions.push(txObj); rec.last_exec_month = curM;
        }
      });
    };

    // ------------------------------------------------------------------------
    // 9. Google Drive 同步機制
    // ------------------------------------------------------------------------
    const autoBackup = (syncCloud = true) => { 
      localStorage.setItem('ledger_backup_' + settings.currentBookId, JSON.stringify(data)); 
      if(syncCloud && settings.googleToken) syncWithGoogleDrive(false); 
    };
    
    const initGoogleAuth = () => {
      if (!settings.googleClientId || typeof google === 'undefined') return;
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: settings.googleClientId, scope: 'https://www.googleapis.com/auth/drive.file',
        callback: (res) => {
          if(res.error) return alert('授權失敗');
          settings.googleToken = res.access_token; saveSettings(false); syncWithGoogleDrive(false);
        },
      });
      if(typeof gapi !== 'undefined') { gapi.load('client', () => { gapi.client.init({}).then(()=>{ gapi.client.setToken({access_token: settings.googleToken}); }); }); }
    };

    const handleGoogleAuth = () => { if(!settings.googleClientId) return alert("請先填寫 Client ID"); if(tokenClient) tokenClient.requestAccessToken({prompt: 'consent'}); };
    const handleGoogleSignout = () => { settings.googleToken = ''; settings.fileId = ''; saveSettings(false); };

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
           settings.fileId = fileId; saveSettings(false);
           if(isManual) { 
              let fileRes = await gapi.client.request({ path: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, method: 'GET' });
              let cloudData = fileRes.result;
              if(typeof cloudData === 'string') { try { cloudData = JSON.parse(cloudData); } catch(e) { cloudData = null; } }
              if(cloudData && typeof cloudData === 'object' && (cloudData.accounts || cloudData.transactions)) { 
                resetData(); Object.assign(data, cloudData); setupDefaultData(data, DEFAULT_CATEGORIES); runAutoTasks(); localStorage.setItem('ledger_backup_' + currentBookId.value, JSON.stringify(data));
                if (expenseChartInstance.value) { expenseChartInstance.value.destroy(); expenseChartInstance.value = null; }
                if (assetChartInstance.value) { assetChartInstance.value.destroy(); assetChartInstance.value = null; }
                if (netWorthChartInstance.value) { netWorthChartInstance.value.destroy(); netWorthChartInstance.value = null; }
                updateCharts(); alert('雲端資料已同步還原'); 
              } else { alert('⚠️ 雲端資料無效或為空，已保留本地資料防止覆蓋！'); }
           } else { 
              await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${settings.googleToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
           }
           syncStatus.value = 'ok';
        } else {
           let form = new FormData();
           form.append('metadata', new Blob([JSON.stringify({ name: currentFileName, mimeType: 'application/json' })], { type: 'application/json' }));
           form.append('file', new Blob([JSON.stringify(data)], { type: 'application/json' }));
           let res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', { method: 'POST', headers: { 'Authorization': `Bearer ${settings.googleToken}` }, body: form });
           let result = await res.json();
           settings.fileId = result.id; saveSettings(false); syncStatus.value = 'ok'; if(isManual) alert('雲端備份已建立');
        }
      } catch (e) {
        syncStatus.value = 'error'; console.warn("GDrive Sync Error", e);
        if(e.status === 401) { settings.googleToken = ''; saveSettings(false); if(isManual) alert("權限過期，請重新登入"); }
      } finally { isSyncing.value = false; }
    };

    const executeFactoryReset = async () => {
      resetData();
      setupDefaultData(data, DEFAULT_CATEGORIES);
      if (settings.googleToken && settings.fileId && typeof gapi !== 'undefined') {
         try { await fetch(`https://www.googleapis.com/upload/drive/v3/files/${settings.fileId}?uploadType=media`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${settings.googleToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); } catch(e) {}
      }
      localStorage.removeItem('ledger_backup_' + currentBookId.value); window.location.reload(true);
    };

    // ------------------------------------------------------------------------
    // 10. 報價與匯率 API
    // ------------------------------------------------------------------------
    const updateStockPrices = async () => {
      try {
        const res = await fetchWithTimeout('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', {}, 5000);
        if (!res.ok) throw new Error('API Error');
        const twseData = await res.json();
        data.investments.forEach(inv => {
          if(inv && inv.currency !== 'USD') {
            let s = twseData.find(st => st && st.Code === (inv.symbol || '').replace('.TW',''));
            if (s) inv.last_price = parseFloat(s.ClosingPrice);
          }
        });
        alert('股價自動更新完成！'); autoBackup(); updateCharts();
      } catch (e) { 
        showManualStockModal.value = true;
      }
    };
    const submitManualStockUpdate = () => { showManualStockModal.value = false; autoBackup(); updateCharts(); alert('✅ 手動股價更新完成'); };
    const setHistoryToCurrentMonth = () => { const now = new Date(); const y = now.getFullYear(); const mStr = String(now.getMonth() + 1).padStart(2, '0'); historyFilter.dateFrom = `${y}-${mStr}-01`; historyFilter.dateTo = `${y}-${mStr}-${new Date(y, now.getMonth() + 1, 0).getDate()}`; };
    const fetchExchangeRate = async () => { try { const res = await fetchWithTimeout('https://api.exchangerate-api.com/v4/latest/USD', {}, 3000); const fx = await res.json(); if(fx && fx.rates && fx.rates.TWD) fxRate.value = fx.rates.TWD; } catch(e) {} };
    
    // ------------------------------------------------------------------------
    // 11. 初始化與生命週期 (Lifecycle)
    // ------------------------------------------------------------------------
    const loadSettings = () => { 
      try { const s = JSON.parse(localStorage.getItem('ledger_settings') || '{}'); if(s && typeof s === 'object') Object.assign(settings, s); } catch(e) {} 
      if(!settings.appName) settings.appName = '智慧帳本'; 
      if(!settings.booksIndex || settings.booksIndex.length === 0) settings.booksIndex = [{id: 'default', name: '日常帳本'}];
      currentBookId.value = settings.currentBookId || 'default';
      if(!settings.pinEnabled) isUnlocked.value = true; 
    };
    
    const unlockApp = () => { if (pinInput.value === settings.pinCode) { isUnlocked.value = true; initData(); } else { pinError.value = "PIN錯誤"; } };
    const saveSettings = (showAlert = true) => { settings.currentBookId = currentBookId.value; localStorage.setItem('ledger_settings', JSON.stringify(settings)); if (showAlert) alert('設定已儲存'); if (settings.googleToken && settings.googleClientId) initGoogleAuth(); };
    const exportData = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'})); a.download = `Ledger_${currentBookId.value}_${new Date().toISOString().split('T')[0]}.json`; a.click(); };
    const importData = (e) => { const f = e.target.files[0]; if(!f) return; const r = new FileReader(); r.onload = (ev) => { try { const p = JSON.parse(ev.target.result); if (p && typeof p === 'object') { resetData(); Object.assign(data, p); setupDefaultData(data, DEFAULT_CATEGORIES); autoBackup(); updateCharts(); alert("成功覆蓋匯入"); } } catch(err) { alert("檔案錯誤"); } }; r.readAsText(f); };

    const updateCharts = () => {
      if (!['dashboard', 'budget', 'reports'].includes(activeTab.value)) return;
      nextTick(() => {
        try {
            expenseChartInstance.value = renderExpenseChart(expenseChartInstance.value, 'expenseChart', data.transactions, data.accounts, dashboardScope.value, dashboardMonth.value);
            
            let scope = dashboardScope.value;
            let cTot=0, sTot=0;
            (data.accounts || []).forEach(a => { if(a && a.type==='Asset' && !a.is_contra && a.id!=='1103' && a.id!=='1201' && a.id!=='1104') cTot += getBaseBalance(a.id, calculateBalance(a.id, scope)); });
            (data.investments || []).forEach(inv => { if(inv) sTot += (Number(inv.shares)||0) * (Number(inv.last_price)||0) * (data.currencyRates[inv.currency||'TWD']||1); });
            let fTot = calculateBalance('1201', scope) + calculateBalance('1201-DEP', scope);
            assetChartInstance.value = renderAssetChart(assetChartInstance.value, 'assetChart', cTot, sTot, fTot);

            let histLabels = []; let histData = []; let d = new Date();
            let allStockCost = calculateBalance('1103', 'all'); let scopeStockCost = calculateBalance('1103', scope);
            let scopeRatio = allStockCost ? (scopeStockCost / allStockCost) : 0;
            let totalInvMV = 0; let totalInvCost = 0;
            (data.investments||[]).forEach(inv => { totalInvMV += (Number(inv.shares)||0) * (Number(inv.last_price)||0) * (data.currencyRates[inv.currency||'TWD']||1); totalInvCost += Number(inv.total_cost)||0; });
            let scopeUnrealizedGain = (totalInvMV - totalInvCost) * scopeRatio;

            for(let i=5; i>=0; i--) {
                let tempDate = new Date(d.getFullYear(), d.getMonth() - i, 1);
                let mStr = tempDate.getFullYear() + '-' + String(tempDate.getMonth()+1).padStart(2,'0');
                histLabels.push(mStr);
                let endOfMonth = mStr + '-31'; 
                let aSum=0, lSum=0;
                (data.accounts||[]).forEach(a => {
                    if(!a) return;
                    let bal = 0;
                    (data.transactions||[]).forEach(tx => {
                        if(!tx || tx.date > endOfMonth) return;
                        if(scope !== 'all' && tx.scope !== scope) return;
                        if(tx.debits) tx.debits.forEach(db=>{if(db.account_id===a.id) bal+=Number(db.amount)||0;});
                        if(tx.credits) tx.credits.forEach(cr=>{if(cr.account_id===a.id) bal-=Number(cr.amount)||0;});
                    });
                    if(a.type==='Asset') aSum += getBaseBalance(a.id, bal); else if(a.type==='Liability') lSum += getBaseBalance(a.id, -bal);
                });
                aSum += scopeUnrealizedGain; histData.push(aSum - lSum);
            }
            netWorthChartInstance.value = renderNetWorthChart(netWorthChartInstance.value, 'netWorthChart', histLabels, histData);
        } catch (err) { console.warn("Chart Render Error:", err); }
      });
    };

    const refreshIcons = () => { nextTick(() => { try { if (window.lucide) lucide.createIcons(); } catch(e){} }); };

    watch(activeTab, () => { if(['dashboard', 'reports', 'budget'].includes(activeTab.value)) updateCharts(); refreshIcons(); });
    watch(dashboardScope, () => updateCharts());

    const initData = async () => {
      try { const backup = localStorage.getItem('ledger_backup_' + currentBookId.value); if (backup) { Object.assign(data, JSON.parse(backup)); } } catch(e) {}
      setupDefaultData(data, DEFAULT_CATEGORIES); setHistoryToCurrentMonth(); await fetchExchangeRate();
      isAppReady.value = true;
      let loadingScreen = document.getElementById('native-loading'); if(loadingScreen) loadingScreen.style.display = 'none';
      if(window.google) initGoogleAuth(); else setTimeout(initGoogleAuth, 2000);
      runAutoTasks(); if (['dashboard', 'reports', 'budget'].includes(activeTab.value)) updateCharts(); refreshIcons();
    };

    onMounted(() => {
      loadSettings();
      if(isUnlocked.value) { initData(); } 
      else { isAppReady.value = true; let loadingScreen = document.getElementById('native-loading'); if(loadingScreen) loadingScreen.style.display = 'none'; refreshIcons(); }
    });

    return { 
      isAppReady, activeTab, isDrawerOpen, entryMode, dashboardScope, isUnlocked, pinInput, pinError, 
      syncStatus, isSyncing, showAmounts, expenseMonth, dashboardMonth, fxRate,
      reportView, reportPeriod, reportStartDate, reportEndDate,
      showAddAccountModal, showInitialStockModal, showAddFixedAssetModal, showDisposalModal, showAddLoanModal, showRateModal, 
      showResetModal, showNewBookModal, showAddGoalModal, showUpdateGoalModal, showManualStockModal, showRefundModal, showReimburseModal,
      activeRefundTx, refundData, activeReimburseTx, reimburseData, hasExpensesThisMonth, settings, currentBookId, newBookName, data, newTx, txError, 
      historyFilter, settingCategoryMode, newPreset, newMainCat, newSubCat, newAssetAcc, initStock, initFA, 
      disposalAsset, disposalForm, initLoan, activeLoan, rateData, newRecurring, initGoal, activeGoal, updateGoalData,
      changeTab, unlockApp, saveSettings, exportData, importData, onSymbolInput, filterByAccount,
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
      openReimburseModal, closeReimburseModal, submitReimburse, reimburseTx,
      deleteTransaction, submitInitialStock, submitFixedAsset, openDisposalModal, submitDisposal, submitAddLoan, 
      openRateModal, submitRateAdjust, submitAddGoal, openUpdateGoalModal, submitUpdateGoal, deleteGoal, addRecurring, 
      deleteRecurring, addMainCategory, deleteMainCategory, addSubCategory, addPreset, removePreset, toggleAccountVisibility, 
      deleteAccount, runAutoTasks, autoBackup, initGoogleAuth, handleGoogleAuth, handleGoogleSignout, syncWithGoogleDrive, 
      executeFactoryReset, updateStockPrices, submitManualStockUpdate, setHistoryToCurrentMonth, fetchExchangeRate, 
      loadSettings, updateCharts, refreshIcons, initData, expenseCategories, incomeCategories, currentSettingCategories
    };
  }
});

app.config.errorHandler = function(err, vm, info) {
  console.warn("Vue Global Error:", err, info);
  var loading = document.getElementById('native-loading');
  var errorScreen = document.getElementById('fallback-error');
  var errorMsg = document.getElementById('fallback-error-msg');
  if(loading) loading.style.display = 'none';
  if(errorScreen) errorScreen.style.display = 'flex';
  if(errorMsg) errorMsg.innerText = err.message + '\n(' + info + ')';
};

app.mount('#app');