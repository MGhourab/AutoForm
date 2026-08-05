class OverlayManager {

    constructor() {

        this.box = document.createElement("div");

        this.box.style.position = "fixed";
        this.box.style.pointerEvents = "none";
        this.box.style.zIndex = "2147483647";
        this.box.style.border = "2px solid #1a73e8";
        this.box.style.background =
            "rgba(26,115,232,.08)";
        this.box.style.borderRadius = "3px";
        this.box.style.display = "none";

        document.documentElement.appendChild(this.box);

    }

    show(element){

        const r = element.getBoundingClientRect();

        this.box.style.display = "block";

        this.box.style.left = r.left + "px";
        this.box.style.top = r.top + "px";
        this.box.style.width = r.width + "px";
        this.box.style.height = r.height + "px";

    }

    hide(){

        this.box.style.display="none";

    }

    destroy(){

        this.box.remove();

    }

}