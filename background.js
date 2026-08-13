(() => {
    "use strict";

    const SESSION_KEY = "automationState";

    function getStorage(defaults) {
        return new Promise(resolve => chrome.storage.local.get(defaults, resolve));
    }

    function getSession() {
        return new Promise(resolve => {
            chrome.storage.session.get(SESSION_KEY, result => {
                resolve(result[SESSION_KEY] || { status: "idle", active: false });
            });
        });
    }

    function setSession(state) {
        return new Promise(resolve => {
            chrome.storage.session.set({ [SESSION_KEY]: state }, resolve);
        });
    }

    function getTab(tabId) {
        return new Promise((resolve, reject) => {
            chrome.tabs.get(tabId, tab => {
                if (chrome.runtime.lastError) {
                    reject(chrome.runtime.lastError);
                    return;
                }

                resolve(tab);
            });
        });
    }

    async function notifyTab(tabId, message) {
        try {
            await chrome.tabs.sendMessage(tabId, message);
            return true;
        } catch {
            return false;
        }
    }

    async function setStatus(state, status) {
        await setSession({
            ...state,
            active: false,
            status
        });
    }

    async function showToast(tabId, text) {
        await notifyTab(tabId, {
            cmd: "automationToast",
            text
        });
    }

    async function failAutomation(state, message) {
        await setStatus(state, "failed");
        await showToast(state.tabId, `Automation failed: ${message}`);
    }

    async function ensureContentScript(tabId) {
        if (await notifyTab(tabId, { cmd: "automationPing" })) {
            return true;
        }

        try {
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ["automation/AutomationEngine.js", "content.js"]
            });
        } catch {
            return false;
        }

        return notifyTab(tabId, { cmd: "automationPing" });
    }

    async function runCycle(state) {
        const ready = await ensureContentScript(state.tabId);

        if (!ready) {
            await failAutomation(state, "Could not reach page content script");
            return;
        }

        const runningState = {
            ...state,
            active: true,
            status: "running",
            reloadObserved: false,
            runId: crypto.randomUUID()
        };

        await setSession(runningState);

        const sent = await notifyTab(runningState.tabId, {
            cmd: "automationRun",
            runId: runningState.runId,
            fixed: runningState.fixed,
            number: runningState.number,
            selectors: runningState.selectors
        });

        if (!sent) {
            await failAutomation(
                runningState,
                "Could not reach page content script"
            );
        }
    }

    async function startAutomation(tabId) {
        const existing = await getSession();

        if (existing.active) {
            await showToast(tabId, "Automation already running");
            return;
        }

        const settings = await getStorage({
            fixed: "",
            start: 1,
            end: 100,
            step: 1,
            selectors: {}
        });
        const selectors = settings.selectors || {};
        const start = Number(settings.start);
        const end = Number(settings.end);
        const step = Number(settings.step);

        if (settings.fixed === "" || settings.fixed == null) {
            await showToast(tabId, "Automation failed: Fixed value not configured");
            return;
        }

        if (
            !Number.isFinite(start) ||
            !Number.isFinite(end) ||
            !Number.isFinite(step) ||
            step <= 0 ||
            start > end
        ) {
            await showToast(tabId, "Automation failed: Invalid Start, End, or Step");
            return;
        }

        if (!selectors.fixed || !selectors.number || !selectors.submit) {
            await showToast(tabId, "Automation failed: Selectors not saved");
            return;
        }

        let tab;

        try {
            tab = await getTab(tabId);
        } catch {
            return;
        }

        const state = {
            active: true,
            status: "starting",
            tabId,
            originUrl: tab.url,
            fixed: String(settings.fixed),
            number: start,
            end,
            step,
            selectors,
            runId: null,
            reloadObserved: false
        };

        await showToast(tabId, "Starting automation...");
        await runCycle(state);
    }

    async function prepareNextCycle(state) {
        const nextNumber = state.number + state.step;

        if (nextNumber > state.end) {
            await setStatus(state, "completed");
            await showToast(state.tabId, "Automation completed");
            return;
        }

        await setSession({
            ...state,
            active: true,
            status: "waitingForReload",
            number: nextNumber,
            reloadObserved: false
        });
    }

    async function stopAutomation(tabId, text = "Automation stopped") {
        const state = await getSession();
        const targetTabId = tabId || state.tabId;

        if (state.active && state.tabId) {
            await notifyTab(state.tabId, {
                cmd: "automationStop",
                runId: state.runId
            });
        }

        await setStatus(state, "stopped");

        if (targetTabId) {
            await showToast(targetTabId, text);
        }
    }

    async function handleNavigation(tabId, changeInfo, tab) {
        const state = await getSession();

        if (
            !state.active ||
            state.tabId !== tabId ||
            state.status !== "waitingForReload"
        ) {
            return;
        }

        if (changeInfo.status === "loading") {
            await setSession({
                ...state,
                reloadObserved: true
            });
            return;
        }

        if (changeInfo.status !== "complete" || !state.reloadObserved) {
            return;
        }

        if (tab.url !== state.originUrl) {
            await stopAutomation(
                tabId,
                `Automation stopped at number ${state.number}: page changed`
            );
            return;
        }

        const nextState = {
            ...state,
            status: "startingNextCycle"
        };
        await setSession(nextState);

        setTimeout(() => {
            runCycle(nextState);
        }, 250);
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
        if (!message?.cmd) {
            return;
        }

        switch (message.cmd) {
            case "picker":
                chrome.tabs.query({ active: true, currentWindow: true }, async tabs => {
                    if (tabs[0]) {
                        await notifyTab(tabs[0].id, message);
                    }
                });
                break;

            case "startAutomation":
                chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
                    if (tabs[0]) {
                        startAutomation(tabs[0].id);
                    }
                });
                break;

            case "stopAutomation":
                chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
                    stopAutomation(tabs[0]?.id || null);
                });
                break;

            case "automationSubmissionStarted":
                getSession().then(async state => {
                    if (
                        state.active &&
                        state.status === "running" &&
                        state.runId === message.runId &&
                        state.tabId === sender.tab?.id
                    ) {
                        await prepareNextCycle(state);
                    }

                    sendResponse();
                });
                return true;

            case "automationCycleFailed":
                getSession().then(async state => {
                    if (
                        state.active &&
                        state.status === "running" &&
                        state.runId === message.runId &&
                        state.tabId === sender.tab?.id
                    ) {
                        await failAutomation(state, message.error || "Unknown error");
                    }
                });
                break;

            default:
                break;
        }
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
        handleNavigation(tabId, changeInfo, tab);
    });
})();