// syncService.js - Google Drive 雲端同步模組
const SyncService = {
  tokenClient: null,

  init(clientId, onSuccessCallback) {
    if (!clientId || typeof google === "undefined") return;
    this.tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: "https://www.googleapis.com/auth/drive.file",
      callback: onSuccessCallback,
    });
    if (typeof gapi !== "undefined") {
      gapi.load("client", () => {
        gapi.client.init({}).then(() => {
          // Token 會在取得後再 setToken
        });
      });
    }
  },

  login() {
    if (this.tokenClient) {
      this.tokenClient.requestAccessToken({ prompt: "consent" });
    }
  },

  logout(context) {
    context.settings.googleToken = "";
    context.settings.fileId = "";
    context.saveSettings(false);
  },

  async syncWithDrive(context, isManual = false) {
    const {
      settings,
      data,
      currentBookId,
      syncStatus,
      isSyncing,
      saveSettings,
      setupDefaultData,
      runAutoTasks,
      updateCharts,
      StorageDB,
      CryptoUtils,
    } = context;

    if (!settings.googleToken || typeof gapi === "undefined" || !gapi.client)
      return;
    isSyncing.value = true;

    try {
      gapi.client.setToken({ access_token: settings.googleToken });
      let fileId = settings.fileId;
      let currentFileName = `ledger_data_${currentBookId.value}.json`;

      if (!fileId) {
        let query = await gapi.client.request({
          path: "https://www.googleapis.com/drive/v3/files",
          method: "GET",
          params: { q: `name='${currentFileName}' and trashed=false` },
        });
        if (query.result.files && query.result.files.length > 0) {
          fileId = query.result.files[0].id;
        }
      }

      if (fileId) {
        settings.fileId = fileId;
        saveSettings(false);
        if (isManual) {
          let fileRes = await gapi.client.request({
            path: `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
            method: "GET",
          });
          let cloudData = fileRes.result;
          if (typeof cloudData === "string") {
            try {
              cloudData = JSON.parse(cloudData);
            } catch (e) {
              cloudData = null;
            }
          }

          if (
            cloudData &&
            typeof cloudData === "object" &&
            (cloudData.accounts || cloudData.transactions)
          ) {
            // [無縫智慧合併 (Smart Merge) 機制]
            const mergeArrayById = (localArr, cloudArr) => {
              let map = new Map();
              (cloudArr || []).forEach((item) => {
                if (
                  item &&
                  item.id &&
                  !(data.deleted_ids || []).includes(item.id)
                ) {
                  map.set(item.id, item);
                }
              });
              (localArr || []).forEach((item) => {
                if (item && item.id) {
                  if (map.has(item.id)) {
                    map.set(item.id, Object.assign({}, map.get(item.id), item));
                  } else {
                    map.set(item.id, item);
                  }
                }
              });
              return Array.from(map.values());
            };

            const mergeStrArray = (localArr, cloudArr) =>
              Array.from(new Set([...(localArr || []), ...(cloudArr || [])]));

            data.deleted_ids = mergeStrArray(
              data.deleted_ids,
              cloudData.deleted_ids,
            );
            data.transactions = mergeArrayById(
              data.transactions,
              cloudData.transactions,
            );
            data.accounts = mergeArrayById(data.accounts, cloudData.accounts);
            data.fixed_assets = mergeArrayById(
              data.fixed_assets,
              cloudData.fixed_assets,
            );
            data.investments = mergeArrayById(
              data.investments,
              cloudData.investments,
            );
            data.installments = mergeArrayById(
              data.installments,
              cloudData.installments,
            );
            data.loans = mergeArrayById(data.loans, cloudData.loans);
            data.savings_goals = mergeArrayById(
              data.savings_goals,
              cloudData.savings_goals,
            );
            data.recurring = mergeArrayById(
              data.recurring,
              cloudData.recurring,
            );
            data.project_budgets = mergeArrayById(
              data.project_budgets,
              cloudData.project_budgets,
            );
            data.split_projects = mergeArrayById(
              data.split_projects,
              cloudData.split_projects,
            );
            data.split_records = mergeArrayById(
              data.split_records,
              cloudData.split_records,
            );
            if (cloudData.quick_entries)
              data.quick_entries = mergeArrayById(
                data.quick_entries,
                cloudData.quick_entries,
              );

            data.quick_tags = mergeStrArray(
              data.quick_tags,
              cloudData.quick_tags,
            );
            if (!data.main_categories)
              data.main_categories = { Expense: [], Income: [] };
            if (cloudData.main_categories) {
              data.main_categories.Expense = mergeStrArray(
                data.main_categories.Expense,
                cloudData.main_categories.Expense,
              );
              data.main_categories.Income = mergeStrArray(
                data.main_categories.Income,
                cloudData.main_categories.Income,
              );
            }

            data.budgets = Object.assign(
              {},
              cloudData.budgets || {},
              data.budgets || {},
            );
            data.smart_tags = Object.assign(
              {},
              cloudData.smart_tags || {},
              data.smart_tags || {},
            );
            data.currencyRates = Object.assign(
              {},
              cloudData.currencyRates || {},
              data.currencyRates || {},
            );

            data.transactions.sort((a, b) => {
              let d1 = a && a.date ? a.date : "";
              let d2 = b && b.date ? b.date : "";
              if (d1 !== d2) return d1 < d2 ? 1 : -1;
              let id1 = a && a.id ? a.id : "";
              let id2 = b && b.id ? b.id : "";
              return id2.localeCompare(id1);
            });

            if (typeof setupDefaultData === "function")
              setupDefaultData(
                data,
                typeof DEFAULT_CATEGORIES !== "undefined"
                  ? DEFAULT_CATEGORIES
                  : {},
              );
            runAutoTasks();

            let mergedDataStr = JSON.stringify(data);
            if (settings.pinEnabled && settings.pinCode.length === 4) {
              mergedDataStr = await CryptoUtils.encrypt(
                mergedDataStr,
                settings.pinCode,
              );
            }
            await StorageDB.set(
              "ledger_backup_" + currentBookId.value,
              mergedDataStr,
            );

            await fetch(
              `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
              {
                method: "PATCH",
                headers: {
                  Authorization: `Bearer ${settings.googleToken}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify(data),
              },
            );

            updateCharts();
            if (isManual)
              alert("✅ 多裝置資料已自動智慧合併，並同步至最新狀態！");
          } else {
            if (isManual) alert("⚠️ 雲端資料無效，已保留本機資料防止覆蓋！");
          }
        } else {
          await fetch(
            `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`,
            {
              method: "PATCH",
              headers: {
                Authorization: `Bearer ${settings.googleToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(data),
            },
          );
        }
        syncStatus.value = "ok";
      } else {
        let form = new FormData();
        form.append(
          "metadata",
          new Blob(
            [
              JSON.stringify({
                name: currentFileName,
                mimeType: "application/json",
              }),
            ],
            { type: "application/json" },
          ),
        );
        form.append(
          "file",
          new Blob([JSON.stringify(data)], { type: "application/json" }),
        );
        let res = await fetch(
          "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
          {
            method: "POST",
            headers: { Authorization: `Bearer ${settings.googleToken}` },
            body: form,
          },
        );
        let result = await res.json();
        settings.fileId = result.id;
        saveSettings(false);
        syncStatus.value = "ok";
        if (isManual) alert("雲端備份已建立");
      }
    } catch (e) {
      syncStatus.value = "error";
      console.warn("GDrive Sync Error", e);
      if (e.status === 401) {
        settings.googleToken = "";
        saveSettings(false);
        if (isManual) alert("權限過期，請重新登入");
      }
    } finally {
      isSyncing.value = false;
    }
  },
};
