/**
 * @file Choose a character's portrait from the icons the system ships.
 *
 * The icons live in assets/icons/characters, built from game-icons.net by
 * tools/build-character-icons.py. A Player cannot open Foundry's file browser
 * by default -- that starts at Trusted Player -- and could not list the folder
 * if they could, so the picker reads the list from index.json and shows it as a
 * grid. Anyone who may browse files gets a button through to the full browser.
 */

/** Where the icons and their index live. */
const iconBase = () => `${CONFIG.OSE.assetsPath}/icons/characters`;

let indexPromise = null;

/**
 * The icon groups, loaded once per session.
 *
 * @returns {Promise<{key: string, label: string, icons: {file: string, name: string}[]}[]>} The groups.
 */
function loadIndex() {
  indexPromise ??= fetch(`${iconBase()}/index.json`)
    .then((response) => (response.ok ? response.json() : []))
    .catch(() => []);
  return indexPromise;
}

const escapeText = (text) => foundry.utils.escapeHTML?.(text) ?? String(text);

/**
 * Point the actor, and its token if the token still wears the actor's old
 * picture or the default one, at a new image.
 *
 * @param {Actor} actor - The character.
 * @param {string} path - The new image.
 * @returns {Promise<Actor>} The updated actor.
 */
async function applyImage(actor, path) {
  const update = { img: path };
  const tokenSrc = actor.prototypeToken?.texture?.src;
  if (!tokenSrc || tokenSrc === actor.img || tokenSrc === CONST.DEFAULT_TOKEN) {
    update["prototypeToken.texture.src"] = path;
  }
  return actor.update(update);
}

/**
 * Give the actor new token art, leaving the portrait alone: the prototype
 * token, which new tokens are made from, and every token of this actor already
 * placed on a scene.
 *
 * @param {Actor} actor - The character.
 * @param {string} path - The new token image.
 * @returns {Promise<void>}
 */
async function applyTokenArt(actor, path) {
  await actor.update({ "prototypeToken.texture.src": path });
  const placed = actor.getDependentTokens?.() ?? [];
  await Promise.all(placed.filter((token) => token.isOwner).map((token) => token.update({ "texture.src": path })));
}

/**
 * Foundry's own file browser, for art that is not in the bundled set.
 *
 * @param {string} current - The file to open the browser on.
 * @param {(path: string) => Promise<unknown>} apply - What to do with the choice.
 */
function browse(current, apply) {
  const FilePicker = foundry.applications.apps.FilePicker.implementation;
  new FilePicker({ type: "image", current, callback: apply }).browse();
}

/**
 * Open the picker for a character.
 *
 * @param {Actor} actor - The character whose portrait is being chosen.
 * @returns {Promise<void>}
 */
export default async function pickCharacterIcon(actor) {
  const groups = await loadIndex();
  const base = iconBase();

  // One section per category. The featured set opens by default; a search
  // looks through everything, featured icons included only once.
  const tabs = groups
    .map(
      ({ key, label }, index) =>
        `<button type="button" class="vf-icon-tab${index === 0 ? " active" : ""}" data-group="${key}">${escapeText(
          game.i18n.localize(label),
        )}</button>`,
    )
    .join("");

  const sections = groups
    .map(
      ({ key, icons }, index) => `
      <div class="vf-icon-grid" data-group="${key}"${index === 0 ? "" : " hidden"}>
        ${icons
          .map(({ file, name }) => {
            const path = `${base}/${file}`;
            const current = path === actor.img ? " current" : "";
            return `<button type="button" class="vf-icon${current}" data-path="${path}" data-name="${escapeText(
              name.toLowerCase(),
            )}" data-tooltip="${escapeText(name)}">
              <img src="${path}" alt="${escapeText(name)}" loading="lazy" />
            </button>`;
          })
          .join("")}
      </div>`,
    )
    .join("");

  const content = groups.length
    ? `<div class="vf-icon-controls">
        <input type="search" class="vf-icon-search" placeholder="${escapeText(
          game.i18n.localize("VF.iconPicker.search"),
        )}" />
        <div class="vf-icon-tabs">${tabs}</div>
      </div>
      <div class="vf-icon-results">${sections}
        <p class="vf-icon-none" hidden>${escapeText(game.i18n.localize("VF.iconPicker.noMatch"))}</p>
      </div>`
    : "";

  // The bundled icons are for everyone; Foundry's file browser only for those
  // Foundry lets browse (Trusted Player and up by default). Token art is its
  // own button: a portrait and a token are often different pictures.
  const buttons = [];
  if (game.user.can("FILES_BROWSE")) {
    buttons.push(
      {
        action: "browse",
        icon: "fas fa-folder-open",
        label: game.i18n.localize("VF.iconPicker.browse"),
        callback: () => browse(actor.img, (path) => applyImage(actor, path)),
      },
      {
        action: "browseToken",
        icon: "fas fa-user-circle",
        label: game.i18n.localize("VF.iconPicker.browseToken"),
        callback: () => browse(actor.prototypeToken?.texture?.src, (path) => applyTokenArt(actor, path)),
      },
    );
  }
  buttons.push({
    action: "cancel",
    icon: "fas fa-times",
    label: game.i18n.localize("VF.Cancel"),
    default: true,
  });

  const dialog = new foundry.applications.api.DialogV2({
    window: { title: game.i18n.format("VF.iconPicker.title", { name: actor.name }) },
    classes: ["ose", "vf-icon-picker"],
    // No fixed height: the icon area scrolls on its own, and a fixed window
    // height cut the buttons off below it.
    position: { width: 600, height: "auto" },
    content: content || `<p>${game.i18n.localize("VF.iconPicker.empty")}</p>`,
    buttons,
  });
  await dialog.render({ force: true });

  const root = dialog.element;
  const grids = [...root.querySelectorAll(".vf-icon-grid")];
  const tabButtons = [...root.querySelectorAll(".vf-icon-tab")];
  const search = root.querySelector(".vf-icon-search");
  const none = root.querySelector(".vf-icon-none");
  let group = grids[0]?.dataset.group;

  // Browsing shows one category. Searching shows matches from every category,
  // and a featured icon that also sits in its own category is shown once.
  const refresh = () => {
    const query = search?.value.trim().toLowerCase() ?? "";
    const seen = new Set();
    let shown = 0;
    for (const grid of grids) {
      const inScope = query ? true : grid.dataset.group === group;
      let visible = 0;
      for (const icon of grid.children) {
        const match = inScope && (!query || icon.dataset.name.includes(query)) && !seen.has(icon.dataset.path);
        icon.hidden = !match;
        if (match) {
          visible += 1;
          if (query) seen.add(icon.dataset.path);
        }
      }
      grid.hidden = visible === 0;
      shown += visible;
    }
    if (none) none.hidden = shown > 0;
    for (const tab of tabButtons) tab.classList.toggle("active", !query && tab.dataset.group === group);
  };

  for (const tab of tabButtons) {
    tab.addEventListener("click", () => {
      group = tab.dataset.group;
      if (search) search.value = "";
      refresh();
    });
  }
  search?.addEventListener("input", refresh);
  search?.focus();

  root.querySelectorAll(".vf-icon").forEach((button) => {
    button.addEventListener("click", async () => {
      await applyImage(actor, button.dataset.path);
      dialog.close();
    });
  });
}
