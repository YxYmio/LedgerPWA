const { createApp, ref, reactive, computed, onMounted, watch, nextTick, shallowRef } = Vue;

const app = createApp({
  setup() {
    // ------------------------------------------------------------------------
    // 1. 全域 UI 狀態
    // ------------------------------------------------------------------------
    let hasShownStorageWarning = false; // 容量預警防干擾變數
    const isAppReady = ref(false);
    const activeTab = ref('dashboard');
    const isDrawerOpen = ref(false); 
    const resetPin = () => {
        if (confirm('⚠️ 忘記密碼？\n為保護隱私，重置將會「清空本機所有資料與設定」！\n若您有綁定 Google Drive，重啟後可重新授權並一鍵還原。\n\n確定要強制重置嗎？')) {
            let check = prompt('請輸入大寫「RESET」以確認執行：');
            if (check === 'RESET') {
                localStorage.clear();
                sessionStorage.clear();
                window.location.reload(true);
            } else {
                alert('輸入錯誤，重置取消。');
            }
        }
    };
    const entryMode = ref('expense'); 
    const dashboardScope = ref('all');
    const isUnlocked = ref(false);
    const pinInput = ref(''); 
    const pinError = ref('');
    const syncStatus = ref('offline'); 
    const isSyncing = ref(false);
    const showAmounts = ref(false);
    const dashboardMonth = ref(getLocalISODate().substring(0,7));
    const fxRate = ref(1);

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
    const showProjectBudgetModal = ref(false);
    
    const showGroupSplitProjectModal = ref(false);
    const showGroupSplitRecordModal = ref(false);
    const showGroupSettleLedgerModal = ref(false);
    
    const showRolloverModal = ref(false);
    const rolloverDate = ref('');
    const hasDownloadedBackup = ref(false);
    
    // --- Phase 4: 分享結算報告彈窗 ---
    const showSharedSettlementModal = ref(false);
    const sharedData = ref(null);

    // ------------------------------------------------------------------------
    // 4. 設定與全域資料模型 (Data Models)
    // ------------------------------------------------------------------------
    const settings = reactive({ 
        appName: 'Kadu｜卡度記帳', 
        googleClientId: '', googleToken: '', fileId: '', 
        pinEnabled: false, pinCode: '0000', 
        currentBookId: 'default', booksIndex: [{id: 'default', name: '日常帳本'}],
        billingStartDay: 1 
    });
    
    const currentBookId = ref('default');
    const newBookName = ref('');

    const data = reactive({
      version: "6.4.0",
      currencyRates: { TWD: 1, USD: 32.5, JPY: 0.22 },
      budgets: {}, recurring: [], quick_tags: [], smart_tags: {}, 
      main_categories: { Expense: [], Income: [] }, accounts: [], 
      transactions: [], fixed_assets: [], investments: [], installments: [], 
      loans: [], savings_goals: [], project_budgets: [], custom_tags: [],
      split_projects: [],
      split_records: []
    });

    // ------------------------------------------------------------------------
    // 5. 表單綁定狀態 (Forms Data)
    // ------------------------------------------------------------------------
    const newTx = reactive({ 
      date: getLocalISODate(), scope: 'personal', desc: '', amount: null, currency: 'TWD',
      mainCategory: '', subAccount: '', paymentAcc: '', fromAcc: '', toAcc: '', investAction: 'buy', 
      symbol: '', stockName: '', shares: null, price: null, fee: null, tax: null, 
      isInst: false, periods: 3, isFA: false, faName: '', faMonths: 60, loanId: '',
      isReimbursement: false, investDividendSymbol: '', manualSymbol: '', manualName: '',
      investSelectedSymbol: '', tags: []
    });
    
    const initStock = reactive({ symbol: '', name: '', shares: null, price: null, cost: null, unitType: 'share' });
    const newAssetAcc = reactive({ name: '', type: 'Asset', initBalance: null, currency: 'TWD', icon: '', billingDay: 1 });
    const initFA = reactive({ name: '', date: getLocalISODate(), cost: null, months: 60, scope: 'personal' });
    const disposalAsset = ref(null);
    const disposalForm = reactive({ type: 'scrap', price: null, account: '' });
    const initLoan = reactive({ name: '', principal: null, rate: null, payment: null, autoDeduct: false, deductDay: 1, deductAccountId: '' });
    const activeLoan = ref(null);
    const rateData = reactive({ rate: null });
    const newRecurring = reactive({ type: 'expense', desc: '', amount: null, day: 1, account: '' });
    const initGoal = reactive({ name: '', target: null, deadline: '', tag: '' });
    const activeGoal = ref(null);
    const updateGoalData = reactive({ amount: null, type: 'add' });
    const activeRefundTx = ref(null);
    const refundData = reactive({ amount: 0, maxAmount: 0, account: '' });
    const activeReimburseTx = ref(null);
    const reimburseData = reactive({ account: '' });
    const editingTx = reactive({ id: '', date: '', desc: '', amount: 0, scope: 'personal', debitAcc: '', creditAcc: '' });
    const selectedInstallment = ref(null);
    const projectBudgetForm = reactive({ name: '', tag: '', limit: null, startDate: '', endDate: '' });
    const editingProjectId = ref(null);

    const openEditProjectBudgetModal = (proj) => {
        if(!proj) return;
        editingProjectId.value = proj.id;
        projectBudgetForm.name = proj.name;
        projectBudgetForm.tag = proj.tag;
        projectBudgetForm.limit = proj.limit;
        projectBudgetForm.startDate = proj.startDate;
        projectBudgetForm.endDate = proj.endDate;
        showProjectBudgetModal.value = true;
    };

    const closeProjectBudgetModal = () => {
        showProjectBudgetModal.value = false;
        editingProjectId.value = null;
        projectBudgetForm.name = ''; 
        projectBudgetForm.tag = ''; 
        projectBudgetForm.limit = null; 
        projectBudgetForm.startDate = ''; 
        projectBudgetForm.endDate = '';
    };

    const txError = ref('');
    const historyFilter = reactive({ keyword: '', scope: 'all', dateFrom: '', dateTo: '' });
    const settingCategoryMode = ref('Expense');
    const newPreset = ref(''); 
    const newMainCat = ref(''); 
    const newSubCat = reactive({ main: '', name: '' });

    let tokenClient = null;

    // ------------------------------------------------------------------------
    // 6. 類 Lightsplit 群組結算中心邏輯 (含 Phase 4 分享功能)
    // ------------------------------------------------------------------------
    const activeSplitProjectId = ref('');
    const groupSplitProjectForm = reactive({ id: '', name: '', members: [{name: '我'}, {name: ''}] });
    const groupSplitRecordForm = reactive({ id: '', desc: '', expenseAcc: '', advanceAcc: '', payer: '我', amount: null, mode: 'even', splits: [] });
    const groupSettleLedgerForm = reactive({ advanceAcc: '', settleAcc: '' });

    const activeSplitProject = computed(() => (data.split_projects || []).find(p => p.id === activeSplitProjectId.value));
    const activeSplitRecords = computed(() => (data.split_records || []).filter(r => r.project_id === activeSplitProjectId.value));
    
    const activeSplitBalances = computed(() => {
        if(!activeSplitProject.value) return {};
        return typeof calculateNetBalances === 'function' ? calculateNetBalances(activeSplitRecords.value, activeSplitProject.value.members) : {};
    });
    
    const activeSplitSettlements = computed(() => {
        return typeof optimizeSettlements === 'function' ? optimizeSettlements(activeSplitBalances.value) : [];
    });

    const openGroupSplitCenter = () => { activeTab.value = 'group_split'; isDrawerOpen.value = false; };
    const viewGroupSplitProject = (id) => { activeSplitProjectId.value = id; };
    const backToSplitProjects = () => { activeSplitProjectId.value = ''; };

    const addSplitMemberField = () => { groupSplitProjectForm.members.push({name: ''}); };
    const removeSplitMemberField = (idx) => { groupSplitProjectForm.members.splice(idx, 1); };

    const saveGroupSplitProject = () => {
        if(!groupSplitProjectForm.name) return alert('請填寫專案名稱');
        // 強制防呆：確保陣列存在
        if (!data.split_projects) data.split_projects = [];
        
        let validMembers = groupSplitProjectForm.members.filter(m => (m.name || '').trim() !== '');
        if(!validMembers.find(m => m.name === '我')) validMembers.unshift({name: '我'});

        data.split_projects.push({
            id: 'gsp_' + Date.now(),
            name: groupSplitProjectForm.name,
            date: typeof getLocalISODate === 'function' ? getLocalISODate() : getLocalISODate(),
            members: validMembers,
            is_settled: false
        });
        groupSplitProjectForm.name = ''; groupSplitProjectForm.members = [{name: '我'}, {name: ''}];
        showGroupSplitProjectModal.value = false; autoBackup(true, true);
    };

    const deleteGroupSplitProject = (id) => {
        if(!confirm('確定刪除此分帳專案？(將一併刪除內部所有代墊明細)')) return;
        data.split_projects = data.split_projects.filter(p => p.id !== id);
        data.split_records = data.split_records.filter(r => r.project_id !== id);
        if(activeSplitProjectId.value === id) activeSplitProjectId.value = '';
        autoBackup(true, true);
    };

    const initGroupSplitRecordForm = () => {
        if(!activeSplitProject.value) return;
        groupSplitRecordForm.id = ''; // 清空 ID 確保為新增模式
        groupSplitRecordForm.desc = ''; groupSplitRecordForm.expenseAcc = ''; groupSplitRecordForm.advanceAcc = ''; groupSplitRecordForm.payer = '我'; groupSplitRecordForm.amount = null; groupSplitRecordForm.mode = 'even';
        groupSplitRecordForm.splits = activeSplitProject.value.members.map(m => ({ member: m.name, amount: null, included: true }));
        showGroupSplitRecordModal.value = true;
    };

    const editGroupSplitRecord = (rec) => {
        if(!rec) return;
        groupSplitRecordForm.id = rec.id;
        groupSplitRecordForm.desc = rec.desc;
        groupSplitRecordForm.expenseAcc = rec.expenseAcc || '';
        groupSplitRecordForm.advanceAcc = rec.advanceAcc || '';
        groupSplitRecordForm.payer = rec.payer;
        groupSplitRecordForm.amount = rec.amount;
        groupSplitRecordForm.mode = 'custom';
        groupSplitRecordForm.splits = JSON.parse(JSON.stringify(rec.splits));
        showGroupSplitRecordModal.value = true;
    };

    const calculateGroupSplitRecord = () => {
        if(groupSplitRecordForm.mode === 'even') {
            let includedCount = groupSplitRecordForm.splits.filter(s => s.included).length;
            if(includedCount === 0) return;
            
            // 餘數分配演算法 (解決除不盡的 1 元誤差)
            let total = Number(groupSplitRecordForm.amount) || 0;
            let perPerson = Math.floor(total / includedCount);
            let remainder = total - (perPerson * includedCount); // 取得餘數
            let distributed = 0;
            
            groupSplitRecordForm.splits.forEach(s => {
                if (s.included) {
                    s.amount = perPerson + (distributed < remainder ? 1 : 0);
                    distributed++;
                } else {
                    s.amount = 0;
                }
            });
        }
    };
    
    watch(() => groupSplitRecordForm.amount, calculateGroupSplitRecord);
    watch(() => groupSplitRecordForm.mode, calculateGroupSplitRecord);
    watch(() => groupSplitRecordForm.splits, calculateGroupSplitRecord, {deep: true});
    watch(() => newTx.subAccount, (newVal) => {
        if (newVal && !newTx.isReimbursement) {
            let acc = (data.accounts || []).find(a => a && a.id === newVal);
            if (acc && acc.category) newTx.mainCategory = acc.category;
        }
    });

    const saveGroupSplitRecord = () => {
        if(!groupSplitRecordForm.desc || !groupSplitRecordForm.amount || !groupSplitRecordForm.expenseAcc) return alert('請填寫完整項目、金額與支出科目');
        if(groupSplitRecordForm.payer === '我' && !groupSplitRecordForm.advanceAcc) return alert('請選擇您先代墊付款的實體帳戶/信用卡');
        
        let totalSplit = groupSplitRecordForm.splits.reduce((sum, s) => sum + (Number(s.amount)||0), 0);
        if(Math.abs(totalSplit - groupSplitRecordForm.amount) > 0) return alert('成員分攤總額與該筆總金額不符，請檢查分配金額。');

        if (groupSplitRecordForm.id) {
            // 編輯模式
            let rec = data.split_records.find(r => r.id === groupSplitRecordForm.id);
            if (rec) {
                rec.desc = groupSplitRecordForm.desc;
                rec.expenseAcc = groupSplitRecordForm.expenseAcc;
                rec.advanceAcc = groupSplitRecordForm.advanceAcc;
                rec.payer = groupSplitRecordForm.payer;
                rec.amount = groupSplitRecordForm.amount;
                rec.splits = JSON.parse(JSON.stringify(groupSplitRecordForm.splits));
            }
        } else {
            // 新增模式
            data.split_records.push({
                id: 'gsr_' + Date.now(), project_id: activeSplitProjectId.value, date: getLocalISODate(),
                desc: groupSplitRecordForm.desc, expenseAcc: groupSplitRecordForm.expenseAcc, advanceAcc: groupSplitRecordForm.advanceAcc, 
                payer: groupSplitRecordForm.payer, amount: groupSplitRecordForm.amount,
                splits: JSON.parse(JSON.stringify(groupSplitRecordForm.splits))
            });
        }
        showGroupSplitRecordModal.value = false; autoBackup(true, true);
    };

    const deleteGroupSplitRecord = (id) => {
        if(confirm('確定刪除此筆代墊紀錄？')) { data.split_records = data.split_records.filter(r => r.id !== id); autoBackup(true, true); }
    };

    // Phase 4: Magic Link 產生器
    const generateMagicLink = () => {
        if(!activeSplitProject.value) return '';
        let payload = {
            n: activeSplitProject.value.name,
            r: activeSplitRecords.value.map(rec => ({ d: rec.desc, p: rec.payer, a: rec.amount })),
            s: activeSplitSettlements.value.map(stl => ({ f: stl.from, t: stl.to, a: stl.amount }))
        };
        let b64 = typeof b64EncodeUnicode === 'function' ? b64EncodeUnicode(JSON.stringify(payload)) : '';
        return b64 ? `${window.location.origin}${window.location.pathname}?shared=${b64}` : '';
    };

    const shareGroupSettlement = async () => {
        if(!activeSplitProject.value) return;
        let text = `📍 ${activeSplitProject.value.name} 結算報告\n\n💰 代墊明細：\n`;
        activeSplitRecords.value.forEach(r => { text += `- ${r.desc}: ${r.payer} 先付 $${formatNumber(r.amount)}\n`; });
        text += `\n📊 最佳轉帳路徑：\n`;
        if(activeSplitSettlements.value.length === 0) { text += `✅ 大家互不相欠！\n`; } 
        else { activeSplitSettlements.value.forEach(s => { text += `👉 [${s.from}] 需轉帳給 [${s.to}] $${formatNumber(s.amount)}\n`; }); }
        
        // 加入 Magic Link
        let magicLink = generateMagicLink();
        if (magicLink) {
             text += `\n🔗 點擊查看動態結算報告：\n${magicLink}\n`;
        }
        text += `\n(Powered by Kadu｜卡度記帳)`;

        if(navigator.share) { try { await navigator.share({ title: activeSplitProject.value.name, text: text }); } catch(e) {} } 
        else { navigator.clipboard.writeText(text); alert('✅ 已複製至剪貼簿，可直接貼到 LINE 等通訊軟體！'); }
        }; 
    // Phase 4: 攔截與解析網址參數
    const checkSharedUrl = () => {
        try {
            const params = new URLSearchParams(window.location.search);
            const sharedObj = params.get('shared');
            if(sharedObj) {
                let decoded = typeof b64DecodeUnicode === 'function' ? b64DecodeUnicode(sharedObj) : '{}';
                let parsed = JSON.parse(decoded);
                if (parsed && parsed.n) {
                    sharedData.value = parsed;
                    showSharedSettlementModal.value = true;
                }
                window.history.replaceState({}, document.title, window.location.pathname);
            }
        } catch(e) {
            console.warn('解析分享連結失敗', e);
        }
    };

   const writeGroupSettlementToLedger = () => {
        if(!activeSplitProject.value) return;
        if(!groupSettleLedgerForm.settleAcc) return alert('請選擇結算轉帳收付款用的實體帳戶');

        let myBalance = activeSplitBalances.value['我'] || 0;
        let myTotalPaid = 0;
        let myExpensesByCategory = {}; 
        let myTotalExpense = 0;
        let advanceCreditsMap = {}; // 精準記錄各代墊帳戶的扣款總額

        activeSplitRecords.value.forEach(r => {
            if(r.payer === '我') {
                myTotalPaid += Number(r.amount);
                let advAcc = r.advanceAcc || groupSettleLedgerForm.advanceAcc || '1101'; // 防呆預設為現金
                advanceCreditsMap[advAcc] = (advanceCreditsMap[advAcc] || 0) + Number(r.amount);
            }
            let mySplit = r.splits.find(s => s.member === '我');
            if(mySplit && Number(mySplit.amount) > 0) {
                let amt = Number(mySplit.amount);
                myTotalExpense += amt;
                let expAcc = r.expenseAcc || '5102'; // 系統防呆
                myExpensesByCategory[expAcc] = (myExpensesByCategory[expAcc] || 0) + amt;
            }
        });

        if (myTotalPaid === 0 && myTotalExpense === 0) return alert('您在此專案中沒有任何花費與代墊，無需寫入帳本。');

        let txObj = {
            id: 'tx_gsp_' + Date.now(), date: getLocalISODate(), scope: 'personal',
            desc: `[群組結算] ${activeSplitProject.value.name}`, tags: [activeSplitProject.value.name.replace(/\s+/g, '')],
            debits: [], credits: []
        };

        // 1. 將實際開銷細緻化認列為各科目支出 (借方)
        for (let accId in myExpensesByCategory) {
            txObj.debits.push({ account_id: accId, amount: myExpensesByCategory[accId] });
        }

        // 2. 結算淨結餘 (雙軌帳戶處理)
        if (myBalance > 0) {
            // 別人欠我錢：增加應收款 (借方)
            txObj.debits.push({ account_id: '1104', amount: myBalance });
        } else if (myBalance < 0) {
            // 我欠別人錢：直接從結算實體帳戶掏錢轉帳還款 (貸方)
            txObj.credits.push({ account_id: groupSettleLedgerForm.settleAcc, amount: Math.abs(myBalance) });
        }

        // 3. 從當初代墊的各帳戶真實扣款 (貸方)
        for (let adv in advanceCreditsMap) {
            txObj.credits.push({ account_id: adv, amount: advanceCreditsMap[adv] });
        }

        // 陣列整合壓平防呆
        const consolidate = (entries) => {
            let map = {};
            entries.forEach(e => { map[e.account_id] = (map[e.account_id] || 0) + e.amount; });
            return Object.keys(map).map(k => ({ account_id: k, amount: map[k] })).filter(e => e.amount > 0);
        };
        txObj.debits = consolidate(txObj.debits);
        txObj.credits = consolidate(txObj.credits);

        data.transactions.unshift(txObj);
        activeSplitProject.value.is_settled = true;
        showGroupSettleLedgerModal.value = false;
        autoBackup(true, true); updateCharts(); refreshIcons();
        alert('✅ 群組結算已成功完美認列至複式帳本！');
    };


    // ------------------------------------------------------------------------
    // 計算機與語音處理邏輯
    // ------------------------------------------------------------------------
    const calcAppend = (val) => { calcExpression.value += val; };
    const calcClear = () => { calcExpression.value = ''; };
    const calcBackspace = () => { calcExpression.value = calcExpression.value.slice(0, -1); };
    const calcConfirm = () => {
        let res = typeof evaluateCalc === 'function' ? evaluateCalc(calcExpression.value) : null;
        if (res !== null && res > 0) newTx.amount = res;
        isCalcOpen.value = false; calcExpression.value = '';
    };

    const startVoiceRecognition = () => {
        // 嚴格檢查 Web Speech API 支援度 (攔截舊版 iOS Safari)
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) { 
            return alert('⚠️ 您的瀏覽器不支援語音輸入功能。\n建議您改用 Chrome，或於 iOS 設定中開啟 Safari 相關權限。'); 
        }

        try {
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
                if (parsed.tags && parsed.tags.length > 0) finalDesc += ' ' + parsed.tags.map(t => '#' + t).join(' ');
                newTx.desc = finalDesc.trim();
            };
            
            recognition.onerror = (event) => { 
                console.warn('Speech error:', event.error);
                let errorMsg = '語音辨識發生未知錯誤。';
                
                // 針對 iOS 與未授權環境給予精準反饋
                if (event.error === 'not-allowed') {
                    errorMsg = '麥克風未授權 🎤\n請至瀏覽器設定中「允許」網站存取麥克風。';
                } else if (event.error === 'network') {
                    errorMsg = '網路連線異常，無法解析語音。';
                } else if (event.error === 'no-speech') {
                    errorMsg = '未偵測到聲音，請再按一次麥克風。';
                }
                alert('⚠️ ' + errorMsg);
                isListening.value = false;
            };
            
            recognition.onend = () => { isListening.value = false; };
            
            recognition.start();
        } catch (e) {
            console.error('Speech Init Error:', e);
            alert('⚠️ 語音系統初始化失敗，請確認設備權限或重新整理頁面。');
            isListening.value = false;
        }
    };

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
    const filterByAccount = (acc, fromDate = '', toDate = '') => {
   if (!acc) return;
   historyFilter.keyword = acc.name || ''; 
   historyFilter.dateFrom = fromDate || ''; 
   historyFilter.dateTo = toDate || ''; 
   historyFilter.scope = 'all'; 
   activeTab.value = 'history';
   setTimeout(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, 50);
    };

    // --- 1. 明細頁面返回鍵邏輯 ---
    const historyPreviousTab = ref(null);
    const clearHistoryFilterAndBack = () => {
        historyFilter.keyword = '';
        historyFilter.dateFrom = '';
        historyFilter.dateTo = '';
        activeTab.value = historyPreviousTab.value || 'assets';
        historyPreviousTab.value = null;
        setTimeout(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, 50);
    };

    // (修改原本的 filterByAccount，加入記錄前一頁的功能)
    const filterByAccount = (acc, fromDate = '', toDate = '') => {
       if (!acc) return;
       historyPreviousTab.value = activeTab.value; // 紀錄是從哪個 Tab 過來的
       historyFilter.keyword = acc.name || ''; 
       historyFilter.dateFrom = fromDate || ''; 
       historyFilter.dateTo = toDate || ''; 
       historyFilter.scope = 'all'; 
       activeTab.value = 'history';
       setTimeout(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, 50);
    };

    // --- 2. 帳戶編輯與刪除彈窗邏輯 ---
    const showEditAccountModal = ref(false);
    const editingAccount = reactive({ id: '', name: '', icon: '' });
    
    const openEditAccountModal = (acc) => {
        editingAccount.id = acc.id;
        editingAccount.name = acc.name;
        editingAccount.icon = acc.icon || '🏦';
        showEditAccountModal.value = true;
    };
    
    const saveEditAccount = () => {
        let acc = data.accounts.find(a => a.id === editingAccount.id);
        if (acc) {
            acc.name = editingAccount.name;
            acc.icon = editingAccount.icon;
            autoBackup(true, true);
        }
        showEditAccountModal.value = false;
        refreshIcons();
    };
    
    const executeDeleteAccountFromModal = () => {
        let id = editingAccount.id;
        let isUsed = false;
        data.transactions.forEach(tx => {
            if(tx.debits) tx.debits.forEach(d => { if(d.account_id === id) isUsed = true; });
            if(tx.credits) tx.credits.forEach(c => { if(c.account_id === id) isUsed = true; });
        });
        if (isUsed) {
            alert("⚠️ 該帳戶已有交易紀錄無法直接刪除。\n若不再使用，請至「設定 > 分類與標籤」中點選停用即可隱藏。");
            return;
        }
        if (confirm("確定要永久刪除此帳戶嗎？此操作無法復原。")) { 
            data.accounts = data.accounts.filter(a => a && a.id !== id); 
            showEditAccountModal.value = false;
            autoBackup(true, true); 
        }
    };

    // --- 3. 外幣匯率自訂與自動更新邏輯 ---
    const newCurrencyCode = ref('');
    
    const addCustomCurrency = () => {
        let code = newCurrencyCode.value.toUpperCase().trim();
        if (!code || code.length !== 3) return alert('請輸入3碼英文幣別 (如: EUR, GBP)');
        if (data.currencyRates[code]) return alert('該幣別已經存在列表囉');
        data.currencyRates[code] = 1.0; 
        newCurrencyCode.value = '';
        autoBackup(true, true);
    };
    
    const deleteCustomCurrency = (code) => {
        if(code === 'USD' || code === 'JPY' || code === 'TWD') return alert('系統預設幣別無法刪除');
        if(!confirm(`確定要刪除幣別 ${code} 嗎？\n(注意：若有使用該幣別的帳戶，換算可能會受影響)`)) return;
        delete data.currencyRates[code];
        autoBackup(true, true);
    };
    
    const updateFxRates = async () => {
        try {
            let res = await fetchWithTimeout('https://api.exchangerate-api.com/v4/latest/TWD', {}, 4000);
            let apiData = await res.json();
            if (apiData && apiData.rates) {
                for (let cur in data.currencyRates) {
                    if (cur !== 'TWD' && apiData.rates[cur]) {
                        // API 回傳的是 1 台幣 = X 外幣，所以 1 外幣 = (1 / X) 台幣
                        data.currencyRates[cur] = Number((1 / apiData.rates[cur]).toFixed(4));
                    }
                }
                autoBackup();
                alert('✅ 所有外幣匯率已自動雲端同步更新完畢！');
            }
        } catch(e) {
            alert('⚠️ 無法連線至匯率 API，請檢查網路狀態或稍後再試。');
        }
    };

    const viewProjectDetails = (tag) => {
       if (!tag) return;
       historyFilter.keyword = '#' + tag; historyFilter.dateFrom = ''; historyFilter.dateTo = ''; historyFilter.scope = 'all'; activeTab.value = 'history'; isDrawerOpen.value = false;
    };

    const resetData = () => {
       data.transactions = []; data.accounts = []; data.fixed_assets = []; data.investments = []; 
       data.installments = []; data.loans = []; data.savings_goals = []; data.recurring = []; 
       data.quick_tags = []; data.smart_tags = {}; data.main_categories = { Expense: [], Income: [] }; data.budgets = {};
       data.project_budgets = []; data.custom_tags = []; 
       data.split_projects = []; data.split_records = [];
    };

    const migrateLegacyData = () => {
       if (!data.installments) data.installments = [];
       if (!data.savings_goals) data.savings_goals = [];
       if (!data.project_budgets) data.project_budgets = [];
       if (!data.custom_tags) data.custom_tags = [];
       if (!data.split_projects) data.split_projects = [];
       if (!data.split_records) data.split_records = [];
       if (settings.billingStartDay === undefined) settings.billingStartDay = 1;
       if (typeof patchAccountIcons === 'function') {
           patchAccountIcons(data.accounts);
       }
    };

    const activeBookName = computed(() => { let b = settings.booksIndex.find(x => x && x.id === currentBookId.value); return b ? b.name : 'Kadu｜卡度記帳'; });
    const availableBooks = computed(() => settings.booksIndex || []);

    const assetAccounts = computed(() => { return (data.accounts || []).filter(a => a && a.type === 'Asset' && !a.is_contra && a.id !== '1103' && a.id !== '1201' && !a.is_hidden); });
    const paymentAccounts = computed(() => { return (data.accounts || []).filter(a => a && ((a.type === 'Asset' && !a.is_contra && a.id !== '1103' && a.id !== '1201') || a.type === 'Liability') && !(a.id || '').startsWith('loan_liab_') && !a.is_hidden); });
    const liabilityAccounts = computed(() => { return (data.accounts || []).filter(a => a && a.type === 'Liability' && !(a.id || '').startsWith('loan_liab_') && !a.is_hidden); });
    
    const activeInstallments = computed(() => (data.installments || []).filter(i => i && i.paid_periods < i.periods));
    const getSubAccounts = (type, mainCat, incHidden = false) => (data.accounts || []).filter(a => a && a.type === type && (!mainCat || a.category === mainCat) && (incHidden || !a.is_hidden));
    
    const safeQuickTags = computed(() => data.quick_tags || []);
    const activeProjectTags = computed(() => {
        let tags = [];
        (data.project_budgets || []).forEach(p => { if (p && p.tag) tags.push(p.tag); });
        (data.split_projects || []).forEach(p => { if (p && !p.is_settled && p.name) tags.push(p.name.replace(/\s+/g, '')); });
        (data.savings_goals || []).forEach(g => { if (g && g.tag) tags.push(g.tag); else if (g && g.name) tags.push(g.name.replace(/\s+/g, '')); });
        return [...new Set(tags)];
    });
    
    const combinedQuickTags = computed(() => {
        return {
            projects: activeProjectTags.value,
            presets: (data.quick_tags || []).filter(t => !activeProjectTags.value.includes(t))
        };
    });

    const recentExpenses = computed(() => {
        return sortedTransactions.value.filter(tx => {
            if (!tx || tx.is_refunded || tx.is_refund || tx.is_reimbursed) return false;
            let isExp = false;
            if (tx.debits && tx.debits.length > 0) {
                let acc = (data.accounts || []).find(a => a && a.id === tx.debits[0].account_id);
                if (acc && acc.type === 'Expense') isExp = true;
            }
            return isExp;
        }).slice(0, 5); // 抓取近 5 筆支出
    });

    const applyRecentTx = (tx) => {
        if (!tx) return;
        newTx.desc = getTxDesc(tx).replace(/#\S+/g, '').trim(); // 帶入摘要並過濾掉舊標籤
        newTx.amount = getDebitAmount(tx);
        if (tx.debits && tx.debits[0]) {
            let expAcc = (data.accounts || []).find(a => a && a.id === tx.debits[0].account_id);
            if (expAcc) { newTx.mainCategory = expAcc.category || ''; newTx.subAccount = expAcc.id || ''; }
        }
        if (tx.credits && tx.credits[0]) newTx.paymentAcc = tx.credits[0].account_id || '';
    };
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

// --- 新增：明細分頁與限制渲染 ---
    const historyDisplayLimit = ref(50);
    
    // 將原本綁定畫面的 filteredTransactions 再包一層切片
    const paginatedTransactions = computed(() => {
      return filteredTransactions.value.slice(0, historyDisplayLimit.value);
    });

    const loadMoreHistory = () => {
      historyDisplayLimit.value += 50;
    };

    // 當搜尋條件改變時，重置顯示筆數
    watch(historyFilter, () => { 
      historyDisplayLimit.value = 50; 
    }, { deep: true });

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
    const getDebitAccName = (tx) => {
        if (!tx || !tx.debits || tx.debits.length === 0) return '未知';
        let names = [...new Set(tx.debits.map(d => getAccName(d.account_id)))];
        return names.length > 2 ? names.slice(0, 2).join(', ') + '...' : names.join(', ');
    };
    const getCreditAccName = (tx) => {
        if (!tx || !tx.credits || tx.credits.length === 0) return '未知';
        let names = [...new Set(tx.credits.map(c => getAccName(c.account_id)))];
        return names.length > 2 ? names.slice(0, 2).join(', ') + '...' : names.join(', ');
    };
    const getDebitAmount = (tx) => {
        if (!tx || !tx.debits) return 0;
        return tx.debits.reduce((sum, d) => sum + (Number(d.amount)||0), 0);
    };
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

    // --- 新增：即時外幣換算屬性 ---
    const newTxBaseAmount = computed(() => {
        let amt = Number(newTx.amount) || 0;
        if (newTx.currency !== 'TWD' && amt > 0 && entryMode.value !== 'invest') {
            let rate = data.currencyRates[newTx.currency] || 1;
            return Math.round(amt * rate);
        }
        return amt;
    });

    const loanRepayPreview = computed(() => {
      let loan = (data.loans || []).find(l => l && l.id === newTx.loanId);
      let baseAmt = newTxBaseAmount.value;
      if(!loan || !baseAmt) return { interest: 0, principal: 0, current_principal: 0 };
      let cp = Math.abs(calculateBalance(loan.liability_acc_id, 'all'));
      let interest = Math.round(cp * ((loan.interest_rate || 0) / 100 / 12));
      let principal = Math.min(baseAmt - interest, cp);
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
           reportStartDate.value = getLocalISODate(new Date(d.getFullYear(), d.getMonth(), 1));
           reportEndDate.value = getLocalISODate(new Date(d.getFullYear(), d.getMonth()+1, 0));
       } else if (newVal === 'this_quarter') {
           let q = Math.floor(d.getMonth() / 3);
           reportStartDate.value = getLocalISODate(new Date(d.getFullYear(), q * 3, 1));
           reportEndDate.value = getLocalISODate(new Date(d.getFullYear(), q * 3 + 3, 0));
       } else if (newVal === 'this_year') {
           reportStartDate.value = getLocalISODate(new Date(d.getFullYear(), 0, 1));
           reportEndDate.value = getLocalISODate(new Date(d.getFullYear(), 11, 31));
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

    const submitTransaction = () => {
      txError.value = '';
      let baseAmt = newTxBaseAmount.value;
      let extractedTags = [];
      let tagMatches = (newTx.desc || '').match(/#\S+/g);
      if (tagMatches) extractedTags = tagMatches.map(t => t.substring(1));

      // 攔截標籤：若符合儲蓄目標，自動將該筆金額累加至存入進度
      extractedTags.forEach(tag => {
          let matchedGoal = (data.savings_goals || []).find(g => g && (g.name === tag || g.tag === tag));
          if (matchedGoal && baseAmt > 0) {
              matchedGoal.saved = (Number(matchedGoal.saved) || 0) + baseAmt;
          }
      });

      let finalDesc = (newTx.desc || '').trim();
      if (!finalDesc && newTx.subAccount && !newTx.isReimbursement) {
          let acc = (data.accounts || []).find(a => a && a.id === newTx.subAccount);
          if (acc && acc.name) finalDesc = acc.name;
      }
      if (!finalDesc) finalDesc = '無摘要';

      // 智慧附註：若是外幣記帳，自動將原幣別金額加入摘要後方
      if (newTx.currency !== 'TWD' && newTx.amount > 0 && entryMode.value !== 'invest') {
          finalDesc += ` (${newTx.currency} ${newTx.amount})`;
      }
      
      let txObj = { id: 'tx_' + Date.now(), date: newTx.date, scope: newTx.scope, desc: finalDesc, tags: extractedTags, debits: [], credits: [] };
      
      if (entryMode.value === 'expense') {
        if (!newTx.paymentAcc || !baseAmt) return txError.value = '請填寫完整金額與扣款帳戶';
        let debitAcc = newTx.isReimbursement ? '1104' : newTx.subAccount;
        if (!debitAcc) return txError.value = '請選擇分類或勾選代墊';
        if (!newTx.isReimbursement && newTx.desc) { if(!data.smart_tags) data.smart_tags = {}; data.smart_tags[newTx.desc] = newTx.paymentAcc; }
        
        if (newTx.isInst && newTx.periods > 1) {
          let perAmt = Math.round(baseAmt / newTx.periods);
          let firstAmt = baseAmt - (perAmt * (newTx.periods - 1));
          let nextM = newTx.date && newTx.date.length >= 7 ? newTx.date.substring(0,7) : getLocalISODate().substring(0,7);
          let nextD = newTx.date && newTx.date.length >= 10 ? newTx.date.substring(8,10) : '01';
          data.installments.push({ id: 'inst_'+Date.now(), desc: newTx.desc||'無摘要', total_amount: baseAmt, periods: newTx.periods, amount_per_period: perAmt, first_amount: firstAmt, paid_periods: 0, next_month: nextM, date_day: nextD, debit_acc: debitAcc, credit_acc: newTx.paymentAcc, scope: newTx.scope });
          runAutoTasks(); newTx.amount = null; newTx.desc = ''; newTx.isInst = false; autoBackup(true, true); updateCharts(); alert('✅ 分期建立成功！'); return;
        } else {
          txObj.debits.push({ account_id: debitAcc, amount: baseAmt });
          txObj.credits.push({ account_id: newTx.paymentAcc, amount: baseAmt });
        }
        if (!newTx.isReimbursement && newTx.isFA && newTx.faMonths > 0) {
           let monthlyDep = Math.round(baseAmt / newTx.faMonths);
           let newFaId = 'fa_'+Date.now();
           data.fixed_assets.push({ id: newFaId, name: newTx.faName||newTx.desc, purchase_date: newTx.date, original_cost: baseAmt, monthly_depreciation: monthlyDep, asset_account_id: '1201', accumulated_dep_account_id: '1201-DEP', expense_account_id: '5102', last_depreciation_date: newTx.date, is_disposed: false });
           txObj.debits[0].account_id = '1201';
           txObj.desc = `購入固定資產: ${newTx.faName||newTx.desc}`;
           txObj.fa_init_id = newFaId;
           newTx.isFA = false; newTx.faMonths = 60; newTx.faName = '';
        }
      } else if (entryMode.value === 'income') {
        if (!newTx.subAccount || !newTx.paymentAcc || !baseAmt) return txError.value = '欄位不完整';
        if(newTx.desc) { if(!data.smart_tags) data.smart_tags = {}; data.smart_tags[newTx.desc] = newTx.paymentAcc; }
        txObj.debits.push({ account_id: newTx.paymentAcc, amount: baseAmt }); txObj.credits.push({ account_id: newTx.subAccount, amount: baseAmt }); 
      } else if (entryMode.value === 'transfer') {
        if (!newTx.fromAcc || !newTx.toAcc || !baseAmt) return txError.value = '欄位不完整';
        if (newTx.fromAcc === newTx.toAcc) return txError.value = '轉出入不可相同';
        txObj.debits.push({ account_id: newTx.toAcc, amount: baseAmt });
        txObj.credits.push({ account_id: newTx.fromAcc, amount: baseAmt });
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
        if (!newTx.loanId || !newTx.paymentAcc || !baseAmt) return txError.value = '欄位不完整';
        let loan = (data.loans || []).find(l => l && l.id === newTx.loanId); if(!loan) return txError.value = '貸款資料錯誤';
        let preview = loanRepayPreview.value;
        txObj.loan_id = loan.id;
        txObj.desc = newTx.desc || `貸款還款: ${loan.name}`;
        if (newTx.currency !== 'TWD') txObj.desc += ` (${newTx.currency} ${newTx.amount})`;
        txObj.debits.push({ account_id: loan.liability_acc_id, amount: preview.principal });
        txObj.debits.push({ account_id: '5103', amount: preview.interest });
        txObj.credits.push({ account_id: newTx.paymentAcc, amount: baseAmt });
      }

      data.transactions.unshift(txObj);
      newTx.amount = null; newTx.desc = ''; newTx.currency = 'TWD'; newTx.shares = null; newTx.price = null; newTx.fee = null; newTx.tax = null; newTx.loanId = ''; newTx.manualSymbol = ''; newTx.manualName = '';
      autoBackup(true, true); updateCharts();
      alert('✅ 記帳成功！'); 
    };

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
         data.version = "6.4.0"; 
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
      
      autoBackup(false); // 確保新建帳本立刻存入本機，防止白屏
      alert(`已成功切換至: ${activeBookName.value}`);
    };


    const createNewBook = () => { showNewBookModal.value = true; };
    
    const submitNewBook = () => {
      if(!newBookName.value) return;
      let newId = 'book_' + Date.now();
      settings.booksIndex.push({ id: newId, name: newBookName.value });
      switchBook(newId); 
      newBookName.value = ''; 
      showNewBookModal.value = false;
    };
    
    const deleteBook = (targetId) => {
        if (settings.booksIndex.length <= 1) { return alert("系統至少須保留一個帳本，無法刪除！"); }
        if (!confirm("確定要永久刪除此帳本及其所有本機儲存紀錄？此操作無法復原！")) return;
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
    const openRolloverModal = () => {
        let d = new Date();
        d.setMonth(d.getMonth() - 3);
        let lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
        rolloverDate.value = typeof getLocalISODate === 'function' ? getLocalISODate(lastDay) : lastDay.toISOString().split('T')[0];
        hasDownloadedBackup.value = false;
        showRolloverModal.value = true;
    };

    const downloadBackupForRollover = () => {
        exportData();
        hasDownloadedBackup.value = true;
    };

    const executeRollover = () => {
        if (!hasDownloadedBackup.value) return alert("請先下載備份檔！");
        if (!rolloverDate.value) return alert("請選擇切帳基準日！");
        
        const cutoffDate = rolloverDate.value;
        const oldTxs = data.transactions.filter(tx => tx && tx.date <= cutoffDate);
        const newTxs = data.transactions.filter(tx => tx && tx.date > cutoffDate);

        if (oldTxs.length === 0) {
            alert("該日期前沒有任何明細可結轉！");
            return;
        }

        let rolloverDebits = [];
        let rolloverCredits = [];
        let rawBalances = {};

        oldTxs.forEach(tx => {
            (tx.debits || []).forEach(d => { rawBalances[d.account_id] = (rawBalances[d.account_id] || 0) + Number(d.amount); });
            (tx.credits || []).forEach(c => { rawBalances[c.account_id] = (rawBalances[c.account_id] || 0) - Number(c.amount); });
        });

        let targetEquity = 0;

        (data.accounts || []).forEach(acc => {
            if (acc && (acc.type === 'Asset' || acc.type === 'Liability')) {
                let bal = rawBalances[acc.id] || 0;
                if (bal > 0) rolloverDebits.push({ account_id: acc.id, amount: bal });
                if (bal < 0) rolloverCredits.push({ account_id: acc.id, amount: Math.abs(bal) });
                targetEquity -= bal;
            }
        });

        if (targetEquity > 0) rolloverCredits.push({ account_id: '3101', amount: targetEquity });
        if (targetEquity < 0) rolloverDebits.push({ account_id: '3101', amount: Math.abs(targetEquity) });

        let [y, m, d_str] = cutoffDate.split('-');
        let nd = new Date(Number(y), Number(m) - 1, Number(d_str));
        nd.setDate(nd.getDate() + 1);
        let nextDayStr = typeof getLocalISODate === 'function' ? getLocalISODate(nd) : `${nd.getFullYear()}-${String(nd.getMonth()+1).padStart(2,'0')}-${String(nd.getDate()).padStart(2,'0')}`;

        let rolloverTx = {
            id: 'tx_rollover_' + Date.now(),
            date: nextDayStr,
            scope: 'personal',
            desc: `[系統結轉] ${cutoffDate} 前歷史資料合併`,
            tags: ['系統結轉'],
            debits: rolloverDebits,
            credits: rolloverCredits,
            auto_generated: true
        };

        data.transactions = newTxs;
        data.transactions.unshift(rolloverTx);
        data.transactions.sort((a, b) => {
            let d1 = (a && a.date) ? a.date : ''; let d2 = (b && b.date) ? b.date : '';
            if (d1 !== d2) return d1 < d2 ? 1 : -1;
            let id1 = (a && a.id) ? a.id : ''; let id2 = (b && b.id) ? b.id : '';
            return id2.localeCompare(id1);
        });

        showRolloverModal.value = false;
        autoBackup(true, true);
        updateCharts();
        alert(`✅ 結轉成功！已安全釋放空間，並清除 ${cutoffDate} (含) 之前的歷史明細。`);
    };
   const submitNewAssetAccount = () => {
      if(!newAssetAcc.name) return;
      let finalType = newAssetAcc.name.includes('信用卡') || newAssetAcc.name.includes('欠款') || newAssetAcc.name.includes('貸款') ? 'Liability' : (newAssetAcc.type || 'Asset');
      const newId = (finalType === 'Liability' ? 'liab_' : 'asset_') + Date.now();
      let finalIcon = newAssetAcc.icon || (finalType === 'Liability' ? '💳' : '🏦');
      
      data.accounts.push({ 
          id: newId, name: newAssetAcc.name, type: finalType, currency: newAssetAcc.currency, 
          is_hidden: false, icon: finalIcon, billing_day: finalType === 'Liability' ? newAssetAcc.billingDay : null 
      });
      
      if(newAssetAcc.initBalance && newAssetAcc.initBalance > 0) {
        if (finalType === 'Asset') {
            data.transactions.unshift({ id: 'tx_init_' + Date.now(), date: getLocalISODate(), scope: 'personal', desc: `期初餘額: ${newAssetAcc.name}`, debits: [{ account_id: newId, amount: newAssetAcc.initBalance }], credits: [{ account_id: '3101', amount: newAssetAcc.initBalance }] });
        } else {
            data.transactions.unshift({ id: 'tx_init_' + Date.now(), date: getLocalISODate(), scope: 'personal', desc: `期初欠款: ${newAssetAcc.name}`, debits: [{ account_id: '3101', amount: newAssetAcc.initBalance }], credits: [{ account_id: newId, amount: newAssetAcc.initBalance }] });
        }
      }
      newAssetAcc.name = ''; newAssetAcc.type = 'Asset'; newAssetAcc.initBalance = null; newAssetAcc.currency = 'TWD';
      showAddAccountModal.value = false; autoBackup(true, true); updateCharts(); refreshIcons(); 
      alert('✅ 帳戶建立成功！');
      newAssetAcc.icon = ''; newAssetAcc.billingDay = 1;
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
        editTxModal.value = false; autoBackup(true, true); updateCharts(); alert('✅ 明細修改成功');
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

      let refundTx = { id: 'tx_refund_' + Date.now(), date: getLocalISODate(), scope: activeRefundTx.value.scope, desc: `[退款沖銷] ${activeRefundTx.value.desc || activeRefundTx.value.description || ''}`, debits: [{ account_id: refundData.account, amount: refundData.amount }], credits: [{ account_id: expAcc, amount: refundData.amount }], is_refund: true, ref_tx_id: activeRefundTx.value.id };
      data.transactions.unshift(refundTx);
      activeRefundTx.value.refunded_amount = (Number(activeRefundTx.value.refunded_amount) || 0) + refundData.amount;
      if (activeRefundTx.value.refunded_amount >= getDebitAmount(activeRefundTx.value)) activeRefundTx.value.is_refunded = true;
      closeRefundModal(); autoBackup(true, true); updateCharts(); alert('✅ 退款沖銷成功！');
    };

    const openReimburseModal = (tx) => { 
        activeReimburseTx.value = tx; 
        reimburseData.account = ''; 
        let origAmt = getDebitAmount(tx);
        let reimbAmt = Number(tx.reimbursed_amount) || 0;
        reimburseData.maxAmount = origAmt - reimbAmt;
        reimburseData.amount = reimburseData.maxAmount;
        showReimburseModal.value = true; 
    };
    const closeReimburseModal = () => { showReimburseModal.value = false; activeReimburseTx.value = null; };
    const submitReimburse = () => { 
        if (!activeReimburseTx.value || !reimburseData.account) return alert('請選擇入帳帳戶'); 
        if (reimburseData.amount <= 0 || reimburseData.amount > reimburseData.maxAmount) return alert("報銷金額無效或大於可報銷餘額");
        reimburseTx(activeReimburseTx.value, reimburseData.account, reimburseData.amount); 
        closeReimburseModal(); 
    };
    const reimburseTx = (tx, toAccountId, amount) => {
         if (!tx || !toAccountId || !amount) return;
         data.transactions.unshift({ id: 'tx_reimb_' + Date.now(), date: getLocalISODate(), scope: tx.scope, desc: `[代墊報銷] ${(tx.desc || tx.description || '')}`, debits: [{ account_id: toAccountId, amount: amount }], credits: [{ account_id: '1104', amount: amount }], ref_tx_id: tx.id });
         tx.reimbursed_amount = (Number(tx.reimbursed_amount) || 0) + amount;
         if (tx.reimbursed_amount >= getDebitAmount(tx)) { tx.is_reimbursed = true; }
         autoBackup(true, true); updateCharts(); alert('✅ 報銷沖銷成功！');
    };

    const deleteTransaction = (id) => {
      if(!confirm('確定刪除？此操作將連動還原相關庫存或排程狀態（若有）。')) return;
      let idx = data.transactions.findIndex(t => t && t.id === id); if (idx === -1) return;
      let tx = data.transactions[idx];
      
      if (tx && tx.auto_generated && tx.asset_id) { let a = data.fixed_assets.find(fa => fa && fa.id === tx.asset_id); if(a) a.last_depreciation_date = null; }
      if (tx && tx.auto_generated && tx.inst_id) { let inst = data.installments.find(i => i && i.id === tx.inst_id); if(inst) { inst.paid_periods = Math.max(0, inst.paid_periods - 1); let p = inst.next_month.split('-'); let y = Number(p[0]); let m = Number(p[1]) - 1; if(m < 1) { m = 12; y--; } inst.next_month = `${y}-${String(m).padStart(2,'0')}`; } }
      if (tx && tx.is_refund && tx.ref_tx_id) { let orig = data.transactions.find(t => t && t.id === tx.ref_tx_id); if (orig) { let refundAmt = getDebitAmount(tx); orig.refunded_amount = Math.max(0, (Number(orig.refunded_amount) || 0) - refundAmt); if (orig.refunded_amount < getDebitAmount(orig)) orig.is_refunded = false; } }
      if (tx && tx.id.startsWith('tx_reimb_') && tx.ref_tx_id) { 
          let orig = data.transactions.find(t => t && t.id === tx.ref_tx_id); 
          if (orig) {
              let reimbAmt = getDebitAmount(tx);
              orig.reimbursed_amount = Math.max(0, (Number(orig.reimbursed_amount) || 0) - reimbAmt);
              if (orig.reimbursed_amount < getDebitAmount(orig)) orig.is_reimbursed = false;
          } 
      }
      if (tx && tx.invest_symbol && tx.invest_shares) { let inv = data.investments.find(i => i && i.symbol === tx.invest_symbol); if (inv) { let s = Number(tx.invest_shares) || 0; let c = Number(tx.invest_cost_value) || 0; if (tx.invest_action === 'buy' || tx.invest_action === 'init') { inv.shares = Math.max(0, inv.shares - s); inv.total_cost = Math.max(0, inv.total_cost - c); } else if (tx.invest_action === 'sell') { inv.shares += s; inv.total_cost += c; } if(inv.shares > 0) inv.last_price = inv.total_cost / inv.shares; else inv.total_cost = 0; } }
      if (tx && tx.loan_init_id) { data.loans = data.loans.filter(l => l && l.id !== tx.loan_init_id); if(tx.loan_account_id) data.accounts = data.accounts.filter(a => a && a.id !== tx.loan_account_id); }
      if (tx && tx.fa_init_id) { data.fixed_assets = data.fixed_assets.filter(fa => fa && fa.id !== tx.fa_init_id); }
      
      if (tx && tx.id.startsWith('tx_gsp_')) {
          let pName = tx.desc.replace('[群組結算] ', '').trim();
          let proj = data.split_projects.find(p => p && p.name === pName);
          if (proj) proj.is_settled = false;
      }
      
      data.transactions.splice(idx, 1); autoBackup(true, true); updateCharts();
    };

    const duplicateTransaction = (tx) => {
        if (!tx || tx.is_refunded || tx.is_refund || tx.is_reimbursed || tx.auto_generated) {
            return alert("特殊狀態或系統自動生成的明細，不支援直接複製。");
        }
        
        newTx.currency = 'TWD'; 
        entryMode.value = getDebitAccType(tx) === 'Expense' ? 'expense' : (getDebitAccType(tx) === 'Asset' ? 'transfer' : 'income');
        newTx.date = typeof getLocalISODate === 'function' ? getLocalISODate() : new Date().toISOString().split('T')[0];
        newTx.scope = tx.scope || 'personal';
        newTx.desc = getTxDesc(tx).replace(/#\S+/g, '').trim(); 
        newTx.amount = getDebitAmount(tx);

        if (tx.debits && tx.debits[0]) {
            let dAcc = data.accounts.find(a => a && a.id === tx.debits[0].account_id);
            if (dAcc && dAcc.type === 'Expense') {
                newTx.mainCategory = dAcc.category || '';
                newTx.subAccount = dAcc.id || '';
            } else if (entryMode.value === 'transfer') {
                newTx.toAcc = dAcc ? dAcc.id : '';
            }
        }
        if (tx.credits && tx.credits[0]) {
            let cAcc = data.accounts.find(a => a && a.id === tx.credits[0].account_id);
            if (cAcc && cAcc.type === 'Income') {
                newTx.mainCategory = cAcc.category || '';
                newTx.subAccount = cAcc.id || '';
            } else {
                newTx.paymentAcc = cAcc ? cAcc.id : '';
                if (entryMode.value === 'transfer') {
                    newTx.fromAcc = cAcc ? cAcc.id : '';
                }
            }
        }

        if (tx.tags && tx.tags.length > 0) {
            newTx.desc += (newTx.desc ? ' ' : '') + tx.tags.map(t => '#' + t).join(' ');
        }

        activeTab.value = 'entry';
        setTimeout(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, 50);
    };

    const smartPredictEntry = () => {
        const now = new Date();
        const hour = now.getHours();

        if (entryMode.value === 'income') {
            const salaryAcc = data.accounts.find(a => a.name === '本薪' && a.type === 'Income');
            if (salaryAcc) {
                newTx.mainCategory = salaryAcc.category || '';
                newTx.subAccount = salaryAcc.id;
                newTx.desc = '本月薪資';
                const bankAcc = data.accounts.find(a => a.type === 'Asset' && !a.is_contra && a.id !== '1101' && a.id !== '1103' && a.id !== '1201' && a.id !== '1104');
                if (bankAcc) newTx.paymentAcc = bankAcc.id;
            } else {
                alert('找不到「本薪」科目，請先於設定中建立。');
            }
            return;
        }

        if (entryMode.value === 'expense') {
            let targetSubName = '飲料點心'; // 非正餐時間的預設值
            if (hour >= 5 && hour <= 10) targetSubName = '早餐';
            else if (hour >= 11 && hour <= 14) targetSubName = '午餐';
            else if (hour >= 17 && hour <= 21) targetSubName = '晚餐';

            const subAcc = data.accounts.find(a => a.name === targetSubName && a.type === 'Expense');
            if (subAcc) {
                newTx.mainCategory = subAcc.category || '';
                newTx.subAccount = subAcc.id;
                newTx.desc = `#${targetSubName}`;

                const recentMatch = data.transactions.find(t => 
                    t.debits && t.debits[0] && t.debits[0].account_id === subAcc.id &&
                    t.credits && t.credits[0]
                );

                if (recentMatch) {
                    newTx.paymentAcc = recentMatch.credits[0].account_id;
                } else {
                    const cashAcc = data.accounts.find(a => a.name === '現金錢包');
                    if (cashAcc) newTx.paymentAcc = cashAcc.id;
                }
            } else {
                alert(`找不到「${targetSubName}」科目，請先於設定中建立。`);
            }
        }
    };
// --- 新增：發票 QR Code 掃描器邏輯 ---
    const showScannerModal = ref(false);
    let html5QrCode = null;

    const startScanner = () => {
        showScannerModal.value = true;
        // 等待彈窗 DOM 渲染完成後啟動相機
        nextTick(() => {
            if (typeof Html5Qrcode === 'undefined') return alert('掃描模組載入失敗，請檢查網路連線。');
            html5QrCode = new Html5Qrcode("qr-reader");
            
            const qrCodeSuccessCallback = (decodedText, decodedResult) => {
                // 解析台灣電子發票格式 (擷取前段資訊)
                // 格式: 字軌(10) + 民國年月日(7) + 隨機碼(4) + 銷售額Hex(8) + 總計額Hex(8)
                if (decodedText && decodedText.length >= 37 && /^[A-Z]{2}\d{8}\d{7}/.test(decodedText)) {
                    try {
                        // 1. 取得日期並轉換為西元
                        let rocYear = parseInt(decodedText.substring(10, 13), 10);
                        let month = decodedText.substring(13, 15);
                        let day = decodedText.substring(15, 17);
                        let gregorianYear = rocYear + 1911;
                        let invoiceDate = `${gregorianYear}-${month}-${day}`;

                        // 2. 取得總計額 (第 29 到 37 字元為 16進制)
                        let hexAmount = decodedText.substring(29, 37);
                        let totalAmount = parseInt(hexAmount, 16);

                        // 3. 取得發票號碼
                        let invNumber = decodedText.substring(0, 10);

                        // 4. 寫入記帳表單
                        entryMode.value = 'expense';
                        newTx.currency = 'TWD';
                        newTx.date = invoiceDate;
                        newTx.amount = totalAmount;
                        
                        if (!newTx.desc || newTx.desc === '無摘要') {
                            newTx.desc = `發票 ${invNumber}`;
                        } else if (!newTx.desc.includes(invNumber)) {
                            newTx.desc += ` (發票 ${invNumber})`;
                        }

                        // 成功震動回饋 (如果手機支援)
                        if (navigator.vibrate) navigator.vibrate(200);
                        
                        stopScanner();
                        setTimeout(() => { alert(`✅ 發票掃描成功！\n\n日期：${invoiceDate}\n金額：$${totalAmount}`); }, 100);
                    } catch (e) {
                        console.warn("發票解析錯誤:", e);
                    }
                }
            };

            const config = { fps: 10, qrbox: { width: 250, height: 250 } };
            // 優先調用後置相機 (environment)
            html5QrCode.start({ facingMode: "environment" }, config, qrCodeSuccessCallback)
                .catch((err) => {
                    alert("無法存取相機，請確認瀏覽器已給予鏡頭權限。");
                    stopScanner();
                });
        });
    };

    const stopScanner = () => {
        if (html5QrCode) {
            html5QrCode.stop().then(() => {
                html5QrCode.clear();
                html5QrCode = null;
                showScannerModal.value = false;
            }).catch(err => {
                showScannerModal.value = false;
            });
        } else {
            showScannerModal.value = false;
        }
    };

    
    const submitProjectBudget = () => {
        // 1. 寬鬆驗證：只強制要求名稱與金額上限
        if (!projectBudgetForm.name || !projectBudgetForm.limit) {
            return alert('請填妥專案名稱與預算總額上限！');
        }
        
        // 2. 絕對防呆：確保陣列結構存在
        if (!data.project_budgets) data.project_budgets = [];
        
        // 3. 智慧補全：未填標籤自動用名稱替代；未填日期則給予預設涵蓋極大範圍的日期
        let tagClean = (projectBudgetForm.tag || projectBudgetForm.name).replace('#', '').trim();
        let sDate = projectBudgetForm.startDate || getLocalISODate();
        let eDate = projectBudgetForm.endDate || '2099-12-31';

        if (editingProjectId.value) {
            // 編輯覆蓋模式
            let p = data.project_budgets.find(x => x.id === editingProjectId.value);
            if (p) {
                p.name = projectBudgetForm.name;
                p.tag = tagClean;
                p.limit = projectBudgetForm.limit;
                p.startDate = sDate;
                p.endDate = eDate;
            }
        } else {
            // 4. 寫入資料庫 (新增)
            data.project_budgets.push({
                id: 'proj_' + Date.now(), 
                name: projectBudgetForm.name, 
                tag: tagClean, 
                limit: projectBudgetForm.limit,
                startDate: sDate, 
                endDate: eDate
            });
        }
        
        // 5. 關閉彈窗並清空表單
        closeProjectBudgetModal();
        autoBackup(true, true);
    };

    const deleteProjectBudget = (id) => {
        if (confirm('確定刪除此專案預算？')) {
            data.project_budgets = data.project_budgets.filter(p => p && p.id !== id);
            autoBackup(true, true);
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
                        let txNetCost = 0;
                        // 借方 (費用增加) => 專案開銷增加
                        (tx.debits || []).forEach(d => {
                            let a = (data.accounts || []).find(ac => ac && ac.id === d.account_id);
                            if (a && a.type === 'Expense') { txNetCost += Number(d.amount)||0; }
                        });
                        // 貸方 (退款費用減少 或 收入增加) => 專案開銷減少 (補血)
                        (tx.credits || []).forEach(c => {
                            let a = (data.accounts || []).find(ac => ac && ac.id === c.account_id);
                            if (a && (a.type === 'Expense' || a.type === 'Income')) { txNetCost -= Number(c.amount)||0; }
                        });
                        spent += txNetCost;
                    }
                }
            });
            // 確保計算比例與剩餘額度
            return {
                ...proj, spent, remaining: proj.limit - spent,
                pct: Math.max(0, Math.min(Math.round((spent / proj.limit) * 100), 100))
            };
        }).filter(Boolean);
    });

    const submitInitialStock = () => {
        let s = Number(initStock.shares) || 0;
        if (initStock.unitType === 'lot') s *= 1000;
        if (!initStock.symbol || s <= 0 || !(initStock.cost > 0 || initStock.price > 0)) return alert("請填寫完整股票代號、股數，以及單價或總成本");
        let p = Number(initStock.price) || 0;
        let c = Number(initStock.cost) || 0;
        if (c <= 0 && p > 0) c = Math.round(s * p);
        if (p <= 0 && c > 0) p = Number((c / s).toFixed(2));
        let existingInv = data.investments.find(i => i && i.symbol === initStock.symbol);
        if (existingInv) {
            existingInv.shares += s; existingInv.total_cost += c;
            if (existingInv.shares > 0) existingInv.last_price = existingInv.total_cost / existingInv.shares;
        } else {
            data.investments.push({ id: 'inv_' + Date.now(), symbol: initStock.symbol, name: initStock.name || initStock.symbol, shares: s, total_cost: c, last_price: p || (c / s), currency: 'TWD' });
        }
        data.transactions.unshift({ id: 'tx_init_' + Date.now(), date: getLocalISODate(), scope: 'personal', desc: `期初建倉 ${initStock.name || initStock.symbol} ${s}股`, debits: [{ account_id: '1103', amount: c }], credits: [{ account_id: '3101', amount: c }], invest_action: 'init', invest_symbol: initStock.symbol, invest_shares: s, invest_cost_value: c });
        showInitialStockModal.value = false; initStock.symbol = ''; initStock.name = ''; initStock.shares = null; initStock.price = null; initStock.cost = null; initStock.unitType = 'share';
        autoBackup(true, true); updateCharts();
    };

    const submitFixedAsset = () => {
      if(!initFA.name || !initFA.cost || !initFA.months) return alert("請填寫完整");
      let monthlyDep = Math.round(initFA.cost / initFA.months);
      let newFaId = 'fa_'+Date.now();
      data.fixed_assets.push({ id: newFaId, name: initFA.name, purchase_date: initFA.date, original_cost: initFA.cost, monthly_depreciation: monthlyDep, asset_account_id: '1201', accumulated_dep_account_id: '1201-DEP', expense_account_id: '5102', last_depreciation_date: null, is_disposed: false });
      data.transactions.unshift({ id: 'tx_fa_'+Date.now(), date: initFA.date, scope: initFA.scope, desc: `購入固定資產 ${initFA.name}`, debits: [{ account_id: '1201', amount: initFA.cost }], credits: [{ account_id: '3101', amount: initFA.cost }], fa_init_id: newFaId });
      showAddFixedAssetModal.value = false; initFA.name = ''; initFA.cost = null; initFA.months = 60; initFA.scope = 'personal'; autoBackup(true, true); updateCharts(); alert('✅ 固定資產登錄成功！');
    };

    const openDisposalModal = (fa) => { disposalAsset.value = fa; disposalForm.type = 'scrap'; disposalForm.price = null; disposalForm.account = ''; showDisposalModal.value = true; };
    const submitDisposal = () => {
      if (disposalForm.type === 'sell' && (disposalForm.price === null || !disposalForm.account)) return alert("請填寫出售金額與入帳帳戶");
      let fa = disposalAsset.value; if(!fa) return;
      let bookValue = getFABookValue(fa); let accDep = getFAAccDep(fa);
      let txObj = { id: 'tx_disp_' + Date.now(), date: getLocalISODate(), scope: 'family', desc: `處分資產: ${fa.name}`, debits: [{ account_id: '1201-DEP', amount: accDep }], credits: [{ account_id: '1201', amount: fa.original_cost }] };
      if (disposalForm.type === 'scrap') {
         if(bookValue > 0) txObj.debits.push({ account_id: '4201', amount: bookValue });
         txObj.desc = `報廢資產: ${fa.name}`;
      } else {
         txObj.debits.push({ account_id: disposalForm.account, amount: disposalForm.price });
         let gain = disposalForm.price - bookValue;
         if(gain > 0) txObj.credits.push({ account_id: '4201', amount: gain });
         else if (gain < 0) txObj.debits.push({ account_id: '4201', amount: Math.abs(gain) });
      }
      data.transactions.unshift(txObj); fa.is_disposed = true; showDisposalModal.value = false; autoBackup(true, true); updateCharts(); alert('✅ 處分完成！');
    };

    const submitAddLoan = () => {
      if(!initLoan.name || !initLoan.principal || !initLoan.rate || !initLoan.payment) return alert("請填妥所有貸款欄位");
      if(initLoan.autoDeduct && (!initLoan.deductDay || !initLoan.deductAccountId)) return alert("請填寫自動扣款日與扣繳帳戶");
      
      let accId = 'loan_liab_' + Date.now(); let loanId = 'loan_' + Date.now();
      data.accounts.push({ id: accId, name: initLoan.name, type: 'Liability', currency: 'TWD', is_hidden: false });
      
      data.loans.push({ 
          id: loanId, name: initLoan.name, liability_acc_id: accId, interest_rate: initLoan.rate, monthly_payment: initLoan.payment,
          auto_deduct: initLoan.autoDeduct, deduct_day: initLoan.deductDay, deduct_account_id: initLoan.deductAccountId, last_exec_month: ''
      });
      
      data.transactions.unshift({ id: 'tx_loan_init_'+Date.now(), date: getLocalISODate(), scope: 'personal', desc: `期初貸款本金: ${initLoan.name}`, debits: [{ account_id: '3101', amount: initLoan.principal }], credits: [{ account_id: accId, amount: initLoan.principal }], loan_init_id: loanId, loan_account_id: accId });
      newTx.loanId = loanId; 
      initLoan.name = ''; initLoan.principal = null; initLoan.rate = null; initLoan.payment = null; 
      initLoan.autoDeduct = false; initLoan.deductDay = 1; initLoan.deductAccountId = '';
      showAddLoanModal.value = false; autoBackup(true, true); updateCharts(); alert('✅ 貸款建立成功！');
    };

    const openRateModal = (loan) => { activeLoan.value = loan; rateData.rate = loan.interest_rate; showRateModal.value = true; };
    const submitRateAdjust = () => { if(!rateData.rate) return alert("請輸入利率"); activeLoan.value.interest_rate = rateData.rate; showRateModal.value = false; autoBackup(true, true); alert('✅ 利率修改成功！'); };

    const submitAddGoal = () => {
      if(!initGoal.name || !initGoal.target) return alert("請填寫目標名稱與金額");
      let tagClean = initGoal.tag ? initGoal.tag.replace('#', '').trim() : initGoal.name.replace(/\s+/g, '');
      data.savings_goals.push({ id: 'goal_' + Date.now(), name: initGoal.name, tag: tagClean, target: initGoal.target, deadline: initGoal.deadline, saved: 0 });
      showAddGoalModal.value = false; initGoal.name = ''; initGoal.tag = ''; initGoal.target = null; initGoal.deadline = ''; autoBackup(true, true); alert('✅ 目標建立成功！');
    };
    const openUpdateGoalModal = (goal) => { activeGoal.value = goal; updateGoalData.amount = null; updateGoalData.type = 'add'; showUpdateGoalModal.value = true; };
    const submitUpdateGoal = () => {
      if(!activeGoal.value || !updateGoalData.amount) return;
      if(updateGoalData.type === 'add') { activeGoal.value.saved += updateGoalData.amount; } else { activeGoal.value.saved = updateGoalData.amount; }
      if(activeGoal.value.saved < 0) activeGoal.value.saved = 0;
      showUpdateGoalModal.value = false; autoBackup(true, true); alert('✅ 進度已更新！');
    };
    const deleteGoal = (id) => { if(!confirm("確定刪除此儲蓄目標？")) return; data.savings_goals = data.savings_goals.filter(g => g && g.id !== id); autoBackup(true, true); };

    const addRecurring = () => {
      if(!newRecurring.desc || !newRecurring.amount || !newRecurring.account) return alert("請填妥排程資訊");
      data.recurring.push({ id: 'rec_'+Date.now(), type: newRecurring.type, desc: newRecurring.desc, amount: newRecurring.amount, day: newRecurring.day, account: newRecurring.account });
      newRecurring.desc = ''; newRecurring.amount = null; newRecurring.day = 1; autoBackup(true, true); alert('✅ 排程建立成功！');
    };
    const deleteRecurring = (id) => { data.recurring = data.recurring.filter(r => r && r.id !== id); autoBackup(true, true); };

    const addMainCategory = () => { let list = data.main_categories[settingCategoryMode.value] || []; if (newMainCat.value && !list.includes(newMainCat.value)) { data.main_categories[settingCategoryMode.value].push(newMainCat.value); newMainCat.value = ''; autoBackup(true, true); } };
    const deleteMainCategory = (type, name) => { if(getSubAccounts(type, name, true).length > 0) return alert("請先清空子類別"); data.main_categories[type] = (data.main_categories[type] || []).filter(c => c !== name); autoBackup(true, true); };
    const addSubCategory = () => { if (newSubCat.name && newSubCat.main) { data.accounts.push({ id: 'acc_'+Date.now(), name: newSubCat.name, type: settingCategoryMode.value, category: newSubCat.main, currency: 'TWD', is_hidden: false }); newSubCat.name = ''; autoBackup(); refreshIcons(); } };
    const addPreset = () => { let list = data.quick_tags || []; if (newPreset.value && !list.includes(newPreset.value)) { data.quick_tags.push(newPreset.value); newPreset.value = ''; autoBackup(true, true); } };
    const removePreset = (idx) => { data.quick_tags.splice(idx, 1); autoBackup(true, true); };
    const toggleAccountVisibility = (id) => { let a = data.accounts.find(a => a && a.id === id); if (a) { a.is_hidden = !a.is_hidden; autoBackup(); refreshIcons(); } };
    const deleteAccount = (id) => {
      let isUsed = false;
      data.transactions.forEach(tx => {
        if(tx.debits) tx.debits.forEach(d => { if(d.account_id === id) isUsed = true; });
        if(tx.credits) tx.credits.forEach(c => { if(c.account_id === id) isUsed = true; });
      });
      if (isUsed) return alert("已有紀錄，請改用隱藏");
      if (confirm("確定刪除?")) { data.accounts = data.accounts.filter(a => a && a.id !== id); autoBackup(true, true); }
    };

    const runAutoTasks = () => {
      let curM = getLocalISODate().substring(0,7); let today = new Date().getDate();
      (data.fixed_assets || []).forEach(fa => {
        if(!fa || fa.is_disposed) return;
        let ld = fa.last_depreciation_date || fa.purchase_date || '';
        if (ld && ld.length >= 7 && ld.substring(0,7) < curM) {
          let accDep = getFAAccDep(fa);
          if (accDep + fa.monthly_depreciation > fa.original_cost) return; 
          data.transactions.unshift({ id: 'tx_dep_'+Date.now()+Math.random(), date: getLocalISODate(), desc: `${fa.name} 自動折舊`, scope: 'family', auto_generated: true, asset_id: fa.id, debits: [{ account_id: fa.expense_account_id, amount: fa.monthly_depreciation }], credits: [{ account_id: fa.accumulated_dep_account_id, amount: fa.monthly_depreciation }] });
          fa.last_depreciation_date = getLocalISODate();
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
      }); // <-- 修正：確保週期排程在這裡正確關閉！

      // 獨立的貸款自動扣款引擎
      (data.loans || []).forEach(loan => {
        if(!loan || !loan.auto_deduct || !loan.monthly_payment || !loan.deduct_account_id) return;
        let lastExec = loan.last_exec_month || '';
        
        // 如果這個月還沒執行過，而且今天的日期已經大於等於設定的扣款日
        if (lastExec !== curM && today >= loan.deduct_day) {
            // 動態精算當下剩餘本金與利息
            let cp = Math.abs(calculateBalance(loan.liability_acc_id, 'all'));
            if (cp <= 0) return; // 已經還清就不再扣款
            
            let interest = Math.round(cp * ((loan.interest_rate || 0) / 100 / 12));
            let principal = Math.min(loan.monthly_payment - interest, cp); // 本金最多只能還到剩下 0
            let totalDeduct = principal + interest;

            let txObj = { 
                id: 'tx_loan_auto_' + Date.now() + Math.random(), 
                date: `${curM}-${String(loan.deduct_day).padStart(2,'0')}`, 
                scope: 'personal', 
                desc: `[自動扣款] 貸款還款: ${loan.name}`, 
                debits: [
                    { account_id: loan.liability_acc_id, amount: principal },
                    { account_id: '5103', amount: interest }
                ], 
                credits: [{ account_id: loan.deduct_account_id, amount: totalDeduct }], 
                auto_generated: true,
                loan_id: loan.id
            };
            data.transactions.unshift(txObj); 
            loan.last_exec_month = curM;
        }
      });
    };

    let backupTimeout = null; // 防抖計時器

    // immediate 參數：若為 true 則無底延遲立即存檔 (例如新增一筆交易時)
    const autoBackup = (syncCloud = true, immediate = false) => {
      const coreTask = () => {
          data.last_modified = Date.now(); // 寫入最新時間戳記，供防覆蓋比對用
          try {
              const serializedData = JSON.stringify(data, (key, value) => value === null ? undefined : value);
              const SAFE_LIMIT = 4200000; 
              if (serializedData.length > SAFE_LIMIT && !hasShownStorageWarning) {
                  hasShownStorageWarning = true;
                  setTimeout(() => { 
                      if (confirm('⚠️ 系統偵測到您的帳本資料量已達本機儲存上限 85%！\n建議您執行「會計結轉與瘦身精靈」，是否立即前往清理？')) {
                          activeTab.value = 'settings';
                          openRolloverModal();
                      }
                  }, 150);
              }
              localStorage.setItem('ledger_backup_' + settings.currentBookId, serializedData); 
          } catch (e) {
              if (e.name === 'QuotaExceededError') {
                  alert('⚠️ 本機空間已滿！系統已自動觸發歷史紀錄降載 (僅保留近 2 年)。');
                  const d = new Date(); d.setFullYear(d.getFullYear() - 2);
                  const cutoffDate = new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split('T')[0];
                  data.transactions = data.transactions.filter(tx => tx && tx.date >= cutoffDate);
                  localStorage.setItem('ledger_backup_' + settings.currentBookId, JSON.stringify(data));
                  hasShownStorageWarning = false;
              }
          }
          if(syncCloud && settings.googleToken) syncWithGoogleDrive(false); 
      };

      if (immediate) {
          clearTimeout(backupTimeout);
          coreTask();
      } else {
          clearTimeout(backupTimeout);
          backupTimeout = setTimeout(coreTask, 800); // 延遲 800ms，減少連續打字時的卡頓
      }
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
                // --- 雲端防覆蓋比對機制 ---
                let localTime = data.last_modified || 0;
                let cloudTime = cloudData.last_modified || 0;
                
                if (cloudTime > localTime) {
                    if (!confirm('⚠️ 偵測到雲端有較新版本的帳本！\n(可能來自您的其他裝置)\n\n是否要【下載覆蓋】本機資料？\n(若選取消，將強制以本機資料覆蓋雲端)')) {
                        // 使用者選擇以本機為準，直接上傳
                        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${settings.googleToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
                        alert('☁️ 已強制以本機資料覆蓋雲端。');
                        syncStatus.value = 'ok';
                        isSyncing.value = false;
                        return;
                    }
                }

                // 執行下載還原
                resetData(); Object.assign(data, cloudData);
                if (typeof setupDefaultData === 'function') setupDefaultData(data, typeof DEFAULT_CATEGORIES !== 'undefined' ? DEFAULT_CATEGORIES : {});
                runAutoTasks(); localStorage.setItem('ledger_backup_' + currentBookId.value, JSON.stringify(data));
                if (expenseChartInstance.value) { expenseChartInstance.value.destroy(); expenseChartInstance.value = null; }
                if (assetChartInstance.value) { assetChartInstance.value.destroy(); assetChartInstance.value = null; }
                if (netWorthChartInstance.value) { netWorthChartInstance.value.destroy(); netWorthChartInstance.value = null; }
                updateCharts(); 
                alert('✅ 雲端資料已成功下載並同步！'); 
              } else { 
                alert('⚠️ 雲端資料無效，已保留本機資料防止覆蓋！'); 
              }
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

    const updateStockPrices = async () => {
        let updatedCount = 0;
        let twdInvestmentsCount = data.investments.filter(i => i && i.currency !== 'USD' && i.shares > 0).length;
        if (twdInvestmentsCount === 0) return alert('目前無持股需要更新');

        // --- 4 小時 API 限流保護機制 ---
        const lastUpdate = localStorage.getItem('ledger_stock_last_update');
        if (lastUpdate && Date.now() - Number(lastUpdate) < 4 * 60 * 60 * 1000) {
            let hours = (4 - (Date.now() - Number(lastUpdate)) / 3600000).toFixed(1);
            if (!confirm(`⏱️ 為防 API 遭阻擋，系統已啟動 4 小時快取保護。\n距離下次開放自動更新還需約 ${hours} 小時。\n\n要跳過自動連線，直接進入「手動更新模式」嗎？`)) {
                return; // 使用者選擇維持目前快取
            } else {
                showManualStockModal.value = true;
                return;
            }
        }

        const loadingScreen = document.getElementById('native-loading');
        if (loadingScreen) {
            loadingScreen.style.display = 'flex';
            const title = loadingScreen.querySelector('h2');
            if (title) title.innerText = '股價更新中...';
        }

        try {
            for (let inv of data.investments) {
                if (!inv || inv.currency === 'USD' || inv.shares <= 0) continue;
                let sym = (inv.symbol || '').replace('.TW', '');
                if (!sym) continue;

                let price = null;
                const fetchPrice = async (url, extractFn) => {
                    try {
                        let res = await fetchWithTimeout(url, {}, 3500); 
                        if (res.ok) {
                            let d = await res.json();
                            let p = extractFn(d);
                            if (p > 0 && p < 100000) return p;
                        }
                    } catch(e) {}
                    return null;
                };

                price = await fetchPrice(`https://corsproxy.io/?url=https://query1.finance.yahoo.com/v8/finance/chart/${sym}.TW`, d => (d && d.chart && d.chart.result && d.chart.result[0] && d.chart.result[0].meta && d.chart.result[0].meta.regularMarketPrice) || null);
                if (!price) price = await fetchPrice(`https://api.allorigins.win/get?url=${encodeURIComponent('https://query1.finance.yahoo.com/v8/finance/chart/' + sym + '.TW')}`, d => {
                    try { let parsed = JSON.parse(d.contents); return (parsed && parsed.chart && parsed.chart.result && parsed.chart.result[0] && parsed.chart.result[0].meta && parsed.chart.result[0].meta.regularMarketPrice) || null; } catch(e) { return null; }
                });
                if (!price) price = await fetchPrice(`https://api.allorigins.win/raw?url=https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=tse_${sym}.tw`, d => (d && d.msgArray && d.msgArray[0]) ? parseFloat(d.msgArray[0].z !== '-' ? d.msgArray[0].z : d.msgArray[0].y) : null);
                if (!price) price = await fetchPrice(`https://api.allorigins.win/raw?url=https://mis.twse.com.tw/stock/api/getStockInfo.jsp?ex_ch=otc_${sym}.tw`, d => (d && d.msgArray && d.msgArray[0]) ? parseFloat(d.msgArray[0].z !== '-' ? d.msgArray[0].z : d.msgArray[0].y) : null);

                if (price) { inv.last_price = price; updatedCount++; }
            }

            if (updatedCount > 0 && updatedCount === twdInvestmentsCount) { 
                localStorage.setItem('ledger_stock_last_update', Date.now().toString()); // 更新成功，寫入時間戳
                alert('✅ 股價自動更新完成！'); autoBackup(); updateCharts(); 
            } else { 
                alert('⚠️ 外部 API 遇上 429 限流或連線逾時，已為您無縫降級至「手動更新模式」。\n(已自動更新 ' + updatedCount + '/' + twdInvestmentsCount + ' 檔)');
                showManualStockModal.value = true; 
            }
        } finally {
            if (loadingScreen) {
                loadingScreen.style.display = 'none';
                const title = loadingScreen.querySelector('h2');
                if (title) title.innerText = '系統啟動中'; 
            }
        }
    };

    const submitManualStockUpdate = () => { showManualStockModal.value = false; autoBackup(true, true);; updateCharts(); alert('✅ 手動股價更新完成'); };
    const setHistoryToCurrentMonth = () => { const now = new Date(); const y = now.getFullYear(); const mStr = String(now.getMonth() + 1).padStart(2, '0'); historyFilter.dateFrom = `${y}-${mStr}-01`; historyFilter.dateTo = `${y}-${mStr}-${new Date(y, now.getMonth() + 1, 0).getDate()}`; };
    const fetchExchangeRate = async () => { try { const res = await fetchWithTimeout('https://api.exchangerate-api.com/v4/latest/USD', {}, 3000); const fx = await res.json(); if(fx && fx.rates && fx.rates.TWD) fxRate.value = fx.rates.TWD; } catch(e) {} };
    
    const loadSettings = () => { 
      try { const s = JSON.parse(localStorage.getItem('ledger_settings') || '{}'); if(s && typeof s === 'object') Object.assign(settings, s); } catch(e) {} 
      if(!settings.appName) settings.appName = 'Kadu｜卡度記帳'; 
      if(!settings.booksIndex || settings.booksIndex.length === 0) settings.booksIndex = [{id: 'default', name: '日常帳本'}];
      if(settings.billingStartDay === undefined) settings.billingStartDay = 1;
      currentBookId.value = settings.currentBookId || 'default';
      if(!settings.pinEnabled) isUnlocked.value = true; 
    };
    
    const unlockApp = () => { if (pinInput.value === settings.pinCode) { isUnlocked.value = true; initData(); } else { pinError.value = "PIN錯誤"; } };
    const saveSettings = (showAlert = true) => { settings.currentBookId = currentBookId.value; localStorage.setItem('ledger_settings', JSON.stringify(settings)); if (showAlert) alert('設定已儲存'); if (settings.googleToken && settings.googleClientId) initGoogleAuth(); };
    const exportData = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'})); a.download = `Ledger_${currentBookId.value}_${getLocalISODate()}.json`; a.click(); };
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
            let scope = dashboardScope.value; let cTot=0, sTot=0;
            (data.accounts || []).forEach(a => { if(a && a.type==='Asset' && !a.is_contra && a.id!=='1103' && a.id!=='1201' && a.id!=='1104') cTot += getBaseBalance(a.id, calculateBalance(a.id, scope)); });
            (data.investments || []).forEach(inv => { if(inv) sTot += (Number(inv.shares)||0) * (Number(inv.last_price)||0) * (data.currencyRates[inv.currency||'TWD']||1); });
            let fTot = calculateBalance('1201', scope) + calculateBalance('1201-DEP', scope);
            if (typeof renderAssetChart === 'function') { assetChartInstance.value = renderAssetChart(assetChartInstance.value, 'assetChart', cTot, sTot, fTot); }

            let histLabels = []; let histData = []; let d = new Date();
            let allStockCost = calculateBalance('1103', 'all'); let scopeStockCost = calculateBalance('1103', scope);
            let scopeRatio = allStockCost ? (scopeStockCost / allStockCost) : 0;
            let totalInvMV = 0; let totalInvCost = 0;
            (data.investments||[]).forEach(inv => { totalInvMV += (Number(inv.shares)||0) * (Number(inv.last_price)||0) * (data.currencyRates[inv.currency||'TWD']||1); totalInvCost += Number(inv.total_cost)||0; });
            let scopeUnrealizedGain = (totalInvMV - totalInvCost) * scopeRatio;

            for(let i=5; i>=0; i--) {
                let tempDate = new Date(d.getFullYear(), d.getMonth() - i, 1);
                let mStr = tempDate.getFullYear() + '-' + String(tempDate.getMonth()+1).padStart(2,'0');
                histLabels.push(mStr); let endOfMonth = mStr + '-31'; let aSum=0, lSum=0;
                (data.accounts||[]).forEach(a => {
                    if(!a) return; let bal = 0;
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
            if (typeof renderNetWorthChart === 'function') { netWorthChartInstance.value = renderNetWorthChart(netWorthChartInstance.value, 'netWorthChart', histLabels, histData); }
        } catch (err) { console.warn("Chart Render Error:", err); }
      });
    };

    const refreshIcons = () => { // 已全面改用原生 SVG，無須再依賴 Lucide CDN 實例化
    };
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
      migrateLegacyData(); runAutoTasks(); if (['dashboard', 'reports', 'budget'].includes(activeTab.value)) updateCharts(); refreshIcons();
    };

    onMounted(() => {
      loadSettings();
      checkSharedUrl();
      if(isUnlocked.value) { initData(); } 
      else { isAppReady.value = true; let loadingScreen = document.getElementById('native-loading'); if(loadingScreen) loadingScreen.style.display = 'none'; refreshIcons(); }
    });

    const safeFormatNumber = typeof formatNumber === 'function' ? formatNumber : (n => Math.round(n).toLocaleString());

    // --- 嚴格確保所有新增狀態與方法 100% 匯出 ---
    return { 
      isAppReady, activeTab,  isDrawerOpen, entryMode, dashboardScope, isUnlocked, pinInput, pinError, resetPin,
      syncStatus, isSyncing, showAmounts, dashboardMonth, fxRate,
      isCalcOpen, calcExpression, isListening,
      reportView, reportPeriod, reportStartDate, reportEndDate,
      showAddAccountModal, showInitialStockModal, showAddFixedAssetModal, showDisposalModal, showAddLoanModal, showRateModal, 
      showResetModal, showNewBookModal, showAddGoalModal, showUpdateGoalModal, showManualStockModal, showRefundModal, showReimburseModal,
      editTxModal, showInstallmentModal, showProjectBudgetModal,
      
      showGroupSplitProjectModal, showGroupSplitRecordModal, showGroupSettleLedgerModal,
      showRolloverModal, rolloverDate, hasDownloadedBackup, openRolloverModal, downloadBackupForRollover, executeRollover,
      showSharedSettlementModal, sharedData,
      activeSplitProjectId, groupSplitProjectForm, groupSplitRecordForm, groupSettleLedgerForm,
      activeSplitProject, activeSplitRecords, activeSplitBalances, activeSplitSettlements,
      openGroupSplitCenter, viewGroupSplitProject, backToSplitProjects, addSplitMemberField, removeSplitMemberField,
      saveGroupSplitProject, deleteGroupSplitProject, initGroupSplitRecordForm, editGroupSplitRecord, calculateGroupSplitRecord,
      saveGroupSplitRecord, deleteGroupSplitRecord, shareGroupSettlement, writeGroupSettlementToLedger,
      
      activeRefundTx, refundData, activeReimburseTx, reimburseData, settings, currentBookId, newBookName, data, newTx, txError,newTxBaseAmount, 
      historyFilter, settingCategoryMode, newPreset, newMainCat, newSubCat, newAssetAcc, initStock, initFA, 
      disposalAsset, disposalForm, initLoan, activeLoan, rateData, newRecurring, initGoal, activeGoal, updateGoalData,
      editingTx, selectedInstallment, projectBudgetForm,
      calcAppend, calcClear, calcBackspace, calcConfirm, startVoiceRecognition,
      editingProjectId, openEditProjectBudgetModal, closeProjectBudgetModal,
      submitProjectBudget, deleteProjectBudget, projectBudgetStats, viewProjectDetails,
      changeTab, unlockApp, saveSettings, exportData, importData, onSymbolInput, onInvestSelectedSymbolChange, filterByAccount,historyPreviousTab, clearHistoryFilterAndBack, showEditAccountModal, editingAccount, openEditAccountModal, saveEditAccount, executeDeleteAccountFromModal, newCurrencyCode, addCustomCurrency, deleteCustomCurrency, updateFxRates,
      activeBookName, availableBooks, assetAccounts, paymentAccounts, liabilityAccounts, activeInstallments, 
      getSubAccounts, safeQuickTags, safeInvestments, safeFixedAssets, safeLoans, safeRecurring, safeSavingsGoals,
      currentHoldings, historicalHoldings, calculateBalance, getBaseBalance, accountsWithBalance, 
      paymentAccountsWithBalance, assetAccountsWithBalance, liquidAccountsWithBalance, liabilityAccountsWithBalance, 
      totalLiquidAssets, upcomingBillsTotal, cashflowWarning, totalAssets, totalLiabilities, netWorth,
      activeBillingPeriod, currentMonthIncome, currentMonthExpense,
      sortedTransactions, filteredTransactions, historyDisplayLimit, paginatedTransactions, loadMoreHistory, ytdDividend, dashboardBudgets, budgetStats, getAccName, formatNumber: safeFormatNumber,
      getTxDesc, getDebitAccName, getCreditAccName, getDebitAmount, getDebitAccType, getInvestTotalAmount, 
      getInvCurrentValue, getUnrealizedGain, getFAAccDep, getFABookValue, getAccumulatedInterest, loanRepayPreview, 
      getTxColorBand, getTxAmountColor, applyQuickTag, onDividendSymbolChange,activeProjectTags, combinedQuickTags, recentExpenses, applyRecentTx, bsData, isData, cfData,
      switchBook, createNewBook, submitNewBook, deleteBook, submitNewAssetAccount, submitTransaction, openRefundModal, closeRefundModal, submitRefund,
      openReimburseModal, closeReimburseModal, submitReimburse, reimburseTx, openEditModal, saveEditTx, viewInstallmentDetails,
      deleteTransaction, duplicateTransaction,smartPredictEntry, showScannerModal, startScanner, stopScanner, submitInitialStock, calculateInitStockCost, submitFixedAsset, openDisposalModal, submitDisposal, submitAddLoan, 
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

// --- 註冊模組化子元件 ---
const modalMixin = {
  emits: ['close', 'confirm', 'update:modelValue'],
  updated() { if (this.show && window.lucide) lucide.createIcons(); } // 確保 v-if 顯示時能正確渲染圖示
};

app.component('modal-new-book', {
  template: '#tpl-modal-new-book',
  props: ['show', 'modelValue'],
  mixins: [modalMixin]
});

app.component('modal-reset', {
  template: '#tpl-modal-reset',
  props: ['show', 'bookName'],
  mixins: [modalMixin]
});


app.mount('#app');