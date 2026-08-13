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

    function getTab(tabId) {
        return new Promise(resolve => chrome.tabs.get(tabId, resolve));
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

    async function runCycle(state) {
        state.status = "submitting";
        state.runId = crypto.randomUUID();
        await setSession(state);

        const sent = await notifyTab(state.tabId, {
            cmd: "automationRun",
            runId: state.runId,
            fixed: state.fixed,
            number: state.number,
            selectors: state.selectors
        });

        if (!sent) {
            await failAutomation(state, "Could not reach page content script");
        }
    }

    async function startAutomation(tabId) {
        const existing = await getSession();

        if (existing.active) {
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
            end: 100,
            step: 1,
            selectors: {}
        });
        const selectors = settings.selectors || {};
        const start = Number(settings.start);
        const end = Number(settings.end);
        const step = Number(settings.step);

        if (settings.fixed === "" || settings.fixed == null) {
            await notifyTab(tabId, {
                cmd: "automationToast",
                text: "Automation failed: Fixed value not configured"
            });
            return;
        }

        if (
            !Number.isFinite(start) ||
            !Number.isFinite(end) ||
            !Number.isFinite(step) ||
            step <= 0 ||
            start > end
        ) {
            await notifyTab(tabId, {
                cmd: "automationToast",
                text: "Automation failed: Invalid Start, End, or Step"
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

        const tab = await getTab(tabId);
        const state = {
            active: true,
            status: "running",
            tabId,
            originUrl: tab.url,
            fixed: String(settings.fixed),
            number: start,
            end,
            step,
            selectors,
            runId: null
        };

        await runCycle(state);
    }

    async function advanceAfterSubmission(state) {
        const nextNumber = state.number + state.step;

        if (nextNumber > state.end) {
            await setStatus(state, "completed");
            await notifyTab(state.tabId, {
                cmd: "automationToast",
                text: "Automation completed"
            });
            return false;
        }

        state.number = nextNumber;
        state.status = "waitingForReload";
        await setSession(state);
        await notifyTab(state.tabId, {
            cmd: "automationToast",
            text: `Waiting for page reload before number ${state.number}`
        });
        return true;
    }

    async function stopAutomation(tabId, message = "Automation stopped") {
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
                text: message
            });
        }
    }

    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
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

            case "automationSubmissionStarted":
                getSession().then(async state => {
                    if (
                        state.active &&
                        state.status === "submitting" &&
                        state.runId === message.runId &&
                        state.tabId === sender.tab?.id
                    ) {
                        await advanceAfterSubmission(state);
                    }

                    sendResponse();
                });
                return true;

            case "automationCycleFailed":
                getSession().then(async state => {
                    if (
                        state.active &&
                        state.status === "submitting" &&
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
        if (changeInfo.status !== "complete") {
            return;
        }

        getSession().then(async state => {
            if (
                !state.active ||
                !["submitting", "waitingForReload"].includes(state.status) ||
                state.tabId !== tabId
            ) {
                return;
            }

            if (tab.url !== state.originUrl) {
                await stopAutomation(
                    tabId,
                    `Automation stopped at number ${state.number}: page changed`
                );
                return;
            }

            if (state.status === "submitting") {
                const hasNextCycle = await advanceAfterSubmission(state);

                if (!hasNextCycle) {
                    return;
                }
            }

            await runCycle(state);
        });
    });
})();