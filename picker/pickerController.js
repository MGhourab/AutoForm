class PickerController {
    constructor() {
        this.mode = null;
        this.hover = null;
        this.active = false;

        this.move = this.move.bind(this);
        this.pick = this.pick.bind(this);
        this.keydown = this.keydown.bind(this);
    }

    start(mode) {
        if (this.active) {
            this.stop();
        }

        this.mode = mode;
        this.active = true;

        toast(`Select ${mode} field (ESC to cancel)`);

        document.addEventListener("mousemove", this.move, true);
        document.addEventListener("click", this.pick, true);
        document.addEventListener("keydown", this.keydown, true);
    }

    stop() {
        document.removeEventListener("mousemove", this.move, true);
        document.removeEventListener("click", this.pick, true);
        document.removeEventListener("keydown", this.keydown, true);

        if (this.hover) {
            this.hover.style.outline = "";
        }

        this.hover = null;
        this.mode = null;
        this.active = false;

        setTimeout(removeToast, 1000);
    }

    move(e) {
        if (this.hover) {
            this.hover.style.outline = "";
        }

        this.hover = e.target;
        this.hover.style.outline = "3px solid #2196f3";
    }

    keydown(e) {
        if (e.key === "Escape") {
            toast("Cancelled");
            this.stop();
        }
    }

    pick(e) {
        e.preventDefault();
        e.stopPropagation();

        const el = e.target;

        const data = buildSelectorBundle(el);

        chrome.storage.local.get("selectors", result => {

            const selectors = result.selectors || {};

            selectors[this.mode] = data;

            chrome.storage.local.set(
                { selectors },
                () => toast(`Saved ${this.mode} field`)
            );

        });

        this.stop();
    }
}