(() => {
    "use strict";

    const SESSION_KEY = "automationState";

    function getStorage(defaults) {
        return new Promise(resolve => chrome.storage.local.get(defaults, resolve));
    }

    function getSession() {
        return new Promise(resolve => {
            chrome.storage.session.get(SESSION_KEY, result => {
                resolve(result[SESSION_KEY] || { status: "idle" });
            });
        });
    }

    function setSession(state) {
        return new Promise(resolve => {
            chrome.storage.session.set({ [SESSION_KEY]: state }, resolve);
        });
    }

    function notifyTab(tabId, message) {
        return new Promise(resolve => {
            chrome.tabs.sendMessage(tabId, message, () => {
                resolve(!chrome.runtime.lastError);
            });
        });
    }

    async function setStatus(state, status) {
        await setSession({
            ...state,
            active: false,
            status
        });
    }

    async function failAutomation(state, message) {
        await setStatus(state, "failed");
        await notifyTab(state.tabId, {
            cmd: "automationToast",
            text: `Automation failed: ${message}`
        });
    }

    async function startAutomation(tabId) {
        const existing = await getSession();

        if (existing.active && existing.status === "running") {
            await notifyTab(tabId, {
                cmd: "automationToast",
                text: "Automation already running"
            });
            return;
        }

        await notifyTab(tabId, {
            cmd: "automationToast",
            text: "Starting automation..."
        });

        const settings = await getStorage({
            fixed: "",
            start: 1,
            selectors: {}
        });
        const selectors = settings.selectors || {};
        const number = Number(settings.start);

        if (settings.fixed === "" || settings.fixed == null) {
            await notifyTab(tabId, {
                cmd: "automationToast",
                text: "Automation failed: Fixed value not configured"
            });
            return;
        }

        if (!Number.isFinite(number)) {
            await notifyTab(tabId, {
                cmd: "automationToast",
                text: "Automation failed: Number value not configured"
            });
            return;
        }

        if (!selectors.fixed || !selectors.number || !selectors.submit) {
            await notifyTab(tabId, {
                cmd: "automationToast",
                text: "Automation failed: Selectors not saved"
            });
            return;
        }

        const state = {
            active: true,
            status: "running",
            tabId,
            runId: crypto.randomUUID(),
            fixed: String(settings.fixed),
            number
        };

        await setSession(state);

        const sent = await notifyTab(tabId, {
            cmd: "automationRun",
            runId: state.runId,
            fixed: state.fixed,
            number: state.number,
            selectors
        });

        if (!sent) {
            await failAutomation(state, "Could not reach page content script");
        }
    }

    async function stopAutomation(tabId) {
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
            await notifyTab(targetTabId, {
                cmd: "automationToast",
                text: "Automation stopped"
            });
        }
    }

    chrome.runtime.onMessage.addListener((message, sender) => {
        if (!message || !message.cmd) {
            return;
        }

        switch (message.cmd) {
            case "picker":
                chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
                    if (tabs.length) {
                        chrome.tabs.sendMessage(tabs[0].id, message);
                    }
                });
                break;

            case "startAutomation":
                chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
                    if (tabs.length) {
                        startAutomation(tabs[0].id);
                    }
                });
                break;

            case "stopAutomation":
                chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
                    stopAutomation(tabs.length ? tabs[0].id : null);
                });
                break;

            case "automationCycleCompleted":
                getSession().then(async state => {
                    if (
                        state.active &&
                        state.status === "running" &&
                        state.runId === message.runId &&
                        state.tabId === sender.tab?.id
                    ) {
                        await setStatus(state, "completed");
                        await notifyTab(state.tabId, {
                            cmd: "automationToast",
                            text: "Automation completed"
                        });
                    }
                });
                break;

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
})();