let activePopup: HTMLElement | undefined;
let dismissal: number | undefined;

export const dismissMobileRollResult = () => {
  if (dismissal !== undefined) window.clearTimeout(dismissal);
  dismissal = undefined;
  activePopup?.remove();
  activePopup = undefined;
};

const showRollResult = (message: ChatMessage, html: HTMLElement) => {
  dismissMobileRollResult();

  const popup = document.createElement("section");
  popup.className = "vf-mobile-roll-result";
  popup.setAttribute("role", "status");
  popup.setAttribute("aria-live", "polite");

  const close = document.createElement("button");
  close.type = "button";
  close.className = "mobile-roll-dismiss";
  close.setAttribute("aria-label", game.i18n.localize("VF.Cancel"));
  close.innerHTML = '<i class="fa-solid fa-xmark"></i>';
  close.addEventListener("click", dismissMobileRollResult);
  popup.append(close);

  if (message.isContentVisible && !message.blind) {
    const content = document.createElement("div");
    content.className = "mobile-roll-content";
    const renderedContent = html.querySelector(".message-content");
    content.innerHTML = renderedContent?.innerHTML ?? message.content;
    content.querySelectorAll(".card-buttons").forEach((buttons) => {
      buttons.remove();
    });
    popup.append(content);
  } else {
    const confirmation = document.createElement("p");
    confirmation.className = "mobile-blind-confirmation";
    confirmation.textContent = game.i18n.localize("VF.mobile.BlindRollSent");
    popup.append(confirmation);
  }

  document.body.append(popup);
  activePopup = popup;
  dismissal = window.setTimeout(dismissMobileRollResult, message.isContentVisible ? 6000 : 2500);
};

const registerMobileRollResults = () => {
  Hooks.on("renderChatMessageHTML", (message: ChatMessage, html: HTMLElement) => {
    if (!document.body.classList.contains("vf-mobile-mode") || !message.isAuthor) return;
    if (!message.content.includes('data-vf-roll="true"')) return;
    if (message.speaker.actor !== game.user?.character?.id) return;
    showRollResult(message, html);
  });
};

export default registerMobileRollResults;
