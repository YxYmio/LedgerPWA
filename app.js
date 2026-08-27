const { createApp, ref, reactive, computed, onMounted, watch, nextTick, shallowRef } = Vue;

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

    // --- 新增：計算機與語音狀態 ---
    const isCalcOpen = ref(false);
    const calcExpression = ref('');
    const isListening = ref(false);

    // ------------------------------------------------------------------------
    // 2. 報表與圖表狀態
    // ------------------------------------------------------------------------
    const reportView = ref('balance');
    const reportPeriod = ref('this_month'); 
    const reportStartDate = ref('');
    const reportEndDate = ref('');
    
    const expenseChartInstance = shallowRef(null);
    const assetChartInstance = shallowRef(null);
    const netWorthChartInstance = shallowRef(null);
    const hasExpensesThisMonth = ref(false);

    // ------------------------------------------------------------------------
    // 3. 彈窗控制狀態 (Modals)
    // ------------------------------------------------------------------------
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
    const editTxModal = ref(false);
    const showInstallmentModal = ref(false);
    
    // --- 新增：拆帳與專案預算彈窗 ---
    const showSplitModal = ref(false);
    const showProjectBudgetModal = ref(false);

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
        currentBookId: 'default',
        booksIndex: [{id: 'default', name: '日常帳本'}],
        billingStartDay: 1 // 新增：結算起算日
    });
    
    const currentBookId = ref('default');
    const newBookName = ref('');

    const data = reactive({
      version: "6.3.1",
      currencyRates: { TWD: 1, USD: 32.5, JPY: 0.22 },
      budgets: {}, recurring: [], quick_tags: [], smart_tags: {}, 
      main_categories: { Expense: [], Income: [] }, accounts: [], 
      transactions: [], fixed_assets: [], investments: [], installments: [], 
      loans: [], savings_goals: [],
      project_budgets: [], // 新增：專案預算清單
      custom_tags: []      // 新增：自訂標籤庫
    });

    // ------------------------------------------------------------------------
    // 5. 表單綁定狀態 (Forms Data)
    // ------------------------------------------------------------------------
    const newTx = reactive({ 
      date: new Date().toISOString().split('T')[0], scope: 'personal', desc: '', amount: null, 
      mainCategory: '', subAccount: '', paymentAcc: '', fromAcc: '', toAcc: '', investAction: 'buy', 
      symbol: '', stockName: '', shares: null, price: null, fee: null, tax: null, 
      isInst: false, periods: 3, isFA: false, faName: '', faMonths: 60, loanId: '',
      isReimbursement: false, investDividendSymbol: '', manualSymbol: '', manualName: '',
      investSelectedSymbol: '', tags: []
    });
    
    const initStock = reactive({ symbol: '', name: '', shares: null, price: null, cost: null, unitType: 'share' });
    const newAssetAcc = reactive({ name: '', type: 'Asset', initBalance: null, currency: 'TWD' });
    const initFA = reactive({ name: '', date: new Date().toISOString().split('T')[0], cost: null, months: 60, scope: 'personal' });
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
    const editingTx = reactive({ id: '', date: '', desc: '', amount: 0, scope: 'personal', debitAcc: '', creditAcc: '' });
    const selectedInstallment = ref(null);
    
    // --- 新增：AA 分帳與專案預算表單 ---
    const splitBillForm = reactive({
        totalAmount: null, myPaid: null, myShare: null, expenseAcc: '', payerAcc: '',
        mode: 'even', members: [{ name: '朋友A', amount: null }]
    });

    const projectBudgetForm = reactive({ name: '', tag: '', limit: null, startDate: '', endDate: '' });

    const txError = ref('');
    const historyFilter = reactive({ keyword: '', scope: 'all', dateFrom: '', dateTo: '' });
    const settingCategoryMode = ref('Expense');
    const newPreset = ref(''); 
    const newMainCat = ref(''); 
    const newSubCat = reactive({ main: '', name: '' });

    let tokenClient = null;

    // ------------------------------------------------------------------------
    // 計算機與語音處理邏輯
    // ------------------------------------------------------------------------
    const calcAppend = (val) => { calcExpression.value += val; };
    const calcClear = () => { calcExpression.value = ''; };
    const calcBackspace = () => { calcExpression.value = calcExpression.value.slice(0, -1); };
    const calcConfirm = () => {
        let res = typeof evaluateCalc === 'function' ? evaluateCalc(calcExpression.value) : null;
        if (res !== null && res > 0) newTx.amount = res;
        isCalcOpen.value = false;
        calcExpression.value = '';
    };

    const startVoiceRecognition = () => {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert('您的瀏覽器不支援語音輸入功能。');
            return;
        }
        const recognition = new SpeechRecognition();
        recognition.lang = 'zh-TW';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => { isListening.value = true; };
        recognition.onresult = (event) => {
            const transcript = event.results[0][0].transcript;
            let parsed = typeof parseVoiceCommand === 'function' ? parseVoiceCommand(transcript, data.accounts) : {amount: null, desc: transcript, tags: [], paymentAcc: ''};
            
            if (parsed.amount) newTx.amount = parsed.amount;
            if (parsed.paymentAcc) newTx.paymentAcc = parsed.paymentAcc;
            
            let finalDesc = parsed.desc;
            if (parsed.tags && parsed.tags.length > 0) {
                finalDesc += ' ' + parsed.tags.map(t => '#' + t).join(' ');
            }
            newTx.desc = finalDesc.trim();
        };
        recognition.onerror = (event) => { console.warn('Speech error', event.error); alert('語音辨識發生錯誤'); };
        recognition.onend = () => { isListening.value = false; };
        recognition.start();
    };

    // ------------------------------------------------------------------------
    // AA 拆帳與專案預算邏輯
    // ------------------------------------------------------------------------
    const calculateSplit = () => {
        if (splitBillForm.mode === 'even') {
            let totalPeople = 1 + splitBillForm.members.length;
            let res = typeof splitBillCalculator === 'function' ? splitBillCalculator(splitBillForm.totalAmount, totalPeople, true) : { personalAmount: 0, receivableAmount: 0 };
            splitBillForm.myShare = res.personalAmount;
            let otherShare = res.receivableAmount / splitBillForm.members.length;
            splitBillForm.members.forEach(m => m.amount = Math.round(otherShare));
        } else {
            let othersTotal = splitBillForm.members.reduce((s, m) => s + (Number(m.amount)||0), 0);
            splitBillForm.myShare = Math.max(0, (Number(splitBillForm.totalAmount)||0) - othersTotal);
        }
    };

    watch(() => splitBillForm.totalAmount, calculateSplit);
    watch(() => splitBillForm.mode, calculateSplit);
    watch(() => splitBillForm.members, calculateSplit, {deep: true});

    const addSplitMember = () => { splitBillForm.members.push({ name: '新成員', amount: null }); calculateSplit(); };
    const removeSplitMember = (idx) => { splitBillForm.members.splice(idx, 1); calculateSplit(); };

    const submitSplitToLedger = () => {
        if (!splitBillForm.totalAmount || !splitBillForm.payerAcc || !splitBillForm.expenseAcc) {
            return alert('請填寫完整總金額、扣款帳戶與自身支出科目');
        }
        let othersTotal = splitBillForm.members.reduce((s, m) => s + (Number(m.amount)||0), 0);
        let myTotal = splitBillForm.myShare;
        
        let extractedTags = [];
        let tagMatches = (newTx.desc || '').match(/#\S+/g);
        if (tagMatches) extractedTags = tagMatches.map(t => t.substring(1));

        let txObj = {
            id: 'tx_split_' + Date.now(),
            date: new Date().toISOString().split('T')[0],
            scope: 'personal',
            desc: (newTx.desc ? (newTx.desc + ' ') : '') + 'AA分帳: ' + splitBillForm.members.map(m => m.name).join('、'),
            tags: extractedTags,
            debits: [],
            credits: [{ account_id: splitBillForm.payerAcc, amount: splitBillForm.totalAmount }]
        };

        if (myTotal > 0) txObj.debits.push({ account_id: splitBillForm.expenseAcc, amount: myTotal });
        if (othersTotal > 0) txObj.debits.push({ account_id: '1104', amount: othersTotal });

        data.transactions.unshift(txObj);
        showSplitModal.value = false;
        splitBillForm.totalAmount = null; splitBillForm.expenseAcc = '';
        splitBillForm.members = [{ name: '朋友A', amount: null }];
        autoBackup(); updateCharts(); refreshIcons();
        alert('✅ 拆帳紀錄已成功寫入帳本');
    };

    const submitProjectBudget = () => {
        if (!projectBudgetForm.name || !projectBudgetForm.tag || !projectBudgetForm.limit || !projectBudgetForm.startDate || !projectBudgetForm.endDate) {
            return alert('請填妥所有專案預算欄位');
        }
        let tagClean = projectBudgetForm.tag.replace('#', '');
        data.project_budgets.push({
            id: 'proj_' + Date.now(), name: projectBudgetForm.name, tag: tagClean, limit: projectBudgetForm.limit,
            startDate: projectBudgetForm.startDate, endDate: projectBudgetForm.endDate
        });
        showProjectBudgetModal.value = false;
        projectBudgetForm.name = ''; projectBudgetForm.tag = ''; projectBudgetForm.limit = null; projectBudgetForm.startDate = ''; projectBudgetForm.endDate = '';
        autoBackup();
    };

    const deleteProjectBudget = (id) => {
        if (confirm('確定刪除此專案預算？')) {
            data.project_budgets = data.project_budgets.filter(p => p && p.id !== id);
            autoBackup();
        }
    };

    const projectBudgetStats = computed(() => {
        return (data.project_budgets || []).map(proj => {
            if (!proj) return null;
            let spent = 0;
            (data.transactions || []).forEach(tx => {
                if (tx && tx.date >= proj.startDate && tx.date <= proj.endDate && !tx.is_refunded && !tx.is_refund) {
                    let hasTag = (tx.tags && tx.tags.includes(proj.tag)) || (tx.desc && tx.desc.includes('#' + proj.tag));
                    if (hasTag) {
                        let isExp = false; let amt = 0;
                        (tx.debits || []).forEach(d => {
                            let a = (data.accounts || []).find(ac => ac && ac.id === d.account_id);
                            if (a && a.type === 'Expense') { isExp = true; amt += Number(d.amount)||0; }
                        });
                        if (isExp) spent += amt;
                    }
                }
            });
            return {
                ...proj, spent, remaining: proj.limit - spent,
                pct: Math.min(Math.round((spent / proj.limit) * 100), 100)
            };
        }).filter(Boolean);
    });

    // ------------------------------------------------------------------------
    // 事件處理與核心邏輯
    // ------------------------------------------------------------------------
    const onSymbolInput = (target) => {
        let val = target === 'tx' ? newTx.symbol : initStock.symbol;
        if (!val) return;
        let symbol = val.replace('.TW', '').toUpperCase();
        let matchName = '';
        if (typeof STOCK_DICTIONARY !== 'undefined' && STOCK_DICTIONARY[symbol]) {
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

    const onInvestSelectedSymbolChange = () => {
        if (newTx.investSelectedSymbol === 'manual' || !newTx.investSelectedSymbol) {
            newTx.symbol = ''; newTx.stockName = '';
        } else {
            let inv = (data.investments || []).find(i => i && i.symbol === newTx.investSelectedSymbol);
            if (inv) {
                newTx.symbol = inv.symbol;
                newTx.stockName = (inv.name || '').replace(/^\[.*?\]\s*/, '');
            }
        }
    };
    const onDividendSymbolChange = () => {
      if (newTx.investDividendSymbol === 'manual' || !newTx.investDividendSymbol) {
         newTx.stockName = '';
      } else {
         let inv = (data.investments || []).find(i => i && i.symbol === newTx.investDividendSymbol);
         if (inv) newTx.stockName = (inv.name || '').replace(/^\[.*?\]\s*/, '');
      }
    };

    const calculateInitStockCost = (changedField) => {
        let s = Number(initStock.shares) || 0;
        if (initStock.unitType === 'lot') s *= 1000;
        let p = Number(initStock.price) || 0;
        let c = Number(initStock.cost) || 0;
        if (changedField === 'price' || changedField === 'shares' || changedField === 'unitType') {
            initStock.cost = Math.round(s * p) || null;
        } else if (changedField === 'cost') {
            if (s > 0) initStock.price = Number((c / s).toFixed(2));
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
       data.project_budgets = []; data.custom_tags = []; 
    };

    const migrateLegacyData = () => {
       if (!data.installments) data.installments = [];
       if (!data.savings_goals) data.savings_goals = [];
       if (!data.project_budgets) data.project_budgets = [];
       if (!data.custom_tags) data.custom_tags = [];
       if (settings.billingStartDay === undefined) settings.billingStartDay = 1;

       // 舊分類與帳戶 Emoji 升級
       (data.accounts || []).forEach(acc => {
           if (acc && !acc.icon) {
               let matchedBrand = Object.keys(typeof BANK_BRAND_COLORS !== 'undefined' ? BANK_BRAND_COLORS : {}).find(brand => acc.name.includes(brand));
               if (matchedBrand) acc.icon = BANK_BRAND_COLORS[matchedBrand].icon || '🏦';
               else acc.icon = typeof EMOJI_DICTIONARY !== 'undefined' ? (EMOJI_DICTIONARY[acc.name] || EMOJI_DICTIONARY[acc.category] || '🏷️') : '🏷️';
           }
       });
    };

    const activeBookName = computed(() => { let b = settings.booksIndex.find(x => x && x.id === currentBookId.value); return b ? b.name : '智慧帳本'; });
    const availableBooks = computed(() => settings.booksIndex || []);

    const assetAccounts = computed(() => { return (data.accounts || []).filter(a => a && a.type === 'Asset' && !a.is_contra && a.id !== '1103' && a.id !== '1201' && a.id !== '1104' && !a.is_hidden); });
    const paymentAccounts = computed(() => { return (data.accounts || []).filter(a => a && ((a.type === 'Asset' && !a.is_contra && a.id !== '1103' && a.id !== '1201' && a.id !== '1104') || a.type === 'Liability') && !(a.id || '').startsWith('loan_liab_') && !a.is_hidden); });
    const liabilityAccounts = computed(() => { return (data.accounts || []).filter(a => a && a.type === 'Liability' && !(a.id || '').startsWith('loan_liab_') && !a.is_hidden); });
    
    const activeInstallments = computed(() => (data.installments || []).filter(i => i && i.paid_periods < i.periods));
    const getSubAccounts = (type, mainCat, incHidden = false) => (data.accounts || []).filter(a => a && a.type === type && (!mainCat || a.category === mainCat) && (incHidden || !a.is_hidden));
    
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
            id: a.id, name: a.name, type: a.type, category: a.category, currency: a.currency||'TWD', is_hidden: a.is_hidden, icon: a.icon || '🏷️',
            balance: calculateBalance(a.id, 'all'), baseBalance: getBaseBalance(a.id, calculateBalance(a.id, 'all')) 
        })); 
    };
    
    const paymentAccountsWithBalance = computed(() => accountsWithBalance(paymentAccounts.value));
    const assetAccountsWithBalance = computed(() => accountsWithBalance(assetAccounts.value));
    const liquidAccountsWithBalance = computed(() => accountsWithBalance(assetAccounts.value)); 
    const liabilityAccountsWithBalance = computed(() => accountsWithBalance(liabilityAccounts.value)); 


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
    
    // --- 套用非自然月計費週期的計算 ---
    const activeBillingPeriod = computed(() => {
        return typeof getCurrentBillingPeriod === 'function' ? getCurrentBillingPeriod(dashboardMonth.value + '-01', settings.billingStartDay || 1) : { startDate: dashboardMonth.value + '-01', endDate: dashboardMonth.value + '-31' };
    });

    const currentMonthIncome = computed(() => {
        let sum = 0; let p = activeBillingPeriod.value;
        (data.transactions || []).forEach(tx => {
            if(tx && tx.date >= p.startDate && tx.date <= p.endDate && !tx.is_refunded && !tx.is_refund) {
                if (dashboardScope.value !== 'all' && tx.scope !== dashboardScope.value) return;
                (tx.credits || []).forEach(c => {
                    let a = data.accounts.find(ac => ac && ac.id === c.account_id);
                    if(a && a.type === 'Income') sum += Number(c.amount) || 0;
                });
            }
        });
        return sum;
    });

    const currentMonthExpense = computed(() => {
        let sum = 0; let p = activeBillingPeriod.value;
        (data.transactions || []).forEach(tx => {
            if(tx && tx.date >= p.startDate && tx.date <= p.endDate && !tx.is_refunded && !tx.is_refund) {
                if (dashboardScope.value !== 'all' && tx.scope !== dashboardScope.value) return;
                (tx.debits || []).forEach(d => {
                    let a = data.accounts.find(ac => ac && ac.id === d.account_id);
                    if(a && a.type === 'Expense') sum += Number(d.amount) || 0;
                });
            }
        });
        return sum;
    });

    const dashboardBudgets = computed(() => {
      let res = {}; let p = activeBillingPeriod.value; let expObj = {};
      (data.transactions || []).forEach(tx => {
        if (tx && !tx.is_refunded && !tx.is_refund && tx.date >= p.startDate && tx.date <= p.endDate) {
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
        let d = new Date(); let p = activeBillingPeriod.value;
        let endD = new Date(p.endDate);
        let daysLeft = Math.max(Math.ceil((endD - d) / (1000 * 60 * 60 * 24)), 1); 
        return { totalLimit: limit, totalSpent: spent, totalRemaining: remaining, dailyRemaining: remaining > 0 ? Math.floor(remaining / daysLeft) : 0, daysLeft };
    });

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
        let matchTags = (tx.tags || []).join(' ').toLowerCase().includes(kw);
        let matchKw = !kw || desc.includes(kw) || accD.includes(kw) || accC.includes(kw) || matchTags;
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

    const getAccName = (id) => { let a = (data.accounts || []).find(ac => ac && ac.id === id); return a ? (a.icon ? `${a.icon} ${a.name}` : a.name) : (id || '未知'); };
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
      if(desc.includes('買進')||desc.includes('賣出')||desc.includes('配息')||desc.includes('建倉')) return 'bg-orange-500';
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
      if (newTx.desc && !newTx.desc.includes(`#${tag}`)) newTx.desc += ` #${tag}`;
      else if (!newTx.desc) newTx.desc = `#${tag}`;
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

    const bsData = computed(() => {
        if (typeof calculateBalanceSheet !== 'function') return null;
        return calculateBalanceSheet(data.accounts, data.transactions, data.investments, data.currencyRates, reportEndDate.value);
    });
    
    const isData = computed(() => {
        if (typeof calculateIncomeStatement !== 'function') return null;
        return calculateIncomeStatement(data.accounts, data.transactions, reportStartDate.value, reportEndDate.value);
    });
    
    const cfData = computed(() => {
        if (typeof calculateCashFlow !== 'function') return null;
        return calculateCashFlow(data.accounts, data.transactions, reportStartDate.value, reportEndDate.value);
    });

    // ------------------------------------------------------------------------
    // 8. 多帳本與帳戶核心操作
    // ------------------------------------------------------------------------
    const switchBook = (targetId) => {
      let newId = currentBookId.value;
      if (targetId && targetId.target && targetId.target.value) {
        newId = targetId.target.value;
      } else if (typeof targetId === 'string') {
        newId = targetId;
      }

      let oldId = settings.currentBookId || 'default';
      localStorage.setItem('ledger_backup_' + oldId, JSON.stringify(data)); 
      
      currentBookId.value = newId;
      settings.currentBookId = newId;
      saveSettings(false);
      
      resetData();

      const newBackup = localStorage.getItem('ledger_backup_' + newId);
      if (newBackup) { 
         Object.assign(data, JSON.parse(newBackup));
      } else { 
         data.version = "6.3.1"; 
      }
      
      if (typeof setupDefaultData === 'function') setupDefaultData(data, typeof DEFAULT_CATEGORIES !== 'undefined' ? DEFAULT_CATEGORIES : {});
      migrateLegacyData();
      runAutoTasks();
      setHistoryToCurrentMonth();

      isDrawerOpen.value = false;
      if (expenseChartInstance.value) { expenseChartInstance.value.destroy(); expenseChartInstance.value = null; }
      if (assetChartInstance.value) { assetChartInstance.value.destroy(); assetChartInstance.value = null; }
      if (netWorthChartInstance.value) { netWorthChartInstance.value.destroy(); netWorthChartInstance.value = null; }
      if (['dashboard', 'reports', 'budget'].includes(activeTab.value)) updateCharts();
      
      alert(`已成功切換至: ${activeBookName.value}`);
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
    
    const deleteBook = (targetId) => {
        if (settings.booksIndex.length <= 1) {
            return alert("系統至少須保留一個帳本，無法刪除！");
        }
        if (!confirm("確定要永久刪除此帳本及其所有本機儲存紀錄？此操作無法復原！")) {
            return;
        }
        localStorage.removeItem('ledger_backup_' + targetId);
        settings.booksIndex = settings.booksIndex.filter(b => b && b.id !== targetId);
        if (targetId === currentBookId.value) {
            currentBookId.value = settings.booksIndex[0].id;
            switchBook(currentBookId.value);
        } else {
            saveSettings(false);
        }
        alert('✅ 帳本刪除成功');
    };

    const submitNewAssetAccount = () => {
      if(!newAssetAcc.name) return;
      let finalType = newAssetAcc.name.includes('信用卡') || newAssetAcc.name.includes('欠款') || newAssetAcc.name.includes('貸款') ? 'Liability' : (newAssetAcc.type || 'Asset');
      const newId = (finalType === 'Liability' ? 'liab_' : 'asset_') + Date.now();
      data.accounts.push({ id: newId, name: newAssetAcc.name, type: finalType, currency: newAssetAcc.currency, is_hidden: false });
      
      if(newAssetAcc.initBalance && newAssetAcc.initBalance > 0) {
        if (finalType === 'Asset') {
            data.transactions.unshift({ id: 'tx_init_' + Date.now(), date: new Date().toISOString().split('T')[0], scope: 'personal', desc: `期初餘額: ${newAssetAcc.name}`, debits: [{ account_id: newId, amount: newAssetAcc.initBalance }], credits: [{ account_id: '3101', amount: newAssetAcc.initBalance }] });
        } else {
            data.transactions.unshift({ id: 'tx_init_' + Date.now(), date: new Date().toISOString().split('T')[0], scope: 'personal', desc: `期初欠款: ${newAssetAcc.name}`, debits: [{ account_id: '3101', amount: newAssetAcc.initBalance }], credits: [{ account_id: newId, amount: newAssetAcc.initBalance }] });
        }
      }
      newAssetAcc.name = ''; newAssetAcc.type = 'Asset'; newAssetAcc.initBalance = null; newAssetAcc.currency = 'TWD';
      showAddAccountModal.value = false; autoBackup(); updateCharts(); refreshIcons(); alert('✅ 帳戶建立成功！');
    };

    const submitTransaction = () => {
      txError.value = '';
      let extractedTags = [];
      let tagMatches = (newTx.desc || '').match(/#\S+/g);
      if (tagMatches) extractedTags = tagMatches.map(t => t.substring(1));

      let txObj = { id: 'tx_' + Date.now(), date: newTx.date, scope: newTx.scope, desc: newTx.desc || '無摘要', tags: extractedTags, debits: [], credits: [] };
      
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
           let newFaId = 'fa_'+Date.now();
           data.fixed_assets.push({ id: newFaId, name: newTx.faName||newTx.desc, purchase_date: newTx.date, original_cost: newTx.amount, monthly_depreciation: monthlyDep, asset_account_id: '1201', accumulated_dep_account_id: '1201-DEP', expense_account_id: '5102', last_depreciation_date: newTx.date, is_disposed: false });
           txObj.debits[0].account_id = '1201';
           txObj.desc = `購入固定資產: ${newTx.faName||newTx.desc}`;
           txObj.fa_init_id = newFaId;
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
             txObj.invest_action = 'buy'; txObj.invest_symbol = newTx.symbol; txObj.invest_shares = newTx.shares; txObj.invest_cost_value = totalAmt;
             if (inv) { inv.shares += newTx.shares; inv.total_cost += totalAmt; } 
             else { data.investments.push({ id: 'inv_'+Date.now(), symbol: newTx.symbol, name: newTx.stockName || newTx.symbol, shares: newTx.shares, total_cost: totalAmt, currency: 'TWD' }); }
           } else {
             if (!inv || inv.shares < newTx.shares) return txError.value = '賣出股數不可超過庫存';
             let costProp = (inv.shares > 0) ? Math.round(inv.total_cost * (newTx.shares / inv.shares)) : 0;
             let gain = totalAmt - costProp;
             txObj.desc = `賣出 ${newTx.stockName || newTx.symbol} ${newTx.shares}股`;
             txObj.invest_action = 'sell'; txObj.invest_symbol = newTx.symbol; txObj.invest_shares = newTx.shares; txObj.invest_cost_value = costProp;
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

      data.transactions.unshift(txObj);
      newTx.amount = null; newTx.desc = ''; newTx.shares = null; newTx.price = null; newTx.fee = null; newTx.tax = null; newTx.loanId = ''; newTx.manualSymbol = ''; newTx.manualName = '';
      autoBackup(); updateCharts(); refreshIcons();
      alert('✅ 記帳成功！'); 
    };

    const openEditModal = (tx) => {
        if(!tx || tx.is_refunded || tx.is_refund || tx.is_reimbursed || tx.auto_generated) return alert("特殊狀態明細無法直接編輯。");
        editingTx.id = tx.id; editingTx.date = tx.date; editingTx.desc = getTxDesc(tx); editingTx.amount = getDebitAmount(tx); editingTx.scope = tx.scope || 'personal';
        editingTx.debitAcc = (tx.debits && tx.debits[0]) ? tx.debits[0].account_id : ''; editingTx.creditAcc = (tx.credits && tx.credits[0]) ? tx.credits[0].account_id : '';
        editTxModal.value = true;
    };

    const saveEditTx = () => {
        let tx = data.transactions.find(t => t && t.id === editingTx.id); if(!tx) return;
        tx.date = editingTx.date; tx.desc = editingTx.desc; tx.scope = editingTx.scope;
        if(tx.debits && tx.debits.length === 1 && editingTx.debitAcc) { tx.debits[0].amount = editingTx.amount; tx.debits[0].account_id = editingTx.debitAcc; }
        if(tx.credits && tx.credits.length === 1 && editingTx.creditAcc) { tx.credits[0].amount = editingTx.amount; tx.credits[0].account_id = editingTx.creditAcc; }
        editTxModal.value = false; autoBackup(); updateCharts(); alert('✅ 明細修改成功');
    };

    const viewInstallmentDetails = (tx) => { if(tx && tx.inst_id) { let inst = data.installments.find(i => i && i.id === tx.inst_id); if(inst) { selectedInstallment.value = inst; showInstallmentModal.value = true; } } };

    const openRefundModal = (tx) => {
      if (!tx) return;
      activeRefundTx.value = tx;
      const originalAmt = getDebitAmount(tx); const refundedAmt = Number(tx.refunded_amount) || 0;
      refundData.maxAmount = originalAmt - refundedAmt; refundData.amount = refundData.maxAmount; refundData.account = (tx.credits && tx.credits[0]) ? tx.credits[0].account_id : '';
      showRefundModal.value = true;
    };
    
    const closeRefundModal = () => { showRefundModal.value = false; activeRefundTx.value = null; };

    const submitRefund = () => {
      if (!activeRefundTx.value) return;
      if (refundData.amount <= 0 || refundData.amount > refundData.maxAmount) return alert("輸入金額無效或大於可退餘額");
      if (!refundData.account) return alert("請選擇退款入帳帳戶");
      let expAcc = (activeRefundTx.value.debits && activeRefundTx.value.debits[0]) ? activeRefundTx.value.debits[0].account_id : null;
      if(!expAcc) return alert("無法解析原始支出科目");

      let refundTx = { id: 'tx_refund_' + Date.now(), date: new Date().toISOString().split('T')[0], scope: activeRefundTx.value.scope, desc: `[退款沖銷] ${activeRefundTx.value.desc || activeRefundTx.value.description || ''}`, debits: [{ account_id: refundData.account, amount: refundData.amount }], credits: [{ account_id: expAcc, amount: refundData.amount }], is_refund: true, ref_tx_id: activeRefundTx.value.id };
      data.transactions.unshift(refundTx);
      activeRefundTx.value.refunded_amount = (Number(activeRefundTx.value.refunded_amount) || 0) + refundData.amount;
      if (activeRefundTx.value.refunded_amount >= getDebitAmount(activeRefundTx.value)) activeRefundTx.value.is_refunded = true;
      closeRefundModal(); autoBackup(); updateCharts(); alert('✅ 退款沖銷成功！');
    };

    const openReimburseModal = (tx) => { activeReimburseTx.value = tx; reimburseData.account = ''; showReimburseModal.value = true; };
    const closeReimburseModal = () => { showReimburseModal.value = false; activeReimburseTx.value = null; };
    const submitReimburse = () => { if (!activeReimburseTx.value || !reimburseData.account) return alert('請選擇入帳帳戶'); reimburseTx(activeReimburseTx.value, reimburseData.account); closeReimburseModal(); };
    const reimburseTx = (tx, toAccountId) => {
         if (!tx || !toAccountId) return;
         let origAmount = getDebitAmount(tx);
         data.transactions.unshift({ id: 'tx_reimb_' + Date.now(), date: new Date().toISOString().split('T')[0], scope: tx.scope, desc: `[代墊報銷] ${(tx.desc || tx.description || '')}`, debits: [{ account_id: toAccountId, amount: origAmount }], credits: [{ account_id: '1104', amount: origAmount }], ref_tx_id: tx.id });
         tx.is_reimbursed = true; autoBackup(); updateCharts(); alert('✅ 報銷沖銷成功！');
    };

    const deleteTransaction = (id) => {
      if(!confirm('確定刪除？此操作將連動還原相關庫存或排程狀態（若有）。')) return;
      let idx = data.transactions.findIndex(t => t && t.id === id); if (idx === -1) return;
      let tx = data.transactions[idx];
      if (tx && tx.auto_generated && tx.asset_id) { let a = data.fixed_assets.find(fa => fa && fa.id === tx.asset_id); if(a) a.last_depreciation_date = null; }
      if (tx && tx.auto_generated && tx.inst_id) { let inst = data.installments.find(i => i && i.id === tx.inst_id); if(inst) { inst.paid_periods = Math.max(0, inst.paid_periods - 1); let p = inst.next_month.split('-'); let y = Number(p[0]); let m = Number(p[1]) - 1; if(m < 1) { m = 12; y--; } inst.next_month = `${y}-${String(m).padStart(2,'0')}`; } }
      if (tx && tx.is_refund && tx.ref_tx_id) { let orig = data.transactions.find(t => t && t.id === tx.ref_tx_id); if (orig) { let refundAmt = getDebitAmount(tx); orig.refunded_amount = Math.max(0, (Number(orig.refunded_amount) || 0) - refundAmt); if (orig.refunded_amount < getDebitAmount(orig)) orig.is_refunded = false; } }
      if (tx && tx.id.startsWith('tx_reimb_') && tx.ref_tx_id) { let orig = data.transactions.find(t => t && t.id === tx.ref_tx_id); if (orig) orig.is_reimbursed = false; }
      if (tx && tx.invest_symbol && tx.invest_shares) { let inv = data.investments.find(i => i && i.symbol === tx.invest_symbol); if (inv) { let s = Number(tx.invest_shares) || 0; let c = Number(tx.invest_cost_value) || 0; if (tx.invest_action === 'buy' || tx.invest_action === 'init') { inv.shares = Math.max(0, inv.shares - s); inv.total_cost = Math.max(0, inv.total_cost - c); } else if (tx.invest_action === 'sell') { inv.shares += s; inv.total_cost += c; } if(inv.shares > 0) inv.last_price = inv.total_cost / inv.shares; else inv.total_cost = 0; } }
      if (tx && tx.loan_init_id) { data.loans = data.loans.filter(l => l && l.id !== tx.loan_init_id); if(tx.loan_account_id) data.accounts = data.accounts.filter(a => a && a.id !== tx.loan_account_id); }
      if (tx && tx.fa_init_id) { data.fixed_assets = data.fixed_assets.filter(fa => fa && fa.id !== tx.fa_init_id); }
      data.transactions.splice(idx, 1); autoBackup(); updateCharts();
    };

const submitInitialStock = () => {
        let s = Number(initStock.shares) || 0;
        if (initStock.unitType === 'lot') s *= 1000;

        if (!initStock.symbol || s <= 0 || !(initStock.cost > 0 || initStock.price > 0)) {
            return alert("請填寫完整股票代號、股數，以及單價或總成本");
        }

        let p = Number(initStock.price) || 0;
        let c = Number(initStock.cost) || 0;

        if (c <= 0 && p > 0) c = Math.round(s * p);
        if (p <= 0 && c > 0) p = Number((c / s).toFixed(2));

        let existingInv = data.investments.find(i => i && i.symbol === initStock.symbol);
        if (existingInv) {
            existingInv.shares += s;
            existingInv.total_cost += c;
            if (existingInv.shares > 0) existingInv.last_price = existingInv.total_cost / existingInv.shares;
        } else {
            data.investments.push({ 
                id: 'inv_' + Date.now(), 
                symbol: initStock.symbol, 
                name: initStock.name || initStock.symbol, 
                shares: s, 
                total_cost: c, 
                last_price: p || (c / s),
                currency: 'TWD' 
            });
        }

        data.transactions.unshift({ 
            id: 'tx_init_' + Date.now(), 
            date: new Date().toISOString().split('T')[0], 
            scope: 'personal', 
            desc: `期初建倉 ${initStock.name || initStock.symbol} ${s}股`, 
            debits: [{ account_id: '1103', amount: c }], 
            credits: [{ account_id: '3101', amount: c }],
            invest_action: 'init',
            invest_symbol: initStock.symbol,
            invest_shares: s,
            invest_cost_value: c
        });

        showInitialStockModal.value = false; 
        initStock.symbol = ''; 
        initStock.name = ''; 
        initStock.shares = null; 
        initStock.price = null;
        initStock.cost = null;
        initStock.unitType = 'share';
        
        autoBackup(); 
        updateCharts();
    };

    const submitFixedAsset = () => {
      if(!initFA.name || !initFA.cost || !initFA.months) return alert("請填寫完整");
      let monthlyDep = Math.round(initFA.cost / initFA.months);
      let newFaId = 'fa_'+Date.now();
      data.fixed_assets.push({ id: newFaId, name: initFA.name, purchase_date: initFA.date, original_cost: initFA.cost, monthly_depreciation: monthlyDep, asset_account_id: '1201', accumulated_dep_account_id: '1201-DEP', expense_account_id: '5102', last_depreciation_date: null, is_disposed: false });
      data.transactions.unshift({ id: 'tx_fa_'+Date.now(), date: initFA.date, scope: initFA.scope, desc: `購入固定資產 ${initFA.name}`, debits: [{ account_id: '1201', amount: initFA.cost }], credits: [{ account_id: '3101', amount: initFA.cost }], fa_init_id: newFaId });
      showAddFixedAssetModal.value = false; initFA.name = ''; initFA.cost = null; initFA.months = 60; initFA.scope = 'personal'; autoBackup(); updateCharts(); alert('✅ 固定資產登錄成功！');
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
      data.transactions.unshift(txObj); fa.is_disposed = true; showDisposalModal.value = false; autoBackup(); updateCharts(); alert('✅ 處分完成！');
    };

    const submitAddLoan = () => {
      if(!initLoan.name || !initLoan.principal || !initLoan.rate || !initLoan.payment) return alert("請填妥所有貸款欄位");
      let accId = 'loan_liab_' + Date.now(); let loanId = 'loan_' + Date.now();
      data.accounts.push({ id: accId, name: initLoan.name, type: 'Liability', currency: 'TWD', is_hidden: false });
      data.loans.push({ id: loanId, name: initLoan.name, liability_acc_id: accId, interest_rate: initLoan.rate, monthly_payment: initLoan.payment });
      data.transactions.unshift({ id: 'tx_loan_init_'+Date.now(), date: new Date().toISOString().split('T')[0], scope: 'personal', desc: `期初貸款本金: ${initLoan.name}`, debits: [{ account_id: '3101', amount: initLoan.principal }], credits: [{ account_id: accId, amount: initLoan.principal }], loan_init_id: loanId, loan_account_id: accId });
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
          data.transactions.unshift({ id: 'tx_dep_'+Date.now()+Math.random(), date: new Date().toISOString().split('T')[0], desc: `${fa.name} 自動折舊`, scope: 'family', auto_generated: true, asset_id: fa.id, debits: [{ account_id: fa.expense_account_id, amount: fa.monthly_depreciation }], credits: [{ account_id: fa.accumulated_dep_account_id, amount: fa.monthly_depreciation }] });
          fa.last_depreciation_date = new Date().toISOString().split('T')[0];
        }
      });
      (data.installments || []).forEach(inst => {
        if(!inst || !inst.next_month) return;
        while (inst.paid_periods < inst.periods && inst.next_month <= curM) {
          let day = inst.date_day || '01'; let amt = (inst.paid_periods === 0 && inst.first_amount) ? inst.first_amount : inst.amount_per_period;
          data.transactions.unshift({ id: 'tx_inst_'+Date.now()+Math.random(), date: `${inst.next_month}-${day}`, desc: `${inst.desc} (${inst.paid_periods+1}/${inst.periods}期)`, scope: inst.scope, auto_generated: true, inst_id: inst.id, debits: [{ account_id: inst.debit_acc, amount: amt }], credits: [{ account_id: inst.credit_acc, amount: amt }] });
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
           data.transactions.unshift(txObj); rec.last_exec_month = curM;
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
                resetData(); Object.assign(data, cloudData);
                if (typeof setupDefaultData === 'function') setupDefaultData(data, typeof DEFAULT_CATEGORIES !== 'undefined' ? DEFAULT_CATEGORIES : {});
                runAutoTasks(); localStorage.setItem('ledger_backup_' + currentBookId.value, JSON.stringify(data));
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
      if (typeof setupDefaultData === 'function') setupDefaultData(data, typeof DEFAULT_CATEGORIES !== 'undefined' ? DEFAULT_CATEGORIES : {});
      if (settings.googleToken && settings.fileId && typeof gapi !== 'undefined') {
         try { await fetch(`https://www.googleapis.com/upload/drive/v3/files/${settings.fileId}?uploadType=media`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${settings.googleToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(data) }); } catch(e) {}
      }
      localStorage.removeItem('ledger_backup_' + currentBookId.value); window.location.reload(true);
    };

    // ------------------------------------------------------------------------
    // 10. 報價與匯率 API (支援多重線路備用)
    // ------------------------------------------------------------------------
    const updateStockPrices = async () => {
        let updatedCount = 0;
        let twdInvestmentsCount = data.investments.filter(i => i && i.currency !== 'USD').length;

        for (let inv of data.investments) {
            if (!inv || inv.currency === 'USD') continue;
            let sym = (inv.symbol || '').replace('.TW', '');
            if (!sym) continue;

            let price = null;
            try {
                let res1 = await fetchWithTimeout(`https://corsproxy.io/?url=https://query1.finance.yahoo.com/v8/finance/chart/${sym}.TW`, {}, 3000);
                if (res1.ok) {
                    let d1 = await res1.json();
                    if (d1.chart && d1.chart.result && d1.chart.result.length > 0 && d1.chart.result[0].meta && d1.chart.result[0].meta.regularMarketPrice) {
                        let p1 = d1.chart.result[0].meta.regularMarketPrice;
                        if (p1 > 0 && p1 < 100000) price = p1;
                    }
                }
            } catch(e) { console.warn(`Route 1 failed for ${sym}`); }

            if (!price) {
                const fetchTwseApi = async (market) => {
                    let res = await fetchWithTimeout(`https://api.allorigins.win/raw?url=https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=${market}_${sym}.tw`, {}, 3000);
                    if (res.ok) {
                        let d = await res.json();
                        if (d.msgArray && d.msgArray.length > 0) {
                            let parsedPrice = parseFloat(d.msgArray[0].z !== '-' ? d.msgArray[0].z : d.msgArray[0].y);
                            if (parsedPrice > 0 && parsedPrice < 100000) return parsedPrice;
                        }
                    }
                    return null;
                };

                try {
                    price = await fetchTwseApi('tse');
                    if (!price) price = await fetchTwseApi('otc');
                } catch(e) { console.warn(`Route 2 failed for ${sym}`); }
            }

            if (price) {
                inv.last_price = price;
                updatedCount++;
            }
        }

        if (updatedCount > 0 && updatedCount === twdInvestmentsCount) {
            alert('股價自動更新完成！'); 
            autoBackup(); 
            updateCharts();
        } else if (twdInvestmentsCount > 0) {
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
      if(settings.billingStartDay === undefined) settings.billingStartDay = 1;
      currentBookId.value = settings.currentBookId || 'default';
      if(!settings.pinEnabled) isUnlocked.value = true; 
    };
    
    const unlockApp = () => { if (pinInput.value === settings.pinCode) { isUnlocked.value = true; initData(); } else { pinError.value = "PIN錯誤"; } };
    const saveSettings = (showAlert = true) => { settings.currentBookId = currentBookId.value; localStorage.setItem('ledger_settings', JSON.stringify(settings)); if (showAlert) alert('設定已儲存'); if (settings.googleToken && settings.googleClientId) initGoogleAuth(); };
    const exportData = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'})); a.download = `Ledger_${currentBookId.value}_${new Date().toISOString().split('T')[0]}.json`; a.click(); };
    const importData = (e) => { const f = e.target.files[0]; if(!f) return; const r = new FileReader(); r.onload = (ev) => { try { const p = JSON.parse(ev.target.result); if (p && typeof p === 'object') { resetData(); Object.assign(data, p); if (typeof setupDefaultData === 'function') setupDefaultData(data, typeof DEFAULT_CATEGORIES !== 'undefined' ? DEFAULT_CATEGORIES : {}); autoBackup(); updateCharts(); alert("成功覆蓋匯入"); } } catch(err) { alert("檔案錯誤"); } }; r.readAsText(f); };

    const updateCharts = () => {
      if (!['dashboard', 'budget', 'reports'].includes(activeTab.value)) return;
      nextTick(() => {
        try {
            if (typeof renderExpenseChart === 'function') {
                let p = activeBillingPeriod.value;
                let filteredTxs = data.transactions.filter(tx => tx && tx.date >= p.startDate && tx.date <= p.endDate);
                expenseChartInstance.value = renderExpenseChart(expenseChartInstance.value, 'expenseChart', filteredTxs, data.accounts, dashboardScope.value, dashboardMonth.value);
            }
            
            let scope = dashboardScope.value;
            let cTot=0, sTot=0;
            (data.accounts || []).forEach(a => { if(a && a.type==='Asset' && !a.is_contra && a.id!=='1103' && a.id!=='1201' && a.id!=='1104') cTot += getBaseBalance(a.id, calculateBalance(a.id, scope)); });
            (data.investments || []).forEach(inv => { if(inv) sTot += (Number(inv.shares)||0) * (Number(inv.last_price)||0) * (data.currencyRates[inv.currency||'TWD']||1); });
            let fTot = calculateBalance('1201', scope) + calculateBalance('1201-DEP', scope);
            
            if (typeof renderAssetChart === 'function') {
                assetChartInstance.value = renderAssetChart(assetChartInstance.value, 'assetChart', cTot, sTot, fTot);
            }

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
            if (typeof renderNetWorthChart === 'function') {
                netWorthChartInstance.value = renderNetWorthChart(netWorthChartInstance.value, 'netWorthChart', histLabels, histData);
            }
        } catch (err) { console.warn("Chart Render Error:", err); }
      });
    };

    const refreshIcons = () => { nextTick(() => { try { if (window.lucide) lucide.createIcons(); } catch(e){} }); };

    watch(activeTab, () => { if(['dashboard', 'reports', 'budget'].includes(activeTab.value)) updateCharts(); refreshIcons(); });
    watch(dashboardScope, () => updateCharts());
    watch(() => settings.billingStartDay, () => { autoBackup(false); updateCharts(); });

    const initData = async () => {
      try { const backup = localStorage.getItem('ledger_backup_' + currentBookId.value); if (backup) { Object.assign(data, JSON.parse(backup)); } } catch(e) {}
      if (typeof setupDefaultData === 'function') setupDefaultData(data, typeof DEFAULT_CATEGORIES !== 'undefined' ? DEFAULT_CATEGORIES : {}); 
      setHistoryToCurrentMonth(); await fetchExchangeRate();
      isAppReady.value = true;
      let loadingScreen = document.getElementById('native-loading'); if(loadingScreen) loadingScreen.style.display = 'none';
      if(window.google) initGoogleAuth(); else setTimeout(initGoogleAuth, 2000);
      migrateLegacyData();
      runAutoTasks(); if (['dashboard', 'reports', 'budget'].includes(activeTab.value)) updateCharts(); refreshIcons();
    };

    onMounted(() => {
      loadSettings();
      if(isUnlocked.value) { initData(); } 
      else { isAppReady.value = true; let loadingScreen = document.getElementById('native-loading'); if(loadingScreen) loadingScreen.style.display = 'none'; refreshIcons(); }
    });

    const safeFormatNumber = typeof formatNumber === 'function' ? formatNumber : (n => Math.round(n).toLocaleString());

    // --- 嚴格確保所有新增狀態與方法 100% 匯出 ---
    return { 
      isAppReady, activeTab, isDrawerOpen, entryMode, dashboardScope, isUnlocked, pinInput, pinError, 
      syncStatus, isSyncing, showAmounts, expenseMonth, dashboardMonth, fxRate,
      isCalcOpen, calcExpression, isListening,
      reportView, reportPeriod, reportStartDate, reportEndDate,
      showAddAccountModal, showInitialStockModal, showAddFixedAssetModal, showDisposalModal, showAddLoanModal, showRateModal, 
      showResetModal, showNewBookModal, showAddGoalModal, showUpdateGoalModal, showManualStockModal, showRefundModal, showReimburseModal,
      editTxModal, showInstallmentModal, showSplitModal, showProjectBudgetModal,
      activeRefundTx, refundData, activeReimburseTx, reimburseData, hasExpensesThisMonth, settings, currentBookId, newBookName, data, newTx, txError, 
      historyFilter, settingCategoryMode, newPreset, newMainCat, newSubCat, newAssetAcc, initStock, initFA, 
      disposalAsset, disposalForm, initLoan, activeLoan, rateData, newRecurring, initGoal, activeGoal, updateGoalData,
      editingTx, selectedInstallment, splitBillForm, projectBudgetForm,
      calcAppend, calcClear, calcBackspace, calcConfirm, startVoiceRecognition,
      calculateSplit, addSplitMember, removeSplitMember, submitSplitToLedger,
      submitProjectBudget, deleteProjectBudget, projectBudgetStats,
      changeTab, unlockApp, saveSettings, exportData, importData, onSymbolInput, onInvestSelectedSymbolChange, filterByAccount,
      activeBookName, availableBooks, assetAccounts, paymentAccounts, liabilityAccounts, activeInstallments, 
      getSubAccounts, safeQuickTags, safeInvestments, safeFixedAssets, safeLoans, safeRecurring, safeSavingsGoals,
      currentHoldings, historicalHoldings, calculateBalance, getBaseBalance, accountsWithBalance, 
      paymentAccountsWithBalance, assetAccountsWithBalance, liquidAccountsWithBalance, liabilityAccountsWithBalance, 
       totalLiquidAssets, upcomingBillsTotal, cashflowWarning, totalAssets, totalLiabilities, netWorth,
      activeBillingPeriod, currentMonthIncome, currentMonthExpense,
      sortedTransactions, filteredTransactions, ytdDividend, dashboardBudgets, budgetStats, getAccName, formatNumber: safeFormatNumber,
      getTxDesc, getDebitAccName, getCreditAccName, getDebitAmount, getDebitAccType, getInvestTotalAmount, 
      getInvCurrentValue, getUnrealizedGain, getFAAccDep, getFABookValue, getAccumulatedInterest, loanRepayPreview, 
      getTxColorBand, getTxAmountColor, applyQuickTag, onDividendSymbolChange, bsData, isData, cfData,
      switchBook, createNewBook, submitNewBook, deleteBook, submitNewAssetAccount, submitTransaction, openRefundModal, closeRefundModal, submitRefund,
      openReimburseModal, closeReimburseModal, submitReimburse, reimburseTx, openEditModal, saveEditTx, viewInstallmentDetails,
      deleteTransaction, submitInitialStock, calculateInitStockCost, submitFixedAsset, openDisposalModal, submitDisposal, submitAddLoan, 
      openRateModal, submitRateAdjust, submitAddGoal, openUpdateGoalModal, submitUpdateGoal, deleteGoal, addRecurring, 
      deleteRecurring, addMainCategory, deleteMainCategory, addSubCategory, addPreset, removePreset, toggleAccountVisibility, 
      deleteAccount, runAutoTasks, autoBackup, initGoogleAuth, handleGoogleAuth, handleGoogleSignout, syncWithGoogleDrive, 
      executeFactoryReset, updateStockPrices, submitManualStockUpdate, setHistoryToCurrentMonth, fetchExchangeRate, 
      loadSettings, updateCharts, refreshIcons, initData, expenseCategories, incomeCategories, currentSettingCategories, migrateLegacyData
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