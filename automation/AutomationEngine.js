(() => {
    "use strict";

    function toast(text) {
        let t = document.getElementById("__aff_toast");

        if (!t) {
            t = document.createElement("div");
            t.id = "__aff_toast";
            t.style.cssText =
                "position:fixed;top:20px;right:20px;background:#1976d2;color:#fff;padding:10px 14px;border-radius:6px;z-index:2147483647;font:14px Arial";

            document.body.appendChild(t);
        }

        t.textContent = text;
    }

    function getStorage(defaults) {
        return new Promise(resolve => {
            chrome.storage.local.get(defaults, resolve);
        });
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function findElement(selectorData, label) {
        if (!selectorData || !selectorData.css) {
            throw new Error(`${label} selector not saved`);
        }

        let element;

        try {
            element = document.querySelector(selectorData.css);
        } catch (err) {
            throw new Error(`${label} selector invalid`);
        }

        if (!element) {
            throw new Error(`${label} not found`);
        }

        return element;
    }

    function setNativeValue(element, value) {
        const proto =
            element instanceof HTMLTextAreaElement
                ? HTMLTextAreaElement.prototype
                : HTMLInputElement.prototype;

        const descriptor = Object.getOwnPropertyDescriptor(proto, "value");

        if (descriptor && descriptor.set) {
            descriptor.set.call(element, value);
        } else {
            element.value = value;
        }
    }

    function setFieldValue(element, value) {
        const str = String(value);

        element.focus();

        if (element.isContentEditable) {
            element.textContent = str;
        } else if (element.tagName === "SELECT") {
            element.value = str;
        } else {
            setNativeValue(element, "");
            element.dispatchEvent(new Event("input", { bubbles: true }));
            setNativeValue(element, str);
        }

        element.dispatchEvent(
            new InputEvent("input", {
                bubbles: true,
                cancelable: true,
                inputType: "insertText",
                data: str
            })
        );

        element.dispatchEvent(new Event("change", { bubbles: true }));
        element.blur();
    }

    async function runStep(payload) {
        const settings = await getStorage({ selectors: {} });
        const selectors = settings.selectors || {};

        const fixedElement = findElement(selectors.fixed, "Fixed field");
        const numberElement = findElement(selectors.number, "Number field");
        const submitElement = findElement(selectors.submit, "Submit button");

        toast(
            `Run ${payload.index}/${payload.total}: filling number ${payload.number}...`
        );

        setFieldValue(fixedElement, payload.fixed);
        await sleep(150);

        setFieldValue(numberElement, String(payload.number));
        await sleep(150);

        toast(
            `Run ${payload.index}/${payload.total}: submitting ${payload.number}...`
        );

        submitElement.focus();
        submitElement.click();

        chrome.runtime.sendMessage({ cmd: "automationStepDone" });
    }

    const AutomationEngine = {
        async runStep(payload) {
            try {
                await runStep(payload);
            } catch (err) {
                toast(`Automation failed: ${err.message || "Unknown error"}`);

                chrome.runtime.sendMessage({
                    cmd: "stopAutomation"
                });
            }
        }
    };

    window.AutomationEngine = AutomationEngine;
})();
