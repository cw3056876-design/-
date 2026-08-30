(() => {
  const setup = () => {
    const source = document.querySelector("#sft-workbench-source");
    const dialog = document.querySelector("#sft-workbench-dialog");
    const canvas = dialog?.querySelector(".sft-dialog-canvas");
    const closeButton = dialog?.querySelector(".sft-dialog-close");

    if (!source || !dialog || !canvas) return;
    const wireTabs = (workbench, prefix) => {
      workbench.querySelectorAll("[data-sft-view]").forEach((tab) => {
        const view = tab.dataset.sftView;
        const panel = workbench.querySelector(`[data-sft-panel="${view}"]`);
        if (!panel) return;
        tab.id = `${prefix}-tab-${view}`;
        tab.setAttribute("aria-controls", `${prefix}-panel-${view}`);
        panel.id = `${prefix}-panel-${view}`;
        panel.setAttribute("aria-labelledby", tab.id);
      });
    };

    const setView = (workbench, view) => {
      workbench.querySelectorAll("[data-sft-view]").forEach((tab) => {
        const isActive = tab.dataset.sftView === view;
        tab.setAttribute("aria-selected", String(isActive));
        tab.tabIndex = isActive ? 0 : -1;
      });

      workbench.querySelectorAll("[data-sft-panel]").forEach((panel) => {
        panel.hidden = panel.dataset.sftPanel !== view;
      });
    };

    const closeDialog = () => {
      if (typeof dialog.close === "function") {
        dialog.close();
      } else {
        dialog.removeAttribute("open");
      }
    };

    const openDialog = () => {
      const expanded = source.cloneNode(true);
      expanded.removeAttribute("id");
      expanded.removeAttribute("inert");
      expanded.removeAttribute("aria-hidden");
      expanded.classList.remove("sft-workbench--preview");
      expanded.classList.add("sft-workbench--expanded");
      wireTabs(expanded, "sft-dialog");

      const chartGradient = expanded.querySelector("#sftChartFill");
      const chartArea = expanded.querySelector('[fill="url(#sftChartFill)"]');
      if (chartGradient && chartArea) {
        chartGradient.id = "sftChartFillDialog";
        chartArea.setAttribute("fill", "url(#sftChartFillDialog)");
      }

      canvas.replaceChildren(expanded);
      setView(expanded, "training");

      if (typeof dialog.showModal === "function") {
        dialog.showModal();
      } else {
        dialog.setAttribute("open", "");
      }

      closeButton?.focus();
    };

    document.querySelectorAll("[data-sft-open]").forEach((button) => {
      button.addEventListener("click", openDialog);
    });

    closeButton?.addEventListener("click", closeDialog);

    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) {
        closeDialog();
        return;
      }

      const tab = event.target.closest("[data-sft-view]");
      if (!tab) return;

      const workbench = tab.closest(".sft-workbench");
      if (!workbench) return;
      setView(workbench, tab.dataset.sftView);
    });

    dialog.addEventListener("keydown", (event) => {
      const tab = event.target.closest("[data-sft-view]");
      if (!tab || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;

      const tabs = [...tab.parentElement.querySelectorAll("[data-sft-view]")];
      const currentIndex = tabs.indexOf(tab);
      const direction = event.key === "ArrowRight" ? 1 : -1;
      const nextTab = tabs[(currentIndex + direction + tabs.length) % tabs.length];
      event.preventDefault();
      nextTab.focus();
      nextTab.click();
    });

    dialog.addEventListener("close", () => {
      canvas.replaceChildren();
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setup, { once: true });
  } else {
    setup();
  }
})();
