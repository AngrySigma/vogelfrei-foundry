/**
 * @file Keep player uploads in one folder.
 *
 * Foundry lets any role with "Upload New Files" write to any folder in Data/,
 * and the FilePicker remembers the last folder browsed, so portraits and
 * tokens end up scattered. For non-GM users this routes every upload -- the
 * picker's button, drag-and-drop into it, images pasted into a text editor --
 * to a single folder the GM chooses, and hides upload and new-folder buttons
 * everywhere else. GMs (and Assistant GMs) are untouched.
 *
 * This is a client-side guard: the server only checks the role permission,
 * so it keeps honest players tidy rather than stopping a determined one.
 */

const SETTING = "playerUploadDir";

/**
 * The folder players upload to, relative to Data/, with no trailing slash.
 * An empty setting means `worlds/<world id>/players`, which travels with the
 * world when it is exported or moved.
 */
export const resolveUploadDir = (setting: string, worldId: string): string => {
  const dir = (setting ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\/+|\/+$/g, "");
  return dir || `worlds/${worldId}/players`;
};

/** Whether a picker target (possibly URI-encoded) is the upload folder itself. */
export const isUploadDir = (target: string, dir: string): boolean => {
  let decoded = target ?? "";
  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Not encoded; compare as-is.
  }
  return decoded.replace(/^\/+|\/+$/g, "") === dir;
};

/** Whether a file path (possibly URI-encoded) lives inside the upload folder. */
export const isInUploadDir = (path: string, dir: string): boolean => {
  const slash = (path ?? "").lastIndexOf("/");
  return slash > 0 && isUploadDir(path.slice(0, slash), dir);
};

/**
 * A file name that does not collide with any of `existing` (compared without
 * case), made by appending -2, -3, ... before the extension. Foundry silently
 * overwrites media files, so without this one player's `token.png` would
 * replace another's.
 */
export const uniqueFileName = (name: string, existing: Iterable<string>): string => {
  const taken = new Set([...existing].map((n) => n.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let i = 2; ; i += 1) {
    const candidate = `${stem}-${i}${ext}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
};

const fileNameOf = (path: string): string => {
  const base = path.split("/").pop() ?? path;
  try {
    return decodeURIComponent(base);
  } catch {
    return base;
  }
};

/** The configured upload folder for this world. */
export const playerUploadDir = (): string =>
  resolveUploadDir(game.settings.get(game.system.id, SETTING as never) as string, game.world.id);

const isRestricted = () => !game.user?.isGM;

/**
 * Register the setting and swap in the guarded FilePicker. Call during init.
 */
export const registerUploadGuard = () => {
  game.settings.register(game.system.id, SETTING, {
    name: game.i18n.localize("VF.Setting.PlayerUploadDir"),
    hint: game.i18n.localize("VF.Setting.PlayerUploadDirHint"),
    default: "",
    scope: "world",
    type: String,
    config: true,
  } as never);

  // biome-ignore lint/suspicious/noExplicitAny: the v14 FilePicker is not in the League v13 types
  const ux = (CONFIG as any).ux;
  const Base = ux.FilePicker;

  class PlayerUploadFilePicker extends Base {
    // biome-ignore lint/suspicious/noExplicitAny: see above
    constructor(options: any = {}) {
      super(options);
      // Open players in the upload folder, unless they are already looking at
      // a file inside it, so the upload button is where they land.
      if (!isRestricted() || !this.sources.data) return;
      const dir = playerUploadDir();
      if (this.activeSource === "data" && isInUploadDir(this.request, dir)) return;
      this.activeSource = "data";
      this.sources.data.target = dir;
    }

    get canCreateFolder(): boolean {
      return isRestricted() ? false : super.canCreateFolder;
    }

    get canUpload(): boolean {
      if (!isRestricted()) return super.canUpload;
      if (this.options.allowUpload === false || this.type === "folder") return false;
      if (game.user?.can("FILES_UPLOAD") === false) return false;
      return this.activeSource === "data" && isUploadDir(this.source.target, playerUploadDir());
    }

    static async createDirectory(source: string, target: string, options = {}) {
      if (isRestricted()) throw new Error(game.i18n.localize("VF.upload.NoFolders"));
      return Base.createDirectory(source, target, options);
    }

    // biome-ignore lint/suspicious/noExplicitAny: see above
    static async upload(source: string, path: string, file: File, body: any = {}, options: any = {}) {
      if (!isRestricted()) return super.upload(source, path, file, body, options);
      const dir = playerUploadDir();
      // A pasted image carries a document uuid and the server would pick its
      // own folder for it; drop the uuid so it lands with everything else.
      const { uuid: _uuid, ...rest } = body ?? {};
      let upload = file;
      // Without browse permission we cannot see what is taken; upload as-is.
      if (game.user?.can("FILES_BROWSE") !== false) {
        try {
          const listing = await Base.browse("data", dir);
          const name = uniqueFileName(file.name, (listing?.files ?? []).map(fileNameOf));
          if (name !== file.name) upload = new File([file], name, { type: file.type });
        } catch {
          ui.notifications?.error(game.i18n.format("VF.upload.MissingDir", { dir }));
          return false;
        }
      }
      if (source !== "data" || !isUploadDir(path ?? "", dir)) {
        ui.notifications?.info(game.i18n.format("VF.upload.Redirected", { dir }));
      }
      return super.upload("data", dir, upload, rest, options);
    }
  }

  ux.FilePicker = PlayerUploadFilePicker;
};

/**
 * As a GM, make sure the upload folder exists so players can use it. Call on ready.
 */
export const ensureUploadDir = async () => {
  if (!game.user?.isGM) return;
  // biome-ignore lint/suspicious/noExplicitAny: see above
  const FilePicker = (CONFIG as any).ux.FilePicker;
  const parts = playerUploadDir().split("/");
  for (let i = 1; i <= parts.length; i += 1) {
    const path = parts.slice(0, i).join("/");
    try {
      await FilePicker.browse("data", path);
    } catch {
      try {
        await FilePicker.createDirectory("data", path);
      } catch (err) {
        console.warn(`Vogelfrei | could not create upload folder ${path}`, err);
        return;
      }
    }
  }
};
