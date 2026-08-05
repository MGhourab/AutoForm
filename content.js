(() => {
    "use strict";

    const state = {
        mode: null,
        hover: null,
        active: false
    };

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

    function removeToast() {
        document.getElementById("__aff_toast")?.remove();
    }

    function cssSelector(el) {
        if (el.id) {
            return "#" + CSS.escape(el.id);
        }

        const path = [];

        while (el && el !== document.body) {
            let index = 1;
            let sibling = el;

            while ((sibling = sibling.previousElementSibling)) {
                if (sibling.tagName === el.tagName) {
                    index++;
                }
            }

            path.unshift(
                `${el.tagName.toLowerCase()}:nth-of-type(${index})`
            );

            el = el.parentElement;
        }

        return path.join(" > ");
    }

    function clearHighlight() {
        if (state.hover) {
            state.hover.style.outline = "";
            state.hover = null;
        }
    }

    function stopPicker() {
        if (!state.active) {
            return;
        }

        document.removeEventListener("mousemove", move, true);
        document.removeEventListener("click", pick, true);
        document.removeEventListener("keydown", esc, true);

        clearHighlight();

        state.mode = null;
        state.active = false;

        setTimeout(removeToast, 1000);
    }

    function move(e) {
        if (state.hover === e.target) {
            return;
        }

        clearHighlight();

        state.hover = e.target;
        state.hover.style.outline = "2px solid #1976d2";
    }

    function esc(e) {
        if (e.key !== "Escape") {
            return;
        }

        toast("Cancelled");

        stopPicker();
    }

    function buildSelector(el) {
        return {
            css: cssSelector(el),
            id: el.id || "",
            name: el.name || "",
            tag: el.tagName,
            type: el.type || "",
            placeholder: el.placeholder || ""
        };
    }

    function saveSelector(selector, mode) {
        chrome.storage.local.get("selectors", result => {
            const selectors = result.selectors || {};

            selectors[mode] = selector;

            chrome.storage.local.set(
                { selectors },
                () => toast(`Saved ${mode} field`)
            );
        });
    }

    function pick(e) {
        if (!state.active) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        const selector = buildSelector(e.target);
        const currentMode = state.mode;

        saveSelector(selector, currentMode);

        stopPicker();
    }

    function startPicker(mode) {
        stopPicker();

        state.mode = mode;
        state.active = true;

        toast(`Select ${mode} field (ESC to cancel)`);

        document.addEventListener("mousemove", move, true);
        document.addEventListener("click", pick, true);
        document.addEventListener("keydown", esc, true);
    }

    chrome.runtime.onMessage.addListener(message => {
        if (message.cmd !== "picker") {
            return;
        }

        startPicker(message.type);
    });
})();