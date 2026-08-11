(() => {
    "use strict";

    const SESSION_KEY = "automationState";
    const DEFAULT_POST_SUBMIT_DELAY = 5000;

    let advanceTimer = null;

    function clearAdvanceTimer() {
        if (advanceTimer) {
            clearTimeout(advanceTimer);
            advanceTimer = null;
        }
    }

    function getStorage(defaults) {
        return new Promise(resolve => {
            chrome.storage.local.get(defaults, resolve);
        });
    }

    function getSession() {
        return new Promise(resolve => {
            chrome.storage.session.get(SESSION_KEY, result => {
                resolve(result[SESSION_KEY] || null);
            });
        });
    }

    function setSession(state) {
        return new Promise(resolve => {
            if (state) {
                chrome.storage.session.set({ [SESSION_KEY]: state }, resolve);
            } else {
                chrome.storage.session.remove(SESSION_KEY, resolve);
            }
        });
    }

    function countIterations(start, end, step) {
        return Math.floor((end - start) / step) + 1;
    }

    function notifyTab(tabId, message) {
        return new Promise(resolve => {
            chrome.tabs.sendMessage(tabId, message, () => {
                resolve(!chrome.runtime.lastError);
            });
        });
    }

    async function completeAutomation(state, message) {
        clearAdvanceTimer();
        await notifyTab(state.tabId, {
            cmd: "automationToast",
            text: message
        });
        await setSession(null);
    }

    async function failAutomation(state, message) {
        clearAdvanceTimer();
        await notifyTab(state.tabId, {
            cmd: "automationToast",
            text: `Automation failed: ${message}`
        });
        await setSession(null);
    }

    async function runStep(state) {
        state.phase = "running";
        state.advanceScheduled = false;
        await setSession(state);

        const sent = await notifyTab(state.tabId, {
            cmd: "automationStep",
            fixed: state.fixed,
            number: state.currentNumber,
            index: state.index,
            total: state.total
        });

        if (!sent) {
            state.retryCount = (state.retryCount || 0) + 1;

            if (state.retryCount > 10) {
                await failAutomation(state, "Could not reach page content script");
                return;
            }

            setTimeout(() => {
                getSession().then(current => {
                    if (current && current.active) {
                        runStep(current);
                    }
                });
            }, 500);

            return;
        }

        state.retryCount = 0;
        state.phase = "waiting";
        await setSession(state);
    }

    function scheduleAdvance(state) {
        if (!state || !state.active || state.advanceScheduled) {
            return;
        }

        state.advanceScheduled = true;
        state.phase = "delaying";
        setSession(state);

        clearAdvanceTimer();

        advanceTimer = setTimeout(async () => {
            advanceTimer = null;

            const current = await getSession();

            if (!current || !current.active) {
                return;
            }

            current.currentNumber += current.step;
            current.index += 1;
            current.advanceScheduled = false;

            if (current.currentNumber > current.end) {
                await completeAutomation(
                    current,
                    `Automation completed (${current.total} submission${current.total === 1 ? "" : "s"})`
                );
                return;
            }

            await runStep(current);
        }, current.postSubmitDelay);
    }

    async function startAutomation(tabId) {
        clearAdvanceTimer();

        const existing = await getSession();

        if (existing && existing.active) {
            await notifyTab(tabId, {
                cmd: "automationToast",
                text: "Automation already running"
            });
            return;
        }

        const settings = await getStorage({
            fixed: "",
            start: 1,
            end: 100,
            step: 1,
            postSubmitDelay: DEFAULT_POST_SUBMIT_DELAY,
            selectors: {}
        });

        const start = Number(settings.start);
        const end = Number(settings.end);
        const step = Number(settings.step);
        const selectors = settings.selectors || {};

        if (settings.fixed === "" || settings.fixed == null) {
            await notifyTab(tabId, {
                cmd: "automationToast",
                text: "Automation failed: Fixed value not configured"
            });
            return;
        }

        if (Number.isNaN(start) || Number.isNaN(end) || Number.isNaN(step) || step <= 0) {
            await notifyTab(tabId, {
                cmd: "automationToast",
                text: "Automation failed: Invalid Start, End, or Step"
            });
            return;
        }

        if (start > end) {
            await notifyTab(tabId, {
                cmd: "automationToast",
                text: "Automation failed: Start must be <= End"
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

        const total = countIterations(start, end, step);

        const state = {
            active: true,
            tabId,
            fixed: String(settings.fixed),
            start,
            end,
            step,
            currentNumber: start,
            index: 1,
            total,
            postSubmitDelay: Math.max(
                0,
                Number(settings.postSubmitDelay ?? DEFAULT_POST_SUBMIT_DELAY)
            ),
            phase: "starting",
            advanceScheduled: false,
            retryCount: 0
        };

        await setSession(state);

        await notifyTab(tabId, {
            cmd: "automationToast",
            text: "Starting automation..."
        });

        await runStep(state);
    }

    async function stopAutomation(tabId) {
        const state = await getSession();

        clearAdvanceTimer();
        await setSession(null);

        if (tabId) {
            await notifyTab(tabId, {
                cmd: "automationToast",
                text: "Automation stopped"
            });
        } else if (state && state.tabId) {
            await notifyTab(state.tabId, {
                cmd: "automationToast",
                text: "Automation stopped"
            });
        }
    }

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
        if (!msg || !msg.cmd) {
            return;
        }

        switch (msg.cmd) {

            case "picker":
                chrome.tabs.query(
                    { active: true, currentWindow: true },
                    tabs => {
                        if (tabs.length) {
                            chrome.tabs.sendMessage(tabs[0].id, msg);
                        }
                    }
                );
                break;

            case "startAutomation":
                chrome.tabs.query(
                    { active: true, currentWindow: true },
                    tabs => {
                        if (tabs.length) {
                            startAutomation(tabs[0].id);
                        }
                    }
                );
                break;

            case "stopAutomation":
                chrome.tabs.query(
                    { active: true, currentWindow: true },
                    tabs => {
                        stopAutomation(tabs.length ? tabs[0].id : null);
                    }
                );
                break;

            case "automationStepDone":
                getSession().then(state => {
                    if (
                        state &&
                        state.active &&
                        state.phase === "waiting" &&
                        state.tabId === sender.tab?.id
                    ) {
                        scheduleAdvance(state);
                    }
                });
                break;

            default:
                break;
        }
    });

    chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.status !== "complete") {
            return;
        }

        getSession().then(state => {
            if (
                state &&
                state.active &&
                state.tabId === tabId &&
                state.phase === "waiting"
            ) {
                scheduleAdvance(state);
            }
        });
    });

})();
