chrome.runtime.onMessage.addListener((msg, sender) => {
    if (!msg || !msg.cmd) {
        return;
    }

    switch (msg.cmd) {

        case "picker":
        case "startAutomation":
        case "stopAutomation":

            chrome.tabs.query(
                {
                    active: true,
                    currentWindow: true
                },
                tabs => {

                    if (!tabs.length) {
                        return;
                    }

                    chrome.tabs.sendMessage(
                        tabs[0].id,
                        msg
                    );

                }
            );

            break;

        default:
            break;
    }
});