(() => {
    "use strict";

    const $ = id => document.getElementById(id);

    const DEFAULTS = {
        fixed: "",
        start: 1,
        end: 100,
        step: 1
    };

    function saveSettings() {
        chrome.storage.local.set({
            fixed: $("fixed").value,
            start: Number($("start").value),
            end: Number($("end").value),
            step: Number($("step").value)
        });
    }

    function loadSettings() {
        chrome.storage.local.get(
            {
                fixed: DEFAULTS.fixed,
                start: DEFAULTS.start,
                end: DEFAULTS.end,
                step: DEFAULTS.step
            },
            data => {
                $("fixed").value = data.fixed;
                $("start").value = data.start;
                $("end").value = data.end;
                $("step").value = data.step;
            }
        );
    }

    function updateStatus(id, exists) {
        const el = $(id);

        if (!el) {
            return;
        }

        el.textContent = exists ? "✅" : "❌";
    }

    function refreshStatus() {
        chrome.storage.local.get("selectors", result => {
            const selectors = result.selectors || {};

            updateStatus("sf", !!selectors.fixed);
            updateStatus("sn", !!selectors.number);
            updateStatus("ss", !!selectors.submit);
        });
    }

    function sendPicker(type) {
        chrome.runtime.sendMessage({
            cmd: "picker",
            type
        });

        window.close();
    }

    function startAutomation() {
        saveSettings();

        chrome.runtime.sendMessage({
            cmd: "startAutomation"
        });

        window.close();
    }

    function stopAutomation() {
        chrome.runtime.sendMessage({
            cmd: "stopAutomation"
        });

        window.close();
    }

    function resetConfiguration() {
        const confirmed = confirm(
            "Reset all AutoForm configuration?"
        );

        if (!confirmed) {
            return;
        }

        chrome.storage.local.set(
            {
                selectors: {},
                fixed: DEFAULTS.fixed,
                start: DEFAULTS.start,
                end: DEFAULTS.end,
                step: DEFAULTS.step
            },
            () => {
                loadSettings();
                refreshStatus();
                alert("Configuration reset.");
            }
        );
    }

    ["fixed", "start", "end", "step"].forEach(id => {
        $(id).addEventListener("change", saveSettings);
    });

    $("pf").addEventListener("click", () => sendPicker("fixed"));
    $("pn").addEventListener("click", () => sendPicker("number"));
    $("ps").addEventListener("click", () => sendPicker("submit"));

    $("startBtn").addEventListener("click", startAutomation);
    $("stopBtn").addEventListener("click", stopAutomation);

    $("resetBtn").addEventListener("click", resetConfiguration);

    loadSettings();
    refreshStatus();
})();