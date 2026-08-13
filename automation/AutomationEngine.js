(() => {
    "use strict";

    let activeRunId = null;

    function toast(text) {
        let element = document.getElementById("__aff_toast");

        if (!element) {
            element = document.createElement("div");
            element.id = "__aff_toast";
            element.style.cssText =
                "position:fixed;top:20px;right:20px;background:#1976d2;color:#fff;padding:10px 14px;border-radius:6px;z-index:2147483647;font:14px Arial";
            document.body.appendChild(element);
        }

        element.textContent = text;
    }

    function pause(milliseconds) {
        return new Promise(resolve => setTimeout(resolve, milliseconds));
    }

    function ensureActive(runId) {
        if (activeRunId !== runId) {
            throw new Error("Automation stopped");
        }
    }

    function findElement(selectorData, label) {
        if (!selectorData || !selectorData.css) {
            throw new Error(`${label} selector not saved`);
        }

        try {
            const element = document.querySelector(selectorData.css);

            if (!element) {
                throw new Error(`${label} not found`);
            }

            return element;
        } catch (error) {
            if (error.message === `${label} not found`) {
                throw error;
            }

            throw new Error(`${label} selector invalid`);
        }
    }

    function setNativeValue(element, value) {
        const prototype = element instanceof HTMLTextAreaElement
            ? HTMLTextAreaElement.prototype
            : HTMLInputElement.prototype;
        const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");

        if (descriptor?.set) {
            descriptor.set.call(element, value);
        } else {
            element.value = value;
        }
    }

    function setFieldValue(element, value) {
        const stringValue = String(value);

        element.focus();

        if (element.isContentEditable) {
            element.textContent = stringValue;
        } else if (element instanceof HTMLSelectElement) {
            element.value = stringValue;
        } else if (
            element instanceof HTMLInputElement ||
            element instanceof HTMLTextAreaElement
        ) {
            setNativeValue(element, stringValue);
        } else {
            throw new Error("Selected element cannot be filled");
        }

        element.dispatchEvent(new Event("input", { bubbles: true }));
        element.dispatchEvent(new Event("change", { bubbles: true }));
        element.blur();
    }

    async function runCycle(payload) {
        activeRunId = payload.runId;

        try {
            toast("Loading configuration...");

            const fixedElement = findElement(payload.selectors.fixed, "Fixed field");
            const numberElement = findElement(payload.selectors.number, "Number field");
            const submitElement = findElement(payload.selectors.submit, "Submit button");

            ensureActive(payload.runId);
            toast("Filling fixed field...");
            setFieldValue(fixedElement, payload.fixed);

            await pause(150);
            ensureActive(payload.runId);

            toast("Filling number field...");
            setFieldValue(numberElement, payload.number);

            await pause(150);
            ensureActive(payload.runId);

            toast("Submitting form...");
            submitElement.focus();
            submitElement.click();

            if (activeRunId === payload.runId) {
                activeRunId = null;
                chrome.runtime.sendMessage({
                    cmd: "automationCycleCompleted",
                    runId: payload.runId
                });
            }
        } catch (error) {
            if (activeRunId !== payload.runId) {
                return;
            }

            activeRunId = null;
            chrome.runtime.sendMessage({
                cmd: "automationCycleFailed",
                runId: payload.runId,
                error: error.message || "Unknown error"
            });
        }
    }

    window.AutomationEngine = {
        runCycle,
        stop(runId) {
            if (!runId || activeRunId === runId) {
                activeRunId = null;
            }
        }
    };
})();